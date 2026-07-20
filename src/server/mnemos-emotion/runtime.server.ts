import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sha256Hex } from "@/server/runtime/hash";
import {
  RUNTIME_EVENT_VERSION,
  RuntimeEventSchema,
  type RuntimeEvent,
  type RuntimePhase,
} from "@/server/runtime/schema";
import {
  COGNITIVE_EVENT_MAP,
  DEFAULT_EMOTIONAL_STATE,
  EMOTIONAL_DIMENSIONS,
  type CognitiveEventType,
  type EmotionalStateValues,
} from "./constants";
import {
  MNEMOS_EMOTIONAL_STATE_TABLE,
  emotionalStateFromRow,
  type MnemosEmotionalStateRow,
} from "./persistence";
import { EmotionalState } from "./state";

export const COMMIT_EMOTIONAL_UPDATE_RPC = "commit_mnemos_emotional_update_v1";
const MAX_REVISION_RETRIES = 4;

export type HostedCognitiveEvent = {
  type: CognitiveEventType;
  magnitude?: number;
};

export type HostedEmotionalEventsInput = {
  visitId: string;
  residentId: string;
  turnId?: string | null;
  phase: Extract<RuntimePhase, "post_turn" | "consolidation">;
  idempotencyKey: string;
  events: readonly HostedCognitiveEvent[];
  occurredAt?: string;
};

export type HostedEmotionalEventsResult = {
  applied: boolean;
  replayed: boolean;
  state: MnemosEmotionalStateRow;
  event: RuntimeEvent;
};

