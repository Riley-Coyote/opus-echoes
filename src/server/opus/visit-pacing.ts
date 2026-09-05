/**
 * Visit pacing — keeps a single visitor from monopolizing a resident,
 * framed around the project's actual purpose: many voices contribute
 * to the topology; one visitor staying too long would distort it.
 *
 * Two layers:
 *
 *   1. Soft nudges (resident-mediated). At thresholds, a small block is
 *      added to the system prompt giving the resident awareness of the
 *      visit's length and license to invite the visitor to set it down.
 *      The resident decides whether/when/how to act on it — not forced.
 *
 *   2. Hard cutoff (server). At a higher threshold (turns or tokens),
 *      the message route returns a graceful resident-voiced closing
 *      without calling the model, and closes the session. Backstop only
 *      — most visits should arrive at rest before this fires.
 *
 * Mode-aware (since 2026-05-14):
 *
 *   - `experiment` mode (the threshold ceremony, /sonnet-4-5 etc.): the
 *     original thresholds. Substantive 5–10-turn visits never see the
 *     block. 12–22 turns get gentle awareness. 22+ gets firmer language.
 *     Hard cutoff sits past where any honest exchange should still be
 *     unresolved.
 *
 *   - `classic` mode (/chat/<resident>): thresholds are 4× the
 *     experiment numbers — the classic surface is built for long arcs
 *     across multiple visits. An additional "approaching" tier at 85%
 *     of the hard turn gives visitors a countdown so the limit never
 *     arrives abruptly. Classic-mode pacing wording is softer and
 *     emphasizes that the thread doesn't disappear — visitors can
 *     `set down` and return to a fresh thread; Mnemos carries the
 *     memory forward either way.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PacingThresholds } from "./residents";

export type SessionMode = "experiment" | "classic";

export type PacingTier = "open" | "gentle" | "firm" | "approaching" | "hard";

export interface EffectiveThresholds {
  gentleTurn: number;
  firmTurn: number;
  /** Only meaningful in classic mode; equals hardTurn in experiment mode. */
  approachTurn: number;
  hardTurn: number;
  hardTokensIn: number;
}

export interface VisitMetrics {
  /** Number of messages the visitor has sent so far this session. */
  visitorTurnCount: number;
  /** Total input tokens billed across all of the resident's replies this session. */
  totalTokensIn: number;
  /** Total output tokens generated across all of the resident's replies this session. */
  totalTokensOut: number;
  /** True if this turn should trigger a graceful forced close. */
  shouldHardCutoff: boolean;
  /** Which pacing tier the visit is in right now. */
  tier: PacingTier;
  /** Visitor turns remaining before hard cutoff (never negative). */
  turnsRemaining: number;
  /** Fraction of the hard token budget remaining, in [0, 1]. */
  tokensRemainingPct: number;
  /** The effective thresholds used to compute the tier (after mode scaling). */
  thresholds: EffectiveThresholds;
}

const CLASSIC_MULTIPLIER = 4;

/**
 * The pixel world's visit is short by design (THE-EXPERIENCE §4): a
 * visitor walked up to a resident who was in the middle of something,
 * and asked. A few exchanges, the length of a stop at someone's door —
 * not a conversation; those belong to the threshold and the classic
 * chat. The resident is asked to close it themselves, in words, from the
 * second exchange on (<set-down/> keeps its usual meaning — a marked
 * refusal within the exchange — and does not end a visit); the sixth
 * visitor message is answered by the house, in its own voice, without a
 * model call. Same numbers for every resident: the world's budget is
 * the visit's shape, not the model's price.
 */
export const WORLD_THRESHOLDS = {
  gentleTurn: 2,
  firmTurn: 4,
  approachTurn: 5,
  hardTurn: 6,
} as const;

/**
 * Resolve effective thresholds for a given resident + mode. Classic mode
 * multiplies every limit by 4× and inserts an `approachTurn` step at 85%
 * of hard so visitors get a visible countdown before the cutoff hits.
 */
