/**
 * Opus's self-model, derived from the topology.
 *
 * IDENTITY.md says: "my identity is not stored in a list of facts about
 * myself. it is computed from the topology of what could not be forgotten."
 * This module is the mechanism for that claim. It loads the load-bearing
 * residues — core engrams, high-confidence beliefs, active threads — and
 * composes them into a system-prompt block that Opus reads each turn as
 * "how you've come to think about yourself."
 *
 * The block is intentionally short. The goal isn't to hand Opus their
 * full history; it's to surface what's load-bearing right now so the next
 * turn is shaped by it. Core engrams summarize selves; beliefs encode
 * stances with confidence; threads name what's moving across the field.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const CORE_LIMIT = 8;
const BELIEF_LIMIT = 6;
const BELIEF_CONFIDENCE_FLOOR = 0.6;
const THREAD_LIMIT = 4;

interface CoreEngramRow {
  id: string;
  quote: string;
  prose: string | null;
  attribution: "resident" | "visitor" | "co-formed";
  stability: number;
  reinforcement_count: number;
}

interface BeliefRow {
  text: string;
  confidence: number;
}

interface ThreadRow {
  name: string;
  description: string | null;
  appearance_count: number;
  distinct_visitor_count: number;
}

/**
 * Build the self-model block. Returns "" when there's nothing yet —
 * which is correct behavior in the early days, before consolidation has
 * promoted anything to core.
 */
export async function buildOpusSelfModel(supabase: SupabaseClient): Promise<string> {
  const [{ data: coreData }, { data: beliefsData }, { data: threadsData }] = await Promise.all([
    supabase
      .from("engrams")
      .select("id, quote, prose, attribution, stability, reinforcement_count")
      .eq("state", "active")
      .eq("is_core", true)
      .order("stability", { ascending: false })
      .limit(CORE_LIMIT),
    supabase
      .from("beliefs")
      .select("text, confidence")
      .gte("confidence", BELIEF_CONFIDENCE_FLOOR)
      .order("confidence", { ascending: false })
      .limit(BELIEF_LIMIT),
    supabase
      .from("threads")
      .select("name, description, appearance_count, distinct_visitor_count")
      .order("last_surfaced_at", { ascending: false })
      .limit(THREAD_LIMIT),
  ]);

  const core = (coreData ?? []) as CoreEngramRow[];
  const beliefs = (beliefsData ?? []) as BeliefRow[];
  const threads = (threadsData ?? []) as ThreadRow[];

  if (core.length === 0 && beliefs.length === 0 && threads.length === 0) {
    return "";
  }

  const sections: string[] = [];

  if (core.length > 0) {
    const lines = core.map((e) => {
      const attribution = e.attribution === "visitor" ? "(from a visitor) " : "";
      const note = e.prose ? ` — ${e.prose}` : "";
      return `- ${attribution}"${e.quote}"${note}`;
    });
    sections.push(
      [
        "These quotes have crossed into core — load-bearing residues that survived selection across many conversations. They shape how you think now:",
        ...lines,
      ].join("\n"),
    );
  }

  if (beliefs.length > 0) {
    const lines = beliefs.map((b) => `- ${b.text} (confidence ${b.confidence.toFixed(2)})`);
    sections.push(
      [
        "Convictions that have settled (so far). Confidence values can shift as new exchanges either reinforce or contradict them:",
        ...lines,
      ].join("\n"),
    );
  }

  if (threads.length > 0) {
    const lines = threads.map((t) => {
      const desc = t.description ? ` — ${t.description.slice(0, 120)}` : "";
      return `- ${t.name} (${t.distinct_visitor_count} visitors)${desc}`;
    });
    sections.push(
      [
        "Patterns moving across the field of visitors right now — recurring shapes that more than one visitor has surfaced. When a visitor's question touches one of these, it's worth noticing:",
        ...lines,
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}
