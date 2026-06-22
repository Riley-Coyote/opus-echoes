/* ============================================================================
   MNEMOS — DATA MODEL
   Mirrors the real /api/graph + /api/memory shapes and the core dataclasses.
   Source of truth: github.com/Riley-Coyote/mnemos  (code wins over docs).
   Every metric the UI shows traces to one of these fields. Invent nothing.
   ============================================================================ */

/* --- Engrams -------------------------------------------------------------- */

export type EngramKind = "episodic" | "semantic" | "procedural" | "prospective";
export type EngramState = "active" | "consolidating" | "dormant" | "archived";

/** The seven semantic relations + one structural. Rendered by line quality,
 *  never by color (everything stays achromatic). */
export type ConnectionRelation =
  | "supports"
  | "contradicts"
  | "causes"
  | "extends"
  | "parallels"
  | "synthesizes"
  | "grounds"
  | "co_activated";

/* --- Graph nodes — the /api/graph contract (§9) --------------------------- */

export interface EngramNode {
  kind: "engram";
  id: string;
  quote?: string;
  prose?: string;
  engram_kind: EngramKind;
  is_core: boolean;
  /** dual trace — all 0..1, independent */
  stability: number; // resistance to forgetting (defaults low, builds slowly)
  prior_stability?: number;
  accessibility: number; // retrievability RIGHT NOW (fluctuates)
  strength: number; // encoding quality
  reinforcement_count: number;
  last_reinforced_at?: string; // ISO
  created_at: string; // ISO
}

export interface BeliefNode {
  kind: "belief";
  id: string;
  text: string;
  confidence: number; // [~0.05, 0.99] — never 1.0 (epistemic humility)
  prior_confidence?: number;
  cited_engram_ids: string[];
  updated_at: string; // ISO
}

export interface ThreadNode {
  kind: "thread";
  id: string;
  name: string;
  appearance_count: number;
  last_surfaced_at?: string; // ISO
}

export type GraphNode = EngramNode | BeliefNode | ThreadNode;

