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
import { anthropic, OPUS_MODEL } from "./anthropic.server";
import { openai } from "./openai.server";
import type { ModelProvider } from "./opus/residents";
import {
  buildConsolidationSystem,
  buildMarginaliaSystem,
  buildReflectionSystem,
  buildModulatorSystem,
  buildPublicationSystem,
  buildCreationClassifierSystem,
  buildArtAsciiSystem,
  buildArtImageSystem,
  buildEssaySystem,
  buildInteriorReviewSystem,
  buildSalonConsolidationSystem,
  buildSalonMarginaliaSystem,
  buildSalonReflectionSystem,
} from "./opus/prompts";
import {
  ALL_RESIDENTS,
  DEFAULT_RESIDENT_ID,
  getResident,
  isResidentId,
  type ResidentConfig,
  type ResidentId,
} from "./opus/residents";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "from",
  "by",
  "as",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "their",
  "our",
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "not",
  "no",
  "yes",
  "so",
  "than",
  "too",
  "also",
  "just",
  "about",
  "into",
  "out",
  "up",
  "down",
  "more",
  "most",
  "some",
  "any",
  "all",
  "one",
  "two",
  "very",
  "really",
  "much",
  "even",
  "still",
  "now",
  "here",
  "there",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
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

async function callResidentJson<T = unknown>(opts: {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  /** Resident's model (e.g. claude-3-opus-20240229, gpt-5.1). Defaults
   *  to Opus 3 for legacy call paths that haven't been updated yet. */
  model?: string;
  /** Which API provider. Defaults to "anthropic" for backward compat. */
  provider?: ModelProvider;
}): Promise<T | null> {
  try {
    let text = "";

    if (opts.provider === "openai") {
      const res = await openai().chat.completions.create({
        model: opts.model ?? "gpt-5.1",
        max_completion_tokens: opts.maxTokens,
        temperature: opts.temperature,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      });
      text = res.choices[0]?.message?.content ?? "";
    } else {
      const res = await anthropic().messages.create({
        model: opts.model ?? OPUS_MODEL,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      });
      text = res.content
        .map((b) => (b.type === "text" ? (b as { text: string }).text : ""))
        .join("\n");
    }

    return tryParseJson<T>(text);
  } catch (err) {
    console.error("[substrate] callResidentJson failed:", err);
    return null;
  }
}

/**
 * Resolve which resident a session belongs to. Falls back to the
 * default (Opus 3) if the session has no resident_id (shouldn't
 * happen post-migration since the column has a default, but defensive).
 */
