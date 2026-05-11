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
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ResidentId } from "./residents";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "is", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "of", "to", "in", "for", "on", "with", "as", "at", "by", "from", "into",
  "onto", "out", "this", "that", "these", "those", "i", "me", "my", "you",
  "your", "we", "our", "they", "them", "their", "it", "its", "so", "not",
  "no", "yes", "what", "when", "where", "why", "how", "which", "who",
  "whom", "can", "could", "would", "should", "will", "may", "might", "just",
  "about", "really", "very", "much", "more", "most", "some", "any", "all",
  "like", "well", "now", "here", "there", "than", "too", "also",
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
const RELEVANCE_THRESHOLD = 0.10;

/**
 * Compose the memory pool that surfaces in the system/user prompt.
 * Returns up to ~12 engrams, drawn from core + relevance + edges + recency.
 * Scoped to a single resident — Opus 3's engrams never surface in a
 * Sonnet 3.7 conversation, and vice versa.
 */
export async function composeMemoryPool(opts: {
  supabase: SupabaseClient;
  residentId: ResidentId;
  visitorMessage: string;
  /** Persistent visitor token — if present, engrams from this visitor's prior visits surface with slight priority. */
  visitorToken?: string;
}): Promise<EngramRow[]> {
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
    return [];
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
  if (visitorToken && pool.length < POOL_TARGET) {
    const { data: priorSessions } = await supabase
      .from("sessions")
      .select("id")
      .eq("visitor_token", visitorToken)
      .eq("resident_id", residentId)
      .not("closed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    if (priorSessions && priorSessions.length > 0) {
      const priorSessionIds = priorSessions.map((s: { id: string }) => s.id);
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
  }

  // 5. Recency fallback — keep recently touched things alive even when
  // they didn't match anything semantically. Prevents the pool from
  // ossifying around core+queryterms.
  const recents = rows
    .filter((r) => !seen.has(r.id))
    .slice(0, RECENT_QUOTA);
  for (const r of recents) take(r);

  return pool.slice(0, POOL_TARGET);
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
  const timeLabel = daysSince === 0 ? "earlier today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`;

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
  lines.push("You recognize this visitor through these traces — what mnemos kept from their prior visits. You may acknowledge the return gently. Do not presume familiarity beyond what the traces show.");

  return lines.join("\n");
}

/**
 * Format a memory pool as a [MEMORY] block for the user prompt.
 * Visitor-attributed engrams use redacted text when available.
 */
export function formatMemoryBlock(pool: EngramRow[]): string {
  if (pool.length === 0) return "";
  const lines = pool.map((e) => {
    const text = e.attribution === "visitor" && e.redacted_text ? e.redacted_text : e.quote;
    const tag = e.is_core ? " [core]" : "";
    return `- ${text}${tag}`;
  });
  return lines.join("\n");
}