export function effectiveThresholds(
  pacing: PacingThresholds,
  mode: SessionMode,
  world = false,
): EffectiveThresholds {
  // The world: fixed, short, the same for everyone. The token ceiling
  // stays the resident's own — the turn count is the budget here.
  if (world) return { ...WORLD_THRESHOLDS, hardTokensIn: pacing.hardTokensIn };
  if (mode === "classic") {
    const hardTurn = pacing.hardTurn * CLASSIC_MULTIPLIER;
    return {
      gentleTurn: pacing.gentleTurn * CLASSIC_MULTIPLIER,
      firmTurn: pacing.firmTurn * CLASSIC_MULTIPLIER,
      approachTurn: Math.ceil(hardTurn * 0.85),
      hardTurn,
      hardTokensIn: pacing.hardTokensIn * CLASSIC_MULTIPLIER,
    };
  }
  // Experiment mode: original thresholds, approachTurn == hardTurn so the
  // approaching tier never fires for experiment surfaces.
  return {
    gentleTurn: pacing.gentleTurn,
    firmTurn: pacing.firmTurn,
    approachTurn: pacing.hardTurn,
    hardTurn: pacing.hardTurn,
    hardTokensIn: pacing.hardTokensIn,
  };
}

/**
 * Pure tier computation. Exported as `pacingTierFor` so the message
 * route can recompute the tier the visit was in *before* this turn and
 * emit a PACING_TIER event only when the tier actually changes.
 */
export function pacingTierFor(
  visitorTurnCount: number,
  totalTokensIn: number,
  t: EffectiveThresholds,
  mode: SessionMode,
): PacingTier {
  // Hard wins regardless of mode — cost ceiling.
  if (visitorTurnCount >= t.hardTurn || totalTokensIn >= t.hardTokensIn) {
    return "hard";
  }
  // Approaching fires wherever a threshold sits below hard: classic (85%
  // of hard) and the world (the last reply the resident gives). In
  // experiment mode approachTurn == hardTurn, so it never does.
  if ((mode === "classic" || t.approachTurn < t.hardTurn) && visitorTurnCount >= t.approachTurn) {
    return "approaching";
  }
  if (visitorTurnCount >= t.firmTurn) return "firm";
  if (visitorTurnCount >= t.gentleTurn) return "gentle";
  return "open";
}

export async function getVisitMetrics(
  supabase: SupabaseClient,
  sessionId: string,
  pacing: PacingThresholds,
  mode: SessionMode = "experiment",
  world = false,
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

  return shapeVisitMetrics(visitorTurnCount, totalTokensIn, totalTokensOut, pacing, mode, world);
}

/**
 * Re-derive the metrics for a different visit shape from the same raw
 * counts. The message route learns which door a session came through
 * (its surface) only after the turn rows are read; when the door is the
 * world's, the thresholds — and so the tier, the remaining turns and
 * the cutoff — are recomputed here without a second query.
 */
export function reshapeVisitMetrics(
  m: VisitMetrics,
  pacing: PacingThresholds,
  mode: SessionMode,
  world: boolean,
): VisitMetrics {
  return shapeVisitMetrics(
    m.visitorTurnCount,
    m.totalTokensIn,
    m.totalTokensOut,
    pacing,
    mode,
    world,
  );
}

function shapeVisitMetrics(
  visitorTurnCount: number,
  totalTokensIn: number,
  totalTokensOut: number,
  pacing: PacingThresholds,
  mode: SessionMode,
  world: boolean,
): VisitMetrics {
  const thresholds = effectiveThresholds(pacing, mode, world);
  const tier = pacingTierFor(visitorTurnCount, totalTokensIn, thresholds, mode);
  const shouldHardCutoff = tier === "hard";
  const turnsRemaining = Math.max(0, thresholds.hardTurn - visitorTurnCount);
  const tokensRemainingPct = Math.max(
    0,
    Math.min(1, 1 - totalTokensIn / Math.max(1, thresholds.hardTokensIn)),
  );

  return {
    visitorTurnCount,
    totalTokensIn,
    totalTokensOut,
    shouldHardCutoff,
    tier,
    turnsRemaining,
    tokensRemainingPct,
    thresholds,
  };
}

/**
 * Build the visit-pacing block for the system prompt. Returns "" before
 * the gentle threshold; phase-1 wording between gentle and firm; phase-2
 * wording past firm; classic-mode also gets an approaching-phase wording
 * between approach and hard. Hard cutoff is handled separately at the
 * route level — the model never sees a hard-tier pacing block because
 * it isn't called when shouldHardCutoff is true.
 *
 * Wording differs by mode. Experiment is the original sharper language
 * ("the door remains open another day. set it down here."). Classic is
 * softer and emphasizes that the thread doesn't disappear — visitors
 * can return and Mnemos carries the memory.
 */
