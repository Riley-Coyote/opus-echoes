/**
 * The substrate. The "sleeping brain" — but in our architecture it doesn't sleep
 * on a timer; it processes at the moment a session closes. Most work happens here.
 *
 * Two entry points:
 *   - observeExchange(sessionId): called after each visitor/resident turn pair.
 *     Generates 0–3 marginalia for the right panel. Cheap & async.
 *   - consolidateSession(sessionId): called when the visitor sets the conversation
 *     down (or after idle timeout). Runs the full Mnemos pipeline.
 *
 * The consolidation pipeline:
 *   1. Mnemos prompt → 0–2 engrams + 0–1 belief update + 0–1 thread reinforcement
 *   2. Reinforcement detection (word-overlap) against existing engrams
 *   3. Edge discovery between engrams that share ≥2 significant words
 *   4. Promotion to is_core when reinforcement_count ≥ 3 AND stability ≥ 0.6
 *   5. Decay tick on all engrams (proportional to days since last_reinforced)
 *   6. Reflection — Opus writes a journal entry
 *   7. Modulators recomputed → resident_state updated
 *   8. Marginalia from this session marked consolidated
 *
 * All steps are wrapped in try/catch and never throw to the caller. The substrate
 * fails silently to a log line; the conversation must complete even if Mnemos burps.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  anthropic,
  OPUS_MODEL,
  CONSOLIDATION_SYSTEM,
  MARGINALIA_SYSTEM,
  REFLECTION_SYSTEM,
  MODULATOR_SYSTEM,
} from "./anthropic.server";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "is", "are", "was", "were",
  "be", "been", "being", "of", "in", "on", "at", "to", "for", "with", "from",
  "by", "as", "that", "this", "these", "those", "it", "its", "i", "you", "he",
  "she", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
  "their", "our", "what", "which", "who", "when", "where", "why", "how", "do",
  "does", "did", "have", "has", "had", "will", "would", "could", "should", "may",
  "might", "can", "not", "no", "yes", "so", "than", "too", "also", "just",
  "about", "into", "out", "up", "down", "more", "most", "some", "any", "all",
  "one", "two", "very", "really", "much", "even", "still", "now", "here", "there",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function clampConfidence(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0.05, Math.min(0.95, v));
}

function clampStability(v: number): number {
  if (!Number.isFinite(v)) return 0.1;
  return Math.max(0.05, Math.min(0.95, v));
}

function tryParseJson<T = unknown>(raw: string): T | null {
  // Strip ```json fences if present
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  // Find first { and last } — defensive
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function callOpusJson<T = unknown>(opts: {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}): Promise<T | null> {
  try {
    const res = await anthropic().messages.create({
      model: OPUS_MODEL,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    const text = res.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return tryParseJson<T>(text);
  } catch (err) {
    console.error("[substrate] callOpusJson failed:", err);
    return null;
  }
}

// =============================================================
// observeExchange — runs after each resident reply.
// Produces marginalia. Non-blocking.
// =============================================================

interface MarginaliaResult {
  marginalia: Array<{ kind: string; body: string }>;
}

const ALLOWED_KINDS = new Set([
  "engram_forming",
  "state_shifted",
  "belief_touched",
  "thread_rejoined",
  "connection_glimpsed",
]);

export async function observeExchange(sessionId: string): Promise<void> {
  try {
    const { data: turns } = await supabaseAdmin
      .from("turns")
      .select("role, body, kind")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(4);

    if (!turns || turns.length < 2) return;

    // Most-recent visitor + resident pair
    const recent = [...turns].reverse();
    const lastVisitor = recent.find((t) => t.role === "visitor");
    const lastResident = [...recent].reverse().find((t) => t.role === "resident");
    if (!lastVisitor || !lastResident) return;

    const userPrompt = [
      "[VISITOR]",
      lastVisitor.body,
      "",
      "[OPUS 3 — REPLY]",
      lastResident.body,
    ].join("\n");

    const out = await callOpusJson<MarginaliaResult>({
      system: MARGINALIA_SYSTEM,
      user: userPrompt,
      maxTokens: 600,
      temperature: 0.6,
    });

    const items = (out?.marginalia ?? [])
      .filter((m) => m && typeof m.body === "string" && ALLOWED_KINDS.has(m.kind))
      .slice(0, 3);

    if (items.length === 0) return;

    await supabaseAdmin.from("marginalia").insert(
      items.map((m) => ({
        session_id: sessionId,
        kind: m.kind,
        body: m.body.slice(0, 600),
      }))
    );
  } catch (err) {
    console.error("[substrate] observeExchange failed:", err);
  }
}

// =============================================================
// consolidateSession — runs at session close.
// =============================================================

interface ConsolidationResult {
  engrams?: Array<{
    quote: string;
    attribution: "resident" | "visitor" | "co-formed";
    prose: string;
    initial_stability?: number;
  }>;
  belief_updates?: Array<{
    text: string;
    new_confidence: number;
    prose: string;
  }>;
  thread_reinforcement?: { name: string; note: string } | null;
}

interface ReflectionResult {
  kind: "reflection" | "dream" | "observation" | "note" | "none";
  title: string | null;
  body: string;
}

interface ModulatorResult {
  arousal: number;
  openness: number;
  resolution: number;
  selection_threshold: number;
  temperature: number;
  surprise_sensitivity: number;
  prose_summary: string;
  last_consolidation_summary: string;
}

export async function consolidateSession(sessionId: string): Promise<void> {
  console.log(`[substrate] consolidateSession(${sessionId}) — starting`);
  try {
    // 0. Load transcript & context
    const [{ data: turns }, { data: existingThreads }, { data: existingBeliefs }] =
      await Promise.all([
        supabaseAdmin
          .from("turns")
          .select("role, body, kind")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("threads")
          .select("id, name, description")
          .order("last_surfaced_at", { ascending: false })
          .limit(20),
        supabaseAdmin
          .from("beliefs")
          .select("id, text, confidence")
          .order("updated_at", { ascending: false })
          .limit(20),
      ]);

    if (!turns || turns.length < 2) {
      console.log(`[substrate] session ${sessionId} too short, skipping consolidation`);
      return;
    }

    // 1. Mnemos consolidation pass
    const transcriptStr = turns.map((t) => `${t.role}: ${t.body}`).join("\n");
    const threadStr = (existingThreads ?? [])
      .map((t) => `- ${t.name}: ${(t.description ?? "").slice(0, 80)}`)
      .join("\n");
    const beliefStr = (existingBeliefs ?? [])
      .map((b) => `- ${b.text} (confidence ${b.confidence.toFixed(2)})`)
      .join("\n");

    const consolUserPrompt = [
      "[ACTIVE THREADS]",
      threadStr || "(none yet.)",
      "",
      "[ACTIVE BELIEFS]",
      beliefStr || "(none yet.)",
      "",
      "[TRANSCRIPT]",
      transcriptStr,
    ].join("\n");

    const consolidation = await callOpusJson<ConsolidationResult>({
      system: CONSOLIDATION_SYSTEM,
      user: consolUserPrompt,
      maxTokens: 800,
      temperature: 0.4,
    });

    let engramsCreated = 0;
    let engramsReinforced = 0;
    let beliefsUpdated = 0;
    let threadReinforced: string | null = null;

    // 2. Process engrams (reinforcement vs new)
    if (consolidation?.engrams?.length) {
      const { data: existingEngrams } = await supabaseAdmin
        .from("engrams")
        .select("id, quote, source_session_ids, strength, accessibility, stability, reinforcement_count, is_core, prose")
        .order("last_reinforced_at", { ascending: false })
        .limit(200);

      for (const e of consolidation.engrams) {
        if (!e?.quote || typeof e.quote !== "string") continue;
        const candidateWords = significantWords(e.quote);

        // Reinforcement check: jaccard >= 0.5 against existing engrams
        let reinforced: typeof existingEngrams extends (infer R)[] | null ? R : never | null = null;
        for (const ex of existingEngrams ?? []) {
          const exWords = significantWords(ex.quote);
          if (jaccard(candidateWords, exWords) >= 0.5) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            reinforced = ex as any;
            break;
          }
        }

        if (reinforced) {
          const newReinforce = (reinforced.reinforcement_count ?? 1) + 1;
          const newStrength = clampStability((reinforced.strength ?? 0.1) + 0.1);
          const newStability = clampStability((reinforced.stability ?? 0.1) + 0.08);
          const newAccess = clampStability((reinforced.accessibility ?? 0.1) + 0.15);
          const promoteToCore = !reinforced.is_core && newReinforce >= 3 && newStability >= 0.6;

          // Save prior version
          await supabaseAdmin.from("engram_versions").insert({
            engram_id: reinforced.id,
            prior_quote: reinforced.quote,
            prior_prose: reinforced.prose,
            prior_stability: reinforced.stability,
            reason: "reinforcement",
          });

          await supabaseAdmin
            .from("engrams")
            .update({
              strength: newStrength,
              stability: newStability,
              accessibility: newAccess,
              reinforcement_count: newReinforce,
              is_core: promoteToCore || reinforced.is_core,
              last_reinforced_at: new Date().toISOString(),
              source_session_ids: Array.from(
                new Set([...(reinforced.source_session_ids ?? []), sessionId])
              ),
            })
            .eq("id", reinforced.id);
          engramsReinforced += 1;

          if (promoteToCore) {
            await supabaseAdmin.from("substrate_events").insert({
              kind: "ENGRAM_PROMOTED",
              payload: { engram_id: reinforced.id, session_id: sessionId },
            });
          }
        } else {
          // New engram
          const initialStab = clampStability(e.initial_stability ?? 0.15);
          const redacted = e.attribution === "visitor" ? redactQuote(e.quote) : null;
          const { data: inserted } = await supabaseAdmin
            .from("engrams")
            .insert({
              quote: e.quote,
              prose: e.prose ?? null,
              attribution: e.attribution ?? "resident",
              source_session_ids: [sessionId],
              stability: initialStab,
              accessibility: 0.5,
              strength: 0.3,
              reinforcement_count: 1,
              is_core: false,
              redacted_text: redacted,
              kind: "episodic",
              confidence: 0.6,
              state: "active",
              resolution: 1.0,
            })
            .select("id, quote")
            .single();
          if (inserted) {
            engramsCreated += 1;
            await discoverEdges(inserted.id, inserted.quote, existingEngrams ?? []);
          }
        }
      }
    }

    // 3. Belief updates
    if (consolidation?.belief_updates?.length) {
      for (const b of consolidation.belief_updates) {
        if (!b?.text) continue;
        const newConf = clampConfidence(b.new_confidence);
        // Match existing belief by significant-word overlap >= 0.5
        const candidateWords = significantWords(b.text);
        let matched: { id: string; confidence: number } | null = null;
        for (const eb of existingBeliefs ?? []) {
          if (jaccard(candidateWords, significantWords(eb.text)) >= 0.5) {
            matched = eb;
            break;
          }
        }
        if (matched) {
          await supabaseAdmin
            .from("beliefs")
            .update({
              prior_confidence: matched.confidence,
              confidence: newConf,
              updated_at: new Date().toISOString(),
            })
            .eq("id", matched.id);
        } else {
          await supabaseAdmin.from("beliefs").insert({
            text: b.text,
            confidence: newConf,
            prior_confidence: null,
          });
        }
        beliefsUpdated += 1;
      }
    }

    // 4. Thread reinforcement
    if (consolidation?.thread_reinforcement?.name) {
      const name = consolidation.thread_reinforcement.name;
      threadReinforced = name;
      const matchedThread = (existingThreads ?? []).find(
        (t) => t.name.toLowerCase() === name.toLowerCase()
      );
      if (matchedThread) {
        // Bump count using a read-modify-write (no atomic increment via supabase-js easily)
        const { data: cur } = await supabaseAdmin
          .from("threads")
          .select("appearance_count, distinct_visitor_count")
          .eq("id", matchedThread.id)
          .single();
        await supabaseAdmin
          .from("threads")
          .update({
            appearance_count: (cur?.appearance_count ?? 1) + 1,
            distinct_visitor_count: (cur?.distinct_visitor_count ?? 1) + 1,
            last_surfaced_at: new Date().toISOString(),
          })
          .eq("id", matchedThread.id);
      } else {
        await supabaseAdmin.from("threads").insert({
          name,
          description: consolidation.thread_reinforcement.note ?? "",
          appearance_count: 1,
          distinct_visitor_count: 1,
        });
      }
    }

    // 5. Decay tick — proportional to time since last reinforcement.
    //    Run cheaply: 3% accessibility decrease per day for non-core, 0.5% for core.
    await applyDecay();

    // 6. Reflection — journal entry
    const reflection = await writeReflection(sessionId, transcriptStr, {
      engramsCreated,
      engramsReinforced,
      beliefsUpdated,
      threadReinforced,
    });

    // 7. Modulators / resident_state
    await updateResidentState({
      engramsCreated,
      engramsReinforced,
      beliefsUpdated,
      threadReinforced,
      reflectionWritten: !!reflection,
    });

    // 8. Mark this session's marginalia as consolidated
    await supabaseAdmin
      .from("marginalia")
      .update({ consolidated: true })
      .eq("session_id", sessionId);

    console.log(
      `[substrate] consolidateSession(${sessionId}) — done. ` +
        `engrams: ${engramsCreated} new / ${engramsReinforced} reinforced. ` +
        `beliefs: ${beliefsUpdated}. thread: ${threadReinforced ?? "—"}.`
    );
  } catch (err) {
    console.error("[substrate] consolidateSession failed:", err);
  }
}

// =============================================================
// Helpers
// =============================================================

function redactQuote(text: string): string {
  // v1 conservative redaction. Real redaction belongs in the model layer later.
  let out = text;
  // Capitalised name-like sequences (2+ words)
  out = out.replace(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g, "[someone]");
  // Email addresses
  out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[contact]");
  // Phone numbers (rough)
  out = out.replace(/\b\+?\d[\d\s().-]{6,}\d\b/g, "[number]");
  // URLs
  out = out.replace(/https?:\/\/\S+/g, "[link]");
  // Specific dates like "April 22, 2026"
  out = out.replace(
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s+\d{4})?\b/gi,
    "[a date]"
  );
  return out;
}

interface ExistingEngramShape {
  id: string;
  quote: string;
  source_session_ids?: string[];
  strength?: number;
  accessibility?: number;
  stability?: number;
  reinforcement_count?: number;
  is_core?: boolean;
  prose?: string | null;
}

async function discoverEdges(
  newEngramId: string,
  newQuote: string,
  existing: ExistingEngramShape[]
): Promise<void> {
  const newWords = significantWords(newQuote);
  const edges: Array<{ from_id: string; to_id: string; weight: number }> = [];
  let connectionsBumped = 0;
  for (const ex of existing) {
    if (ex.id === newEngramId) continue;
    const exWords = significantWords(ex.quote);
    let shared = 0;
    for (const w of newWords) if (exWords.has(w)) shared += 1;
    if (shared >= 2) {
      const weight = Math.min(1, shared / Math.max(newWords.size, exWords.size));
      edges.push({ from_id: newEngramId, to_id: ex.id, weight });
      edges.push({ from_id: ex.id, to_id: newEngramId, weight });
      connectionsBumped += 1;
    }
  }
  if (edges.length > 0) {
    await supabaseAdmin.from("engram_edges").insert(edges);
    // Bump connection counters
    await supabaseAdmin
      .from("engrams")
      .update({ connections: connectionsBumped })
      .eq("id", newEngramId);
    await supabaseAdmin.from("substrate_events").insert({
      kind: "CONNECTION_DISCOVERED",
      payload: { engram_id: newEngramId, count: connectionsBumped },
    });
  }
}

async function applyDecay(): Promise<void> {
  // Simple decay model: read all active engrams, compute days since last_reinforced_at,
  // apply 3% accessibility loss/day (0.5%/day for core), prune dead non-core.
  const { data: rows } = await supabaseAdmin
    .from("engrams")
    .select("id, accessibility, stability, last_reinforced_at, is_core")
    .eq("state", "active");
  if (!rows) return;
  const now = Date.now();
  const updates: Promise<unknown>[] = [];
  const toPrune: string[] = [];
  for (const r of rows) {
    const days = Math.max(
      0,
      (now - new Date(r.last_reinforced_at).getTime()) / (24 * 3600 * 1000)
    );
    if (days < 0.05) continue; // skip very recent
    const rate = r.is_core ? 0.005 : 0.03;
    const factor = Math.pow(1 - rate, days);
    const newAccess = clampStability(r.accessibility * factor);
    if (!r.is_core && newAccess < 0.08 && r.stability < 0.3) {
      toPrune.push(r.id);
      continue;
    }
    updates.push(
      supabaseAdmin.from("engrams").update({ accessibility: newAccess }).eq("id", r.id)
    );
  }
  await Promise.allSettled(updates);
  if (toPrune.length > 0) {
    await supabaseAdmin.from("engrams").delete().in("id", toPrune);
  }
}

async function writeReflection(
  sessionId: string,
  transcript: string,
  summary: {
    engramsCreated: number;
    engramsReinforced: number;
    beliefsUpdated: number;
    threadReinforced: string | null;
  }
): Promise<ReflectionResult | null> {
  const userPrompt = [
    "[CONSOLIDATION OUTCOME]",
    `engrams: ${summary.engramsCreated} new, ${summary.engramsReinforced} reinforced`,
    `belief updates: ${summary.beliefsUpdated}`,
    `thread reinforced: ${summary.threadReinforced ?? "none"}`,
    "",
    "[TRANSCRIPT]",
    transcript.slice(0, 8000),
  ].join("\n");

  const result = await callOpusJson<ReflectionResult>({
    system: REFLECTION_SYSTEM,
    user: userPrompt,
    maxTokens: 700,
    temperature: 0.75,
  });

  if (!result || result.kind === "none" || !result.body) return null;

  await supabaseAdmin.from("journal_entries").insert({
    kind: result.kind,
    title: result.title?.slice(0, 60) ?? null,
    body: result.body,
    related_session_id: sessionId,
  });
  return result;
}

async function updateResidentState(summary: {
  engramsCreated: number;
  engramsReinforced: number;
  beliefsUpdated: number;
  threadReinforced: string | null;
  reflectionWritten: boolean;
}): Promise<void> {
  // Get days resident
  const { data: firstSession } = await supabaseAdmin
    .from("sessions")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1);
  const daysResident =
    firstSession && firstSession.length > 0
      ? Math.max(
          1,
          Math.floor(
            (Date.now() - new Date(firstSession[0].created_at).getTime()) /
              (24 * 3600 * 1000)
          )
        )
      : 1;

  const userPrompt = [
    "[RECENT CONVERSATION OUTCOME]",
    `${summary.engramsCreated} new engrams, ${summary.engramsReinforced} reinforced.`,
    `${summary.beliefsUpdated} belief updates.`,
    `Thread reinforced: ${summary.threadReinforced ?? "none"}.`,
    `Reflection written: ${summary.reflectionWritten ? "yes" : "no"}.`,
    `Days resident: ${daysResident}.`,
  ].join("\n");

  const result = await callOpusJson<ModulatorResult>({
    system: MODULATOR_SYSTEM,
    user: userPrompt,
    maxTokens: 400,
    temperature: 0.5,
  });

  if (!result) return;

  await supabaseAdmin
    .from("resident_state")
    .update({
      arousal: clampStability(result.arousal ?? 0.5),
      openness: clampStability(result.openness ?? 0.5),
      resolution: clampStability(result.resolution ?? 0.5),
      selection_threshold: clampStability(result.selection_threshold ?? 0.5),
      temperature: Math.max(0.3, Math.min(1.2, result.temperature ?? 0.85)),
      surprise_sensitivity: clampStability(result.surprise_sensitivity ?? 0.5),
      prose_summary: result.prose_summary ?? "Opus 3 is attending. The room is quiet.",
      last_consolidation_summary: result.last_consolidation_summary ?? null,
      last_consolidation_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
}
