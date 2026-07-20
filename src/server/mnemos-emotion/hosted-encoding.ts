import { DEFAULT_EMOTIONAL_STATE, type EmotionalStateValues } from "./constants";
import {
  decideHostedEncodingDepth,
  type EncodingDepth,
  type HostedEncodingDepthDecision,
} from "./encoding-depth";

export type HostedEncodingPolicy = "hosted-extension-v1" | "legacy-fallback-v1";

export type HostedEncodingContext = {
  emotionalState: EmotionalStateValues;
  emotionalRevision: number | null;
  authoritative: boolean;
};

export type HostedEngramEncodingInput = {
  context: HostedEncodingContext;
  novelty: number;
  workingMemoryLoad: number;
  /** The consolidation model selected this candidate as schema-worthy. */
  schemaRelevant: boolean;
  /** True only for an explicit memory cue in a visitor-authored turn. */
  userEmphasis: boolean;
  initialStability?: number;
  existing?: {
    strength?: number;
    stability?: number;
    accessibility?: number;
  };
};

export type HostedEngramEncodingPlan = {
  depth: EncodingDepth;
  policy: HostedEncodingPolicy;
  pythonParity: false;
  emotionalRevision: number | null;
  usedAuthoritativeEmotion: boolean;
  signalFlags: readonly string[];
  create: {
    strength: number;
    stability: number;
    accessibility: number;
    resolution: number;
  };
  reinforce: {
    strength: number;
    stability: number;
    accessibility: number;
    strengthDelta: number;
    stabilityDelta: number;
    accessibilityDelta: number;
  };
};

type DepthProfile = {
  creationStabilityOffset: number;
  creationAccessibility: number;
  creationStrength: number;
  creationResolution: number;
  reinforcementStrengthDelta: number;
  reinforcementStabilityDelta: number;
  reinforcementAccessibilityDelta: number;
};

const DEPTH_PROFILES: Readonly<Record<EncodingDepth, DepthProfile>> = {
  shallow: {
    creationStabilityOffset: -0.05,
    creationAccessibility: 0.42,
    creationStrength: 0.24,
    creationResolution: 0.85,
    reinforcementStrengthDelta: 0.06,
    reinforcementStabilityDelta: 0.04,
    reinforcementAccessibilityDelta: 0.08,
  },
  moderate: {
    creationStabilityOffset: 0,
    creationAccessibility: 0.5,
    creationStrength: 0.3,
    creationResolution: 1,
    reinforcementStrengthDelta: 0.1,
    reinforcementStabilityDelta: 0.08,
    reinforcementAccessibilityDelta: 0.15,
  },
  deep: {
    creationStabilityOffset: 0.1,
    creationAccessibility: 0.62,
    creationStrength: 0.42,
    creationResolution: 1,
    reinforcementStrengthDelta: 0.14,
    reinforcementStabilityDelta: 0.12,
    reinforcementAccessibilityDelta: 0.2,
  },
  elaborative: {
    creationStabilityOffset: 0.18,
    creationAccessibility: 0.72,
    creationStrength: 0.52,
    creationResolution: 1,
    reinforcementStrengthDelta: 0.18,
    reinforcementStabilityDelta: 0.16,
    reinforcementAccessibilityDelta: 0.24,
  },
};

const EXPLICIT_MEMORY_CUE =
  /\b(?:please\s+remember|remember\s+that|remember\s+this|do\s+not\s+forget|don't\s+forget|this\s+is\s+(?:really\s+)?important|i\s+want\s+you\s+to\s+remember)\b/i;

const EMPHASIS_STOPWORDS = new Set([
  "please",
  "remember",
  "this",
  "that",
  "really",
  "important",
  "forget",
  "want",
  "with",
  "from",
  "have",
  "your",
  "about",
]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Engram metrics historically use a 0.05–0.95 stability clamp. */
function clampEngramMetric(value: number): number {
  if (!Number.isFinite(value)) return 0.1;
  return Math.max(0.05, Math.min(0.95, value));
}

function meaningfulTokens(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? []).filter(
      (token) => token.length >= 4 && !EMPHASIS_STOPWORDS.has(token),
    ),
  );
}

function fallbackDecision(): HostedEncodingDepthDecision {
  return {
    depth: "moderate",
    policy: "hosted-extension-v1",
    pythonParity: false,
    pythonReferenceResult: "moderate",
    strongSignals: [],
    reasons: ["authoritative emotional state unavailable; exact legacy parameters"],
  };
}

