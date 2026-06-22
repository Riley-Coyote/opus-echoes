/* Inner weather model — faithful to emotional_state.py.
   Events nudge dimensions; updates are smoothed (new = old*0.7 + target*0.3)
   so values DRIFT, never jump. Plus modulators derived from graph stats. */

import type {
  Weather,
  Modulators,
  CognitiveEventType,
  GraphResponse,
  EngramNode,
} from "../types/mnemos";

const SMOOTHING = 0.7; // weight on the previous value

/** event → [dimension, direction] pairs. Verbatim from the source map. */
const EVENT_MAP: Partial<Record<CognitiveEventType, [keyof Weather, 1 | -1][]>> = {
  schema_violation: [["curiosity", 1]],
  new_connection_discovered: [["curiosity", 1]],
  retrieval_failed: [["restlessness", 1]],
  contradiction_detected: [["restlessness", 1]],
  belief_contradicted: [["restlessness", 1]],
  stagnant_belief_found: [["restlessness", 1]],
  user_interaction: [["warmth", 1], ["isolation", -1]],
  relationship_memory_accessed: [["warmth", 1]],
  schema_slots_filled: [["clarity", 1]],
  belief_confirmed: [["clarity", 1]],
  high_interference: [["clarity", -1]],
  dream_connection: [["creative_flow", 1]],
  cross_schema_transfer: [["creative_flow", 1]],
  wm_overload: [["creative_flow", -1]],
  no_interaction_extended: [["isolation", 1]],
  shared_pool_activity: [["isolation", -1]],
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Apply one event. The "target" pushes the dimension toward an extreme; the
 *  smoothing means a single event moves the value ~0.1 — a visible drift. */
export function applyEvent(weather: Weather, type: CognitiveEventType, kick = 0.4): Weather {
  const effects = EVENT_MAP[type];
  if (!effects) return weather;
  const next: Weather = { ...weather };
  for (const [dim, dir] of effects) {
    const target = clamp01(weather[dim] + dir * (kick + 0.6 * (dir > 0 ? 1 - weather[dim] : weather[dim])));
    next[dim] = clamp01(weather[dim] * SMOOTHING + target * (1 - SMOOTHING));
  }
  return next;
}

/** A faint resting drift toward the resident's baseline (homeostasis). */
export function relaxToward(weather: Weather, baseline: Weather, rate = 0.012): Weather {
  const next = {} as Weather;
  (Object.keys(weather) as (keyof Weather)[]).forEach((k) => {
    next[k] = clamp01(weather[k] + (baseline[k] - weather[k]) * rate);
  });
  return next;
}

/* --- Modulators — derived from graph stats (modulators.py formulas) -------- */

export function computeModulators(graph: GraphResponse): Modulators {
  const engrams = graph.nodes.filter((n): n is EngramNode => n.kind === "engram");
  const beliefs = graph.nodes.filter((n) => n.kind === "belief");
  const total = engrams.length;
  const totalConnections = graph.edges.length;

  // arousal — recent activity ratio (recency proxy: high accessibility)
  const recent = engrams.filter((e) => e.accessibility > 0.55).length;
  const arousal = total > 0 ? Math.min(0.9, Math.max(0.1, recent / Math.max(total * 0.18, 1))) : 0.3;

  // openness — inverse of belief settlement + connection density
  let openness = 0.7;
  if (total > 0) {
    const density = totalConnections / total;
    const settlement = Math.min(beliefs.length / 10, 1);
    openness = Math.max(0.2, 0.8 - density * 0.06 - settlement * 0.2);
  }

  // resolution — average vividness (accessibility * strength)
  const vivid =
    total > 0
      ? engrams.reduce((s, e) => s + e.accessibility * e.strength, 0) / total
      : 0.4;
  const resolution = Math.min(0.9, Math.max(0.2, vivid * 2));

  // selection threshold — derived from arousal
  const selection_threshold = Math.max(0.2, 0.7 - arousal * 0.3);

  return { arousal, openness, resolution, selection_threshold };
}
