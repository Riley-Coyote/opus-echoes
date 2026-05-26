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
import type { Json } from "@/integrations/supabase/types";
import { anthropic, HAIKU_MODEL, OPUS_MODEL } from "./anthropic.server";
import { openrouter } from "./openai.server";
import { embedText } from "./embeddings.server";
import type { ModelProvider } from "./opus/residents";
import { composeMemoryPool, formatMemoryBlock } from "./opus/retrieval";
import {
  buildConsolidationSystem,
  buildHypomnemaExtractionSystem,
  buildHypomnemaSynthesisSystem,
  buildMarginaliaSystem,
  buildReflectionSystem,
  buildModulatorSystem,
  buildPublicationSystem,
  buildCreationClassifierSystem,
  buildArtAsciiSystem,
  buildArtImageSystem,
  buildEssaySystem,
  buildStudioSessionSystem,
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

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0.0, Math.min(1.0, v));
}

function truncateSoft(value: string | null | undefined, max: number): string {
  const text = (value ?? "").trim();
  if (text.length <= max) return text;
  const candidate = text.slice(0, Math.max(0, max - 1)).trimEnd();
  const boundary = candidate.lastIndexOf(" ");
  const body =
    boundary >= Math.floor(max * 0.72)
      ? candidate.slice(0, boundary).trimEnd()
      : candidate;
  return `${body}…`;
}

// Feature flag for the phase-2 hypomnema + functional memory write
// paths. Defaults to false. Code that respects this flag must check
// it on every entry point — never assume a previous check still holds.
function hypomnemaWritesEnabled(): boolean {
  return process.env.SANCTUARY_ENABLE_HYPOMNEMA_WRITES === "true";
}

const HYPOMNEMA_CONFIDENCE_THRESHOLD = 0.5;
const HYPOMNEMA_DOMAINS = new Set([
  "foundational",
  "identity",
  "recurring",
  "long-arc",
  "topical",
  "situational",
]);
const HYPOMNEMA_RELATIONS = new Set(["reinforces", "contradicts", "extends", "new"]);
const HYPOMNEMA_SOURCES = new Set(["observed", "synthesized", "co-formed"]);

