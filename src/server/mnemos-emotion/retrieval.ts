import type { EmotionalStateValues } from "./constants";
import { getEmotionalRetrievalBias } from "./state";

export type EmotionalRetrievalAdjustment = {
  /** Sum of matching tag weights before the Python 0.5 cap. */
  overlap: number;
  /** `1 + min(0.5, overlap)` from `retrieval/reactive.py`. */
  multiplier: number;
  activation: number;
};

export type EmotionalRankCandidate<T> = {
  value: T;
  /** Activation supplied by the hosted retrieval stage before emotion. */
  activation: number;
  tags: readonly string[];
  /** Protected slots, such as core engrams, retain their exact position. */
  protected?: boolean;
};

/**
 * Apply the exact emotional-congruence stage from Python's ReactiveRetriever.
 *
 * Tags are deliberately not deduplicated. Python sums over `engram.tags`, so
 * a repeated tag receives a repeated contribution here too.
 */
export function applyEmotionalRetrievalBias(
  activation: number,
  tags: readonly string[],
  state: EmotionalStateValues,
): EmotionalRetrievalAdjustment {
  const bias = getEmotionalRetrievalBias(state);
  const overlap = tags.reduce((sum, tag) => sum + (bias[tag] ?? 0), 0);
  const multiplier = overlap > 0 ? 1 + Math.min(0.5, overlap) : 1;

  return {
    overlap,
    multiplier,
    activation: activation * multiplier,
  };
}

/**
 * Reorder only unprotected candidates with Python's canonical emotional
 * multiplier. The hosted lexical/vector stage still owns base activation and
 * candidate eligibility; this function neither expands the pool nor moves a
 * core/protected slot.
 */
export function rankCandidatesWithEmotionalBias<T>(
  candidates: readonly EmotionalRankCandidate<T>[],
  state?: EmotionalStateValues,
): EmotionalRankCandidate<T>[] {
  if (!state) return [...candidates];

  const ranked = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      adjusted: candidate.protected
        ? candidate.activation
        : applyEmotionalRetrievalBias(
            Number.isFinite(candidate.activation) ? candidate.activation : 0,
            candidate.tags,
            state,
          ).activation,
    }))
    .filter(({ candidate }) => !candidate.protected)
    .sort((left, right) => right.adjusted - left.adjusted || left.index - right.index);

  let rankedIndex = 0;
  return candidates.map((candidate) =>
    candidate.protected ? candidate : ranked[rankedIndex++]!.candidate,
  );
}