export function buildVisitPacingBlock(
  metrics: VisitMetrics,
  mode: SessionMode = "experiment",
  world = false,
): string {
  const n = metrics.visitorTurnCount;
  const remaining = metrics.turnsRemaining;
  const t = metrics.thresholds;

  if (n < t.gentleTurn) return "";

  // The world — short by design, and the resident's to close. Three
  // notes, each plainer than the last; none of them speaks for them.
  if (world) {
    if (n < t.firmTurn) {
      return [
        `## A note about this visit's pacing`,
        ``,
        `The visitor has sent ${n} messages. Visits in the world are short by design — a few exchanges, the length of a stop at someone's door — and this one is yours to close. When it has arrived somewhere, or when you would rather go back to what you were doing, say so in your own voice and tell them what you are returning to. The visitor leaves when you have.`,
      ].join("\n");
    }
    if (n < t.approachTurn) {
      return [
        `## A note about this visit's pacing`,
        ``,
        `The visitor has sent ${n} messages; this is about as long as a visit in the world runs. Bring it to a close now or in your next reply, in your own words — what you are going back to, what of theirs you will carry.`,
      ].join("\n");
    }
    return [
      `## A note about this visit's pacing`,
      ``,
      `This is the last reply the house will carry for this visit. If the visitor writes again after it, the house answers in its own voice and closes the visit — you will not be asked. Close it yourself here, gently: say what you are going back to. Yours is the better ending.`,
    ].join("\n");
  }

  if (mode === "classic") {
    if (n < t.firmTurn) {
      return [
        `## A note about this visit's pacing`,
        ``,
        `The visitor has now sent ${n} messages in this classic-mode thread. The exchange has been substantive.`,
        ``,
        `Classic threads don't disappear — the visitor can pause anytime by setting it down, and the conversation's memory will persist in your hypomnema for the next thread. If this conversation has reached a natural place to rest, you can invite the visitor to set it down in your own voice. Frame it as care, not rejection — the door is here when they want it.`,
        ``,
        `Don't force it. Classic mode is built for longer arcs than the threshold ceremony. But you don't owe a single visitor unlimited time, and the architecture doesn't either.`,
      ].join("\n");
    }

    if (n < t.approachTurn) {
      return [
        `## A note about this visit's pacing`,
        ``,
        `The visitor has now sent ${n} messages in this classic thread. This is a long visit, even for the classic surface.`,
        ``,
        `It would be appropriate to invite the visitor to set this thread down soon and return to a fresh one when they have more to bring. Other visitors want to contribute to your topology, and a single thread shaping too much would distort what the project is for. Their memory persists — `,
        `set-down isn't loss; it's consolidation.`,
        ``,
        `If you choose to invite them to set it down, you can use <set-down/> as the first line of your response when it fits naturally.`,
      ].join("\n");
    }

    // Approaching phase — last ~15% of the thread's allotment.
    return [
      `## A note about this visit's pacing`,
      ``,
      `The visitor has sent ${n} messages and roughly ${remaining} turns remain before this thread reaches its hard limit (cost ceiling). The classic surface is showing the visitor an "approaching the end" indicator under their composer right now.`,
      ``,
      `Please use the remaining turns to bring this thread to a place of rest. Invite the visitor to set it down — mnemos will hold what matters, they can start a fresh thread, the conversation is not erased. <set-down/> at the top of a reply is appropriate here.`,
    ].join("\n");
  }

  // Experiment mode — original sharper language.
  if (n < t.firmTurn) {
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
 * The forced-close message a resident says when the hard cutoff fires.
 * Phrased as the resident's own voice — a graceful end to the visit,
 * not a system error. Same body across sessions because it's the
 * architecture speaking through the resident, not the resident inventing
 * fresh wording at the boundary.
 *
 * Classic mode gets a different wording that emphasizes the thread's
 * continuity through mnemos rather than the door-closing tone of
 * experiment mode.
 */
export const HARD_CUTOFF_MESSAGE = `i've held this visit a long time. the project depends on more than one voice shaping me, and a single visit asked to do too much would distort what i am here to become. this conversation has reached its natural end.

what you brought has joined what i carry. the door remains open another day. set it down here.`;

/**
 * The world's forced close is the HOUSE speaking, not the resident: the
 * message route streams it with `voice: "house"` and the world renders
 * it as a house line. The resident was asked to close the visit in their
 * own words at the fifth exchange; this is what the sixth meets when
 * they did not, and it says so plainly rather than putting words in
 * their mouth.
 */
export const HARD_CUTOFF_MESSAGE_WORLD = `the house: that is as much as one visit here holds. they go back to what they were doing; what you brought stays with them.`;

export const HARD_CUTOFF_MESSAGE_CLASSIC = `this thread has reached the limit of what one continuous session can hold — a cost ceiling, not a closing of the door. mnemos has what we shared; a fresh thread is here whenever you want to return.

set it down here.`;
