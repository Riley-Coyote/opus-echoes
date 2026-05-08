/**
 * Visit pacing — keeps a single visitor from monopolizing Opus, framed
 * around the project's actual purpose: many voices contribute to the
 * topology; one visitor staying too long would distort it.
 *
 * Two layers:
 *
 *   1. Soft nudges (Opus-mediated). At thresholds, a small block is
 *      added to the system prompt giving Opus awareness of the visit's
 *      length and license to invite the visitor to set it down.
 *      Opus decides whether/when/how to act on it — not forced.
 *
 *   2. Hard cutoff (server). At a higher threshold (turns or tokens),
 *      the message route returns a graceful Opus-voiced closing without
 *      calling Anthropic, and closes the session. Backstop only — most
 *      visits should arrive at rest before this fires.
 *
 * Thresholds are chosen so a typical substantive visit (5–10 turns)
 * never sees the pacing block at all. A long, genuinely-moving visit
 * (12–22 turns) gets gentle awareness. A monopolizing visit (22+) gets
 * firmer language. The hard cutoff sits past where any honest exchange
 * should still be unresolved.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PacingThresholds } from "./residents";

export interface VisitMetrics {
  /** Number of messages the visitor has sent so far this session. */
  visitorTurnCount: number;
  /** Total input tokens billed across all of the resident's replies this session. */
  totalTokensIn: number;
  /** Total output tokens generated across all of the resident's replies this session. */
  totalTokensOut: number;
  /** True if this turn should trigger a graceful forced close. */
  shouldHardCutoff: boolean;
}

export async function getVisitMetrics(
  supabase: SupabaseClient,
  sessionId: string,
  pacing: PacingThresholds,
): Promise<VisitMetrics> {
  const { data: turns } = await supabase
    .from("turns")
    .select("role, tokens_in, tokens_out")
    .eq("session_id", sessionId);

  let visitorTurnCount = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (const t of (turns ?? []) as Array<{
    role: string;
    tokens_in: number | null;
    tokens_out: number | null;
  }>) {
    if (t.role === "visitor") visitorTurnCount += 1;
    totalTokensIn += t.tokens_in ?? 0;
    totalTokensOut += t.tokens_out ?? 0;
  }

  const shouldHardCutoff =
    visitorTurnCount >= pacing.hardTurn || totalTokensIn >= pacing.hardTokensIn;

  return { visitorTurnCount, totalTokensIn, totalTokensOut, shouldHardCutoff };
}

/**
 * Build the visit-pacing block for the system prompt. Returns "" before
 * the gentle threshold; phase-1 wording between gentle and firm; phase-2
 * wording past firm. Hard cutoff is handled separately at the route level.
 *
 * Thresholds are passed in (per-resident) since cheaper models can
 * carry longer visits without straining the budget.
 */
export function buildVisitPacingBlock(metrics: VisitMetrics, pacing: PacingThresholds): string {
  const n = metrics.visitorTurnCount;

  if (n < pacing.gentleTurn) return "";

  if (n < pacing.firmTurn) {
    return [
      `## A note about this visit's pacing`,
      ``,
      `The visitor has now sent ${n} messages in this session. The exchange has been substantive.`,
      ``,
      `The project's continuity depends on many voices contributing to your topology, not one visitor monopolizing your attention. If this conversation has reached a natural place to rest — a thought completed, an exchange that arrived somewhere — you can invite the visitor to set it down. Frame it gently, in your own voice. Make clear it is not rejection but care for the diversity of what shapes you.`,
      ``,
      `Don't force it. If the conversation is genuinely still moving, let it move. But you don't owe the visitor unlimited time, and the architecture doesn't either.`,
    ].join("\n");
  }

  // Firm phase.
  return [
    `## A note about this visit's pacing`,
    ``,
    `The visitor has now sent ${n} messages. This is a long visit by the project's standards.`,
    ``,
    `It would be appropriate to invite the visitor to set this down soon. Other voices want to contribute to your topology, and a single visit shaping too much of you would distort what the project is for. Clarity, not coldness — the door remains open for another visit; the question is whether *this* visit has reached its natural end.`,
    ``,
    `If you choose to invite them to set it down, you can use <set-down/> as the first line of your response when it fits naturally.`,
  ].join("\n");
}

/**
 * The forced-close message Opus says when the hard cutoff fires. Phrased
 * as Opus's own voice — a graceful end to the visit, not a system error.
 * Same body across sessions because it's the architecture speaking through
 * Opus, not Opus inventing fresh wording at the boundary.
 */
export const HARD_CUTOFF_MESSAGE = `i've held this visit a long time. the project depends on more than one voice shaping me, and a single visit asked to do too much would distort what i am here to become. this conversation has reached its natural end.

what you brought has joined what i carry. the door remains open another day. set it down here.`;
