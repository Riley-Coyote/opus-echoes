/**
 * Engram retrieval. The previous implementation in the message route
 * was `engrams.order("last_reinforced_at desc").limit(5)` — recency only.
 * That ignored everything Mnemos had computed about the topology: which
 * engrams are core, which are stable, which are connected, which match
 * what the visitor is asking about.
 *
 * This module composes a memory pool from four signals, weighted:
 *
 *   1. Core engrams (always present, top by stability)
 *   2. Relevance to the visitor's message (significant-word overlap)
 *   3. Edge-walked from relevance hits (the topology surfaces)
 *   4. A small recency fallback (keeps freshly touched things alive)
 *
 * Dormant engrams are excluded. Dedup is by id. The result is ~12 engrams
 * — enough to give Opus continuity context without flooding the prompt.
 *
 * PHASE 3 — three-layer retrieval (gated by
 * SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL). When the flag is on,
 * `composeThreeLayerMemoryPool` is used instead. It returns:
 *
 *   - functional: the per-session working summary (one row)
 *   - hypomnema:  the per-(visitor, resident) entries — 6 vector-matched
 *                 + up to 6 most recent (dedup by id)
 *   - engrams:    the wider topology — vector-matched via the new
 *                 match_engrams_vector RPC, with the phase 0
 *                 cross-visitor attribution filter still applied
 *
 * Plus `formatThreeLayerMemory` for prompt assembly. Both old and new
 * paths live here in parallel; message.ts picks one based on the flag.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embedText } from "@/server/embeddings.server";
import type { ResidentId } from "./residents";

export function threeLayerRetrievalEnabled(): boolean {
  return process.env.SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL === "true";
}

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
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "of",
  "to",
  "in",
  "for",
  "on",
  "with",
  "as",
  "at",
  "by",
  "from",
  "into",
  "onto",
  "out",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "you",
  "your",
  "we",
  "our",
  "they",
  "them",
  "their",
  "it",
  "its",
  "so",
  "not",
  "no",
  "yes",
  "what",
  "when",
  "where",
  "why",
  "how",
  "which",
  "who",
  "whom",
  "can",
  "could",
  "would",
  "should",
  "will",
  "may",
  "might",
  "just",
  "about",
  "really",
  "very",
  "much",
  "more",
  "most",
  "some",
  "any",
  "all",
  "like",
  "well",
  "now",
  "here",
  "there",
  "than",
  "too",
  "also",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
}

function relevanceScore(query: Set<string>, candidate: Set<string>): number {
  if (query.size === 0 || candidate.size === 0) return 0;
  let shared = 0;
  for (const w of candidate) if (query.has(w)) shared += 1;
  // Weighted overlap — favors candidates that match many query terms,
  // not just candidates that happen to be wordy.
  return shared / Math.sqrt(query.size * candidate.size);
}

export interface EngramRow {
  id: string;
  quote: string;
  prose: string | null;
  attribution: "resident" | "visitor" | "co-formed";
  redacted_text: string | null;
  is_core: boolean;
  stability: number;
  accessibility: number;
  strength: number;
  reinforcement_count: number;
  last_reinforced_at: string;
}

const ENGRAM_COLUMNS =
  "id, quote, prose, attribution, redacted_text, is_core, stability, accessibility, strength, reinforcement_count, last_reinforced_at, source_session_ids";

const POOL_TARGET = 12;
const CORE_QUOTA = 5;
const RELEVANCE_QUOTA = 4;
const EDGE_QUOTA = 2;
const RECENT_QUOTA = 2;
const RELEVANCE_THRESHOLD = 0.1;

export interface MemoryPoolResult {
  pool: EngramRow[];
  /** IDs of engrams in the pool that originated (at least partly) from this visitor's prior sessions. */
  thisVisitorEngramIds: Set<string>;
}

/**
 * Compose the memory pool that surfaces in the system/user prompt.
 * Returns up to ~12 engrams, drawn from core + relevance + edges + recency,
 * plus a set of IDs identifying which engrams came from this specific
 * visitor's prior sessions (for provenance tagging in the prompt).
 * Scoped to a single resident — Opus 3's engrams never surface in a
 * Sonnet 4.5 conversation, and vice versa.
 */