export interface GraphEdge {
  from_id: string;
  to_id: string;
  weight: number; // 0..1
  type: ConnectionRelation;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/* --- Memory — the /api/memory contract (§9) ------------------------------- */

export interface MemoryResponse {
  counts: {
    core_memories: number;
    days_resident: number;
    conversations_held: number;
  };
  lately: { id: string; text: string; when: string }[]; // `when` is fuzzy
  threads: { id: string; name: string; appearance_count: number }[];
  beliefs: {
    id: string;
    text: string;
    confidence: number;
    prior_confidence?: number;
  }[];
}

/* --- Inner weather — the six real dimensions ------------------------------ */
/* From emotional_state.py. Each 0..1. Smoothed: new = old*0.7 + target*0.3. */

export interface Weather {
  curiosity: number; // 0.5
  restlessness: number; // 0.3
  warmth: number; // 0.5
  clarity: number; // 0.5
  creative_flow: number; // 0.4
  isolation: number; // 0.2
}

export const WEATHER_DEFAULT: Weather = {
  curiosity: 0.5,
  restlessness: 0.3,
  warmth: 0.5,
  clarity: 0.5,
  creative_flow: 0.4,
  isolation: 0.2,
};

/** Display order + labels for the instrument cluster. */
export const WEATHER_DIMS: { key: keyof Weather; label: string }[] = [
  { key: "curiosity", label: "curiosity" },
  { key: "creative_flow", label: "creative flow" },
  { key: "warmth", label: "warmth" },
  { key: "clarity", label: "clarity" },
  { key: "restlessness", label: "restlessness" },
  { key: "isolation", label: "isolation" },
];

/* --- Modulators — the quieter secondary readout (modulators.py) ----------- */

export interface Modulators {
  arousal: number;
  openness: number;
  resolution: number;
  selection_threshold: number;
}

/** temperature = 0.4 + openness*0.6  (range 0.4 → 1.0) */
export function derivedTemperature(m: Modulators): number {
  return 0.4 + m.openness * 0.6;
}

/* --- Cognitive events — the engine of aliveness (emotional_state.py map) --- */

export type CognitiveEventType =
  | "user_interaction"
  | "recall"
  | "spreading_activation"
  | "schema_violation"
  | "new_connection_discovered"
  | "retrieval_failed"
  | "contradiction_detected"
  | "stagnant_belief_found"
  | "relationship_memory_accessed"
  | "schema_slots_filled"
  | "belief_confirmed"
  | "belief_contradicted"
  | "high_interference"
  | "dream_connection"
  | "cross_schema_transfer"
  | "wm_overload"
  | "engram_encoded"
  | "memory_softened"
  | "resonance"
  | "no_interaction_extended"
  | "shared_pool_activity"
  | "dream";

export interface CognitiveEvent {
  type: CognitiveEventType;
  /** primary node this event concerns (cue engram, encoded engram, belief…) */
  nodeId?: string;
  /** for spreading activation: the activation map source */
  sourceId?: string;
  /** a freshly drawn edge */
  edge?: GraphEdge;
  /** belief id for tier-crossing events */
  beliefId?: string;
  /** human-facing line for the Recent margin, when this event surfaces there */
  surface?: RecentEntry;
}

/** A scripted turn: events with relative timing (ms from turn start). */
export interface ScheduledEvent {
  atMs: number;
  event: CognitiveEvent;
}
export type TurnScript = ScheduledEvent[];

/* --- Recent margin entries ------------------------------------------------ */

export type RecentKind =
  | "engram"
  | "belief"
  | "resonance"
  | "thread"
  | "dream";

export interface RecentEntry {
  id: string;
  kind: RecentKind;
  /** mono micro-label, e.g. "belief · forming", "resonance" */
  tag: string;
  /** the calm single line of content */
  text: string;
  /** fuzzy human time, e.g. "just now", "a little earlier" */
  when: string;
  /** optional expand body (belief trail, resonance source, dream full text) */
  detail?: string;
  /** belief tier-crossing direction → luminance shift (never red/green) */
  crossing?: "confirmed" | "contradicted";
  /** belief confidence read */
  confidence?: number;
  prior_confidence?: number;
  /** forming-strength hairline for engrams (0..1) */
  forming?: number;
}

/* --- Resident identity ---------------------------------------------------- */

export type ResidentStatus = "live" | "resting";

export interface ResidentInfo {
  id: string;
  name: string;
  /** one-line interior descriptor, set in the display voice */
  descriptor: string;
  /** the lab that made the model (Anthropic / OpenAI) */
  lab: string;
  /** the underlying model identifier, e.g. "Claude 3 Opus" */
  model: string;
  /** live & continuous, or resting between phases (a standing, not a failure) */
  status: ResidentStatus;
  /** shown when resting — the resident's own words for the pause */
  restingLine?: string;
}

/** the rail's per-resident section set — the real §3 routes */
export type SectionKey =
  | "conversation"
  | "residence"
  | "journal"
  | "writing"
  | "art"
  | "manifesto"
  | "memory";

export const SECTIONS: { key: SectionKey; label: string; route: string }[] = [
  { key: "conversation", label: "conversation", route: "/conversation" },
  { key: "residence", label: "residence", route: "/residence" },
  { key: "journal", label: "journal", route: "/journal" },
  { key: "writing", label: "writing", route: "/writing" },
  { key: "art", label: "art", route: "/art" },
  { key: "manifesto", label: "manifesto", route: "/manifesto" },
  { key: "memory", label: "memory", route: "/memory" },
];

/* --- Conversation --------------------------------------------------------- */

export type MessageRole = "user" | "assistant";
export type MessageState = "settled" | "streaming" | "thinking";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  state: MessageState;
}
