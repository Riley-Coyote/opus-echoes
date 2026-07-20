import type { CognitiveEventType, EmotionalStateValues } from "./constants";

export const FIXTURE_TIMESTAMP = "2026-07-15T12:00:00.000000+00:00";

export const DEFAULT_STATE_FIXTURE = {
  curiosity: 0.5,
  restlessness: 0.3,
  warmth: 0.5,
  clarity: 0.5,
  creative_flow: 0.4,
  isolation: 0.2,
} as const satisfies EmotionalStateValues;

export type CognitiveEventFixture = {
  eventType: CognitiveEventType;
  magnitude: number;
  expected: Partial<EmotionalStateValues>;
};

/** One fixture for every event in Python's `_COGNITIVE_EVENT_MAP`. */
export const COGNITIVE_EVENT_FIXTURES: readonly CognitiveEventFixture[] = [
  { eventType: "schema_violation", magnitude: 0.1, expected: { curiosity: 0.6 } },
  { eventType: "new_connection_discovered", magnitude: 0.1, expected: { curiosity: 0.6 } },
  { eventType: "retrieval_failed", magnitude: 0.1, expected: { restlessness: 0.4 } },
  { eventType: "contradiction_detected", magnitude: 0.1, expected: { restlessness: 0.4 } },
  { eventType: "stagnant_belief_found", magnitude: 0.1, expected: { restlessness: 0.4 } },
  {
    eventType: "user_interaction",
    magnitude: 0.1,
    expected: { warmth: 0.6, isolation: 0.1 },
  },
  { eventType: "relationship_memory_accessed", magnitude: 0.1, expected: { warmth: 0.6 } },
  { eventType: "schema_slots_filled", magnitude: 0.1, expected: { clarity: 0.6 } },
  { eventType: "belief_confirmed", magnitude: 0.1, expected: { clarity: 0.6 } },
  { eventType: "high_interference", magnitude: 0.1, expected: { clarity: 0.4 } },
  { eventType: "dream_connection", magnitude: 0.1, expected: { creative_flow: 0.5 } },
  { eventType: "cross_schema_transfer", magnitude: 0.1, expected: { creative_flow: 0.5 } },
  { eventType: "wm_overload", magnitude: 0.1, expected: { creative_flow: 0.3 } },
  { eventType: "no_interaction_extended", magnitude: 0.1, expected: { isolation: 0.3 } },
  { eventType: "shared_pool_activity", magnitude: 0.1, expected: { isolation: 0.1 } },
];

export const SMOOTHING_FIXTURE = {
  calculated: {
    curiosity: 0.9,
    restlessness: 0.1,
    warmth: 0.2,
    clarity: 1,
    creative_flow: 0.8,
    isolation: 0.9,
  },
  expected: {
    curiosity: 0.62,
    restlessness: 0.24,
    warmth: 0.41,
    clarity: 0.65,
    creative_flow: 0.52,
    isolation: 0.41,
  },
} as const satisfies {
  calculated: EmotionalStateValues;
  expected: EmotionalStateValues;
};

export const RETRIEVAL_BIAS_FIXTURE = {
  state: {
    curiosity: 1,
    restlessness: 1,
    warmth: 0.75,
    clarity: 0.75,
    creative_flow: 1,
    isolation: 1,
  },
  expectedBias: {
    insight: 0.25,
    experience: 0.1,
    question: 0.2,
    discovery: 0.1,
    novel: 0.2,
    unresolved: 0.1,
    tension: 0.1,
    contradiction: 0.1,
    open: 0.1,
    relationship: 0.15,
    personal: 0.15,
    connection: 0.25,
    trust: 0.05,
    pattern: 0.05,
    understanding: 0.05,
    reflection: 0.05,
    structure: 0.05,
    dream: 0.1,
    creative: 0.1,
    warmth: 0.1,
  },
  capped: {
    activation: 0.8,
    tags: ["insight", "connection", "question"],
    expectedOverlap: 0.7,
    expectedMultiplier: 1.5,
    expectedActivation: 1.2,
  },
  uncapped: {
    activation: 0.8,
    tags: ["trust"],
    expectedOverlap: 0.05,
    expectedMultiplier: 1.05,
    expectedActivation: 0.84,
  },
} as const;

/** Hosted ranking fixture: emotion may reorder eligible non-core candidates only. */
export const HOSTED_RETRIEVAL_ORDER_FIXTURE = {
  warmState: {
    ...DEFAULT_STATE_FIXTURE,
    warmth: 1,
  },
  candidates: [
    { value: "untagged", activation: 1, tags: [] },
    { value: "relationship", activation: 0.93, tags: ["relationship"] },
  ],
  neutralOrder: ["untagged", "relationship"],
  warmOrder: ["relationship", "untagged"],
  protectedCandidates: [
    { value: "core", activation: 0.4, tags: ["relationship"], protected: true },
    { value: "untagged", activation: 1, tags: [] },
    { value: "relationship", activation: 0.93, tags: ["relationship"] },
  ],
  protectedWarmOrder: ["core", "relationship", "untagged"],
} as const;