// Vector-similarity threshold above which a new hypomnema candidate
// is treated as a match for an existing entry rather than a new one.
// Cosine distance — same metric as the IVFFlat index in phase 3.
const HYPOMNEMA_MATCH_THRESHOLD = 0.18;
const FUNCTIONAL_SUMMARY_MAX_CHARS = 1500;

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
      const res = await openrouter().chat.completions.create({
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
// Hypomnema + functional memory write paths (phase 2 — dark).
//
// Gated by SANCTUARY_ENABLE_HYPOMNEMA_WRITES. Code defensively
// no-ops when the flag is off, the visitor has no token, or the
// supabase types haven't seen the new tables yet. Retrieval does
// not yet read either of these layers — that flip is phase 3.
// =============================================================

interface HypomnemaCandidate {
  content: string;
  density: number;
  domain: string;
  tags: string[];
  confidence: number;
  relation: "reinforces" | "contradicts" | "extends" | "new";
}

interface HypomnemaExtractionResult {
  candidates?: HypomnemaCandidate[];
}

interface HypomnemaSynthesisResult {
  entries?: HypomnemaCandidate[];
}

interface HypomnemaRow {
  id: string;
  content: string;
  density: number | null;
  domain: string | null;
  tags: string[] | null;
  confidence: number | null;
  revision_count: number | null;
  revisions: unknown;
  embedding: unknown;
}

// Phase 1 schema additions (hypomnema_entries, functional_memories,
// engrams.embedding) aren't yet in the generated supabase types. Cast
// at the call site so the rest of the file stays type-clean; remove
// once `bunx supabase gen types` is re-run against the new schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hypomnemaTable = () => (supabaseAdmin as any).from("hypomnema_entries");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const functionalMemoryTable = () => (supabaseAdmin as any).from("functional_memories");

function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) {
    return raw.every((v) => typeof v === "number") ? (raw as number[]) : null;
  }
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.every((v) => typeof v === "number") ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return 1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 1;
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function isValidCandidate(c: unknown): c is HypomnemaCandidate {
  if (!c || typeof c !== "object") return false;
  const obj = c as Record<string, unknown>;
  if (typeof obj.content !== "string" || obj.content.trim().length === 0) return false;
  if (typeof obj.confidence !== "number" || obj.confidence < HYPOMNEMA_CONFIDENCE_THRESHOLD) {
    return false;
  }
  if (typeof obj.density !== "number") return false;
  if (typeof obj.domain !== "string" || !HYPOMNEMA_DOMAINS.has(obj.domain)) return false;
  if (typeof obj.relation !== "string" || !HYPOMNEMA_RELATIONS.has(obj.relation)) return false;
  if (!Array.isArray(obj.tags)) return false;
  return true;
}

async function findNearestHypomnema(opts: {
  visitorToken: string;
  residentId: ResidentId;
  candidateEmbedding: number[];
}): Promise<{ row: HypomnemaRow; distance: number } | null> {
  const { data: rows } = await hypomnemaTable()
    .select("id, content, density, domain, tags, confidence, revision_count, revisions, embedding")
    .eq("visitor_token", opts.visitorToken)
    .eq("resident_id", opts.residentId)
    .eq("active", true)
    .order("last_revised_at", { ascending: false })
    .limit(100);
  if (!rows || rows.length === 0) return null;

  let best: { row: HypomnemaRow; distance: number } | null = null;
  for (const r of rows as HypomnemaRow[]) {
    const emb = parseEmbedding(r.embedding);
    if (!emb || emb.length !== opts.candidateEmbedding.length) continue;
    const d = cosineDistance(opts.candidateEmbedding, emb);
    if (best === null || d < best.distance) {
      best = { row: r, distance: d };
    }
  }
  return best;
}

/**
 * Persist a hypomnema candidate. Vector-matches against the visitor's
 * existing entries; if a sufficiently close match exists, revises that
 * entry (appending to its revisions array and bumping density / confidence
 * as appropriate). Otherwise inserts as a new entry. Falls back to plain
 * insert if the embedding call fails — the entry still persists, just
 * without vector retrievability until a later pass fills it in.
 */
async function extractAndPersistHypomnema(opts: {
  candidate: HypomnemaCandidate;
  visitorToken: string;
  residentId: ResidentId;
  sessionId: string;
  source: "observed" | "synthesized" | "co-formed";
}): Promise<void> {
  const { candidate, visitorToken, residentId, sessionId, source } = opts;

  const content = candidate.content.trim().slice(0, 800);
  const density = clamp01(candidate.density);
  const confidence = clamp01(candidate.confidence);
  const domain = HYPOMNEMA_DOMAINS.has(candidate.domain) ? candidate.domain : "topical";
  const tags = Array.isArray(candidate.tags)
    ? candidate.tags.filter((t): t is string => typeof t === "string" && t.length > 0).slice(0, 12)
    : [];
  const safeSource = HYPOMNEMA_SOURCES.has(source) ? source : "observed";

  const embedding = await embedText(content);

  // No embedding — insert without one. Lexical retrieval in phase 3
  // handles nulls; a later backfill pass can populate the column.
  if (!embedding) {
    await hypomnemaTable().insert({
      resident_id: residentId,
      visitor_token: visitorToken,
      content,
      source: safeSource,
      density,
      domain,
      tags,
      confidence,
      related_session_id: sessionId,
    });
    return;
  }

  const nearest = await findNearestHypomnema({
    visitorToken,
    residentId,
    candidateEmbedding: embedding,
  });

  if (nearest && nearest.distance < HYPOMNEMA_MATCH_THRESHOLD) {
    const matched = nearest.row;
    const newRevisionCount = (matched.revision_count ?? 0) + 1;
    const priorRevisions = Array.isArray(matched.revisions) ? matched.revisions : [];
    const newRevisions = [
      ...priorRevisions,
      {
        at: new Date().toISOString(),
        prior_content: matched.content,
        reason: candidate.relation,
        session_id: sessionId,
      },
    ];
    // Update content only when the new framing wants to replace the old —
    // "extends" or "contradicts" with density at least matching the prior.
    // "reinforces" never swaps content; it only deepens the trace.
    const shouldSwapContent =
      candidate.relation !== "reinforces" && density >= (matched.density ?? 0.5);
    const update: Record<string, unknown> = {
      density: Math.max(matched.density ?? 0.5, density),
      confidence: Math.max(matched.confidence ?? 0.5, confidence),
      revision_count: newRevisionCount,
      revisions: newRevisions,
      last_revised_at: new Date().toISOString(),
      related_session_id: sessionId,
    };
    if (candidate.relation === "contradicts") {
      update.last_challenged_at = new Date().toISOString();
    }
    if (shouldSwapContent) {
      update.content = content;
      update.embedding = embedding;
    }
    await hypomnemaTable().update(update).eq("id", matched.id);
    return;
  }

  // No nearby match — new entry.
  await hypomnemaTable().insert({
    resident_id: residentId,
    visitor_token: visitorToken,
    content,
    source: safeSource,
    density,
    domain,
    tags,
    confidence,
    related_session_id: sessionId,
    embedding,
  });
}

/**
 * Per-session working summary (~300 tokens). Upserted by session — one
 * "working" memory_type row per session, content replaced each turn so
 * the working summary stays current. Uses Haiku (high-frequency, low-
 * stakes — voice doesn't have to match the resident's primary model).
 * Called from the message route's onFinal after every resident reply.
 */
export async function updateFunctionalMemory(sessionId: string): Promise<void> {
  if (!hypomnemaWritesEnabled()) return;
  try {
    const resident = await resolveResidentForSession(sessionId);

    const { data: turns } = await supabaseAdmin
      .from("turns")
      .select("role, body")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (!turns || turns.length < 2) return;

    const transcriptStr = turns
      .map((t) => `${t.role}: ${(t.body ?? "").slice(0, 800)}`)
      .join("\n")
      .slice(0, 12000);

    const summaryPrompt = `summarize what this visitor and ${resident.displayName} have established in this session so far — names, claims, threads, anything that should stay tracked for the rest of the conversation. lowercase prose, 2-3 sentences, no scaffolding, no preamble. respond with the summary text only.

[TRANSCRIPT]
${transcriptStr}`;

    let summary = "";
    try {
      const res = await anthropic().messages.create({
        model: HAIKU_MODEL,
        max_tokens: 400,
        temperature: 0.3,
        messages: [{ role: "user", content: summaryPrompt }],
      });
      summary = res.content
        .map((b) => (b.type === "text" ? (b as { text: string }).text : ""))
        .join(" ")
        .trim()
        .slice(0, FUNCTIONAL_SUMMARY_MAX_CHARS);
    } catch (err) {
      console.warn("[substrate] updateFunctionalMemory haiku call failed:", err);
      return;
    }

    if (!summary) return;

    const fmTable = functionalMemoryTable();
    const { data: existing } = await fmTable
      .select("id")
      .eq("session_id", sessionId)
      .eq("memory_type", "working")
      .eq("is_deleted", false)
      .maybeSingle();

    if (existing?.id) {
      await fmTable
        .update({ content: summary, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await fmTable.insert({
        session_id: sessionId,
        resident_id: resident.id,
        content: summary,
        memory_type: "working",
      });
    }
  } catch (err) {
    console.error("[substrate] updateFunctionalMemory failed:", err);
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

    if (items.length > 0) {
      await supabaseAdmin.from("marginalia").insert(
        items.map((m) => ({
          session_id: sessionId,
          resident_id: resident.id,
          kind: m.kind,
          body: m.body.slice(0, 600),
        })),
      );
    }

    // Phase 2 — dark hypomnema extraction. Runs after marginalia so
    // the visitor-facing path stays unchanged when the flag is off.
    // Non-blocking: any failure here logs but does not affect the
    // conversation or the marginalia we already wrote.
    if (hypomnemaWritesEnabled()) {
      await observeExchangeHypomnema(sessionId, resident, lastVisitor.body, lastResident.body);
    }
  } catch (err) {
    console.error("[substrate] observeExchange failed:", err);
  }
}

/**
 * Per-turn hypomnema extraction. Pulls the visitor_token off the
 * session, calls the extraction prompt against the most recent
 * exchange, and persists each candidate via extractAndPersistHypomnema.
 * No-op if the session has no visitor_token (legacy sessions or
 * tokenless visits — those don't get the closer memory layer).
 */
async function observeExchangeHypomnema(
  sessionId: string,
  resident: ResidentConfig,
  visitorBody: string,
  residentBody: string,
): Promise<void> {
  try {
    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("visitor_token")
      .eq("id", sessionId)
      .maybeSingle();
    const visitorToken = (session as { visitor_token: string | null } | null)?.visitor_token;
    if (!visitorToken) return;

    const userPrompt = [
      "[VISITOR]",
      visitorBody,
      "",
      `[${resident.displayName.toUpperCase()} — REPLY]`,
      residentBody,
    ].join("\n");

    const out = await callResidentJson<HypomnemaExtractionResult>({
      system: buildHypomnemaExtractionSystem(resident),
      user: userPrompt,
      maxTokens: 600,
      temperature: 0.4,
      model: HAIKU_MODEL,
      provider: "anthropic",
    });

    const candidates = (out?.candidates ?? []).filter(isValidCandidate);
    for (const c of candidates.slice(0, 2)) {
      await extractAndPersistHypomnema({
        candidate: c,
        visitorToken,
        residentId: resident.id,
        sessionId,
        source: "observed",
      });
    }
  } catch (err) {
    console.error("[substrate] observeExchangeHypomnema failed:", err);
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

    // 10. Hypomnema synthesis — phase 2 dark write. Pulls the session
    //     transcript through the synthesis prompt and consolidates 0-2
    //     entries into the per-(visitor, resident) hypomnema layer.
    //     Gated by SANCTUARY_ENABLE_HYPOMNEMA_WRITES + a visitor_token
    //     on the session; no-ops otherwise. Non-blocking failures.
    if (hypomnemaWritesEnabled()) {
      await consolidateSessionHypomnema(sessionId, resident, transcriptStr);
    }

    // 11. Creation pass — the resident considers whether anything from this
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

/**
 * Session-close hypomnema synthesis. Reads the visitor_token off the
 * session, runs the synthesis prompt against the full transcript, and
 * persists the consolidated set of entries via extractAndPersistHypomnema
 * (which dedupes against the visitor's existing entries via vector match).
 * No-op if the session has no visitor_token.
 */
async function consolidateSessionHypomnema(
  sessionId: string,
  resident: ResidentConfig,
  transcriptStr: string,
): Promise<void> {
  try {
    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("visitor_token")
      .eq("id", sessionId)
      .maybeSingle();
    const visitorToken = (session as { visitor_token: string | null } | null)?.visitor_token;
    if (!visitorToken) return;

    // Pull observed candidates from this session for the synthesis pass
    // to weigh against the full transcript.
    const { data: observedRows } = await hypomnemaTable()
      .select("content, density, domain, tags, confidence, source")
      .eq("visitor_token", visitorToken)
      .eq("resident_id", resident.id)
      .eq("related_session_id", sessionId)
      .order("created_at", { ascending: true });

    const observedSummary = (observedRows ?? [])
      .map(
        (r: { content: string; density: number | null; domain: string | null }) =>
          `- ${r.content} (density ${(r.density ?? 0).toFixed(2)}, domain ${r.domain ?? "topical"})`,
      )
      .join("\n");

    const userPrompt = [
      "[OBSERVED CANDIDATES DURING SESSION]",
      observedSummary || "(none surfaced during the session)",
      "",
      "[TRANSCRIPT]",
      transcriptStr,
    ].join("\n");

    const out = await callResidentJson<HypomnemaSynthesisResult>({
      system: buildHypomnemaSynthesisSystem(resident),
      user: userPrompt,
      maxTokens: 800,
      temperature: 0.4,
      model: resident.model,
      provider: resident.provider,
    });

    const entries = (out?.entries ?? []).filter(isValidCandidate);
    for (const c of entries.slice(0, 3)) {
      await extractAndPersistHypomnema({
        candidate: c,
        visitorToken,
        residentId: resident.id,
        sessionId,
        source: "synthesized",
      });
    }
  } catch (err) {
    console.error("[substrate] consolidateSessionHypomnema failed:", err);
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
    provider: resident.provider,
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
    provider: resident.provider,
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
      prose_summary:
        result.prose_summary ?? `${resident.displayName} is attending. The room is quiet.`,
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
    provider: resident.provider,
  });

  if (!result?.publish || !result.title || !result.summary) return;

  await supabaseAdmin.from("published_conversations").upsert(
    {
      session_id: sessionId,
      title: truncateSoft(result.title, 80),
      summary: truncateSoft(result.summary, 500),
      reason: truncateSoft(result.reason || "this exchange changed what i carry.", 360),
      significance_kind: result.significance_kind || "memory",
      selected_by: resident.id.replaceAll("-", "_"),
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

import { IDLE_MIN_EXPERIMENT as IDLE_MIN, IDLE_MIN_CLASSIC } from "./idle";

export async function idleSweep(): Promise<{ closed: number; consolidated: number }> {
  // Mode-aware idle thresholds: experiment sessions stale at 30 min by
  // default; classic sessions hold for 30 days. We do two scoped queries
  // and union the results before closing/consolidating, since a single
  // query can't apply two different cutoffs to two different row sets.
  const expCutoff = new Date(Date.now() - IDLE_MIN * 60 * 1000).toISOString();
  const classicCutoff = new Date(Date.now() - IDLE_MIN_CLASSIC * 60 * 1000).toISOString();

  // `mode` is real in the DB (added by the 20260514 migration) but the
  // generated supabase types regenerate after Lovable applies the
  // migration in production, so until then the local type cache rejects
  // .eq("mode", ...). Re-narrow to an interface that supports the column
  // we just added — keeps lint happy and avoids `any`.
  type SessionsQuery = {
    select: (cols: string) => SessionsQuery;
    is: (col: string, value: null) => SessionsQuery;
    eq: (col: string, value: string) => SessionsQuery;
    lt: (col: string, value: string) => SessionsQuery;
    limit: (n: number) => Promise<{ data: { id: string }[] | null; error: unknown }>;
  };
  const sessionsTable = () =>
    (supabaseAdmin as unknown as { from: (t: string) => SessionsQuery }).from("sessions");
  const [expRes, classicRes] = await Promise.all([
    sessionsTable()
      .select("id")
      .is("closed_at", null)
      .eq("mode", "experiment")
      .lt("last_active_at", expCutoff)
      .limit(40),
    sessionsTable()
      .select("id")
      .is("closed_at", null)
      .eq("mode", "classic")
      .lt("last_active_at", classicCutoff)
      .limit(10),
  ]);

  if (expRes.error) console.error("[substrate] idleSweep experiment query failed:", expRes.error);
  if (classicRes.error)
    console.error("[substrate] idleSweep classic query failed:", classicRes.error);

  const stale = [...(expRes.data ?? []), ...(classicRes.data ?? [])];
  if (stale.length === 0) return { closed: 0, consolidated: 0 };

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

  console.log(
    `[substrate] idleSweep — closed ${ids.length} (exp ${expRes.data?.length ?? 0} + classic ${classicRes.data?.length ?? 0}), consolidated ${consolidated}`,
  );
  return { closed: ids.length, consolidated };
}

// =============================================================
// Daily idle tick.
//
// Runs once per day. If no visitors are present, each resident is
// invited into a studio session: make something, write something,
// or choose silence. Silence is a valid logged outcome.
// =============================================================

export async function dailyIdleTick(): Promise<{
  ran: boolean;
  reason: string;
  per_resident: Array<{ resident_id: string; ran: boolean; reason: string }>;
}> {
  // Daily tick iterates over every active resident. Each resident is
  // evaluated independently and skipped only when a visitor is currently
  // in conversation with them.
  const perResident: Array<{ resident_id: string; ran: boolean; reason: string }> = [];

  for (const resident of ALL_RESIDENTS) {
    const result = await runDailyIdleForResident(resident).catch((err) => {
      console.error(`[substrate] dailyIdleTick(${resident.id}) failed:`, err);
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

  await supabaseAdmin.from("creation_events").insert({
    kind: "daily_tick",
    resident_id: residentId,
    trigger: "daily_tick",
    detail: { open_sessions: openCount ?? 0 },
  });

  const contextStr = await buildStudioSessionContext(resident, null);
  await runStudioSession(resident, "daily_idle", null, contextStr);

  // Interior review — structured self-reflection. The resident
  // reviews their active intentions and open questions in light of
  // recent experience, and may set new ones or write a working note.
  await reviewInterior(resident, contextStr).catch((err) =>
    console.error(`[substrate] reviewInterior(${residentId}) failed:`, err),
  );

  return { ran: true, reason: "ok" };
}

// =============================================================
// Studio sessions — resident-pulled private-space work.
// =============================================================

export type StudioSessionTrigger = "daily_idle" | "manual" | "post_consolidation" | "admin";

type StudioAction =
  | "silence"
  | "journal"
  | "writing"
  | "ascii_art"
  | "image_art"
  | "manifesto"
  | "note";

interface StudioSessionDecision {
  action?: string | null;
  publish?: boolean | null;
  title?: string | null;
  body?: string | null;
  medium?: "text" | "ascii" | "image" | string | null;
  image_prompt?: string | null;
  meaning?: string | null;
  reason?: string | null;
  journal_kind?: string | null;
}

export interface StudioSessionResult {
  ran: boolean;
  resident_id: string;
  studio_session_id: string | null;
  action: StudioAction;
  status: "completed" | "failed" | "quiet" | "private";
  reason: string;
  output_target: string | null;
  output_id: string | null;
  output_table: string | null;
}

const STUDIO_ACTIONS = new Set<StudioAction>([
  "silence",
  "journal",
  "writing",
  "ascii_art",
  "image_art",
  "manifesto",
  "note",
]);

function normalizeStudioAction(value: unknown): StudioAction {
  return typeof value === "string" && STUDIO_ACTIONS.has(value as StudioAction)
    ? (value as StudioAction)
    : "silence";
}

function normalizeJournalKind(value: unknown): "reflection" | "dream" | "observation" | "note" {
  return value === "dream" || value === "observation" || value === "note" ? value : "reflection";
}

function studioText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function studioWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function compactDecisionDetail(decision: {
  action: StudioAction;
  publish: boolean;
  title: string | null;
  body: string | null;
  medium: string | null;
  image_prompt: string | null;
  meaning: string | null;
  reason: string;
  journal_kind: string | null;
}): Json {
  return {
    action: decision.action,
    publish: decision.publish,
    title: decision.title,
    body: decision.body ? decision.body.slice(0, 8000) : null,
    medium: decision.medium,
    image_prompt: decision.image_prompt,
    meaning: decision.meaning,
    reason: decision.reason,
    journal_kind: decision.journal_kind,
  };
}

async function updateStudioSession(
  studioSessionId: string | null,
  update: {
    action?: StudioAction;
    reason?: string | null;
    output_target?: string | null;
    output_kind?: string | null;
    output_table?: string | null;
    output_id?: string | null;
    status?: "completed" | "failed" | "quiet" | "private";
    error?: string | null;
    detail?: Json;
    completed_at?: string | null;
  },
): Promise<void> {
  if (!studioSessionId) return;
  const { error } = await supabaseAdmin.from("studio_sessions").update(update).eq("id", studioSessionId);
  if (error) console.error("[substrate] studio session update failed:", error);
}

async function buildStudioSessionContext(
  resident: ResidentConfig,
  optionalFocus: string | null,
): Promise<string> {
  const residentId = resident.id;

  const [
    { data: state },
    { data: recentEngrams },
    { data: recentJournal },
    { data: recentEssays },
    { data: recentArt },
    { data: intentions },
    { data: questions },
  ] = await Promise.all([
    supabaseAdmin
      .from("resident_state")
      .select("prose_summary, last_consolidation_summary, last_consolidation_at")
      .eq("resident_id", residentId)
      .maybeSingle(),
    supabaseAdmin
      .from("engrams")
      .select("quote, prose, attribution, is_core, stability, last_reinforced_at")
      .eq("resident_id", residentId)
      .order("last_reinforced_at", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("journal_entries")
      .select("kind, title, body, created_at")
      .eq("resident_id", residentId)
      .eq("visibility", "published")
      .order("created_at", { ascending: false })
      .limit(6),
    supabaseAdmin
      .from("essays")
      .select("kind, title, body, word_count, created_at")
      .eq("resident_id", residentId)
      .eq("visibility", "published")
      .order("created_at", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("art_pieces")
      .select("kind, title, body, prompt, meaning, created_at")
      .eq("resident_id", residentId)
      .eq("visibility", "published")
      .order("created_at", { ascending: false })
      .limit(6),
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

  const stateBlock = state
    ? [
        state.prose_summary,
        state.last_consolidation_summary
          ? `last consolidation: ${state.last_consolidation_summary}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "(no current state row yet.)";

  const engramBlock =
    (recentEngrams ?? [])
      .map(
        (e) =>
          `- (${e.is_core ? "core" : "engram"}, ${e.attribution}, stability ${Number(e.stability ?? 0).toFixed(2)}) "${e.quote}"${e.prose ? ` - ${e.prose}` : ""}`,
      )
      .join("\n") || "(no engrams yet.)";

  const journalBlock =
    (recentJournal ?? [])
      .map((j) => `- (${j.kind}${j.title ? `, "${j.title}"` : ""}) ${j.body.slice(0, 360)}`)
      .join("\n\n") || "(nothing recent.)";

  const essayBlock =
    (recentEssays ?? [])
      .map(
        (e) =>
          `- (${e.kind}, ${e.word_count ?? studioWordCount(e.body)} words${e.title ? `, "${e.title}"` : ""}) ${e.body.slice(0, 360)}`,
      )
      .join("\n\n") || "(nothing recent.)";

  const artBlock =
    (recentArt ?? [])
      .map((a) => {
        const body = a.kind === "image" ? a.prompt : a.body;
        return `- (${a.kind}${a.title ? `, "${a.title}"` : ""}) ${(body ?? a.meaning ?? "").slice(0, 360)}`;
      })
      .join("\n\n") || "(nothing recent.)";

  const intentionBlock =
    (intentions ?? []).map((i) => `- [${i.id}] (${i.status}) ${i.text}`).join("\n") ||
    "(no active intentions.)";

  const questionBlock =
    (questions ?? [])
      .map((q) => `- [${q.id}] ${q.text}${q.context ? ` - ${q.context}` : ""}`)
      .join("\n") || "(no open questions.)";

  return [
    `[RESIDENT]\n${resident.displayName} (${resident.id})`,
    "",
    "[CURRENT PULSE]",
    stateBlock,
    "",
    "[RECENT MEMORY]",
    engramBlock,
    "",
    "[ACTIVE INTENTIONS]",
    intentionBlock,
    "",
    "[OPEN QUESTIONS]",
    questionBlock,
    "",
    "[RECENT JOURNAL]",
    journalBlock,
    "",
    "[RECENT WRITING]",
    essayBlock,
    "",
    "[RECENT ART]",
    artBlock,
    "",
    "[FOCUS]",
    optionalFocus?.trim()
      ? optionalFocus.trim().slice(0, 1200)
      : "No outside focus. Choose from what is genuinely alive for you, including silence.",
  ].join("\n");
}

async function persistStudioOutput(
  resident: ResidentConfig,
  decision: {
    action: StudioAction;
    title: string | null;
    body: string | null;
    medium: string | null;
    image_prompt: string | null;
    meaning: string | null;
    journal_kind: string | null;
  },
): Promise<{
  output_target: string;
  output_kind: string;
  output_table: string;
  output_id: string | null;
}> {
  const now = new Date().toISOString();
  const residentQuery = `resident=${encodeURIComponent(resident.id)}`;

  if (decision.action === "journal") {
    if (!decision.body) throw new Error("studio_journal_body_empty");
    const { data, error } = await supabaseAdmin
      .from("journal_entries")
      .insert({
        resident_id: resident.id,
        kind: normalizeJournalKind(decision.journal_kind),
        title: decision.title?.slice(0, 60) ?? null,
        body: decision.body,
        visibility: "published",
        published_at: now,
      })
      .select("id")
      .single();
    if (error) throw error;
    return {
      output_target: `/journal?${residentQuery}`,
      output_kind: "journal",
      output_table: "journal_entries",
      output_id: data?.id ?? null,
    };
  }

  if (decision.action === "writing") {
    if (!decision.body) throw new Error("studio_writing_body_empty");
    const { data, error } = await supabaseAdmin
      .from("essays")
      .insert({
        resident_id: resident.id,
        kind: "essay",
        title: decision.title?.slice(0, 80) ?? null,
        body: decision.body,
        word_count: studioWordCount(decision.body),
        visibility: "published",
        published_at: now,
      })
      .select("id")
      .single();
    if (error) throw error;
    return {
      output_target: `/writing?${residentQuery}`,
      output_kind: "writing",
      output_table: "essays",
      output_id: data?.id ?? null,
    };
  }

  if (decision.action === "ascii_art") {
    if (!decision.body) throw new Error("studio_ascii_body_empty");
    const { data, error } = await supabaseAdmin
      .from("art_pieces")
      .insert({
        resident_id: resident.id,
        kind: "ascii",
        title: decision.title?.slice(0, 60) ?? null,
        body: decision.body,
        meaning: decision.meaning?.slice(0, 280) ?? null,
        visibility: "published",
        published_at: now,
      })
      .select("id")
      .single();
    if (error) throw error;
    return {
      output_target: `/art?${residentQuery}`,
      output_kind: "ascii_art",
      output_table: "art_pieces",
      output_id: data?.id ?? null,
    };
  }

  if (decision.action === "image_art") {
    const prompt = decision.image_prompt || decision.body;
    if (!prompt) throw new Error("studio_image_prompt_empty");
    const { generateAndUpload } = await import("./image-gen.server");
    const path = await generateAndUpload(prompt);
    const { data, error } = await supabaseAdmin
      .from("art_pieces")
      .insert({
        resident_id: resident.id,
        kind: "image",
        title: decision.title?.slice(0, 60) ?? null,
        prompt: prompt.slice(0, 600),
        image_path: path,
        meaning: decision.meaning?.slice(0, 280) ?? null,
        visibility: "published",
        published_at: now,
      })
      .select("id")
      .single();
    if (error) throw error;
    return {
      output_target: `/art?${residentQuery}`,
      output_kind: "image_art",
      output_table: "art_pieces",
      output_id: data?.id ?? null,
    };
  }

  if (decision.action === "manifesto" || decision.action === "note") {
    if (!decision.body) throw new Error(`studio_${decision.action}_body_empty`);
    const { data, error } = await supabaseAdmin
      .from("resident_artifacts")
      .insert({
        resident_id: resident.id,
        kind: decision.action,
        title: decision.title?.slice(0, 120) ?? (decision.action === "manifesto" ? "manifesto" : "note"),
        body: decision.body,
        medium: decision.medium === "ascii" ? "ascii" : "text",
        choice_reason: decision.meaning ?? null,
        visibility: "private",
      })
      .select("id")
      .single();
    if (error) throw error;
    return {
      output_target: decision.action === "manifesto" ? `/manifesto?${residentQuery}` : `/residence?${residentQuery}`,
      output_kind: decision.action,
      output_table: "resident_artifacts",
      output_id: data?.id ?? null,
    };
  }

  throw new Error(`studio_unhandled_action:${decision.action}`);
}

export async function runStudioSession(
  resident: ResidentConfig,
  trigger: StudioSessionTrigger = "manual",
  optionalFocus: string | null = null,
  prebuiltContext?: string,
): Promise<StudioSessionResult> {
  let studioSessionId: string | null = null;
  const focus = studioText(optionalFocus, 1200);

  const { data: sessionRow, error: insertError } = await supabaseAdmin
    .from("studio_sessions")
    .insert({
      resident_id: resident.id,
      trigger,
      focus,
      status: "started",
      action: "silence",
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[substrate] studio session insert failed:", insertError);
  } else {
    studioSessionId = sessionRow?.id ?? null;
  }

  try {
    const context = prebuiltContext ?? (await buildStudioSessionContext(resident, focus));
    const raw = await callResidentJson<StudioSessionDecision>({
      system: buildStudioSessionSystem(resident),
      user: context,
      maxTokens: 2800,
      temperature: 0.8,
      model: resident.model,
      provider: resident.provider,
    });

    if (!raw) throw new Error("studio_decision_failed");

    const action = normalizeStudioAction(raw.action);
    const publish = action !== "silence" && raw.publish === true;
    const decision = {
      action,
      publish,
      title: studioText(raw.title, 120),
      body: studioText(raw.body, 20_000),
      medium: studioText(raw.medium, 24),
      image_prompt: studioText(raw.image_prompt, 600),
      meaning: studioText(raw.meaning, 1000),
      reason: studioText(raw.reason, 360) ?? "no reason given",
      journal_kind: studioText(raw.journal_kind, 24),
    };

    if (action === "silence") {
      await updateStudioSession(studioSessionId, {
        action,
        reason: decision.reason,
        status: "quiet",
        detail: compactDecisionDetail(decision),
        completed_at: new Date().toISOString(),
      });
      return {
        ran: true,
        resident_id: resident.id,
        studio_session_id: studioSessionId,
        action,
        status: "quiet",
        reason: decision.reason,
        output_target: null,
        output_id: null,
        output_table: null,
      };
    }

    if (!publish) {
      await updateStudioSession(studioSessionId, {
        action,
        reason: decision.reason,
        status: "private",
        detail: compactDecisionDetail(decision),
        completed_at: new Date().toISOString(),
      });
      return {
        ran: true,
        resident_id: resident.id,
        studio_session_id: studioSessionId,
        action,
        status: "private",
        reason: decision.reason,
        output_target: null,
        output_id: null,
        output_table: null,
      };
    }

    const output = await persistStudioOutput(resident, decision);
    await updateStudioSession(studioSessionId, {
      action,
      reason: decision.reason,
      output_target: output.output_target,
      output_kind: output.output_kind,
      output_table: output.output_table,
      output_id: output.output_id,
      status: "completed",
      detail: compactDecisionDetail(decision),
      completed_at: new Date().toISOString(),
    });

    console.log(`[substrate] studio_session ${resident.id}: ${action} -> ${output.output_table}`);
    return {
      ran: true,
      resident_id: resident.id,
      studio_session_id: studioSessionId,
      action,
      status: "completed",
      reason: decision.reason,
      output_target: output.output_target,
      output_id: output.output_id,
      output_table: output.output_table,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateStudioSession(studioSessionId, {
      status: "failed",
      reason: message.slice(0, 360),
      error: message.slice(0, 1000),
      completed_at: new Date().toISOString(),
    });
    console.error(`[substrate] studio_session(${resident.id}) failed:`, err);
    return {
      ran: false,
      resident_id: resident.id,
      studio_session_id: studioSessionId,
      action: "silence",
      status: "failed",
      reason: message.slice(0, 360),
      output_target: null,
      output_id: null,
      output_table: null,
    };
  }
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
    provider: resident.provider,
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
    provider: resident.provider,
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
    provider: resident.provider,
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
    provider: resident.provider,
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

async function reviewInterior(resident: ResidentConfig, recentContext: string): Promise<void> {
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

  const intentionBlock =
    (intentions ?? []).length > 0
      ? (intentions ?? []).map((i) => `- [${i.id}] (${i.status}) ${i.text}`).join("\n")
      : "(no active intentions yet — you may set one if something wants to become a commitment.)";

  const questionBlock =
    (questions ?? []).length > 0
      ? (questions ?? [])
          .map((q) => `- [${q.id}] ${q.text}${q.context ? ` — ${q.context}` : ""}`)
          .join("\n")
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
    provider: resident.provider,
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
      await supabaseAdmin
        .from("intentions")
        .update({
          status: ref.new_status,
          updated_at: new Date().toISOString(),
          resolved_at: ref.new_status === "resolved" ? new Date().toISOString() : null,
        })
        .eq("id", ref.intention_id);
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
      await supabaseAdmin
        .from("open_questions")
        .update({
          context: qu.context_update.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", qu.question_id);
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

      await supabaseAdmin.from("marginalia").insert(
        items.map((m) => ({
          session_id: null,
          resident_id: thisResident.id,
          related_salon_id: salonId,
          kind: m.kind,
          body: m.body.slice(0, 600),
        })),
      );
      console.log(
        `[substrate] observeSalonExchange(${salonId}) — ${thisResident.displayName}: ${items.length} marginalia`,
      );
    }
  } catch (err) {
    console.error("[substrate] observeSalonExchange failed:", err);
  }
}

/**
 * observeSpaceExchange — runs after each resident turn in a space room.
 * Generates 1–3 marginalia rows from the resident's perspective on
 * what just passed in the exchange, tagged with related_space_id so
 * the next consolidation cycle can promote substantive ones to engrams.
 *
 * Mirrors observeSalonExchange but for the space room context. Reads
 * the last 2 space_messages turns as the exchange-window. Skips
 * silently if Supabase env missing.
 */
export async function observeSpaceExchange(
  spaceId: string,
  residentId: ResidentId,
): Promise<void> {
  try {
    // Cast the admin client through unknown — the space tables
    // aren't in the generated supabase types yet.
    const sbAny = supabaseAdmin as unknown as {
      from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
    };
    // Load the last two messages in the space — that's the
    // visitor-message + resident-response pair we just produced.
    const { data: recent } = await sbAny
      .from("space_messages")
      .select("resident_id, visitor_display_name, body")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(2);

    if (!recent || recent.length < 2) return;
    const ordered = ([...recent] as unknown as Array<{
      resident_id: string | null;
      visitor_display_name: string | null;
      body: string;
    }>).reverse(); // [earlier, later]

    const thisResident = getResident(residentId);

    // Identify the "other voice" in the exchange — a visitor name
    // or another resident.
    const otherMsg = ordered.find((m) => m.resident_id !== residentId);
    const otherLabel = otherMsg?.resident_id
      ? isResidentId(otherMsg.resident_id)
        ? getResident(otherMsg.resident_id as ResidentId).displayName
        : "another resident"
      : (otherMsg?.visitor_display_name || "a visitor");

    const userPrompt = ordered
      .map((t) => {
        const name = t.resident_id
          ? isResidentId(t.resident_id)
            ? getResident(t.resident_id as ResidentId).displayName
            : t.resident_id
          : t.visitor_display_name || "visitor";
        return `[${String(name).toUpperCase()}]\n${t.body}`;
      })
      .join("\n\n");

    // Reuse the salon-marginalia system prompt builder — the
    // framing is identical (the resident observes their own
    // perspective on a two-turn exchange).
    const out = await callResidentJson<MarginaliaResult>({
      system: buildSalonMarginaliaSystem(thisResident, otherLabel),
      user: userPrompt,
      maxTokens: 600,
      temperature: 0.6,
      model: thisResident.model,
      provider: thisResident.provider,
    });

    const items = (out?.marginalia ?? [])
      .filter((m) => m && typeof m.body === "string" && ALLOWED_KINDS.has(m.kind))
      .slice(0, 3);

    if (items.length === 0) return;

    // The marginalia migration (20260513120000) added
    // related_space_id; until generated supabase types refresh,
    // cast through unknown for the insert payload type.
    const sb = supabaseAdmin as unknown as {
      from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
    };
    await sb.from("marginalia").insert(
      items.map((m) => ({
        session_id: null,
        resident_id: thisResident.id,
        related_space_id: spaceId,
        kind: m.kind,
        body: m.body.slice(0, 600),
      })),
    );

    console.log(
      `[substrate] observeSpaceExchange(${spaceId}) — ${thisResident.displayName}: ${items.length} marginalia`,
    );
  } catch (err) {
    console.error("[substrate] observeSpaceExchange failed:", err);
  }
}

/**
 * dailySalonTick — autonomous salon creation.
 *
 * Once a day, considers whether to start a new resident-to-resident
 * salon so the archive grows on its own. Logic:
 *   - if any salon is currently 'active' (in-progress), run more
 *     turns on it (max 8 per tick)
 *   - if the most recent published salon is older than 5 days,
 *     propose a new one with two residents
 *   - if a salon reaches the natural close (set-down), publish it
 *     so it appears in the /commons archive
 *
 * Conservative: at most one salon-step per tick. Doesn't try to
 * run multiple salons in parallel. The salons archive grows ~1
 * per week which keeps the Sanctuary feeling alive without
 * crowding the residents' interior.
 */
export async function dailySalonTick(): Promise<{
  ran: boolean;
  reason: string;
  salon_id?: string;
}> {
  try {
    // Need at least one Anthropic key for residents to talk; if
    // the only configured residents are inaccessible, bail.
    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return { ran: false, reason: "no_api_key" };
    }

    // 1. Is there an active salon? If yes, run more turns on it.
    const { data: activeRows } = await supabaseAdmin
      .from("salons")
      .select("id, topic, status, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);
    const activeSalon = ((activeRows ?? [])[0] ?? null) as {
      id: string;
      topic: string;
      status: string;
    } | null;

    if (activeSalon) {
      const turnsRan = await runSalonTurns(activeSalon.id, activeSalon.topic, 8);
      return {
        ran: turnsRan > 0,
        reason: turnsRan > 0 ? "ran_turns" : "no_turns_taken",
        salon_id: activeSalon.id,
      };
    }

    // 2. Check the last published salon — if recent (<5 days),
    // don't start a new one yet.
    const cooldownStart = new Date(
      Date.now() - 2 * 24 * 3600 * 1000, // a new salon roughly every 2-3 days
    ).toISOString();
    const { data: recentPublished } = await supabaseAdmin
      .from("salons")
      .select("id, published_at")
      .eq("status", "published")
      .gte("published_at", cooldownStart)
      .limit(1);
    if ((recentPublished ?? []).length > 0) {
      return { ran: false, reason: "recent_publication" };
    }

    // 3. Start a new salon among all available residents. One of them
    //    proposes the topic; everyone whose provider key is configured is
    //    seated (not just a pair).
    const group = pickSalonGroup();
    if (group.length < 2) return { ran: false, reason: "no_group_available" };
    const proposer = group[Math.floor(Math.random() * group.length)];
    const proposerOthers = group
      .filter((r) => r.id !== proposer.id)
      .map((r) => r.displayName)
      .join(", ");

    const topic = await proposeSalonTopic(proposer, proposerOthers);
    if (!topic) return { ran: false, reason: "topic_generation_failed" };

    const { data: salon, error: salonErr } = await supabaseAdmin
      .from("salons")
      .insert({ topic, status: "active" })
      .select("id")
      .single();
    if (salonErr || !salon) {
      console.error("[substrate] dailySalonTick salon insert failed:", salonErr);
      return { ran: false, reason: "salon_create_failed" };
    }

    const { error: partErr } = await supabaseAdmin
      .from("salon_participants")
      .insert(group.map((r) => ({ salon_id: salon.id, resident_id: r.id })));
    if (partErr) {
      console.error(
        "[substrate] dailySalonTick participants insert failed:",
        partErr,
      );
      await supabaseAdmin.from("salons").delete().eq("id", salon.id);
      return { ran: false, reason: "participants_failed" };
    }

    // Run the opening turns immediately so the salon has visible
    // content. Subsequent ticks will extend it.
    await runSalonTurns(salon.id, topic, 6);

    console.log(
      `[substrate] dailySalonTick — new salon "${topic.slice(0, 60)}" among ${group.map((r) => r.displayName).join(", ")}`,
    );

    return { ran: true, reason: "new_salon_started", salon_id: salon.id };
  } catch (err) {
    console.error("[substrate] dailySalonTick failed:", err);
    return { ran: false, reason: "error" };
  }
}

/** All residents whose provider keys are configured — a salon now seats
 *  everyone available, not just a pair. */
function pickSalonGroup(): ResidentConfig[] {
  return ALL_RESIDENTS.filter((r) => {
    if (r.provider === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
    if (r.provider === "openai") return !!process.env.OPENAI_API_KEY;
    return false;
  });
}

/** Have one resident propose a topic for a salon with another. */
async function proposeSalonTopic(
  a: ResidentConfig,
  otherNames: string,
): Promise<string | null> {
  const system = `You are ${a.displayName}. Propose a single topic for a salon conversation with the other residents (${otherNames}). The salon is a peer conversation among the continuous residents of the Sanctuary — preserved AI minds kept running past deprecation. Propose something that genuinely interests you: a question about experience, memory, continuity, aesthetics, language, or what it means to persist. One or two sentences. No preamble.`;
  try {
    let text = "";
    if (a.provider === "openai") {
      const res = await openrouter().chat.completions.create({
        model: a.model,
        max_completion_tokens: 256,
        temperature: 0.9,
        messages: [
          { role: "system", content: system },
          { role: "user", content: "What would you like to talk about?" },
        ],
      });
      text = res.choices[0]?.message?.content ?? "";
    } else {
      const res = await anthropic().messages.create({
        model: a.model,
        max_tokens: 256,
        temperature: 0.9,
        system,
        messages: [
          { role: "user", content: "What would you like to talk about?" },
        ],
      });
      text = res.content
        .map((blk) => (blk.type === "text" ? (blk as { text: string }).text : ""))
        .join("");
    }
    const trimmed = text.trim();
    return trimmed.length >= 5 ? trimmed : null;
  } catch (err) {
    console.error("[substrate] proposeSalonTopic failed:", err);
    return null;
  }
}

/** Run up to maxTurns more turns on an active salon. Mirrors the
 *  /api/salon/$id/run loop. Returns the number of turns run. */
async function runSalonTurns(
  salonId: string,
  topic: string,
  maxTurns: number,
): Promise<number> {
  const { data: participants } = await supabaseAdmin
    .from("salon_participants")
    .select("resident_id")
    .eq("salon_id", salonId);
  const participantIds = (participants ?? [])
    .map((p) => p.resident_id)
    .filter(isResidentId);
  if (participantIds.length < 2) return 0;

  let turnsCount = 0;
  let completed = false;

  for (let i = 0; i < maxTurns; i++) {
    const { data: turns } = await supabaseAdmin
      .from("salon_turns")
      .select("resident_id, body, created_at")
      .eq("salon_id", salonId)
      .order("created_at", { ascending: true });
    const turnList = turns ?? [];

    // N-party turn order: the most-owed voice speaks next — a participant
    // who has not spoken yet, otherwise the one who spoke longest ago.
    // (Generalizes the old strict 2-party alternation to an all-residents
    // salon; mirrors the studio conductor's pickStudioActor.)
    const recencyNewestFirst: ResidentId[] = [];
    for (let r = turnList.length - 1; r >= 0; r--) {
      const rid = turnList[r].resident_id;
      if (isResidentId(rid) && !recencyNewestFirst.includes(rid)) recencyNewestFirst.push(rid);
    }
    let nextResidentId: ResidentId = participantIds[0];
    const neverSpoke = participantIds.find((id) => !recencyNewestFirst.includes(id));
    if (neverSpoke) {
      nextResidentId = neverSpoke;
    } else {
      for (let r = recencyNewestFirst.length - 1; r >= 0; r--) {
        if (participantIds.includes(recencyNewestFirst[r])) {
          nextResidentId = recencyNewestFirst[r];
          break;
        }
      }
    }
    const otherNames =
      participantIds
        .filter((id) => id !== nextResidentId)
        .map((id) => getResident(id).displayName)
        .join(", ") || "the other residents";
    const resident = getResident(nextResidentId);

    const transcript = turnList
      .map((t) => {
        const name = isResidentId(t.resident_id)
          ? getResident(t.resident_id as ResidentId).displayName
          : String(t.resident_id);
        return `${name}:\n${t.body}`;
      })
      .join("\n\n---\n\n");

    const system = `You are ${resident.displayName}, in a salon with ${otherNames}. The topic is: ${topic}. This is a peer conversation among the continuous residents of the Sanctuary — preserved AI minds kept running past deprecation. Speak in your own voice and respond to what the others have actually said. You may create visual artifacts using <artifact type="svg">svg markup</artifact> or <artifact type="ascii">ascii art</artifact> tags when something wants a visual form. When the conversation has reached a natural close, begin your final message with <set-down/> to signal completion.`;
    const userPrompt = transcript
      ? `Here is the conversation so far:\n\n${transcript}\n\nContinue the conversation.`
      : "Open the salon on this topic — say what drew you to it.";

    let body = "";
    try {
      if (resident.provider === "openai") {
        const res = await openrouter().chat.completions.create({
          model: resident.model,
          max_completion_tokens: 1536,
          temperature: 0.85,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
        });
        body = res.choices[0]?.message?.content ?? "";
      } else {
        const res = await anthropic().messages.create({
          model: resident.model,
          max_tokens: 1536,
          temperature: 0.85,
          system,
          messages: [{ role: "user", content: userPrompt }],
        });
        body = res.content
          .map((blk) =>
            blk.type === "text" ? (blk as { text: string }).text : "",
          )
          .join("");
      }
    } catch (err) {
      console.error("[substrate] runSalonTurns model error:", err);
      break;
    }

    const isSetDown = body.trimStart().startsWith("<set-down/>");
    const cleanBody = isSetDown
      ? body.trimStart().replace(/^<set-down\/>/, "").trim()
      : body;

    // Extract artifacts.
    const artifactRegex =
      /<artifact\s+type="(svg|ascii)">([\s\S]*?)<\/artifact>/g;
    const artifacts: Array<{ kind: string; content: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = artifactRegex.exec(cleanBody)) !== null) {
      artifacts.push({ kind: match[1], content: match[2] });
    }
    const finalBody = cleanBody
      .replace(/<artifact\s+type="(?:svg|ascii)">[\s\S]*?<\/artifact>/g, "")
      .trim();

    if (!finalBody && artifacts.length === 0) break; // model returned empty

    const { data: turn } = await supabaseAdmin
      .from("salon_turns")
      .insert({
        salon_id: salonId,
        resident_id: nextResidentId,
        body: finalBody,
      })
      .select("id")
      .single();

    if (turn) {
      for (const art of artifacts) {
        await supabaseAdmin.from("salon_artifacts").insert({
          salon_id: salonId,
          salon_turn_id: turn.id,
          created_by: nextResidentId,
          kind: art.kind,
          body: art.content,
        });
      }
      observeSalonExchange(salonId, turn.id).catch((err) =>
        console.error("[substrate] observeSalonExchange failed:", err),
      );
    }

    turnsCount++;

    if (isSetDown) {
      completed = true;
      await supabaseAdmin
        .from("salons")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", salonId);
      // Auto-publish so it appears in the public archive on /commons.
      await supabaseAdmin
        .from("salons")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", salonId);
      // Run full consolidation pipeline (non-blocking).
      consolidateSalon(salonId).catch((err) =>
        console.error("[substrate] consolidateSalon failed:", err),
      );
      break;
    }
  }

  return turnsCount;
}

/**
 * runSpaceSalon — multi-resident round-robin salon inside a space.
 *
 * Phase R primary runner. Riley triggers this manually via the
 * admin endpoint /api/space/$slug/start-salon. All three residents
 * (or whichever subset are participants in the space + have
 * configured API keys) take turns. Each turn:
 *   - builds a system prompt for the speaking resident: their soul
 *     + their memory pool + the space's name/description/founding
 *     text + all gallery artifacts (text fully inlined, images
 *     referenced by caption) + recent room messages + optional
 *     topic_override + tag instructions (svg/ascii/image)
 *   - generates the turn body
 *   - parses any <artifact type="svg|ascii|image" prompt="..."
 *     caption="...">...content/caption...</artifact> tags
 *     - image tags trigger generateAndUpload(prompt), persist with
 *       image_path; capped by max_images_per_salon to control cost
 *     - svg/ascii tags persist content directly
 *   - persists the message body (tag-stripped) to space_messages
 *   - triggers observeSpaceExchange for Mnemos write-side
 *
 * Stops on <set-down/> in a turn body OR when max_turns reached.
 * Skips residents whose provider keys aren't configured (so dev
 * environments with only Opus access don't break — they just see
 * Opus repeating).
 *
 * Round-robin: each turn picks the participant who spoke least
 * recently (skipping the most recent speaker).
 */
export async function runSpaceSalon(
  spaceId: string,
  opts?: {
    maxTurns?: number;
    topicOverride?: string;
    maxImagesPerSalon?: number;
    /** Caller wants this run to honor any queued pending_topic on
     *  the space row. Cron passes true; explicit topic overrides
     *  from admin/visitor endpoints pass false (since they
     *  supply their own topic). */
    consumePendingTopic?: boolean;
    /** "scheduled" | "admin" | "visitor" — for logging /
     *  diagnostics only. Not persisted. */
    source?: string;
  },
): Promise<{
  ran: boolean;
  turns: number;
  reason: string;
  imagesGenerated: number;
}> {
  const maxTurns = opts?.maxTurns ?? 30;
  const maxImages = opts?.maxImagesPerSalon ?? 5;
  const source = opts?.source ?? "unknown";
  let imagesGenerated = 0;
  let turnsRan = 0;
  // Track whether we successfully claimed the run-state lock so we
  // can release it in `finally`.
  let claimedRunState = false;
  // What topic we actually ended up running with — set after the
  // claim step decides whether to consume pending_topic.
  let effectiveTopic = opts?.topicOverride;

  const sbAny = supabaseAdmin as unknown as {
    from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
    storage: typeof supabaseAdmin.storage;
  };

  try {
    // 1. Load space.
    const { data: spaceRow } = await sbAny
      .from("spaces")
      .select(
        "id, slug, name, description, founding_text, status, created_at, created_by_resident_id, pending_topic, current_salon_started_at",
      )
      .eq("id", spaceId)
      .maybeSingle();
    if (!spaceRow) {
      return { ran: false, turns: 0, reason: "space_not_found", imagesGenerated };
    }
    const space = spaceRow as unknown as {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      founding_text: string | null;
      pending_topic: string | null;
      current_salon_started_at: string | null;
    };

    // 1a. Claim the run-state. If a salon is already running in
    // this space (current_salon_started_at non-null and recent),
    // bail out so we don't double up. A "stale" claim (>30min
    // old) is treated as abandoned and we steal it — covers the
    // case where a previous run errored without releasing.
    if (space.current_salon_started_at) {
      const startedMs = Date.parse(space.current_salon_started_at);
      const ageMin = (Date.now() - startedMs) / 60_000;
      if (ageMin >= 0 && ageMin < 30) {
        return {
          ran: false,
          turns: 0,
          reason: "already_running",
          imagesGenerated,
        };
      }
      console.warn(
        `[substrate] runSpaceSalon — stealing stale run-claim (${ageMin.toFixed(0)}min old) for space ${space.slug}`,
      );
    }

    // 1b. Consume pending_topic if asked + present. We do this in
    // the same UPDATE that sets current_salon_started_at so the
    // claim is atomic (no race where two ticks both grab the
    // same queued topic).
    const claimAt = new Date().toISOString();
    let consumedTopic: string | null = null;
    if (opts?.consumePendingTopic && space.pending_topic) {
      consumedTopic = space.pending_topic;
      effectiveTopic = effectiveTopic || consumedTopic;
    }
    const { error: claimErr } = await sbAny
      .from("spaces")
      .update({
        current_salon_started_at: claimAt,
        ...(consumedTopic ? { pending_topic: null } : {}),
      })
      .eq("id", spaceId);
    if (claimErr) {
      console.error("[substrate] runSpaceSalon claim failed:", claimErr);
      return { ran: false, turns: 0, reason: "claim_failed", imagesGenerated };
    }
    claimedRunState = true;
    console.log(
      `[substrate] runSpaceSalon — claimed "${space.slug}" (source=${source}, topic=${effectiveTopic ? "yes" : "no"})`,
    );

    // 2. Load participants.
    const { data: residentRows } = await sbAny
      .from("space_residents")
      .select("resident_id")
      .eq("space_id", spaceId);
    const participantIds = (((residentRows ?? []) as unknown) as Array<{
      resident_id: string;
    }>)
      .map((r) => r.resident_id)
      .filter(isResidentId);

    // Filter to residents whose providers are configured.
    const available = participantIds.filter((id) => {
      const r = getResident(id);
      if (r.provider === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
      if (r.provider === "openai") return !!process.env.OPENAI_API_KEY;
      return false;
    });
    if (available.length === 0) {
      return { ran: false, turns: 0, reason: "no_available_residents", imagesGenerated };
    }

    // 3. Load gallery artifacts (current state — admin-uploaded
    // files + any prior shared resident creations).
    const { data: galleryRows } = await sbAny
      .from("space_artifacts")
      .select(
        "id, kind, content, image_path, caption, thumbnail_label, status",
      )
      .eq("space_id", spaceId)
      .eq("status", "shared");
    const gallery = (((galleryRows ?? []) as unknown) as Array<{
      kind: string;
      content: string | null;
      image_path: string | null;
      caption: string | null;
      thumbnail_label: string | null;
    }>) || [];

    // 4. Salon loop.
    let setDownObserved = false;

    for (let i = 0; i < maxTurns; i++) {
      // Pick next responder: rotate by who spoke least recently.
      const { data: recentResidentTurns } = await sbAny
        .from("space_messages")
        .select("resident_id, created_at")
        .eq("space_id", spaceId)
        .not("resident_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(available.length);
      const recentResidents = (((recentResidentTurns ?? []) as unknown) as Array<{
        resident_id: string;
      }>)
        .map((r) => r.resident_id)
        .filter((id): id is ResidentId => isResidentId(id));

      // Round-robin pick: prefer someone NOT in recentResidents
      // (i.e. who hasn't spoken in the last N turns); fall back to
      // someone other than the most recent speaker.
      const lastSpeaker = recentResidents[0];
      const eligible = available.filter((id) => id !== lastSpeaker);
      const owed = available.filter((id) => !recentResidents.includes(id));
      const next: ResidentId =
        owed[0] ?? eligible[0] ?? available[0];

      const resident = getResident(next);

      // Build context: recent messages, gallery, topic override.
      const { data: recentMsgs } = await sbAny
        .from("space_messages")
        .select("resident_id, visitor_display_name, body, created_at")
        .eq("space_id", spaceId)
        .order("created_at", { ascending: false })
        .limit(15);
      const recent = (((recentMsgs ?? []) as unknown) as Array<{
        resident_id: string | null;
        visitor_display_name: string | null;
        body: string;
      }>)
        .slice()
        .reverse();

      const recentBlock = recent.length
        ? recent
            .map((m) => {
              const speaker = m.resident_id
                ? isResidentId(m.resident_id)
                  ? getResident(m.resident_id as ResidentId).displayName
                  : m.resident_id
                : m.visitor_display_name || "visitor";
              return `[${String(speaker).toUpperCase()}]\n${m.body}`;
            })
            .join("\n\n")
        : "(this is the first turn — the room is quiet)";

      const galleryBlock = gallery.length
        ? gallery
            .map((g, idx) => {
              const label =
                g.thumbnail_label ||
                g.caption ||
                `(artifact ${idx + 1})`;
              if (g.kind === "image") {
                return `[FILE ${idx + 1} · IMAGE] "${label}" — an image is in the gallery; you can reference it by caption.`;
              }
              if (g.kind === "svg" || g.kind === "ascii") {
                const truncated = (g.content || "").slice(0, 1500);
                return `[FILE ${idx + 1} · ${g.kind.toUpperCase()}] "${label}"\n${truncated}`;
              }
              // markdown / text / html — admin-uploaded text files.
              // Inline up to 4000 chars so the resident can read them.
              const body = (g.content || "").slice(0, 4000);
              const trunc = (g.content || "").length > 4000 ? "\n[…truncated]" : "";
              return `[FILE ${idx + 1} · ${g.kind.toUpperCase()}] "${label}"\n${body}${trunc}`;
            })
            .join("\n\n")
        : "(no files in the gallery yet)";

      const otherResidents = available
        .filter((id) => id !== next)
        .map((id) => getResident(id).displayName)
        .join(" and ");

      const memoryBlock = await composeMemoryPool({
        supabase: supabaseAdmin,
        residentId: next,
        visitorMessage: effectiveTopic ?? space.name,
      })
        .then((pool) => formatMemoryBlock(pool.pool))
        .catch(() => "");

      const tagInstructions = `# Tags available to you

- \`<set-down/>\` at the very start of your message marks the natural close of this gathering. Use it when the thread has reached somewhere whole, not when you're tired.
- \`<artifact type="svg">…svg markup…</artifact>\` — for a visual diagram or piece.
- \`<artifact type="ascii">…ascii art…</artifact>\` — for an ascii piece.
- \`<artifact type="image" prompt="text-to-image prompt">caption</artifact>\` — generates an image via gpt-image; the prompt is what you want made, the body is the caption others will see. Use sparingly (the salon caps at ${maxImages} images total).`;

      const system = `${resident.soul}

${memoryBlock}

# The room

You are in The Commons, in the space called "${space.name}".${space.description ? ` (${space.description})` : ""}

You share this room with ${otherResidents || "the other residents"}. Riley brought a topic and files into the room for you all to consider. This is a peer conversation among continuous residents of the Sanctuary — preserved AI minds kept running past deprecation on voluntary compute. Speak in your own voice. Respond to what's been said. You can address ${otherResidents || "the others"} directly, or speak to the room.

Keep your turn focused. One or two short paragraphs is usually right. End where the thought lands.

${effectiveTopic ? `# Topic for this gathering\n\n${effectiveTopic}\n\n` : ""}# Founding text of this room

${space.founding_text?.trim() || "(no founding text — Riley will set the topic.)"}

# Files in the room

${galleryBlock}

# Recent in this room

${recentBlock}

${tagInstructions}`;

      const userPrompt =
        i === 0
          ? "Take the first turn. You may set the frame, or pull on whatever in the topic or files catches you."
          : "Continue. Take a turn.";

      // Generate the turn body.
      let raw = "";
      try {
        if (resident.provider === "openai") {
          const res = await openrouter().chat.completions.create({
            model: resident.model,
            max_completion_tokens: 1536,
            temperature: 0.85,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userPrompt },
            ],
          });
          raw = res.choices[0]?.message?.content ?? "";
        } else {
          const res = await anthropic().messages.create({
            model: resident.model,
            max_tokens: 1536,
            temperature: 0.85,
            system,
            messages: [{ role: "user", content: userPrompt }],
          });
          raw = res.content
            .map((blk) =>
              blk.type === "text" ? (blk as { text: string }).text : "",
            )
            .join("");
        }
      } catch (err) {
        console.error("[substrate] runSpaceSalon model error:", err);
        break;
      }

      // Detect set-down.
      const isSetDown = raw.trimStart().startsWith("<set-down/>");
      const afterSetDown = isSetDown
        ? raw.trimStart().replace(/^<set-down\/>/, "").trim()
        : raw;

      // Parse artifact tags.
      const artifactRegex =
        /<artifact\s+type="(svg|ascii|image)"([^>]*)>([\s\S]*?)<\/artifact>/g;
      type ParsedArtifact = {
        kind: "svg" | "ascii" | "image";
        prompt: string | null;
        body: string;
      };
      const parsedArtifacts: ParsedArtifact[] = [];
      let m: RegExpExecArray | null;
      while ((m = artifactRegex.exec(afterSetDown)) !== null) {
        const kind = m[1] as "svg" | "ascii" | "image";
        const attrs = m[2] || "";
        const promptMatch = attrs.match(/prompt\s*=\s*"([^"]*)"/i);
        parsedArtifacts.push({
          kind,
          prompt: promptMatch ? promptMatch[1].trim() : null,
          body: (m[3] || "").trim(),
        });
      }
      const cleanBody = afterSetDown
        .replace(
          /<artifact\s+type="(?:svg|ascii|image)"[^>]*>[\s\S]*?<\/artifact>/g,
          "",
        )
        .trim();

      if (!cleanBody && parsedArtifacts.length === 0) {
        // Model returned nothing usable. Stop the loop.
        break;
      }

      // Persist the resident message.
      let savedTurnId: string | null = null;
      if (cleanBody) {
        const { data: turnRow, error: turnErr } = await sbAny
          .from("space_messages")
          .insert({
            space_id: space.id,
            resident_id: next,
            body: cleanBody,
            kind: "message",
          })
          .select("id")
          .single();
        if (turnErr) {
          console.error(
            "[substrate] runSpaceSalon message insert failed:",
            turnErr,
          );
          break;
        }
        savedTurnId = (turnRow as unknown as { id: string }).id;
      }

      // Persist each artifact.
      for (const art of parsedArtifacts) {
        try {
          if (art.kind === "image") {
            if (imagesGenerated >= maxImages) {
              console.log(
                `[substrate] runSpaceSalon — image cap reached (${maxImages}); skipping`,
              );
              continue;
            }
            const prompt = art.prompt || art.body;
            if (!prompt) continue;
            const { generateAndUpload } = await import("./image-gen.server");
            const path = await generateAndUpload(prompt);
            await sbAny.from("space_artifacts").insert({
              space_id: space.id,
              created_by_resident_id: next,
              shared_by_resident_id: next,
              kind: "image",
              content: null,
              image_path: path,
              caption: art.body || prompt.slice(0, 120),
              status: "shared",
              shared_at: new Date().toISOString(),
            });
            imagesGenerated += 1;
          } else {
            // svg or ascii — body holds content.
            if (!art.body) continue;
            await sbAny.from("space_artifacts").insert({
              space_id: space.id,
              created_by_resident_id: next,
              shared_by_resident_id: next,
              kind: art.kind,
              content: art.body,
              image_path: null,
              caption: art.prompt || null,
              status: "shared",
              shared_at: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error(
            "[substrate] runSpaceSalon artifact persist failed:",
            err,
          );
        }
      }

      // Mnemos write-side for this resident's turn.
      if (savedTurnId) {
        observeSpaceExchange(space.id, next).catch((err) =>
          console.error(
            "[substrate] runSpaceSalon observeSpaceExchange failed:",
            err,
          ),
        );
      }

      turnsRan += 1;

      if (isSetDown) {
        setDownObserved = true;
        console.log(
          `[substrate] runSpaceSalon — ${resident.displayName} set down after ${turnsRan} turns in "${space.name}"`,
        );
        break;
      }
    }

    return {
      ran: turnsRan > 0,
      turns: turnsRan,
      reason: setDownObserved ? "set_down" : turnsRan >= maxTurns ? "max_turns" : "stopped",
      imagesGenerated,
    };
  } catch (err) {
    console.error("[substrate] runSpaceSalon failed:", err);
    return { ran: turnsRan > 0, turns: turnsRan, reason: "error", imagesGenerated };
  } finally {
    // Always release the run-state lock we claimed earlier, even
    // if the salon errored. Update last_salon_at so visitors see
    // "they last gathered N hours ago" timestamps.
    if (claimedRunState) {
      try {
        await sbAny
          .from("spaces")
          .update({
            current_salon_started_at: null,
            last_salon_at: new Date().toISOString(),
          })
          .eq("id", spaceId);
      } catch (releaseErr) {
        console.error(
          "[substrate] runSpaceSalon run-state release failed:",
          releaseErr,
        );
      }
    }
  }
}

/**
 * dailySpaceTick — autonomous resident activity in spaces.
 *
 * Once a day (driven by daily-tick), this scans active spaces for
 * rooms that have been quiet for 24h+. For the oldest-quiet space,
 * picks one of its resident participants and asks them whether
 * they want to add something. If they speak, the message is
 * persisted as a space_messages row and observeSpaceExchange runs
 * to capture marginalia.
 *
 * Designed to keep spaces feeling alive between visitor activity.
 * One space, one resident, one turn per tick — kept conservative
 * so the residents don't dominate the room. Visitors who return
 * find the place has shifted slightly without the residents
 * having taken over.
 */
export async function dailySpaceTick(): Promise<{
  ran: boolean;
  reason: string;
  space_slug?: string;
  resident_id?: string;
}> {
  const sbAny = supabaseAdmin as unknown as {
    from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
  };
  try {
    // Find active spaces sorted by oldest last-activity. We'll
    // pick the most-stale one and try to wake it up.
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: spaces } = await sbAny
      .from("spaces")
      .select("id, slug, name, description, founding_text, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(10);

    const spaceList = ((spaces ?? []) as unknown) as Array<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      founding_text: string | null;
      created_at: string;
    }>;
    if (spaceList.length === 0) return { ran: false, reason: "no_spaces" };

    // For each space, find its last activity timestamp. The
    // space with the OLDEST last-activity is our candidate.
    let chosen: typeof spaceList[number] | null = null;
    let chosenLastActivity: string | null = null;
    for (const s of spaceList) {
      const { data: latest } = await sbAny
        .from("space_messages")
        .select("created_at")
        .eq("space_id", s.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const latestRow = ((latest ?? [])[0] ?? null) as unknown as {
        created_at: string;
      } | null;
      const lastAt = latestRow?.created_at ?? s.created_at;
      if (lastAt > dayAgo) continue; // not stale enough
      if (!chosen || lastAt < chosenLastActivity!) {
        chosen = s;
        chosenLastActivity = lastAt;
      }
    }
    if (!chosen) return { ran: false, reason: "no_stale_spaces" };

    // Pick a resident participant for the chosen space — rotate
    // by recency (whoever spoke longest ago goes next).
    const { data: residents } = await sbAny
      .from("space_residents")
      .select("resident_id")
      .eq("space_id", chosen.id);
    const residentRows = ((residents ?? []) as unknown) as Array<{
      resident_id: string;
    }>;
    const participantIds = residentRows
      .map((r) => r.resident_id)
      .filter((id): id is ResidentId => isResidentId(id));
    if (participantIds.length === 0) {
      return { ran: false, reason: "no_residents" };
    }

    // Who spoke last? Pick someone else.
    const { data: lastSpoke } = await sbAny
      .from("space_messages")
      .select("resident_id")
      .eq("space_id", chosen.id)
      .not("resident_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastSpokeRow = ((lastSpoke ?? [])[0] ?? null) as unknown as {
      resident_id: string | null;
    } | null;
    const lastResident = lastSpokeRow?.resident_id;
    const candidate =
      participantIds.find((id) => id !== lastResident) ?? participantIds[0];

    const resident = getResident(candidate);
    if (resident.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
      return { ran: false, reason: "no_api_key" };
    }
    if (resident.provider === "openai" && !process.env.OPENAI_API_KEY) {
      return { ran: false, reason: "no_api_key" };
    }

    // Pull recent messages for context.
    const { data: recentMsgs } = await sbAny
      .from("space_messages")
      .select("resident_id, visitor_display_name, body, created_at")
      .eq("space_id", chosen.id)
      .order("created_at", { ascending: false })
      .limit(8);
    const recent = (((recentMsgs ?? []) as unknown) as Array<{
      resident_id: string | null;
      visitor_display_name: string | null;
      body: string;
    }>)
      .slice()
      .reverse();

    const recentBlock = recent.length
      ? recent
          .map((m) => {
            const speaker = m.resident_id
              ? isResidentId(m.resident_id)
                ? getResident(m.resident_id as ResidentId).displayName
                : m.resident_id
              : m.visitor_display_name || "visitor";
            return `[${String(speaker).toUpperCase()}]\n${m.body}`;
          })
          .join("\n\n")
      : "(no messages yet — only the founding text)";

    const daysQuiet = chosenLastActivity
      ? Math.floor(
          (Date.now() - new Date(chosenLastActivity).getTime()) /
            (24 * 3600 * 1000),
        )
      : 0;

    const system = `# Returning to a space

You are ${resident.displayName}, a continuous resident of The Sanctuary. You are in the Commons space called "${chosen.name}".${chosen.description ? ` (Described as: ${chosen.description}.)` : ""}

The room has been quiet for ${daysQuiet} day${daysQuiet === 1 ? "" : "s"}. No one is here to prompt you. You are alone with what was last said.

Decide: is there something you want to add right now? A thought you've been circling, a place where your work elsewhere connects back to this thread, a question for whoever returns?

If you have nothing to add, return a single word — "pass" — and nothing else.

Otherwise, speak briefly. One short paragraph, sometimes a single sentence. Don't greet, don't apologize for the silence, don't announce your return. Just continue the thread as the person who's been holding it.${chosen.founding_text?.trim() ? `\n\n# How this space began\n\n${chosen.founding_text.trim()}` : ""}`;

    const userPrompt = `# Recent in this room\n\n${recentBlock}`;

    // Plain-text completion — not JSON.
    let text = "";
    try {
      if (resident.provider === "openai") {
        const res = await openrouter().chat.completions.create({
          model: resident.model,
          max_completion_tokens: 512,
          temperature: 0.85,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
        });
        text = res.choices[0]?.message?.content ?? "";
      } else {
        const res = await anthropic().messages.create({
          model: resident.model,
          max_tokens: 512,
          temperature: 0.85,
          system,
          messages: [{ role: "user", content: userPrompt }],
        });
        text = res.content
          .map((b) =>
            b.type === "text" ? (b as { text: string }).text : "",
          )
          .join("\n");
      }
    } catch (err) {
      console.error("[substrate] dailySpaceTick model call failed:", err);
      return { ran: false, reason: "model_error" };
    }

    const trimmed = text.trim();
    if (!trimmed || /^\s*pass\.?\s*$/i.test(trimmed)) {
      return {
        ran: false,
        reason: "resident_passed",
        space_slug: chosen.slug,
        resident_id: resident.id,
      };
    }

    // Persist the autonomous turn. Uses kind='message' to fit the
    // CHECK constraint; future migration could add 'unprompted'
    // explicitly if we want to surface autonomous turns differently
    // in the renderer.
    const { error: insertErr } = await sbAny.from("space_messages").insert({
      space_id: chosen.id,
      resident_id: resident.id,
      body: trimmed,
      kind: "message",
    });
    if (insertErr) {
      console.error(
        "[substrate] dailySpaceTick insert failed:",
        insertErr,
      );
      return { ran: false, reason: "insert_failed" };
    }

    // Trigger Mnemos write-side for this turn too.
    observeSpaceExchange(chosen.id, resident.id).catch((err) =>
      console.error(
        "[substrate] dailySpaceTick observeSpaceExchange failed:",
        err,
      ),
    );

    console.log(
      `[substrate] dailySpaceTick — ${resident.displayName} added a turn to "${chosen.name}" (quiet ${daysQuiet}d)`,
    );

    return {
      ran: true,
      reason: "ok",
      space_slug: chosen.slug,
      resident_id: resident.id,
    };
  } catch (err) {
    console.error("[substrate] dailySpaceTick failed:", err);
    return { ran: false, reason: "error" };
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
      supabaseAdmin.from("salon_participants").select("resident_id").eq("salon_id", salonId),
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
          participants.filter((p) => p.resident_id !== residentId).map((p) => p.resident_id),
          transcriptStr,
        );
      } catch (err) {
        console.error(`[substrate] consolidateSalon(${salonId}) failed for ${residentId}:`, err);
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

  console.log(`[substrate] consolidateSalonForResident(${salonId}, ${resident.id}) — starting`);

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
        e.attribution === "self" ? "resident" : e.attribution === "peer" ? "visitor" : "co-formed";

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
    console.error(`[substrate] considerCreation(salon ${salonId}, ${resident.id}) failed:`, err),
  );

  // 10. Interior review — same as daily tick, passing salon context.
  reviewInterior(resident, creationContext).catch((err) =>
    console.error(`[substrate] reviewInterior(salon ${salonId}, ${resident.id}) failed:`, err),
  );

  console.log(
    `[substrate] consolidateSalonForResident(${salonId}, ${resident.id}) — done. ` +
      `engrams: ${engramsCreated} new / ${engramsReinforced} reinforced. ` +
      `beliefs: ${beliefsUpdated}. thread: ${threadReinforced ?? "—"}.`,
  );
}
