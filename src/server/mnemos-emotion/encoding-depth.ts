import { EMOTIONAL_DIMENSIONS, type EmotionalStateValues } from "./constants";

export type EncodingDepth = "shallow" | "moderate" | "deep" | "elaborative";

export const PYTHON_ATTENTION_GATE_STATUS = {
  implemented: false,
  currentResult: "moderate",
  reference: "mnemos/advanced/attention_gate.py",
} as const;

export type HostedEncodingSignals = {
  emotionalState: EmotionalStateValues;
  novelty?: number;
  surprise?: number;
  workingMemoryLoad?: number;
  schemaRelevant?: boolean;
  goalRelevant?: boolean;
  userEmphasis?: boolean;
};

export type HostedEncodingDepthDecision = {
  depth: EncodingDepth;
  policy: "hosted-extension-v1";
  pythonParity: false;
  pythonReferenceResult: "moderate";
  strongSignals: readonly string[];
  reasons: readonly string[];
};

function clamp01(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

/**
 * Conservative hosted encoding policy; this is explicitly NOT Python parity.
 *
 * The Python attention gate is currently a TODO that always returns
 * `moderate`. Mnemos's hosted runtime needs a deterministic place to evolve
 * encoding behavior, but exporting this under a distinct name and returning
 * `pythonParity: false` prevents the extension from being presented as an
 * implemented Python feature.
 *
 * Most inputs remain moderate. Deep/elaborative encoding requires several
 * independent strong signals, while shallow encoding is reserved for severe
 * working-memory load without a countervailing salience signal.
 */
export function decideHostedEncodingDepth(
  signals: HostedEncodingSignals,
): HostedEncodingDepthDecision {
  const novelty = clamp01(signals.novelty, 0);
  const surprise = clamp01(signals.surprise, 0);
  const workingMemoryLoad = clamp01(signals.workingMemoryLoad, 0.5);
  const emotionalIntensity = Math.max(
    ...EMOTIONAL_DIMENSIONS.map((dimension) => clamp01(signals.emotionalState[dimension], 0.5)),
  );

  const strongSignals: string[] = [];
  if (novelty >= 0.75) strongSignals.push("novelty");
  if (surprise >= 0.75) strongSignals.push("surprise");
  if (emotionalIntensity >= 0.75) strongSignals.push("emotional_intensity");
  if (signals.schemaRelevant) strongSignals.push("schema_relevance");
  if (signals.goalRelevant) strongSignals.push("goal_relevance");

  const reasons: string[] = [];
  let depth: EncodingDepth = "moderate";

  if (signals.userEmphasis === true && strongSignals.length >= 3 && workingMemoryLoad <= 0.65) {
    depth = "elaborative";
    reasons.push("explicit emphasis and at least three independent strong signals");
  } else if (
    workingMemoryLoad < 0.85 &&
    (strongSignals.length >= 3 || (signals.userEmphasis === true && strongSignals.length >= 1))
  ) {
    depth = "deep";
    reasons.push("multiple independent salience signals with available working memory");
  } else if (
    workingMemoryLoad >= 0.9 &&
    signals.userEmphasis !== true &&
    strongSignals.length === 0
  ) {
    depth = "shallow";
    reasons.push("severe working-memory load without a strong salience signal");
  } else {
    reasons.push("conservative moderate baseline");
  }

  if (workingMemoryLoad >= 0.85 && depth !== "shallow") {
    reasons.push("high working-memory load prevented deeper encoding");
  }

  return {
    depth,
    policy: "hosted-extension-v1",
    pythonParity: false,
    pythonReferenceResult: PYTHON_ATTENTION_GATE_STATUS.currentResult,
    strongSignals,
    reasons,
  };
}