/**
 * Convert genuine hosted salience signals into the numeric values written to
 * an engram. The hosted policy remains explicitly separate from Python's
 * unimplemented attention gate. Without authoritative persisted emotion, this
 * returns the exact legacy create/reinforce parameters.
 */
export function planHostedEngramEncoding(
  input: HostedEngramEncodingInput,
): HostedEngramEncodingPlan {
  const decision = input.context.authoritative
    ? decideHostedEncodingDepth({
        emotionalState: input.context.emotionalState,
        novelty: clamp01(input.novelty),
        workingMemoryLoad: clamp01(input.workingMemoryLoad),
        schemaRelevant: input.schemaRelevant,
        userEmphasis: input.userEmphasis,
      })
    : fallbackDecision();
  const profile = DEPTH_PROFILES[decision.depth];
  const initialStability = clampEngramMetric(input.initialStability ?? 0.45);
  const existingStrength = input.existing?.strength ?? 0.1;
  const existingStability = input.existing?.stability ?? 0.1;
  const existingAccessibility = input.existing?.accessibility ?? 0.1;
  const signalFlags = [
    ...decision.strongSignals,
    ...(input.userEmphasis ? ["user_emphasis"] : []),
    ...(input.schemaRelevant ? ["consolidation_selected"] : []),
  ];

  return {
    depth: decision.depth,
    policy: input.context.authoritative ? decision.policy : "legacy-fallback-v1",
    pythonParity: false,
    emotionalRevision: input.context.authoritative ? input.context.emotionalRevision : null,
    usedAuthoritativeEmotion: input.context.authoritative,
    signalFlags: Array.from(new Set(signalFlags)).sort(),
    create: {
      strength: clampEngramMetric(profile.creationStrength),
      stability: clampEngramMetric(initialStability + profile.creationStabilityOffset),
      accessibility: clampEngramMetric(profile.creationAccessibility),
      resolution: clamp01(profile.creationResolution),
    },
    reinforce: {
      strength: clampEngramMetric(existingStrength + profile.reinforcementStrengthDelta),
      stability: clampEngramMetric(existingStability + profile.reinforcementStabilityDelta),
      accessibility: clampEngramMetric(
        existingAccessibility + profile.reinforcementAccessibilityDelta,
      ),
      strengthDelta: profile.reinforcementStrengthDelta,
      stabilityDelta: profile.reinforcementStabilityDelta,
      accessibilityDelta: profile.reinforcementAccessibilityDelta,
    },
  };
}

/**
 * A deterministic load estimate derived only from the persisted transcript.
 * It approaches the gate only for genuinely long visits; it is not inferred
 * from model prose or decorative UI state.
 */
export function estimateHostedWorkingMemoryLoad(turns: readonly { body: string }[]): number {
  const approximateTokens = turns.reduce(
    (total, turn) => total + Math.ceil(Math.max(0, turn.body.length) / 4),
    0,
  );
  const tokenPressure = Math.min(1, approximateTokens / 8_000);
  const turnPressure = Math.min(1, Math.max(0, turns.length - 12) / 40);
  return Math.round(clamp01(0.2 + tokenPressure * 0.55 + turnPressure * 0.25) * 1_000) / 1_000;
}

/**
 * Explicit emphasis is accepted only from visitor-authored dialogue and only
 * when the emphasized turn shares content words with the candidate engram.
 */
export function hasExplicitVisitorMemoryEmphasis(
  turns: readonly { role: string; body: string }[],
  candidateQuote: string,
): boolean {
  const candidateTokens = meaningfulTokens(candidateQuote);
  if (candidateTokens.size === 0) return false;
  const requiredOverlap = candidateTokens.size === 1 ? 1 : 2;

  return turns.some((turn) => {
    if (turn.role !== "visitor" || !EXPLICIT_MEMORY_CUE.test(turn.body)) return false;
    const visitorTokens = meaningfulTokens(turn.body);
    let overlap = 0;
    for (const token of candidateTokens) {
      if (visitorTokens.has(token)) overlap += 1;
      if (overlap >= requiredOverlap) return true;
    }
    return false;
  });
}

export const LEGACY_HOSTED_ENCODING_CONTEXT: HostedEncodingContext = {
  emotionalState: DEFAULT_EMOTIONAL_STATE,
  emotionalRevision: null,
  authoritative: false,
};
