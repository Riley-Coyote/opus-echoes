import {
  COGNITIVE_EVENT_MAP,
  DEFAULT_EMOTIONAL_STATE,
  EMOTIONAL_DIMENSIONS,
  EMOTIONAL_RETRIEVAL_BIAS,
  EMOTIONAL_SMOOTHING,
  type CognitiveEventType,
  type EmotionalStateValues,
} from "./constants";

export type EmotionalStateSnapshot = EmotionalStateValues & {
  timestamp: string;
};

export type EmotionalStateInput = Partial<EmotionalStateValues> & {
  timestamp?: string;
};

function nowIsoLikePython(): string {
  // Python's datetime.now(timezone.utc).isoformat() uses an explicit +00:00
  // suffix. Preserve that serialized shape rather than emitting JavaScript's Z.
  return new Date().toISOString().replace(/Z$/, "+00:00");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Round an IEEE-754 number to decimal places using ties-to-even.
 *
 * Python's `round(value, 4)` rounds the exact binary float, not the decimal
 * spelling. Converting the double to its exact integer ratio avoids common
 * cross-runtime edge differences such as 2.675 at two decimal places.
 */
function pythonRound(value: number, decimalPlaces: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 12) {
    throw new RangeError("decimalPlaces must be an integer between 0 and 12");
  }

  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false);
  const isNegative = bits >> 63n === 1n;
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0x000fffffffffffffn;

  let numerator: bigint;
  let exponent: number;
  if (exponentBits === 0) {
    numerator = fraction;
    exponent = -1074;
  } else {
    numerator = (1n << 52n) | fraction;
    exponent = exponentBits - 1023 - 52;
  }

  const decimalFactor = 10n ** BigInt(decimalPlaces);
  numerator *= decimalFactor;

  let denominator = 1n;
  if (exponent >= 0) numerator <<= BigInt(exponent);
  else denominator <<= BigInt(-exponent);

  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const twiceRemainder = remainder * 2n;
  if (twiceRemainder > denominator || (twiceRemainder === denominator && quotient % 2n !== 0n)) {
    quotient += 1n;
  }

  const rounded = Number(quotient) / Number(decimalFactor);
  if (!isNegative) return rounded;
  return rounded === 0 ? -0 : -rounded;
}

function hasCognitiveEvent(eventType: string): eventType is CognitiveEventType {
  return Object.prototype.hasOwnProperty.call(COGNITIVE_EVENT_MAP, eventType);
}

export function getEmotionalRetrievalBias(state: EmotionalStateValues): Record<string, number> {
  const bias: Record<string, number> = {};

  for (const dimension of EMOTIONAL_DIMENSIONS) {
    const level = state[dimension];
    if (level <= 0.5) continue;

    const boost = (level - 0.5) * 0.2;
    for (const tag of EMOTIONAL_RETRIEVAL_BIAS[dimension]) {
      bias[tag] = (bias[tag] ?? 0) + boost;
    }
  }

  return bias;
}

/**
 * Mutable counterpart of Python Mnemos's `EmotionalState` dataclass.
 *
 * Constructor and `fromDict` values are intentionally not normalized: the
 * Python dataclass accepts the supplied values as-is. Cognitive events clamp
 * only the dimensions they change, exactly as the reference implementation
 * does.
 */
export class EmotionalState implements EmotionalStateValues {
  curiosity: number;
  restlessness: number;
  warmth: number;
  clarity: number;
  creative_flow: number;
  isolation: number;
  timestamp: string;

  constructor(input: EmotionalStateInput = {}) {
    this.curiosity = input.curiosity ?? DEFAULT_EMOTIONAL_STATE.curiosity;
    this.restlessness = input.restlessness ?? DEFAULT_EMOTIONAL_STATE.restlessness;
    this.warmth = input.warmth ?? DEFAULT_EMOTIONAL_STATE.warmth;
    this.clarity = input.clarity ?? DEFAULT_EMOTIONAL_STATE.clarity;
    this.creative_flow = input.creative_flow ?? DEFAULT_EMOTIONAL_STATE.creative_flow;
    this.isolation = input.isolation ?? DEFAULT_EMOTIONAL_STATE.isolation;
    this.timestamp = input.timestamp ?? nowIsoLikePython();
  }

  applyCognitiveEvent(
    eventType: string,
    magnitude = 0.05,
    timestamp = nowIsoLikePython(),
  ): boolean {
    if (!hasCognitiveEvent(eventType)) return false;

    const adjustments = COGNITIVE_EVENT_MAP[eventType];
    for (const dimension of EMOTIONAL_DIMENSIONS) {
      const direction = adjustments[dimension as keyof typeof adjustments];
      if (direction === undefined) continue;
      this[dimension] = clamp01(this[dimension] + magnitude * direction);
    }
    this.timestamp = timestamp;
    return true;
  }

  smoothUpdate(calculated: EmotionalStateValues, timestamp = nowIsoLikePython()): void {
    for (const dimension of EMOTIONAL_DIMENSIONS) {
      const smoothed =
        this[dimension] * EMOTIONAL_SMOOTHING + calculated[dimension] * (1 - EMOTIONAL_SMOOTHING);
      this[dimension] = pythonRound(smoothed, 4);
    }
    this.timestamp = timestamp;
  }

  getRetrievalBias(): Record<string, number> {
    return getEmotionalRetrievalBias(this);
  }

  toDict(): EmotionalStateSnapshot {
    return {
      curiosity: this.curiosity,
      restlessness: this.restlessness,
      warmth: this.warmth,
      clarity: this.clarity,
      creative_flow: this.creative_flow,
      isolation: this.isolation,
      timestamp: this.timestamp,
    };
  }

  static fromDict(input: EmotionalStateInput): EmotionalState {
    return new EmotionalState(input);
  }
}