export type VisitorSafeInnerWeatherPayload = {
  values: EmotionalStateValues;
  revision: number;
  state_timestamp: string;
  updated_at: string;
  trigger_scope: "post_turn" | "consolidation";
  applied_event_count: number;
  provenance: "persisted-authoritative-state";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function validDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseEmotionalStateRow(value: unknown): MnemosEmotionalStateRow {
  if (!isRecord(value)) throw new Error("authoritative emotional state was not an object");
  for (const dimension of EMOTIONAL_DIMENSIONS) {
    if (!validDimension(value[dimension])) {
      throw new Error(`authoritative emotional state has an invalid ${dimension} value`);
    }
  }
  const revision = Number(value.revision);
  const sourceRuntime = value.source_runtime;
  if (typeof value.resident_id !== "string" || value.resident_id.length === 0) {
    throw new Error("authoritative emotional state has no resident id");
  }
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("authoritative emotional state has an invalid revision");
  }
  if (sourceRuntime !== "opus-supabase" && sourceRuntime !== "mnemos-python") {
    throw new Error("authoritative emotional state has an invalid source runtime");
  }
  if (
    !validTimestamp(value.state_timestamp) ||
    !validTimestamp(value.created_at) ||
    !validTimestamp(value.updated_at)
  ) {
    throw new Error("authoritative emotional state has an invalid timestamp");
  }

  return {
    resident_id: value.resident_id,
    curiosity: value.curiosity as number,
    restlessness: value.restlessness as number,
    warmth: value.warmth as number,
    clarity: value.clarity as number,
    creative_flow: value.creative_flow as number,
    isolation: value.isolation as number,
    state_timestamp: value.state_timestamp,
    revision,
    source_runtime: sourceRuntime,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

function runtimeEventFromRow(value: unknown): RuntimeEvent {
  if (!isRecord(value)) throw new Error("emotional update returned no RuntimeEvent");
  return RuntimeEventSchema.parse({
    v: RUNTIME_EVENT_VERSION,
    event_id: value.id,
    session_id: value.visit_id,
    visit_id: value.visit_id,
    seq: Number(value.seq),
    ts: value.created_at,
    type: value.event_type,
    phase: value.phase,
    resident_id: value.resident_id,
    visitor_id: value.visitor_id ?? null,
    turn_id: value.turn_id ?? null,
    surface: value.surface ?? "visit",
    location: value.location ?? null,
    source_runtime: value.source_runtime,
    visibility: value.visibility,
    epistemic_status: value.epistemic_status,
    payload: value.payload ?? {},
  });
}

export function emotionalStateValuesFromRow(row: MnemosEmotionalStateRow): EmotionalStateValues {
  return {
    curiosity: row.curiosity,
    restlessness: row.restlessness,
    warmth: row.warmth,
    clarity: row.clarity,
    creative_flow: row.creative_flow,
    isolation: row.isolation,
  };
}

/** Public shape deliberately omits cognitive-event names, magnitudes, and prior state. */
export function visitorSafeInnerWeatherFromRow(
  row: MnemosEmotionalStateRow,
  triggerScope: "post_turn" | "consolidation",
  appliedEventCount: number,
): VisitorSafeInnerWeatherPayload {
  return {
    values: emotionalStateValuesFromRow(row),
    revision: row.revision,
    state_timestamp: row.state_timestamp,
    updated_at: row.updated_at,
    trigger_scope: triggerScope,
    applied_event_count: appliedEventCount,
    provenance: "persisted-authoritative-state",
  };
}

function assertVisitorSafeEvent(
  event: RuntimeEvent,
  input: HostedEmotionalEventsInput,
  state: MnemosEmotionalStateRow,
  appliedEventCount: number,
): void {
  if (
    event.type !== "emotion.inner-weather.updated" ||
    event.visit_id !== input.visitId ||
    event.resident_id !== input.residentId ||
    (event.turn_id ?? null) !== (input.turnId ?? null) ||
    event.phase !== input.phase ||
    event.source_runtime !== "opus-supabase" ||
    event.visibility !== "visitor" ||
    event.epistemic_status !== "inferred"
  ) {
    throw new Error("emotional update returned a mismatched RuntimeEvent");
  }
  const allowedKeys = [
    "applied_event_count",
    "provenance",
    "revision",
    "state_timestamp",
    "trigger_scope",
    "updated_at",
    "values",
  ];
  if (Object.keys(event.payload).sort().join("\u0000") !== allowedKeys.join("\u0000")) {
    throw new Error("emotional RuntimeEvent payload crossed the redaction boundary");
  }
  const values = event.payload.values;
  if (
    !isRecord(values) ||
    Object.keys(values).sort().join("\u0000") !== [...EMOTIONAL_DIMENSIONS].sort().join("\u0000")
  ) {
    throw new Error("emotional RuntimeEvent must contain exactly six dimensions");
  }
  for (const dimension of EMOTIONAL_DIMENSIONS) {
    if (!validDimension(values[dimension])) {
      throw new Error(`emotional RuntimeEvent has an invalid ${dimension} value`);
    }
    if (values[dimension] !== state[dimension]) {
      throw new Error(`emotional RuntimeEvent ${dimension} does not match persisted state`);
    }
  }
  if (
    !Number.isSafeInteger(event.payload.revision) ||
    event.payload.revision !== state.revision ||
    event.payload.state_timestamp !== state.state_timestamp ||
    event.payload.updated_at !== state.updated_at ||
    event.payload.trigger_scope !== input.phase ||
    event.payload.applied_event_count !== appliedEventCount ||
    event.payload.provenance !== "persisted-authoritative-state"
  ) {
    throw new Error("emotional RuntimeEvent metadata does not match persisted state");
  }
}

export async function loadAuthoritativeEmotionalState(
  residentId: string,
  options: { client?: SupabaseClient } = {},
): Promise<MnemosEmotionalStateRow | null> {
  const normalizedResidentId = residentId.trim();
  if (!normalizedResidentId) throw new Error("resident id is required for emotional state");

  const client = options.client ?? supabaseAdmin;
  // The emotion foundation migration is newer than generated Supabase types.
  // Keep the untyped boundary confined to this server-only adapter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from(MNEMOS_EMOTIONAL_STATE_TABLE)
    .select(
      "resident_id, curiosity, restlessness, warmth, clarity, creative_flow, isolation, state_timestamp, revision, source_runtime, created_at, updated_at",
    )
    .eq("resident_id", normalizedResidentId)
    .maybeSingle();
  if (error) throw new Error(`authoritative emotional state load failed: ${error.message}`);
  if (!data) return null;
  const row = parseEmotionalStateRow(data);
  if (row.resident_id !== normalizedResidentId) {
    throw new Error("authoritative emotional state returned the wrong resident");
  }
  return row;
}

export async function loadEmotionalStateValues(
  residentId: string,
  options: { client?: SupabaseClient } = {},
): Promise<EmotionalStateValues | null> {
  const row = await loadAuthoritativeEmotionalState(residentId, options);
  return row ? emotionalStateValuesFromRow(row) : null;
}

function normalizeEvents(events: readonly HostedCognitiveEvent[]): Array<{
  type: CognitiveEventType;
  magnitude: number;
}> {
  if (events.length < 1 || events.length > 16) {
    throw new Error("an emotional update requires between 1 and 16 cognitive events");
  }
  return events.map((event) => {
    if (!Object.prototype.hasOwnProperty.call(COGNITIVE_EVENT_MAP, event.type)) {
      throw new Error(`unknown Mnemos cognitive event: ${event.type}`);
    }
    const magnitude = event.magnitude ?? 0.05;
    if (!Number.isFinite(magnitude) || magnitude < 0) {
      throw new Error("emotional event magnitude must be a finite non-negative number");
    }
    return { type: event.type, magnitude };
  });
}

function calculateTarget(
  current: MnemosEmotionalStateRow | null,
  events: readonly { type: CognitiveEventType; magnitude: number }[],
  occurredAt: string,
): EmotionalStateValues {
  const state = current
    ? emotionalStateFromRow(current)
    : new EmotionalState({ ...DEFAULT_EMOTIONAL_STATE, timestamp: occurredAt });
  for (const event of events) {
    if (!state.applyCognitiveEvent(event.type, event.magnitude, occurredAt)) {
      throw new Error(`unknown Mnemos cognitive event: ${event.type}`);
    }
  }
  return {
    curiosity: state.curiosity,
    restlessness: state.restlessness,
    warmth: state.warmth,
    clarity: state.clarity,
    creative_flow: state.creative_flow,
    isolation: state.isolation,
  };
}

/**
 * Calculates Python-parity event adjustments in TypeScript, then CAS-commits
 * state + redacted RuntimeEvent through one database transaction. Revision
 * conflicts reload and recompute; exact idempotent replay returns the original
 * historical state and RuntimeEvent.
 */
export async function applyHostedEmotionalEvents(
  input: HostedEmotionalEventsInput,
  client: SupabaseClient = supabaseAdmin,
): Promise<HostedEmotionalEventsResult> {
  const visitId = input.visitId.trim();
  const residentId = input.residentId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const events = normalizeEvents(input.events);
  if (!visitId || !residentId)
    throw new Error("visit and resident are required for emotional state");
  if (input.phase !== "post_turn" && input.phase !== "consolidation") {
    throw new Error("hosted emotional updates require post-turn or consolidation scope");
  }
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new Error("emotional update idempotency key must be between 1 and 200 characters");
  }
  if (!validTimestamp(occurredAt)) throw new Error("emotional update timestamp is invalid");

  const requestHash = await sha256Hex({
    visit_id: visitId,
    resident_id: residentId,
    turn_id: input.turnId ?? null,
    phase: input.phase,
    cognitive_events: events,
  });
  const normalizedInput: HostedEmotionalEventsInput = {
    ...input,
    visitId,
    residentId,
    idempotencyKey,
  };
  let current = await loadAuthoritativeEmotionalState(residentId, { client });

  for (let attempt = 0; attempt < MAX_REVISION_RETRIES; attempt += 1) {
    const target = calculateTarget(current, events, occurredAt);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any).rpc(COMMIT_EMOTIONAL_UPDATE_RPC, {
      p_visit_id: visitId,
      p_resident_id: residentId,
      p_turn_id: input.turnId ?? null,
      p_phase: input.phase,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_expected_revision: current?.revision ?? 0,
      p_target_values: target,
      p_state_timestamp: occurredAt,
      p_cognitive_events: events,
      p_applied_event_count: events.length,
    });
    if (error) throw new Error(`emotional update failed: ${error.message}`);
    const payload = Array.isArray(data) && data.length === 1 ? data[0] : data;
    if (!isRecord(payload) || typeof payload.status !== "string") {
      throw new Error("emotional update returned an invalid result");
    }
    const state = parseEmotionalStateRow(payload.state);
    if (state.resident_id !== residentId) {
      throw new Error("emotional update returned the wrong resident");
    }
    if (payload.status === "revision_conflict") {
      current = state;
      continue;
    }
    if (payload.status !== "applied" && payload.status !== "replayed") {
      throw new Error(`emotional update returned an unknown status: ${payload.status}`);
    }
    if (state.source_runtime !== "opus-supabase") {
      throw new Error("hosted emotional update returned non-hosted authoritative state");
    }
    const event = runtimeEventFromRow(payload.event);
    assertVisitorSafeEvent(event, normalizedInput, state, events.length);
    return {
      applied: payload.status === "applied",
      replayed: payload.status === "replayed",
      state,
      event,
    };
  }

  throw new Error("emotional update could not settle after concurrent revisions");
}