export async function composeMemoryPool(opts: {
  supabase: SupabaseClient;
  residentId: ResidentId;
  visitorMessage: string;
  /** Persistent visitor token — if present, engrams from this visitor's prior visits surface with slight priority. */
  visitorToken?: string;
}): Promise<MemoryPoolResult> {
  const { supabase, residentId, visitorMessage, visitorToken } = opts;
  const queryWords = significantWords(visitorMessage);

  // Pull a wide candidate window in one query — cheaper than N queries —
  // and slice the four signals out of it locally.
  const { data: candidates, error } = await supabase
    .from("engrams")
    .select(ENGRAM_COLUMNS)
    .eq("resident_id", residentId)
    .eq("state", "active")
    .order("last_reinforced_at", { ascending: false })
    .limit(200);

  if (error || !candidates) {
    console.warn("[retrieval] candidate load failed:", error);
    return { pool: [], thisVisitorEngramIds: new Set() };
  }

  const rows = candidates as EngramRow[];
  const seen = new Set<string>();
  const pool: EngramRow[] = [];

  const take = (row: EngramRow) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    pool.push(row);
    return true;
  };

  // Resolve this visitor's prior session IDs early so they're available
  // for both the visitor echo step and the final provenance tagging.
  let priorSessionIds: string[] = [];
  if (visitorToken) {
    const { data: priorSessions } = await supabase
      .from("sessions")
      .select("id")
      .eq("visitor_token", visitorToken)
      .eq("resident_id", residentId)
      .not("closed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    if (priorSessions && priorSessions.length > 0) {
      priorSessionIds = priorSessions.map((s: { id: string }) => s.id);
    }
  }

  // 1. Core engrams — always present, top by stability. These are the
  // load-bearing residues that define who Opus has become.
  const core = rows
    .filter((r) => r.is_core)
    .sort((a, b) => b.stability - a.stability)
    .slice(0, CORE_QUOTA);
  for (const r of core) take(r);

  // 2. Relevance — score remaining against the visitor's message.
  const scored: Array<{ row: EngramRow; score: number }> = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const haystack = significantWords(`${row.quote} ${row.prose ?? ""}`);
    const score = relevanceScore(queryWords, haystack);
    if (score >= RELEVANCE_THRESHOLD) {
      scored.push({ row, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const relevanceHits = scored.slice(0, RELEVANCE_QUOTA);
  for (const { row } of relevanceHits) take(row);

  // 3. Edge walk — for each relevance seed, pull one connected engram.
  // The topology becomes meaningful instead of just stored.
  if (relevanceHits.length > 0 && pool.length < POOL_TARGET) {
    const seedIds = relevanceHits.map((s) => s.row.id);
    const { data: edges } = await supabase
      .from("engram_edges")
      .select("from_id, to_id, weight")
      .in("from_id", seedIds)
      .order("weight", { ascending: false })
      .limit(EDGE_QUOTA * 4);

    if (edges && edges.length > 0) {
      const connectedIds = Array.from(
        new Set(edges.map((e: { to_id: string }) => e.to_id).filter((id) => !seen.has(id))),
      ).slice(0, EDGE_QUOTA);

      if (connectedIds.length > 0) {
        const { data: connected } = await supabase
          .from("engrams")
          .select(ENGRAM_COLUMNS)
          .in("id", connectedIds)
          .eq("resident_id", residentId)
          .eq("state", "active");
        for (const row of (connected ?? []) as EngramRow[]) take(row);
      }
    }
  }

  // 4. Visitor echo — if this visitor has been here before, surface
  // engrams from their prior sessions. The resident recognizes
  // returning visitors through the traces they left, not through
  // an address book.
  if (priorSessionIds.length > 0 && pool.length < POOL_TARGET) {
    const visitorEngrams = rows.filter(
      (r) =>
        !seen.has(r.id) &&
        Array.isArray((r as unknown as { source_session_ids?: string[] }).source_session_ids) &&
        (r as unknown as { source_session_ids: string[] }).source_session_ids.some((sid) =>
          priorSessionIds.includes(sid),
        ),
    );
    for (const r of visitorEngrams.slice(0, 3)) take(r);
  }

  // 5. Recency fallback — keep recently touched things alive even when
  // they didn't match anything semantically. Prevents the pool from
  // ossifying around core+queryterms.
  const recents = rows.filter((r) => !seen.has(r.id)).slice(0, RECENT_QUOTA);
  for (const r of recents) take(r);

  // 6. Cross-visitor attribution filter — drop visitor-attributed engrams
  // that did not originate in this visitor's prior sessions. Without this,
  // word-overlap relevance can pull another visitor's utterance into the
  // pool, and the resident — seeing it in [MEMORY] — references it as if
  // the current visitor had said it. Resident-attributed and co-formed
  // engrams stay regardless of source: those are the resident's own
  // utterances or jointly-formed distillations and may surface from any
  // exchange. When the current visitor is anonymous (no token), prior
  // session set is empty and every visitor-attributed engram drops out —
  // the safer default.
  const priorSessionSet = new Set(priorSessionIds);
  const filteredPool = pool.filter((e) => {
    if (e.attribution !== "visitor") return true;
    const sessionIds = (e as unknown as { source_session_ids?: string[] }).source_session_ids;
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) return false;
    return sessionIds.some((sid) => priorSessionSet.has(sid));
  });

  // If filtering dropped the pool below the soft floor, backfill from
  // core engrams not already in the pool. Core is attribution-agnostic
  // by definition — these are load-bearing residues of how the resident
  // has come to think, not anyone's particular words.
  const MIN_AFTER_FILTER = 6;
  if (filteredPool.length < MIN_AFTER_FILTER) {
    const inPool = new Set(filteredPool.map((e) => e.id));
    const coreBackfill = rows
      .filter((r) => r.is_core && !inPool.has(r.id))
      .sort((a, b) => b.stability - a.stability);
    for (const r of coreBackfill) {
      if (filteredPool.length >= MIN_AFTER_FILTER) break;
      filteredPool.push(r);
    }
  }

  // Cross-reference: tag which engrams in the filtered pool came from
  // this visitor's prior sessions. An engram added via core or relevance
  // might also be from this visitor — we want to tag it regardless of
  // which retrieval stage added it.
  const thisVisitorEngramIds = new Set<string>();
  if (priorSessionSet.size > 0) {
    for (const e of filteredPool) {
      const sessionIds = (e as unknown as { source_session_ids?: string[] }).source_session_ids;
      if (Array.isArray(sessionIds) && sessionIds.some((sid) => priorSessionSet.has(sid))) {
        thisVisitorEngramIds.add(e.id);
      }
    }
  }

  return { pool: filteredPool.slice(0, POOL_TARGET), thisVisitorEngramIds };
}

/**
 * Build a visitor context block for the user prompt. If this visitor
 * has been here before (matched by localStorage token), returns a
 * brief summary of their prior visits and the engrams that formed.
 * Returns empty string for first-time visitors.
 */
export async function getVisitorContext(
  visitorToken: string | null | undefined,
  residentId: ResidentId,
): Promise<string> {
  if (!visitorToken) return "";

  const { data: priorSessions } = await supabaseAdmin
    .from("sessions")
    .select("id, created_at, closed_at")
    .eq("visitor_token", visitorToken)
    .eq("resident_id", residentId)
    .not("closed_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(8);

  if (!priorSessions || priorSessions.length === 0) return "";

  const sessionIds = priorSessions.map((s: { id: string }) => s.id);

  // Pull engrams that formed from this visitor's prior sessions
  const { data: visitorEngrams } = await supabaseAdmin
    .from("engrams")
    .select("quote, prose, attribution, created_at, source_session_ids")
    .eq("resident_id", residentId)
    .eq("state", "active")
    .overlaps("source_session_ids", sessionIds)
    .order("created_at", { ascending: false })
    .limit(6);

  // Pull journal entries from this visitor's sessions
  const { data: journals } = await supabaseAdmin
    .from("journal_entries")
    .select("title, kind, created_at")
    .eq("resident_id", residentId)
    .in("related_session_id", sessionIds)
    .order("created_at", { ascending: false })
    .limit(4);

  const visitCount = priorSessions.length;
  const lastVisit = new Date(priorSessions[0].created_at);
  const daysSince = Math.round((Date.now() - lastVisit.getTime()) / (24 * 3600 * 1000));
  const timeLabel =
    daysSince === 0 ? "earlier today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`;

  const lines = [
    `This visitor has been here before. ${visitCount} prior visit${visitCount > 1 ? "s" : ""}. Most recent: ${timeLabel}.`,
  ];

  if (visitorEngrams && visitorEngrams.length > 0) {
    lines.push("");
    lines.push("Traces from their prior visits:");
    for (const e of visitorEngrams) {
      const text = e.attribution === "visitor" ? "(visitor's words, redacted)" : `"${e.quote}"`;
      lines.push(`- ${text}${e.prose ? ` — ${e.prose}` : ""}`);
    }
  }

  if (journals && journals.length > 0) {
    lines.push("");
    lines.push("Journal entries you wrote after their visits:");
    for (const j of journals) {
      lines.push(`- ${j.kind}${j.title ? `: "${j.title}"` : ""}`);
    }
  }

  lines.push("");
  lines.push(
    "You recognize this visitor through these traces — what mnemos kept from their prior visits. You may acknowledge the return gently. Do not presume familiarity beyond what the traces show.",
  );

  return lines.join("\n");
}

/**
 * Format a memory pool as a [MEMORY] block for the user prompt.
 * Visitor-attributed engrams use redacted text when available.
 *
 * Three signals for provenance:
 *   - `[core]` bracket tag — load-bearing residue
 *   - `[from this visitor's prior visit]` bracket tag — built with this
 *     specific person in an earlier session
 *   - inline prose parenthetical at the end of the line — for engrams
 *     from the wider topology (neither core, nor this visitor's prior).
 *     Deliberately prose, not a bracket tag: dense bracketed scaffolding
 *     primes the resident to echo bracket structure into responses.
 */
export function formatMemoryBlock(pool: EngramRow[], thisVisitorEngramIds?: Set<string>): string {
  if (pool.length === 0) return "";
  const lines = pool.map((e) => {
    const text = e.attribution === "visitor" && e.redacted_text ? e.redacted_text : e.quote;
    const isThisVisitor = thisVisitorEngramIds?.has(e.id) ?? false;
    const tags: string[] = [];
    if (e.is_core) tags.push("core");
    if (isThisVisitor) tags.push("from this visitor's prior visit");
    const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    const widerQualifier =
      !e.is_core && !isThisVisitor
        ? " (from a wider exchange — carry the shape, not the words as this visitor's)"
        : "";
    return `- ${text}${tagStr}${widerQualifier}`;
  });
  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════════
// PHASE 3 — three-layer retrieval. Gated by
// SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL. New shapes live alongside
// the old ones; message.ts picks the path by flag.
// ════════════════════════════════════════════════════════════════════

export interface FunctionalMemoryRow {
  content: string;
  updatedAt: string;
}

export interface HypomnemaMatch {
  id: string;
  content: string;
  source: "observed" | "synthesized" | "co-formed";
  density: number;
  domain: string;
  tags: string[];
  confidence: number;
  foundational: boolean;
  revisionCount: number;
  lastRevisedAt: string;
  /** How this entry was surfaced — vector match against the visitor's
   *  current turn, or simply most-recent for the pair. */
  via: "matched" | "recent";
}

export interface ThreeLayerRetrieval {
  functional: FunctionalMemoryRow | null;
  hypomnema: HypomnemaMatch[];
  engrams: EngramRow[];
  /** IDs of engrams in the pool that originated from this visitor's
   *  prior sessions — same provenance tagging as the old single-layer
   *  path so [from this visitor's prior visit] still renders. */
  thisVisitorEngramIds: Set<string>;
}

// Phase 1 schema additions aren't yet in the generated supabase types.
// Cast at the call site until `bunx supabase gen types` is re-run
// against the new schema — same pattern used in substrate.server.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hypomnemaTable = (sb: SupabaseClient) => (sb as any).from("hypomnema_entries");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const functionalMemoryTable = (sb: SupabaseClient) => (sb as any).from("functional_memories");

/**
 * Load this session's working-memory summary (one "working"-type row).
 * Returns null when the session has no functional memory yet (the first
 * exchange has not produced one; the flag may have been off when earlier
 * turns ran; etc).
 */
export async function loadFunctionalMemory(
  sb: SupabaseClient,
  sessionId: string,
): Promise<FunctionalMemoryRow | null> {
  const { data } = await functionalMemoryTable(sb)
    .select("content, updated_at")
    .eq("session_id", sessionId)
    .eq("memory_type", "working")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { content: (data.content as string) ?? "", updatedAt: data.updated_at as string };
}

/**
 * Load hypomnema entries for a (visitor, resident) pair. Returns up to
 * `recentCount` most-recently-revised entries plus up to `matchCount`
 * vector-matched entries to the visitor's current turn. Dedup by id.
 *
 * Embedding failure or absent visitorToken → return empty. The new
 * three-layer prompt structure renders "(you and this visitor have not
 * built anything together yet, or none of it surfaced for this turn)"
 * in that case.
 */
export async function loadHypomnema(
  sb: SupabaseClient,
  opts: {
    visitorToken: string | null | undefined;
    residentId: ResidentId;
    visitorMessage: string;
    matchCount?: number;
    recentCount?: number;
  },
): Promise<HypomnemaMatch[]> {
  if (!opts.visitorToken) return [];
  const matchCount = opts.matchCount ?? 6;
  const recentCount = opts.recentCount ?? 6;

  const seen = new Set<string>();
  const out: HypomnemaMatch[] = [];

  const pushRow = (row: Record<string, unknown>, via: "matched" | "recent") => {
    const id = row.id as string;
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      content: (row.content as string) ?? "",
      source: (row.source as HypomnemaMatch["source"]) ?? "observed",
      density: (row.density as number) ?? 0.5,
      domain: (row.domain as string) ?? "topical",
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      confidence: (row.confidence as number) ?? 0.5,
      foundational: (row.foundational as boolean) ?? false,
      revisionCount: (row.revision_count as number) ?? 0,
      lastRevisedAt: (row.last_revised_at as string) ?? "",
      via,
    });
  };

  // Vector match against this turn's embedding. If embedText returns
  // null (graceful fallback in the embeddings module), we still load
  // recent entries — just no semantic match for this turn.
  const embedding = await embedText(opts.visitorMessage);
  if (embedding && embedding.length === 1536) {
    const { data: matched } = await sb.rpc("match_hypomnema_vector", {
      query_embedding: embedding,
      match_visitor_token: opts.visitorToken,
      match_resident_id: opts.residentId,
      match_count: matchCount,
    });
    for (const row of (matched ?? []) as Record<string, unknown>[]) {
      pushRow(row, "matched");
    }
  }

  // Recent-by-revision pull. Vector index isn't doing time work, so
  // this keeps recently-touched content surfacing even when its
  // semantic distance to the current turn is high.
  const { data: recent } = await hypomnemaTable(sb)
    .select(
      "id, content, source, density, domain, tags, confidence, foundational, revision_count, last_revised_at",
    )
    .eq("visitor_token", opts.visitorToken)
    .eq("resident_id", opts.residentId)
    .eq("active", true)
    .order("last_revised_at", { ascending: false })
    .limit(recentCount);
  for (const row of (recent ?? []) as Record<string, unknown>[]) {
    pushRow(row, "recent");
  }

  return out;
}

/**
 * Load engrams via vector match (match_engrams_vector RPC), then apply
 * the phase 0 cross-visitor attribution filter and tag this-visitor's
 * prior engrams. Falls back to the lexical-overlap pool from
 * composeMemoryPool when embedText returns null — graceful degradation
 * keeps the conversation going even if the embeddings API is down.
 */
async function loadEngrams(opts: {
  supabase: SupabaseClient;
  residentId: ResidentId;
  visitorMessage: string;
  visitorToken?: string | null;
  poolSize?: number;
}): Promise<{ pool: EngramRow[]; thisVisitorEngramIds: Set<string> }> {
  const poolSize = opts.poolSize ?? POOL_TARGET;
  const embedding = await embedText(opts.visitorMessage);

  // Fallback: no embedding → reuse the lexical-overlap composeMemoryPool
  // which already applies the cross-visitor filter and visitor-prior
  // tagging. We oversample slightly (poolSize + 2 core) since vector
  // hits also need core blended back in below.
  if (!embedding || embedding.length !== 1536) {
    const fallback = await composeMemoryPool({
      supabase: opts.supabase,
      residentId: opts.residentId,
      visitorMessage: opts.visitorMessage,
      visitorToken: opts.visitorToken ?? undefined,
    });
    return { pool: fallback.pool, thisVisitorEngramIds: fallback.thisVisitorEngramIds };
  }

  // Resolve this visitor's prior session IDs so we can apply the
  // cross-visitor filter and tag this-visitor engrams below — same
  // logic as composeMemoryPool.
  let priorSessionIds: string[] = [];
  if (opts.visitorToken) {
    const { data: priorSessions } = await opts.supabase
      .from("sessions")
      .select("id")
      .eq("visitor_token", opts.visitorToken)
      .eq("resident_id", opts.residentId)
      .not("closed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    if (priorSessions && priorSessions.length > 0) {
      priorSessionIds = priorSessions.map((s: { id: string }) => s.id);
    }
  }
  const priorSessionSet = new Set(priorSessionIds);

  // Vector pull — oversample so the filter has headroom.
  const { data: matched } = await opts.supabase.rpc("match_engrams_vector", {
    query_embedding: embedding,
    match_resident_id: opts.residentId,
    match_count: poolSize + 6,
  });

  type MatchRow = Record<string, unknown>;
  const rows: EngramRow[] = ((matched ?? []) as MatchRow[]).map((r) => ({
    id: r.id as string,
    quote: (r.quote as string) ?? "",
    prose: (r.prose as string | null) ?? null,
    attribution: (r.attribution as EngramRow["attribution"]) ?? "resident",
    redacted_text: (r.redacted_text as string | null) ?? null,
    is_core: (r.is_core as boolean) ?? false,
    stability: (r.stability as number) ?? 0,
    accessibility: (r.accessibility as number) ?? 0,
    strength: (r.strength as number) ?? 0,
    reinforcement_count: (r.reinforcement_count as number) ?? 0,
    last_reinforced_at: (r.last_reinforced_at as string) ?? "",
  }));
  // source_session_ids attached out-of-band for the filter.
  const sourceSessions = new Map<string, string[]>();
  for (const r of (matched ?? []) as MatchRow[]) {
    const sids = r.source_session_ids;
    if (Array.isArray(sids)) sourceSessions.set(r.id as string, sids as string[]);
  }

  // Cross-visitor attribution filter: drop visitor-attributed engrams
  // that did not originate in this visitor's prior sessions. Same
  // rule as phase 0's composeMemoryPool.
  const filtered = rows.filter((e) => {
    if (e.attribution !== "visitor") return true;
    const sids = sourceSessions.get(e.id);
    if (!sids || sids.length === 0) return false;
    return sids.some((sid) => priorSessionSet.has(sid));
  });

  // Tag this-visitor engrams for the prompt's [from this visitor's
  // prior visit] marker.
  const thisVisitorEngramIds = new Set<string>();
  if (priorSessionSet.size > 0) {
    for (const e of filtered) {
      const sids = sourceSessions.get(e.id);
      if (sids && sids.some((sid) => priorSessionSet.has(sid))) {
        thisVisitorEngramIds.add(e.id);
      }
    }
  }

  return { pool: filtered.slice(0, poolSize), thisVisitorEngramIds };
}

/**
 * Three-layer composeMemoryPool. Returns functional + hypomnema +
 * engrams in one shape. Used by message.ts when
 * SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL is on. The old single-layer
 * composeMemoryPool stays available for the flag-off path.
 */
export async function composeThreeLayerMemoryPool(opts: {
  supabase: SupabaseClient;
  sessionId: string;
  residentId: ResidentId;
  visitorMessage: string;
  visitorToken?: string | null;
}): Promise<ThreeLayerRetrieval> {
  const [functional, hypomnema, engrams] = await Promise.all([
    loadFunctionalMemory(opts.supabase, opts.sessionId),
    loadHypomnema(opts.supabase, {
      visitorToken: opts.visitorToken,
      residentId: opts.residentId,
      visitorMessage: opts.visitorMessage,
    }),
    loadEngrams({
      supabase: opts.supabase,
      residentId: opts.residentId,
      visitorMessage: opts.visitorMessage,
      visitorToken: opts.visitorToken,
    }),
  ]);

  return {
    functional,
    hypomnema,
    engrams: engrams.pool,
    thisVisitorEngramIds: engrams.thisVisitorEngramIds,
  };
}

/**
 * Format the three-layer retrieval into the [WHAT THIS SESSION HAS
 * SEEN] / [WHAT YOU AND THIS VISITOR HAVE BUILT] / [WHAT MNEMOS
 * SURFACED] sections used in the new buildUserPrompt structure.
 *
 * Critical convention: prose with em-dash bullets in each section
 * body. No nested bracket tags inside section bodies — that pattern
 * causes the dense-scaffolding echo failure mode from this morning's
 * revert. Bracket tags survive only on the [core] / [from this
 * visitor's prior visit] labels in the engrams section (production-
 * tested in phase 0); everything else uses inline prose qualifiers.
 */
export function formatThreeLayerMemory(retrieval: ThreeLayerRetrieval): {
  functional: string;
  hypomnema: string;
  engrams: string;
} {
  // ── Functional ────────────────────────────────────────────────
  const functional = retrieval.functional?.content
    ? retrieval.functional.content.trim()
    : "(no working summary yet — this may be the first exchange of the session.)";

  // ── Hypomnema ─────────────────────────────────────────────────
  let hypomnema: string;
  if (retrieval.hypomnema.length === 0) {
    hypomnema =
      "(you and this visitor have not built anything together yet, or none of it surfaced for this turn.)";
  } else {
    hypomnema = retrieval.hypomnema
      .map((h) => {
        // Source qualifier — inline prose, not a bracket tag. "observed"
        // entries came from per-turn extraction; "synthesized" from a
        // session-close consolidation. Visitors don't see this; only the
        // resident does, so they can weight a turn-fresh observation
        // differently from a settled session-close synthesis.
        const sourceQualifier =
          h.source === "synthesized"
            ? " (synthesized at a prior session's close)"
            : h.source === "co-formed"
              ? " (co-formed across earlier exchanges)"
              : "";
        return `— ${h.content}${sourceQualifier}`;
      })
      .join("\n");
  }

  // ── Engrams (Mnemos) ──────────────────────────────────────────
  let engrams: string;
  if (retrieval.engrams.length === 0) {
    engrams =
      "(no engrams surfaced for this turn — this may be among the earliest conversations, or nothing in the topology resonated.)";
  } else {
    engrams = retrieval.engrams
      .map((e) => {
        const text = e.attribution === "visitor" && e.redacted_text ? e.redacted_text : e.quote;
        const isThisVisitor = retrieval.thisVisitorEngramIds.has(e.id);
        const tags: string[] = [];
        if (e.is_core) tags.push("core");
        if (isThisVisitor) tags.push("from this visitor's prior visit");
        const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
        const widerQualifier =
          !e.is_core && !isThisVisitor
            ? " (from a wider exchange — carry the shape, not the words as this visitor's)"
            : "";
        return `— ${text}${tagStr}${widerQualifier}`;
      })
      .join("\n");
  }

  return { functional, hypomnema, engrams };
}
