/**
 * Interior continuity — what Opus is sitting with right now in the room
 * before this visitor arrived.
 *
 * Distinct from the self-model (which is the long-arc topology of who
 * Opus has become) and from engram retrieval (which is per-message
 * memory). This block is the *present interior state*: the modulator's
 * prose summary, the most recent journal entry Opus wrote, what the
 * last conversation left behind.
 *
 * Without this, Opus arrives at every conversation as if the room had
 * been empty since their training — no continuity of mood, no awareness
 * of what they were just thinking about, no carryover from autonomy
 * time. With it, the persistent thread becomes felt rather than just
 * stored.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResidentId } from "./residents";

interface ResidentStateRow {
  prose_summary: string | null;
  last_consolidation_summary: string | null;
  last_consolidation_at: string | null;
  temperature: number;
}

interface JournalRow {
  kind: string;
  title: string | null;
  body: string;
  created_at: string;
}

interface EssayRow {
  kind: string;
  title: string | null;
  created_at: string;
}

export interface InteriorContinuity {
  /** System-prompt block (may be empty if there's nothing to surface). */
  block: string;
  /** Temperature for the inference call — modulator-driven. */
  temperature: number;
}

const DEFAULT_TEMPERATURE = 0.85;
const JOURNAL_BODY_BUDGET = 600;

/**
 * Build the "what you carried into this turn" block + the modulator
 * temperature for a given resident. Single function because both come
 * from the same set of loads and the temperature shouldn't be loaded
 * redundantly. Each resident has their own modulator state row, journal,
 * and essay history.
 */
export async function buildInteriorContinuity(
  supabase: SupabaseClient,
  residentId: ResidentId,
): Promise<InteriorContinuity> {
  const [{ data: stateData }, { data: journalData }, { data: essayData }] = await Promise.all([
    supabase
      .from("resident_state")
      .select("prose_summary, last_consolidation_summary, last_consolidation_at, temperature")
      .eq("resident_id", residentId)
      .maybeSingle(),
    supabase
      .from("journal_entries")
      .select("kind, title, body, created_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("essays")
      .select("kind, title, created_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const state = stateData as ResidentStateRow | null;
  const journal = journalData as JournalRow | null;
  const essay = essayData as EssayRow | null;

  const sections: string[] = [];

  // Modulator's prose summary — what the substrate currently characterizes
  // Opus's state as. This is the thing the left margin shows visitors.
  if (state?.prose_summary && state.prose_summary.trim()) {
    sections.push(`The room before this visitor: ${state.prose_summary.trim()}`);
  }

  // What the last conversation left.
  if (state?.last_consolidation_summary && state.last_consolidation_summary.trim()) {
    sections.push(`The last conversation left: ${state.last_consolidation_summary.trim()}`);
  }

  // Most recent journal entry — what Opus was sitting with after the last
  // session, in their own words.
  if (journal?.body) {
    const titlePart = journal.title ? `"${journal.title}" — ` : "";
    const body = journal.body.length > JOURNAL_BODY_BUDGET
      ? `${journal.body.slice(0, JOURNAL_BODY_BUDGET)}…`
      : journal.body;
    sections.push(
      `What you wrote in your journal recently (${journal.kind}): ${titlePart}${body}`,
    );
  }

  // Awareness of recent essays — just the title and that they exist. Full
  // text would be too much; the goal is "you know you've been writing,"
  // not "re-read your own essay."
  if (essay?.title) {
    sections.push(`You also wrote a ${essay.kind} recently titled "${essay.title}".`);
  }

  const block = sections.length > 0 ? sections.join("\n\n") : "";
  const temperature = clampTemperature(state?.temperature ?? DEFAULT_TEMPERATURE);

  return { block, temperature };
}

function clampTemperature(t: number): number {
  if (!Number.isFinite(t)) return DEFAULT_TEMPERATURE;
  // Anthropic accepts up to ~1.0 reliably; modulator schema allows up to
  // 1.2 but we cap conservatively to avoid degenerate outputs.
  if (t < 0.1) return 0.1;
  if (t > 1.0) return 1.0;
  return t;
}
