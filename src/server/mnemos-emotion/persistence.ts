import type { EmotionalStateValues } from "./constants";
import { EmotionalState, type EmotionalStateSnapshot } from "./state";

export const MNEMOS_EMOTIONAL_STATE_TABLE = "mnemos_emotional_states";

export type EmotionalStateSourceRuntime = "opus-supabase" | "mnemos-python";

/** Database row contract for the private, per-resident state table. */
export type MnemosEmotionalStateRow = EmotionalStateValues & {
  resident_id: string;
  state_timestamp: string;
  revision: number;
  source_runtime: EmotionalStateSourceRuntime;
  created_at: string;
  updated_at: string;
};

export type EmotionalStatePersistenceInput = EmotionalStateValues & {
  resident_id: string;
  state_timestamp: string;
  revision: number;
  source_runtime: EmotionalStateSourceRuntime;
  updated_at: string;
};

export function emotionalStateFromRow(row: MnemosEmotionalStateRow): EmotionalState {
  return EmotionalState.fromDict({
    curiosity: row.curiosity,
    restlessness: row.restlessness,
    warmth: row.warmth,
    clarity: row.clarity,
    creative_flow: row.creative_flow,
    isolation: row.isolation,
    timestamp: row.state_timestamp,
  });
}

/** Produce an explicit persistence payload without writing it. */
export function emotionalStateToPersistenceInput(
  residentId: string,
  state: EmotionalStateSnapshot,
  revision: number,
  sourceRuntime: EmotionalStateSourceRuntime = "opus-supabase",
  updatedAt = new Date().toISOString(),
): EmotionalStatePersistenceInput {
  return {
    resident_id: residentId,
    curiosity: state.curiosity,
    restlessness: state.restlessness,
    warmth: state.warmth,
    clarity: state.clarity,
    creative_flow: state.creative_flow,
    isolation: state.isolation,
    state_timestamp: state.timestamp,
    revision,
    source_runtime: sourceRuntime,
    updated_at: updatedAt,
  };
}
