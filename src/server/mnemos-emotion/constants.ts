/**
 * Exact TypeScript counterparts of the constants in Mnemos
 * `core/emotional_state.py`.
 *
 * Keep this module behavior-free: later adapters can import the canonical
 * vocabulary without also importing persistence or a resident runtime.
 */

export const EMOTIONAL_DIMENSIONS = [
  "curiosity",
  "restlessness",
  "warmth",
  "clarity",
  "creative_flow",
  "isolation",
] as const;

export type EmotionalDimension = (typeof EMOTIONAL_DIMENSIONS)[number];

export type EmotionalStateValues = Record<EmotionalDimension, number>;

export const DEFAULT_EMOTIONAL_STATE = {
  curiosity: 0.5,
  restlessness: 0.3,
  warmth: 0.5,
  clarity: 0.5,
  creative_flow: 0.4,
  isolation: 0.2,
} as const satisfies EmotionalStateValues;

/** `new = old * 0.7 + calculated * 0.3` */
export const EMOTIONAL_SMOOTHING = 0.7;

export const EMOTIONAL_RETRIEVAL_BIAS = {
  curiosity: ["insight", "experience", "question", "discovery", "novel"],
  restlessness: ["unresolved", "tension", "question", "contradiction", "open"],
  warmth: ["relationship", "personal", "connection", "trust"],
  clarity: ["insight", "pattern", "understanding", "reflection", "structure"],
  creative_flow: ["dream", "connection", "creative", "insight", "novel"],
  isolation: ["relationship", "connection", "warmth", "personal"],
} as const satisfies Readonly<Record<EmotionalDimension, readonly string[]>>;

type CognitiveAdjustment = Readonly<Partial<Record<EmotionalDimension, 1 | -1>>>;

export const COGNITIVE_EVENT_MAP = {
  schema_violation: { curiosity: 1 },
  new_connection_discovered: { curiosity: 1 },
  retrieval_failed: { restlessness: 1 },
  contradiction_detected: { restlessness: 1 },
  stagnant_belief_found: { restlessness: 1 },
  user_interaction: { warmth: 1, isolation: -1 },
  relationship_memory_accessed: { warmth: 1 },
  schema_slots_filled: { clarity: 1 },
  belief_confirmed: { clarity: 1 },
  high_interference: { clarity: -1 },
  dream_connection: { creative_flow: 1 },
  cross_schema_transfer: { creative_flow: 1 },
  wm_overload: { creative_flow: -1 },
  no_interaction_extended: { isolation: 1 },
  shared_pool_activity: { isolation: -1 },
} as const satisfies Readonly<Record<string, CognitiveAdjustment>>;

export type CognitiveEventType = keyof typeof COGNITIVE_EVENT_MAP;