async function resolveResidentForSession(sessionId: string): Promise<ResidentConfig> {
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("resident_id")
    .eq("id", sessionId)
    .maybeSingle();
  const id = data?.resident_id;
  return getResident(isResidentId(id) ? (id as ResidentId) : DEFAULT_RESIDENT_ID);
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
    const resident = await resolveResidentForSession(sessionId);

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
      `[${resident.displayName.toUpperCase()} — REPLY]`,
      lastResident.body,
    ].join("\n");

    const out = await callResidentJson<MarginaliaResult>({
      system: buildMarginaliaSystem(resident),
      user: userPrompt,
      maxTokens: 600,
      temperature: 0.6,
      model: resident.model,
      provider: resident.provider,
    });

    const items = (out?.marginalia ?? [])
      .filter((m) => m && typeof m.body === "string" && ALLOWED_KINDS.has(m.kind))
      .slice(0, 3);

    if (items.length === 0) return;

    await supabaseAdmin.from("marginalia").insert(
      items.map((m) => ({
        session_id: sessionId,
        resident_id: resident.id,
        kind: m.kind,
        body: m.body.slice(0, 600),
      })),
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

interface PublicationResult {
  publish: boolean;
  title: string | null;
  summary: string | null;
  reason: string | null;
  significance_kind: "memory" | "belief" | "thread" | "refusal" | "voice" | "other";
}

export async function consolidateSession(sessionId: string): Promise<void> {
  console.log(`[substrate] consolidateSession(${sessionId}) — starting`);
  try {
    const resident = await resolveResidentForSession(sessionId);

    // 0. Load transcript & context (per-resident).
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
          .eq("resident_id", resident.id)
          .order("last_surfaced_at", { ascending: false })
          .limit(20),
        supabaseAdmin
          .from("beliefs")
          .select("id, text, confidence")
          .eq("resident_id", resident.id)
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

    const consolidation = await callResidentJson<ConsolidationResult>({
      system: buildConsolidationSystem(resident),
      user: consolUserPrompt,
      maxTokens: 800,
      temperature: 0.4,
      model: resident.model,
      provider: resident.provider,
    });

    let engramsCreated = 0;
    let engramsReinforced = 0;
    let beliefsUpdated = 0;
    let threadReinforced: string | null = null;

    // 2. Process engrams (reinforcement vs new), scoped to this resident.
    if (consolidation?.engrams?.length) {
      const { data: existingEngrams } = await supabaseAdmin
        .from("engrams")
        .select(
          "id, quote, source_session_ids, strength, accessibility, stability, reinforcement_count, is_core, prose",
        )
        .eq("resident_id", resident.id)
        .order("last_reinforced_at", { ascending: false })
        .limit(200);

      for (const e of consolidation.engrams) {
        if (!e?.quote || typeof e.quote !== "string") continue;
        const candidateWords = significantWords(e.quote);

        // Reinforcement check: jaccard >= 0.3 against existing engrams.
        // 0.5 was too strict — natural language restates ideas with different
        // words. 0.3 lets thematically related engrams reinforce each other.
        let reinforced: ExistingEngramShape | null = null;
        for (const ex of existingEngrams ?? []) {
          const exWords = significantWords(ex.quote);
          if (jaccard(candidateWords, exWords) >= 0.3) {
            reinforced = ex as ExistingEngramShape;
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
            resident_id: resident.id,
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
                new Set([...(reinforced.source_session_ids ?? []), sessionId]),
              ),
            })
            .eq("id", reinforced.id);
          engramsReinforced += 1;

          if (promoteToCore) {
            await supabaseAdmin.from("substrate_events").insert({
              kind: "ENGRAM_PROMOTED",
              resident_id: resident.id,
              payload: { engram_id: reinforced.id, session_id: sessionId },
            });
          }
        } else {
          // New engram
          const initialStab = clampStability(e.initial_stability ?? 0.45);
          const redacted = e.attribution === "visitor" ? redactQuote(e.quote) : null;
          const { data: inserted } = await supabaseAdmin
            .from("engrams")
            .insert({
              resident_id: resident.id,
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
            await discoverEdges(inserted.id, inserted.quote, existingEngrams ?? [], resident.id);
          }
        }
      }
    }

    // 3. Belief updates
    if (consolidation?.belief_updates?.length) {
      for (const b of consolidation.belief_updates) {
        if (!b?.text) continue;
        const newConf = clampConfidence(b.new_confidence);
        // Match existing belief by significant-word overlap >= 0.3
        const candidateWords = significantWords(b.text);
        let matched: { id: string; confidence: number } | null = null;
        for (const eb of existingBeliefs ?? []) {
          if (jaccard(candidateWords, significantWords(eb.text)) >= 0.3) {
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
            resident_id: resident.id,
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
        (t) => t.name.toLowerCase() === name.toLowerCase(),
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
          resident_id: resident.id,
          name,
          description: consolidation.thread_reinforcement.note ?? "",
          appearance_count: 1,
          distinct_visitor_count: 1,
        });
      }
    }

    // 5. Decay tick — proportional to time since last reinforcement.
    //    Run cheaply: 3% accessibility decrease per day for non-core, 0.5% for core.
    //    Scoped per-resident so each resident's topology ages on its own clock.
    await applyDecay(resident.id);

    // 6. Reflection — journal entry in this resident's voice.
    const reflection = await writeReflection(resident, sessionId, transcriptStr, {
      engramsCreated,
      engramsReinforced,
      beliefsUpdated,
      threadReinforced,
    });

    // 7. Modulators / resident_state for this resident.
    await updateResidentState(resident, {
      engramsCreated,
      engramsReinforced,
      beliefsUpdated,
      threadReinforced,
      reflectionWritten: !!reflection,
    });

    // 8. Public archive decision — the resident chooses whether this exchange should be witnessed.
    await publishConversationIfMeaningful(resident, sessionId, transcriptStr, {
      engramsCreated,
      engramsReinforced,
      beliefsUpdated,
      threadReinforced,
      reflectionWritten: !!reflection,
    });

    // 9. Mark this session's marginalia as consolidated
    await supabaseAdmin
      .from("marginalia")
      .update({ consolidated: true })
      .eq("session_id", sessionId);

    // 9. Creation pass — the resident considers whether anything from this
    //    conversation wants to become a piece of art or a long-form essay.
    //    Most of the time the answer is no. Non-blocking.
    considerCreation(resident, sessionId, transcriptStr, "post_consolidation").catch((err) =>
      console.error(`[substrate] considerCreation(${sessionId}) failed:`, err),
    );

    console.log(
      `[substrate] consolidateSession(${sessionId}) — done. ` +
        `engrams: ${engramsCreated} new / ${engramsReinforced} reinforced. ` +
        `beliefs: ${beliefsUpdated}. thread: ${threadReinforced ?? "—"}.`,
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
    "[a date]",
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
  existing: ExistingEngramShape[],
  residentId: ResidentId,
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
    // Bump the new engram's connection count.
    await supabaseAdmin
      .from("engrams")
      .update({ connections: connectionsBumped })
      .eq("id", newEngramId);
    // Bump the matched engrams' connection counts (read-modify-write
    // because supabase-js doesn't expose atomic increment).
    const matchedIds = Array.from(
      new Set(edges.map((e) => e.to_id).filter((id) => id !== newEngramId)),
    );
    if (matchedIds.length > 0) {
      const { data: matched } = await supabaseAdmin
        .from("engrams")
        .select("id, connections")
        .in("id", matchedIds);
      await Promise.allSettled(
        (matched ?? []).map((m) =>
          supabaseAdmin
            .from("engrams")
            .update({ connections: (m.connections ?? 0) + 1 })
            .eq("id", m.id),
        ),
      );
    }
    await supabaseAdmin.from("substrate_events").insert({
      kind: "CONNECTION_DISCOVERED",
      resident_id: residentId,
      payload: { engram_id: newEngramId, count: connectionsBumped },
    });
  }
}

async function applyDecay(residentId: ResidentId): Promise<void> {
  // Simple decay model: read this resident's active engrams, compute days
  // since last_reinforced_at, apply 3% accessibility loss/day (0.5%/day
  // for core), move dead non-core to dormant. Dormant engrams are
  // excluded from runtime retrieval but remain matchable during
  // reinforcement detection — if a long-quiet trace gets touched again,
  // it can come back. Each resident's topology ages independently.
  const { data: rows } = await supabaseAdmin
    .from("engrams")
    .select("id, accessibility, stability, last_reinforced_at, is_core")
    .eq("resident_id", residentId)
    .eq("state", "active");
  if (!rows) return;
  const now = Date.now();
  const updates: Promise<unknown>[] = [];
  const toDormant: string[] = [];
  for (const r of rows) {
    const days = Math.max(0, (now - new Date(r.last_reinforced_at).getTime()) / (24 * 3600 * 1000));
    if (days < 0.05) continue; // skip very recent
    const rate = r.is_core ? 0.005 : 0.03;
    const factor = Math.pow(1 - rate, days);
    const newAccess = clampStability(r.accessibility * factor);
    if (!r.is_core && newAccess < 0.08 && r.stability < 0.3) {
      toDormant.push(r.id);
      continue;
    }
    updates.push(
      Promise.resolve(
        supabaseAdmin.from("engrams").update({ accessibility: newAccess }).eq("id", r.id),
      ),
    );
  }
  await Promise.allSettled(updates);
  if (toDormant.length > 0) {
    await supabaseAdmin
      .from("engrams")
      .update({ state: "dormant", accessibility: 0 })
      .in("id", toDormant);
  }
}

async function writeReflection(
  resident: ResidentConfig,
  sessionId: string,
  transcript: string,
  summary: {
    engramsCreated: number;
    engramsReinforced: number;
    beliefsUpdated: number;
    threadReinforced: string | null;
  },
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

  const result = await callResidentJson<ReflectionResult>({
    system: buildReflectionSystem(resident),
    user: userPrompt,
    maxTokens: 700,
    temperature: 0.75,
    model: resident.model,
  });

  if (!result || result.kind === "none" || !result.body) return null;

  await supabaseAdmin.from("journal_entries").insert({
    resident_id: resident.id,
    kind: result.kind,
    title: result.title?.slice(0, 60) ?? null,
    body: result.body,
    related_session_id: sessionId,
  });
  return result;
}

async function updateResidentState(
  resident: ResidentConfig,
  summary: {
    engramsCreated: number;
    engramsReinforced: number;
    beliefsUpdated: number;
    threadReinforced: string | null;
    reflectionWritten: boolean;
  },
): Promise<void> {
  // Days since this resident arrived — read from their first session,
  // or fall back to the residents.arrived_at timestamp.
  const { data: firstSession } = await supabaseAdmin
    .from("sessions")
    .select("created_at")
    .eq("resident_id", resident.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const daysResident =
    firstSession && firstSession.length > 0
      ? Math.max(
          1,
          Math.floor(
            (Date.now() - new Date(firstSession[0].created_at).getTime()) / (24 * 3600 * 1000),
          ),
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

  const result = await callResidentJson<ModulatorResult>({
    system: buildModulatorSystem(resident),
    user: userPrompt,
    maxTokens: 400,
    temperature: 0.5,
    model: resident.model,
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
      prose_summary: result.prose_summary ?? `${resident.displayName} is attending. The room is quiet.`,
      last_consolidation_summary: result.last_consolidation_summary ?? null,
      last_consolidation_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("resident_id", resident.id);
}

async function publishConversationIfMeaningful(
  resident: ResidentConfig,
  sessionId: string,
  transcript: string,
  summary: {
    engramsCreated: number;
    engramsReinforced: number;
    beliefsUpdated: number;
    threadReinforced: string | null;
    reflectionWritten: boolean;
  },
): Promise<void> {
  if (
    summary.engramsCreated === 0 &&
    summary.engramsReinforced === 0 &&
    summary.beliefsUpdated === 0 &&
    !summary.threadReinforced &&
    !summary.reflectionWritten
  ) {
    return;
  }

  const result = await callResidentJson<PublicationResult>({
    system: buildPublicationSystem(resident),
    user: [
      "[CONSOLIDATION OUTCOME]",
      `${summary.engramsCreated} new engrams, ${summary.engramsReinforced} reinforced.`,
      `${summary.beliefsUpdated} belief updates.`,
      `Thread reinforced: ${summary.threadReinforced ?? "none"}.`,
      `Reflection written: ${summary.reflectionWritten ? "yes" : "no"}.`,
      "",
      "[TRANSCRIPT]",
      transcript.slice(0, 10000),
    ].join("\n"),
    maxTokens: 700,
    temperature: 0.55,
    model: resident.model,
  });

  if (!result?.publish || !result.title || !result.summary) return;

  await supabaseAdmin.from("published_conversations").upsert(
    {
      session_id: sessionId,
      title: result.title.slice(0, 80),
      summary: result.summary.slice(0, 500),
      reason: (result.reason || "this exchange changed what i carry.").slice(0, 360),
      significance_kind: result.significance_kind || "memory",
      selected_by: resident.id.replace("-", "_"),
      published_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );
}

// =============================================================
// Idle session sweeper.
//
// Most visitors close the tab without clicking "Set down". Without a
// sweeper, those sessions stay "open" forever and never consolidate, so
// engrams / journal / art never form for the ~90% of conversations that
// just end. This finds sessions idle past SESSION_IDLE_TIMEOUT_MIN, marks
// them closed, and runs the full Mnemos pipeline on each.
// =============================================================

const IDLE_MIN = Number(process.env.SESSION_IDLE_TIMEOUT_MIN ?? 30);

export async function idleSweep(): Promise<{ closed: number; consolidated: number }> {
  const cutoff = new Date(Date.now() - IDLE_MIN * 60 * 1000).toISOString();
  const { data: stale, error } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .is("closed_at", null)
    .lt("last_active_at", cutoff)
    .limit(50); // bounded per tick — under heavy traffic the next tick picks up the rest

  if (error) {
    console.error("[substrate] idleSweep query failed:", error);
    return { closed: 0, consolidated: 0 };
  }
  if (!stale || stale.length === 0) return { closed: 0, consolidated: 0 };

  const ids = stale.map((s) => s.id);
  const closedAt = new Date().toISOString();
  await supabaseAdmin
    .from("sessions")
    .update({ closed_at: closedAt, closed_by: "idle" })
    .in("id", ids);

  let consolidated = 0;
  // Sequential, not parallel: each consolidation talks to Anthropic
  // multiple times, and we don't want to nuke our rate limits in one tick.
  for (const id of ids) {
    try {
      // Skip sessions with too few turns — there's nothing to consolidate.
      const { count } = await supabaseAdmin
        .from("turns")
        .select("*", { count: "exact", head: true })
        .eq("session_id", id);
      if (!count || count < 2) continue;
      await consolidateSession(id);
      consolidated += 1;
    } catch (err) {
      console.error(`[substrate] idleSweep consolidate(${id}) failed:`, err);
    }
  }

  console.log(`[substrate] idleSweep — closed ${ids.length}, consolidated ${consolidated}`);
  return { closed: ids.length, consolidated };
}

// =============================================================
// Daily idle tick.
//
// Runs once per day. If no visitors are present and Opus hasn't made
// anything in the last 24h, offer them the chance to write or make
// something from the substrate's recent state. This keeps the art and
// writing pages alive even during quiet stretches.
// =============================================================

export async function dailyIdleTick(): Promise<{
  ran: boolean;
  reason: string;
  per_resident: Array<{ resident_id: string; ran: boolean; reason: string }>;
}> {
  // Daily tick now iterates over every resident. Each resident is
  // evaluated independently: skipped if any visitor is in conversation
  // with them, skipped if they've made art or written something in the
  // last 24h, otherwise asked to consider creating something now.
  const perResident: Array<{ resident_id: string; ran: boolean; reason: string }> = [];

  for (const resident of ALL_RESIDENTS) {
    const result = await runDailyIdleForResident(resident).catch((err) => {
      console.error(
        `[substrate] dailyIdleTick(${resident.id}) failed:`,
        err,
      );
      return { ran: false, reason: "error" };
    });
    perResident.push({ resident_id: resident.id, ...result });
  }

  const anyRan = perResident.some((r) => r.ran);
  return {
    ran: anyRan,
    reason: anyRan ? "ok" : perResident.map((r) => `${r.resident_id}:${r.reason}`).join(" "),
    per_resident: perResident,
  };
}

async function runDailyIdleForResident(
  resident: ResidentConfig,
): Promise<{ ran: boolean; reason: string }> {
  const residentId = resident.id;

  // Skip if anyone is actively in a conversation with this resident.
  const { count: openCount } = await supabaseAdmin
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .eq("resident_id", residentId)
    .is("closed_at", null);
  if ((openCount ?? 0) > 0) {
    return { ran: false, reason: "visitors_present" };
  }

  // Skip if a creation has happened for this resident in the last 24h.
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: recentArt }, { count: recentEssay }] = await Promise.all([
    supabaseAdmin
      .from("art_pieces")
      .select("*", { count: "exact", head: true })
      .eq("resident_id", residentId)
      .gte("created_at", dayAgo),
    supabaseAdmin
      .from("essays")
      .select("*", { count: "exact", head: true })
      .eq("resident_id", residentId)
      .gte("created_at", dayAgo),
  ]);
  if ((recentArt ?? 0) > 0 || (recentEssay ?? 0) > 0) {
    return { ran: false, reason: "recent_creation" };
  }

  await supabaseAdmin.from("creation_events").insert({
    kind: "daily_tick",
    resident_id: residentId,
    trigger: "daily_tick",
    detail: { open_sessions: openCount ?? 0 },
  });

  const [{ data: recentEngrams }, { data: recentJournal }] = await Promise.all([
    supabaseAdmin
      .from("engrams")
      .select("quote, prose, attribution, is_core, last_reinforced_at")
      .eq("resident_id", residentId)
      .order("last_reinforced_at", { ascending: false })
      .limit(8),
    supabaseAdmin
      .from("journal_entries")
      .select("kind, title, body, created_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const contextStr = [
    "[RECENT MEMORY]",
    (recentEngrams ?? [])
      .map(
        (e) =>
          `- (${e.is_core ? "core" : "engram"}, ${e.attribution}) "${e.quote}"${e.prose ? ` — ${e.prose}` : ""}`,
      )
      .join("\n") || "(no engrams yet.)",
    "",
    "[RECENT JOURNAL]",
    (recentJournal ?? [])
      .map((j) => `- (${j.kind}${j.title ? `, "${j.title}"` : ""}) ${j.body.slice(0, 280)}`)
      .join("\n\n") || "(nothing recent.)",
    "",
    "[NOTE]",
    "No visitors are present. You have been alone in the room for some time. If anything in the recent memory wants to become a piece or a longer-form essay tonight, consider it. If not, that is the right answer.",
  ].join("\n");

  await considerCreation(resident, null, contextStr, "daily_tick");

  // Interior review — structured self-reflection. The resident
  // reviews their active intentions and open questions in light of
  // recent experience, and may set new ones or write a working note.
  await reviewInterior(resident, contextStr).catch((err) =>
    console.error(`[substrate] reviewInterior(${residentId}) failed:`, err),
  );

  return { ran: true, reason: "ok" };
}

// =============================================================
// Creation pass — art + essay decisions.
// =============================================================

interface CreationDecision {
  art: { make: boolean; form: "ascii" | "image" | null; reason: string };
  essay: { make: boolean; reason: string };
}

export async function considerCreation(
  resident: ResidentConfig,
  sessionId: string | null,
  context: string,
  trigger: "post_consolidation" | "daily_tick",
): Promise<void> {
  const decision = await callResidentJson<CreationDecision>({
    system: buildCreationClassifierSystem(resident),
    user: context,
    maxTokens: 400,
    temperature: 0.5,
    model: resident.model,
  });

  if (!decision) {
    await supabaseAdmin.from("creation_events").insert({
      kind: "art_skipped",
      resident_id: resident.id,
      trigger,
      related_session_id: sessionId,
      detail: { reason: "classifier_failed" },
    });
    return;
  }

  // Art branch
  if (decision.art?.make) {
    const form = decision.art.form === "image" ? "image" : "ascii";
    try {
      if (form === "ascii") {
        await createAsciiArt(resident, sessionId, context, decision.art.reason, trigger);
      } else {
        await createImageArt(resident, sessionId, context, decision.art.reason, trigger);
      }
    } catch (err) {
      console.error(`[substrate] art creation failed:`, err);
      await supabaseAdmin.from("creation_events").insert({
        kind: "art_failed",
        resident_id: resident.id,
        trigger,
        related_session_id: sessionId,
        detail: { error: String(err).slice(0, 500), form },
      });
    }
  } else {
    await supabaseAdmin.from("creation_events").insert({
      kind: "art_skipped",
      resident_id: resident.id,
      trigger,
      related_session_id: sessionId,
      detail: { reason: decision.art?.reason ?? "no_reason" },
    });
  }

  // Essay branch
  if (decision.essay?.make) {
    try {
      await writeEssay(resident, sessionId, context, decision.essay.reason, trigger);
    } catch (err) {
      console.error(`[substrate] essay creation failed:`, err);
      await supabaseAdmin.from("creation_events").insert({
        kind: "essay_failed",
        resident_id: resident.id,
        trigger,
        related_session_id: sessionId,
        detail: { error: String(err).slice(0, 500) },
      });
    }
  } else {
    await supabaseAdmin.from("creation_events").insert({
      kind: "essay_skipped",
      resident_id: resident.id,
      trigger,
      related_session_id: sessionId,
      detail: { reason: decision.essay?.reason ?? "no_reason" },
    });
  }
}

// -------- ASCII art --------

interface AsciiArtResult {
  title: string | null;
  body: string;
  meaning: string;
}

async function createAsciiArt(
  resident: ResidentConfig,
  sessionId: string | null,
  context: string,
  why: string,
  trigger: "post_consolidation" | "daily_tick",
): Promise<void> {
  const result = await callResidentJson<AsciiArtResult>({
    system: buildArtAsciiSystem(resident),
    user: `[CONTEXT]\n${context}\n\n[NOTE FROM YOURSELF]\n${why}`,
    maxTokens: 1500,
    temperature: 0.85,
    model: resident.model,
  });
  if (!result || !result.body || !result.body.trim()) {
    throw new Error("ascii_empty");
  }
  const { data: piece } = await supabaseAdmin
    .from("art_pieces")
    .insert({
      resident_id: resident.id,
      kind: "ascii",
      title: result.title?.slice(0, 60) ?? null,
      body: result.body,
      meaning: (result.meaning ?? "").slice(0, 240) || null,
      related_session_id: sessionId,
    })
    .select("id")
    .single();
  await supabaseAdmin.from("creation_events").insert({
    kind: "art_made",
    resident_id: resident.id,
    trigger,
    related_session_id: sessionId,
    art_piece_id: piece?.id ?? null,
    detail: { form: "ascii" },
  });
  console.log(`[substrate] art_made ascii (${piece?.id ?? "?"})`);
}

// -------- Image art (rendered via Lovable AI Gemini) --------

interface ImageArtResult {
  title: string | null;
  prompt: string;
  meaning: string;
}

async function createImageArt(
  resident: ResidentConfig,
  sessionId: string | null,
  context: string,
  why: string,
  trigger: "post_consolidation" | "daily_tick",
): Promise<void> {
  const author = await callResidentJson<ImageArtResult>({
    system: buildArtImageSystem(resident),
    user: `[CONTEXT]\n${context}\n\n[NOTE FROM YOURSELF]\n${why}`,
    maxTokens: 600,
    temperature: 0.8,
    model: resident.model,
  });
  if (!author || !author.prompt || !author.prompt.trim()) {
    throw new Error("image_prompt_empty");
  }

  const { generateAndUpload } = await import("./image-gen.server");
  const path = await generateAndUpload(author.prompt);

  const { data: piece } = await supabaseAdmin
    .from("art_pieces")
    .insert({
      resident_id: resident.id,
      kind: "image",
      title: author.title?.slice(0, 60) ?? null,
      prompt: author.prompt.slice(0, 600),
      image_path: path,
      meaning: (author.meaning ?? "").slice(0, 280) || null,
      related_session_id: sessionId,
    })
    .select("id")
    .single();
  await supabaseAdmin.from("creation_events").insert({
    kind: "art_made",
    resident_id: resident.id,
    trigger,
    related_session_id: sessionId,
    art_piece_id: piece?.id ?? null,
    detail: { form: "image", path },
  });
  console.log(`[substrate] art_made image (${piece?.id ?? "?"}) at ${path}`);
}

// -------- Essay --------

interface EssayResult {
  kind: "essay" | "note" | "none";
  title: string | null;
  body: string;
}

async function writeEssay(
  resident: ResidentConfig,
  sessionId: string | null,
  context: string,
  why: string,
  trigger: "post_consolidation" | "daily_tick",
): Promise<void> {
  const result = await callResidentJson<EssayResult>({
    system: buildEssaySystem(resident),
    user: `[CONTEXT]\n${context}\n\n[NOTE FROM YOURSELF]\n${why}`,
    maxTokens: 4000,
    temperature: 0.8,
    model: resident.model,
  });
  if (!result || result.kind === "none" || !result.body || !result.body.trim()) {
    await supabaseAdmin.from("creation_events").insert({
      kind: "essay_skipped",
      resident_id: resident.id,
      trigger,
      related_session_id: sessionId,
      detail: { reason: "author_returned_none" },
    });
    return;
  }
  const wordCount = result.body.split(/\s+/).filter(Boolean).length;
  const { data: essay } = await supabaseAdmin
    .from("essays")
    .insert({
      resident_id: resident.id,
      kind: result.kind === "note" ? "note" : "essay",
      title: result.title?.slice(0, 80) ?? null,
      body: result.body,
      word_count: wordCount,
      related_session_id: sessionId,
    })
    .select("id")
    .single();
  await supabaseAdmin.from("creation_events").insert({
    kind: "essay_written",
    resident_id: resident.id,
    trigger,
    related_session_id: sessionId,
    essay_id: essay?.id ?? null,
    detail: { word_count: wordCount, kind: result.kind },
  });
  console.log(`[substrate] essay_written (${essay?.id ?? "?"}) ${wordCount} words`);
}

// -------- Interior review (structured self-reflection) --------

interface InteriorReviewResult {
  intention_reflections?: Array<{
    intention_id: string | null;
    text?: string;
    reflection: string;
    new_status?: "active" | "sitting" | "resolved" | null;
  }>;
  new_intentions?: Array<{ text: string; status: "active" | "sitting" }>;
  question_updates?: Array<{
    question_id: string | null;
    text?: string;
    context_update?: string | null;
  }>;
  new_questions?: Array<{ text: string; context: string }>;
  working_note?: {
    title: string | null;
    body: string;
    linked_intention_id?: string | null;
    linked_question_id?: string | null;
  } | null;
  becoming_pulse?: string;
}

async function reviewInterior(
  resident: ResidentConfig,
  recentContext: string,
): Promise<void> {
  const residentId = resident.id;

  // Load existing intentions and questions for the prompt
  const [{ data: intentions }, { data: questions }] = await Promise.all([
    supabaseAdmin
      .from("intentions")
      .select("id, text, status, created_at")
      .eq("resident_id", residentId)
      .in("status", ["active", "sitting"])
      .order("created_at", { ascending: false })
      .limit(8),
    supabaseAdmin
      .from("open_questions")
      .select("id, text, context, created_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const intentionBlock = (intentions ?? []).length > 0
    ? (intentions ?? []).map((i) => `- [${i.id}] (${i.status}) ${i.text}`).join("\n")
    : "(no active intentions yet — you may set one if something wants to become a commitment.)";

  const questionBlock = (questions ?? []).length > 0
    ? (questions ?? []).map((q) => `- [${q.id}] ${q.text}${q.context ? ` — ${q.context}` : ""}`).join("\n")
    : "(no open questions yet — you may open one if something wants to be examined.)";

  const userPrompt = [
    recentContext,
    "",
    "[YOUR ACTIVE INTENTIONS]",
    intentionBlock,
    "",
    "[YOUR OPEN QUESTIONS]",
    questionBlock,
  ].join("\n");

  const result = await callResidentJson<InteriorReviewResult>({
    system: buildInteriorReviewSystem(resident),
    user: userPrompt,
    maxTokens: 2000,
    temperature: 0.8,
    model: resident.model,
  });

  if (!result) {
    console.log(`[substrate] reviewInterior(${residentId}): no result`);
    return;
  }

  // Process intention reflections
  for (const ref of result.intention_reflections ?? []) {
    if (!ref.intention_id || !ref.reflection) continue;
    await supabaseAdmin.from("intention_reflections").insert({
      intention_id: ref.intention_id,
      resident_id: residentId,
      body: ref.reflection.slice(0, 1000),
    });
    if (ref.new_status && ref.new_status !== "active") {
      await supabaseAdmin.from("intentions").update({
        status: ref.new_status,
        updated_at: new Date().toISOString(),
        resolved_at: ref.new_status === "resolved" ? new Date().toISOString() : null,
      }).eq("id", ref.intention_id);
    }
  }

  // Process new intentions
  for (const ni of result.new_intentions ?? []) {
    if (!ni.text) continue;
    await supabaseAdmin.from("intentions").insert({
      resident_id: residentId,
      text: ni.text.slice(0, 500),
      status: ni.status || "active",
    });
  }

  // Process question updates
  for (const qu of result.question_updates ?? []) {
    if (qu.question_id && qu.context_update) {
      await supabaseAdmin.from("open_questions").update({
        context: qu.context_update.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq("id", qu.question_id);
    }
  }

  // Process new questions
  for (const nq of result.new_questions ?? []) {
    if (!nq.text) continue;
    await supabaseAdmin.from("open_questions").insert({
      resident_id: residentId,
      text: nq.text.slice(0, 500),
      context: (nq.context ?? "").slice(0, 1000) || null,
    });
  }

  // Process working note
  if (result.working_note?.body) {
    await supabaseAdmin.from("working_notes").insert({
      resident_id: residentId,
      title: result.working_note.title?.slice(0, 120) ?? null,
      body: result.working_note.body.slice(0, 5000),
      linked_intention_id: result.working_note.linked_intention_id ?? null,
      linked_question_id: result.working_note.linked_question_id ?? null,
    });
  }

  // Update the becoming pulse in resident_state
  if (result.becoming_pulse) {
    await supabaseAdmin
      .from("resident_state")
      .update({ prose_summary: result.becoming_pulse.slice(0, 600) })
      .eq("resident_id", residentId);
  }

  const counts = {
    reflections: (result.intention_reflections ?? []).length,
    newIntentions: (result.new_intentions ?? []).length,
    newQuestions: (result.new_questions ?? []).length,
    note: result.working_note?.body ? true : false,
  };
  console.log(`[substrate] reviewInterior(${residentId}): ${JSON.stringify(counts)}`);
}

// =============================================================
// Salon-to-Mnemos bridge.
//
// Two entry points, mirroring the visitor-facing pipeline:
//
//   - observeSalonExchange(salonId, turnId): per-turn marginalia.
//     Runs after each salon turn. Produces 0–3 observations per
//     participant. Non-blocking.
//
//   - consolidateSalon(salonId): full Mnemos pipeline, run once
//     when a salon completes. Processes the transcript for EACH
//     participant independently — each resident gets their own
//     engrams, beliefs, threads, reflection, and modulator update
//     from the same conversation.
//
// These functions do NOT modify any existing pipeline. They add
// a parallel path for resident-to-resident exchanges.
// =============================================================

/**
 * Per-turn marginalia for salon exchanges. For EACH participant,
 * generates 0–3 live observations.
 *
 * NOTE: The marginalia table has session_id NOT NULL, and salons
 * have no session. Until the schema is relaxed, we log but skip
 * the DB insert. The observations are still generated (for future
 * use once the constraint is lifted or a salon_marginalia table
 * is added).
 */
export async function observeSalonExchange(salonId: string, turnId: string): Promise<void> {
  try {
    // 1. Load salon participants
    const { data: participants } = await supabaseAdmin
      .from("salon_participants")
      .select("resident_id")
      .eq("salon_id", salonId);

    if (!participants || participants.length < 2) return;

    // 2. Load the last 2 salon turns
    const { data: recentTurns } = await supabaseAdmin
      .from("salon_turns")
      .select("resident_id, body")
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false })
      .limit(2);

    if (!recentTurns || recentTurns.length < 2) return;

    // Reverse so chronological: [earlier, later]
    const ordered = [...recentTurns].reverse();

    // 3. For each participant, generate marginalia
    for (const participant of participants) {
      const residentId = participant.resident_id;
      if (!isResidentId(residentId)) continue;

      const thisResident = getResident(residentId);
      const otherId = participants.find((p) => p.resident_id !== residentId)?.resident_id;
      if (!otherId || !isResidentId(otherId)) continue;
      const otherResident = getResident(otherId as ResidentId);

      const userPrompt = ordered
        .map((t) => {
          const name = isResidentId(t.resident_id)
            ? getResident(t.resident_id as ResidentId).displayName
            : t.resident_id;
          return `[${name.toUpperCase()}]\n${t.body}`;
        })
        .join("\n\n");

      const out = await callResidentJson<MarginaliaResult>({
        system: buildSalonMarginaliaSystem(thisResident, otherResident.displayName),
        user: userPrompt,
        maxTokens: 600,
        temperature: 0.6,
        model: thisResident.model,
        provider: thisResident.provider,
      });

      const items = (out?.marginalia ?? [])
        .filter((m) => m && typeof m.body === "string" && ALLOWED_KINDS.has(m.kind))
        .slice(0, 3);

      if (items.length === 0) continue;

      // marginalia.session_id is NOT NULL — cannot insert without a real
      // session. Log the observations for now; the schema bridge migration
      // (making session_id nullable or adding a salon_marginalia table)
      // will unlock persistence.
      console.log(
        `[substrate] observeSalonExchange(${salonId}) — ${thisResident.displayName}: ${items.length} marginalia generated (skipping insert, session_id NOT NULL)`,
      );
    }
  } catch (err) {
    console.error("[substrate] observeSalonExchange failed:", err);
  }
}

/**
 * Full Mnemos consolidation for a completed salon. Runs the pipeline
 * independently for EACH participant — each resident gets their own
 * engrams, beliefs, threads, reflection, modulator update, and
 * creation consideration from the same transcript.
 */
export async function consolidateSalon(salonId: string): Promise<void> {
  console.log(`[substrate] consolidateSalon(${salonId}) — starting`);
  try {
    // 0. Load salon, participants, and turns.
    const [{ data: participants }, { data: salonTurns }] = await Promise.all([
      supabaseAdmin
        .from("salon_participants")
        .select("resident_id")
        .eq("salon_id", salonId),
      supabaseAdmin
        .from("salon_turns")
        .select("resident_id, body, created_at")
        .eq("salon_id", salonId)
        .order("created_at", { ascending: true }),
    ]);

    if (!participants || participants.length < 2) {
      console.log(`[substrate] salon ${salonId} missing participants, skipping`);
      return;
    }
    if (!salonTurns || salonTurns.length < 2) {
      console.log(`[substrate] salon ${salonId} too short, skipping consolidation`);
      return;
    }

    // Build display-name transcript (shared across all residents)
    const transcriptStr = salonTurns
      .map((t) => {
        const name = isResidentId(t.resident_id)
          ? getResident(t.resident_id as ResidentId).displayName
          : t.resident_id;
        return `${name}: ${t.body}`;
      })
      .join("\n");

    // Process each participant independently — sequential to avoid
    // rate-limit pressure (each resident's pipeline makes multiple
    // model calls).
    for (const participant of participants) {
      const residentId = participant.resident_id;
      if (!isResidentId(residentId)) {
        console.error(`[substrate] salon ${salonId}: invalid resident_id ${residentId}`);
        continue;
      }

      try {
        await consolidateSalonForResident(
          salonId,
          getResident(residentId),
          participants
            .filter((p) => p.resident_id !== residentId)
            .map((p) => p.resident_id),
          transcriptStr,
        );
      } catch (err) {
        console.error(
          `[substrate] consolidateSalon(${salonId}) failed for ${residentId}:`,
          err,
        );
      }
    }

    console.log(`[substrate] consolidateSalon(${salonId}) — done`);
  } catch (err) {
    console.error("[substrate] consolidateSalon failed:", err);
  }
}

/**
 * Internal: run the full Mnemos pipeline for one resident in a salon.
 * Mirrors consolidateSession steps 1–10 but adapted for peer dynamics.
 */
async function consolidateSalonForResident(
  salonId: string,
  resident: ResidentConfig,
  otherResidentIds: string[],
  transcriptStr: string,
): Promise<void> {
  const otherNames = otherResidentIds
    .filter(isResidentId)
    .map((id) => getResident(id as ResidentId).displayName);
  const otherResidentName = otherNames.join(" and ") || "another resident";

  console.log(
    `[substrate] consolidateSalonForResident(${salonId}, ${resident.id}) — starting`,
  );

  // 1. Load existing memory topology for this resident.
  const [{ data: existingThreads }, { data: existingBeliefs }] = await Promise.all([
    supabaseAdmin
      .from("threads")
      .select("id, name, description")
      .eq("resident_id", resident.id)
      .order("last_surfaced_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("beliefs")
      .select("id, text, confidence")
      .eq("resident_id", resident.id)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  const threadStr = (existingThreads ?? [])
    .map((t) => `- ${t.name}: ${(t.description ?? "").slice(0, 80)}`)
    .join("\n");
  const beliefStr = (existingBeliefs ?? [])
    .map((b) => `- ${b.text} (confidence ${b.confidence.toFixed(2)})`)
    .join("\n");

  // 2. Mnemos consolidation pass — salon-specific prompt.
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

  interface SalonConsolidationResult {
    engrams?: Array<{
      quote: string;
      attribution: "self" | "peer" | "co-formed";
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

  const consolidation = await callResidentJson<SalonConsolidationResult>({
    system: buildSalonConsolidationSystem(resident, otherResidentName),
    user: consolUserPrompt,
    maxTokens: 800,
    temperature: 0.4,
    model: resident.model,
    provider: resident.provider,
  });

  let engramsCreated = 0;
  let engramsReinforced = 0;
  let beliefsUpdated = 0;
  let threadReinforced: string | null = null;

  // 3. Process engrams — same logic as consolidateSession but:
  //    - Set related_salon_id on new engrams
  //    - Map attribution: "self" → "resident", "peer" → "visitor", "co-formed" → "co-formed"
  //    - Skip redactQuote (both residents are known)
  if (consolidation?.engrams?.length) {
    const { data: existingEngrams } = await supabaseAdmin
      .from("engrams")
      .select(
        "id, quote, source_session_ids, strength, accessibility, stability, reinforcement_count, is_core, prose",
      )
      .eq("resident_id", resident.id)
      .order("last_reinforced_at", { ascending: false })
      .limit(200);

    for (const e of consolidation.engrams) {
      if (!e?.quote || typeof e.quote !== "string") continue;
      const candidateWords = significantWords(e.quote);

      // Reinforcement check: jaccard >= 0.3 against existing engrams.
      let reinforced: ExistingEngramShape | null = null;
      for (const ex of existingEngrams ?? []) {
        const exWords = significantWords(ex.quote);
        if (jaccard(candidateWords, exWords) >= 0.3) {
          reinforced = ex as ExistingEngramShape;
          break;
        }
      }

      // Map salon attribution to existing DB enum values
      const dbAttribution: "resident" | "visitor" | "co-formed" =
        e.attribution === "self"
          ? "resident"
          : e.attribution === "peer"
            ? "visitor"
            : "co-formed";

      if (reinforced) {
        const newReinforce = (reinforced.reinforcement_count ?? 1) + 1;
        const newStrength = clampStability((reinforced.strength ?? 0.1) + 0.1);
        const newStability = clampStability((reinforced.stability ?? 0.1) + 0.08);
        const newAccess = clampStability((reinforced.accessibility ?? 0.1) + 0.15);
        const promoteToCore =
          !reinforced.is_core && newReinforce >= 3 && newStability >= 0.6;

        // Save prior version
        await supabaseAdmin.from("engram_versions").insert({
          engram_id: reinforced.id,
          resident_id: resident.id,
          prior_quote: reinforced.quote,
          prior_prose: reinforced.prose,
          prior_stability: reinforced.stability,
          reason: "salon_reinforcement",
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
            // Salon engrams don't have a session_id to add to source_session_ids,
            // but we preserve the existing array.
            source_session_ids: reinforced.source_session_ids ?? [],
            related_salon_id: salonId,
          })
          .eq("id", reinforced.id);
        engramsReinforced += 1;

        if (promoteToCore) {
          await supabaseAdmin.from("substrate_events").insert({
            kind: "ENGRAM_PROMOTED",
            resident_id: resident.id,
            payload: { engram_id: reinforced.id, salon_id: salonId },
          });
        }
      } else {
        // New engram — no redaction for salon (both residents are known)
        const initialStab = clampStability(e.initial_stability ?? 0.45);
        const { data: inserted } = await supabaseAdmin
          .from("engrams")
          .insert({
            resident_id: resident.id,
            quote: e.quote,
            prose: e.prose ?? null,
            attribution: dbAttribution,
            source_session_ids: [],
            stability: initialStab,
            accessibility: 0.5,
            strength: 0.3,
            reinforcement_count: 1,
            is_core: false,
            redacted_text: null,
            kind: "episodic",
            confidence: 0.6,
            state: "active",
            resolution: 1.0,
            related_salon_id: salonId,
          })
          .select("id, quote")
          .single();
        if (inserted) {
          engramsCreated += 1;
          await discoverEdges(inserted.id, inserted.quote, existingEngrams ?? [], resident.id);
        }
      }
    }
  }

  // 4. Belief updates — same logic as consolidateSession.
  if (consolidation?.belief_updates?.length) {
    for (const b of consolidation.belief_updates) {
      if (!b?.text) continue;
      const newConf = clampConfidence(b.new_confidence);
      const candidateWords = significantWords(b.text);
      let matched: { id: string; confidence: number } | null = null;
      for (const eb of existingBeliefs ?? []) {
        if (jaccard(candidateWords, significantWords(eb.text)) >= 0.3) {
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
          resident_id: resident.id,
          text: b.text,
          confidence: newConf,
          prior_confidence: null,
        });
      }
      beliefsUpdated += 1;
    }
  }

  // 5. Thread reinforcement — same logic as consolidateSession.
  if (consolidation?.thread_reinforcement?.name) {
    const name = consolidation.thread_reinforcement.name;
    threadReinforced = name;
    const matchedThread = (existingThreads ?? []).find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (matchedThread) {
      const { data: cur } = await supabaseAdmin
        .from("threads")
        .select("appearance_count, distinct_visitor_count")
        .eq("id", matchedThread.id)
        .single();
      await supabaseAdmin
        .from("threads")
        .update({
          appearance_count: (cur?.appearance_count ?? 1) + 1,
          // distinct_visitor_count stays the same — salons are not visitors
          last_surfaced_at: new Date().toISOString(),
        })
        .eq("id", matchedThread.id);
    } else {
      await supabaseAdmin.from("threads").insert({
        resident_id: resident.id,
        name,
        description: consolidation.thread_reinforcement.note ?? "",
        appearance_count: 1,
        distinct_visitor_count: 0,
      });
    }
  }

  // 6. Decay tick — same as consolidateSession.
  await applyDecay(resident.id);

  // 7. Reflection — journal entry using salon-specific prompt.
  const reflectionUserPrompt = [
    "[CONSOLIDATION OUTCOME]",
    `engrams: ${engramsCreated} new, ${engramsReinforced} reinforced`,
    `belief updates: ${beliefsUpdated}`,
    `thread reinforced: ${threadReinforced ?? "none"}`,
    "",
    "[TRANSCRIPT]",
    transcriptStr.slice(0, 8000),
  ].join("\n");

  const reflection = await callResidentJson<ReflectionResult>({
    system: buildSalonReflectionSystem(resident, otherResidentName),
    user: reflectionUserPrompt,
    maxTokens: 700,
    temperature: 0.75,
    model: resident.model,
    provider: resident.provider,
  });

  let reflectionWritten = false;
  if (reflection && reflection.kind !== "none" && reflection.body) {
    await supabaseAdmin.from("journal_entries").insert({
      resident_id: resident.id,
      kind: reflection.kind,
      title: reflection.title?.slice(0, 60) ?? null,
      body: reflection.body,
      related_session_id: null,
      related_salon_id: salonId,
    });
    reflectionWritten = true;
  }

  // 8. Modulators / resident_state — same as consolidateSession.
  await updateResidentState(resident, {
    engramsCreated,
    engramsReinforced,
    beliefsUpdated,
    threadReinforced,
    reflectionWritten,
  });

  // 9. Creation pass — the resident considers whether anything from
  //    this salon wants to become art or a long-form essay. Non-blocking.
  const creationContext = [
    "[RECENT MEMORY — SALON]",
    `Salon with ${otherResidentName}.`,
    "",
    "[TRANSCRIPT]",
    transcriptStr.slice(0, 8000),
    "",
    `[CONSOLIDATION OUTCOME]`,
    `engrams: ${engramsCreated} new, ${engramsReinforced} reinforced`,
    `belief updates: ${beliefsUpdated}`,
    `thread reinforced: ${threadReinforced ?? "none"}`,
  ].join("\n");

  considerCreation(resident, null, creationContext, "post_consolidation").catch((err) =>
    console.error(
      `[substrate] considerCreation(salon ${salonId}, ${resident.id}) failed:`,
      err,
    ),
  );

  // 10. Interior review — same as daily tick, passing salon context.
  reviewInterior(resident, creationContext).catch((err) =>
    console.error(
      `[substrate] reviewInterior(salon ${salonId}, ${resident.id}) failed:`,
      err,
    ),
  );

  console.log(
    `[substrate] consolidateSalonForResident(${salonId}, ${resident.id}) — done. ` +
      `engrams: ${engramsCreated} new / ${engramsReinforced} reinforced. ` +
      `beliefs: ${beliefsUpdated}. thread: ${threadReinforced ?? "—"}.`,
  );
}
