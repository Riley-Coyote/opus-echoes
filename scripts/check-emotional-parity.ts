import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COGNITIVE_EVENT_MAP,
  DEFAULT_EMOTIONAL_STATE,
  EMOTIONAL_DIMENSIONS,
  EMOTIONAL_SMOOTHING,
  type EmotionalStateValues,
} from "../src/server/mnemos-emotion/constants";
import { decideHostedEncodingDepth } from "../src/server/mnemos-emotion/encoding-depth";
import {
  COGNITIVE_EVENT_FIXTURES,
  DEFAULT_STATE_FIXTURE,
  FIXTURE_TIMESTAMP,
  HOSTED_RETRIEVAL_ORDER_FIXTURE,
  RETRIEVAL_BIAS_FIXTURE,
  SMOOTHING_FIXTURE,
} from "../src/server/mnemos-emotion/fixtures";
import type { MnemosEmotionalStateRow } from "../src/server/mnemos-emotion/persistence";
import {
  applyEmotionalRetrievalBias,
  rankCandidatesWithEmotionalBias,
} from "../src/server/mnemos-emotion/retrieval";
import {
  applyHostedEmotionalEvents,
  COMMIT_EMOTIONAL_UPDATE_RPC,
  visitorSafeInnerWeatherFromRow,
} from "../src/server/mnemos-emotion/runtime.server";
import { EmotionalState } from "../src/server/mnemos-emotion/state";
import {
  emotionalTagsForEngram,
  engramEligibleForVisitor,
  inferLegacyEngramEmotionalTags,
} from "../src/server/opus/retrieval";

const EPSILON = 1e-12;

function assertClose(actual: number, expected: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

function valuesOf(state: EmotionalState): Record<string, number> {
  return Object.fromEntries(EMOTIONAL_DIMENSIONS.map((dimension) => [dimension, state[dimension]]));
}

function checkDefaults(): void {
  assert.equal(EMOTIONAL_SMOOTHING, 0.7);
  assert.deepEqual(DEFAULT_EMOTIONAL_STATE, DEFAULT_STATE_FIXTURE);
  assert.deepEqual(valuesOf(new EmotionalState({ timestamp: FIXTURE_TIMESTAMP })), {
    ...DEFAULT_STATE_FIXTURE,
  });
}

function checkCognitiveEvents(): void {
  assert.equal(
    COGNITIVE_EVENT_FIXTURES.length,
    Object.keys(COGNITIVE_EVENT_MAP).length,
    "every Python cognitive event must have a fixture",
  );

  for (const fixture of COGNITIVE_EVENT_FIXTURES) {
    const state = new EmotionalState({ timestamp: "before" });
    assert.equal(
      state.applyCognitiveEvent(fixture.eventType, fixture.magnitude, FIXTURE_TIMESTAMP),
      true,
    );
    assert.equal(state.timestamp, FIXTURE_TIMESTAMP);
    for (const [dimension, expected] of Object.entries(fixture.expected)) {
      assertClose(
        state[dimension as keyof typeof DEFAULT_STATE_FIXTURE],
        expected,
        `${fixture.eventType}.${dimension}`,
      );
    }
  }

  const unknown = new EmotionalState({ timestamp: "unchanged" });
  const before = unknown.toDict();
  assert.equal(unknown.applyCognitiveEvent("not_a_python_event", 0.2, FIXTURE_TIMESTAMP), false);
  assert.deepEqual(unknown.toDict(), before, "unknown events must not mutate state or timestamp");

  const clamped = new EmotionalState({ warmth: 0.98, isolation: 0.01, timestamp: "before" });
  clamped.applyCognitiveEvent("user_interaction", 0.2, FIXTURE_TIMESTAMP);
  assert.equal(clamped.warmth, 1);
  assert.equal(clamped.isolation, 0);
}

function checkSmoothing(): void {
  const state = new EmotionalState({ ...DEFAULT_STATE_FIXTURE, timestamp: "before" });
  state.smoothUpdate(SMOOTHING_FIXTURE.calculated, FIXTURE_TIMESTAMP);
  assert.equal(state.timestamp, FIXTURE_TIMESTAMP);
  for (const dimension of EMOTIONAL_DIMENSIONS) {
    assertClose(state[dimension], SMOOTHING_FIXTURE.expected[dimension], `smooth.${dimension}`);
  }
}

function checkRetrievalBias(): void {
  const state = new EmotionalState(RETRIEVAL_BIAS_FIXTURE.state);
  const actualBias = state.getRetrievalBias();
  assert.deepEqual(
    Object.keys(actualBias).sort(),
    Object.keys(RETRIEVAL_BIAS_FIXTURE.expectedBias).sort(),
  );
  for (const [tag, expected] of Object.entries(RETRIEVAL_BIAS_FIXTURE.expectedBias)) {
    assertClose(actualBias[tag], expected, `bias.${tag}`);
  }

  for (const fixture of [RETRIEVAL_BIAS_FIXTURE.capped, RETRIEVAL_BIAS_FIXTURE.uncapped]) {
    const result = applyEmotionalRetrievalBias(fixture.activation, fixture.tags, state);
    assertClose(result.overlap, fixture.expectedOverlap, "retrieval.overlap");
    assertClose(result.multiplier, fixture.expectedMultiplier, "retrieval.multiplier");
    assertClose(result.activation, fixture.expectedActivation, "retrieval.activation");
  }

  const neutral = applyEmotionalRetrievalBias(
    0.42,
    ["insight"],
    new EmotionalState({ timestamp: FIXTURE_TIMESTAMP }),
  );
  assert.deepEqual(neutral, { overlap: 0, multiplier: 1, activation: 0.42 });
}

function checkHostedRetrievalOrdering(): void {
  const fixture = HOSTED_RETRIEVAL_ORDER_FIXTURE;
  const neutral = rankCandidatesWithEmotionalBias(fixture.candidates).map(
    (candidate) => candidate.value,
  );
  const warm = rankCandidatesWithEmotionalBias(fixture.candidates, fixture.warmState).map(
    (candidate) => candidate.value,
  );
  const protectedWarm = rankCandidatesWithEmotionalBias(
    fixture.protectedCandidates,
    fixture.warmState,
  ).map((candidate) => candidate.value);
  assert.deepEqual(neutral, fixture.neutralOrder, "omitting state must preserve legacy order");
  assert.deepEqual(warm, fixture.warmOrder, "high warmth must reorder eligible tagged memory");
  assert.deepEqual(
    protectedWarm,
    fixture.protectedWarmOrder,
    "emotion must not move a protected core slot",
  );

  assert.deepEqual(
    inferLegacyEngramEmotionalTags({
      quote: "A question opened into trust and connection.",
      prose: null,
    }),
    ["question", "connection", "trust"],
    "legacy inference must use only exact canonical cues",
  );
  assert.deepEqual(
    inferLegacyEngramEmotionalTags({
      quote: "A trusted companionship felt intimate.",
      prose: null,
    }),
    [],
    "legacy inference must not invent tags from sentiment or synonyms",
  );
  assert.deepEqual(
    emotionalTagsForEngram({
      quote: "An insight that should not override stored tags.",
      prose: null,
      tags: [" Relationship ", "decorative", "TRUST"],
    }),
    ["relationship", "trust"],
    "stored canonical tags must take precedence and reject unsupported labels",
  );

  const currentVisitor = new Set(["11111111-1111-4111-8111-111111111111"]);
  assert.equal(
    engramEligibleForVisitor(
      {
        attribution: "visitor",
        source_session_ids: ["11111111-1111-4111-8111-111111111111"],
      },
      currentVisitor,
    ),
    true,
  );
  assert.equal(
    engramEligibleForVisitor(
      {
        attribution: "visitor",
        source_session_ids: ["22222222-2222-4222-8222-222222222222"],
      },
      currentVisitor,
    ),
    false,
    "cross-visitor candidates must be ineligible before emotional ranking",
  );
}

const VISIT_ID = "11111111-1111-4111-8111-111111111111";
const TURN_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const RESIDENT_ID = "opus-3";
const OCCURRED_AT = "2026-07-15T12:00:00.000Z";
const UPDATED_AT = "2026-07-15T12:00:01.000Z";

function stateRow(
  values: EmotionalStateValues,
  revision: number,
  options: { stateTimestamp?: string; updatedAt?: string } = {},
): MnemosEmotionalStateRow {
  return {
    resident_id: RESIDENT_ID,
    ...values,
    state_timestamp: options.stateTimestamp ?? OCCURRED_AT,
    revision,
    source_runtime: "opus-supabase",
    created_at: "2026-07-15T11:00:00.000Z",
    updated_at: options.updatedAt ?? UPDATED_AT,
  };
}

function runtimeEventRow(
  state: MnemosEmotionalStateRow,
  options: {
    payload?: Record<string, unknown>;
    sequence?: number;
  } = {},
): Record<string, unknown> {
  return {
    id: EVENT_ID,
    visit_id: VISIT_ID,
    seq: options.sequence ?? 11,
    created_at: UPDATED_AT,
    event_type: "emotion.inner-weather.updated",
    phase: "post_turn",
    resident_id: RESIDENT_ID,
    visitor_id: null,
    turn_id: TURN_ID,
    surface: "visit",
    location: null,
    source_runtime: "opus-supabase",
    visibility: "visitor",
    epistemic_status: "inferred",
    payload: options.payload ?? visitorSafeInnerWeatherFromRow(state, "post_turn", 1),
  };
}

type RpcArgs = Record<string, unknown>;
type RpcResult = Promise<{ data: unknown; error: { message: string } | null }>;

function fakeEmotionalClient(input: {
  loadedState: MnemosEmotionalStateRow;
  onRpc: (name: string, args: RpcArgs) => RpcResult;
}): SupabaseClient {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: input.loadedState, error: null }),
  };
  return {
    from: (table: string) => {
      assert.equal(table, "mnemos_emotional_states");
      return query;
    },
    rpc: input.onRpc,
  } as unknown as SupabaseClient;
}

async function checkAtomicRuntimeAdapter(): Promise<void> {
  const initial = stateRow(DEFAULT_STATE_FIXTURE, 1);
  const concurrent = stateRow({ ...DEFAULT_STATE_FIXTURE, warmth: 0.7, isolation: 0.1 }, 2, {
    updatedAt: "2026-07-15T12:00:00.500Z",
  });
  const rpcCalls: RpcArgs[] = [];
  let persisted: MnemosEmotionalStateRow | null = null;
  const client = fakeEmotionalClient({
    loadedState: initial,
    onRpc: async (name, args) => {
      assert.equal(name, COMMIT_EMOTIONAL_UPDATE_RPC);
      rpcCalls.push(args);
      if (rpcCalls.length === 1) {
        return {
          data: { status: "revision_conflict", applied: false, state: concurrent },
          error: null,
        };
      }
      const target = args.p_target_values as EmotionalStateValues;
      persisted = stateRow(target, 3);
      return {
        data: {
          status: "applied",
          applied: true,
          state: persisted,
          event: runtimeEventRow(persisted),
        },
        error: null,
      };
    },
  });

  const result = await applyHostedEmotionalEvents(
    {
      visitId: VISIT_ID,
      residentId: RESIDENT_ID,
      turnId: TURN_ID,
      phase: "post_turn",
      idempotencyKey: "emotion:test-user-interaction",
      events: [{ type: "user_interaction" }],
      occurredAt: OCCURRED_AT,
    },
    client,
  );
  assert.equal(rpcCalls.length, 2, "a CAS conflict must recompute and retry");
  assert.equal(rpcCalls[0]?.p_expected_revision, 1);
  assert.equal(rpcCalls[1]?.p_expected_revision, 2);
  assert.equal(
    rpcCalls[0]?.p_request_hash,
    rpcCalls[1]?.p_request_hash,
    "revision and calculated target must not change the semantic request hash",
  );
  assert.deepEqual(rpcCalls[1]?.p_cognitive_events, [
    { type: "user_interaction", magnitude: 0.05 },
  ]);
  const firstTarget = rpcCalls[0]?.p_target_values as EmotionalStateValues;
  const recomputedTarget = rpcCalls[1]?.p_target_values as EmotionalStateValues;
  assertClose(firstTarget.warmth, 0.55, "CAS.initial.warmth");
  assertClose(firstTarget.isolation, 0.15, "CAS.initial.isolation");
  assertClose(recomputedTarget.warmth, 0.75, "CAS.recomputed.warmth");
  assertClose(recomputedTarget.isolation, 0.05, "CAS.recomputed.isolation");
  assert.equal(result.applied, true);
  assert.equal(result.replayed, false);
  assert.equal(result.state.revision, 3);
  assert.equal(result.event.seq, 11);
  assert.deepEqual(Object.keys(result.event.payload).sort(), [
    "applied_event_count",
    "provenance",
    "revision",
    "state_timestamp",
    "trigger_scope",
    "updated_at",
    "values",
  ]);
  assert.equal(JSON.stringify(result.event.payload).includes("user_interaction"), false);
  assert.equal(JSON.stringify(result.event.payload).includes("magnitude"), false);

  assert.ok(persisted, "the applied fixture must persist a state");
  const newest = stateRow({ ...DEFAULT_STATE_FIXTURE, warmth: 0.95 }, 8, {
    updatedAt: "2026-07-15T12:10:00.000Z",
  });
  const replayCalls: RpcArgs[] = [];
  const replayClient = fakeEmotionalClient({
    loadedState: newest,
    onRpc: async (_name, args) => {
      replayCalls.push(args);
      return {
        data: {
          status: "replayed",
          applied: false,
          state: persisted,
          event: runtimeEventRow(persisted),
        },
        error: null,
      };
    },
  });
  const replay = await applyHostedEmotionalEvents(
    {
      visitId: VISIT_ID,
      residentId: RESIDENT_ID,
      turnId: TURN_ID,
      phase: "post_turn",
      idempotencyKey: "emotion:test-user-interaction",
      events: [{ type: "user_interaction" }],
      occurredAt: "2026-07-15T12:20:00.000Z",
    },
    replayClient,
  );
  assert.equal(replay.applied, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.revision, 3, "replay must return the historical state, not revision 8");
  assert.equal(replay.event.seq, 11, "replay must return the original RuntimeEvent");
  assert.equal(
    replayCalls[0]?.p_request_hash,
    rpcCalls[0]?.p_request_hash,
    "wall-clock retry time must not change the semantic request hash",
  );

  const unsafeClient = fakeEmotionalClient({
    loadedState: initial,
    onRpc: async (_name, args) => {
      const unsafeState = stateRow(args.p_target_values as EmotionalStateValues, 2);
      return {
        data: {
          status: "applied",
          applied: true,
          state: unsafeState,
          event: runtimeEventRow(unsafeState, {
            payload: {
              ...visitorSafeInnerWeatherFromRow(unsafeState, "post_turn", 1),
              cognitive_event: "user_interaction",
            },
          }),
        },
        error: null,
      };
    },
  });
  await assert.rejects(
    applyHostedEmotionalEvents(
      {
        visitId: VISIT_ID,
        residentId: RESIDENT_ID,
        turnId: TURN_ID,
        phase: "post_turn",
        idempotencyKey: "emotion:test-redaction",
        events: [{ type: "user_interaction" }],
        occurredAt: OCCURRED_AT,
      },
      unsafeClient,
    ),
    /redaction boundary/,
    "the server adapter must reject an event that exposes private cognitive labels",
  );
}

async function checkPersistenceSourceContract(): Promise<void> {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260715150000_mnemos_emotional_event_updates.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const projection = await readFile(
    new URL("../src/server/runtime/projection.server.ts", import.meta.url),
    "utf8",
  );
  const cognitionProjection = await readFile(
    new URL("../src/server/runtime/cognition-projection.server.ts", import.meta.url),
    "utf8",
  );
  const turn = await readFile(
    new URL("../src/server/runtime/turn.server.ts", import.meta.url),
    "utf8",
  );
  const messageRoute = await readFile(
    new URL("../src/routes/api/message.ts", import.meta.url),
    "utf8",
  );

  for (const required of [
    "request_hash",
    "before_state",
    "after_state",
    "runtime_event_id",
    "FOR UPDATE",
    "revision_conflict",
    "append_runtime_event_v1",
    "mnemos_emotional_update_idempotency_conflict",
    "prevent_mnemos_emotional_mutation_rewrite",
  ]) {
    assert.ok(migration.includes(required), `atomic migration must include ${required}`);
  }
  assert.match(
    migration,
    /WHERE id = p_visit_id AND resident_id = p_resident_id/,
    "the RPC must validate visit/resident ownership",
  );
  assert.match(
    migration,
    /'state', v_mutation\.after_state,[\s\S]*'event', to_jsonb\(v_event\)/,
    "an exact replay must return the ledger's historical state and RuntimeEvent",
  );
  assert.equal(
    migration.includes("user_interaction") || migration.includes("new_connection_discovered"),
    false,
    "Python-parity cognitive arithmetic must remain in TypeScript, not SQL",
  );
  assert.match(
    turn,
    /residentTurnCompleted: sawLegacyDone && outputStarted/,
    "failed or partial turns must not apply user_interaction",
  );
  assert.match(
    projection,
    /if \(input\.residentTurnCompleted && input\.turnId\)/,
    "post-turn emotion must retain an explicit success gate",
  );
  assert.match(
    cognitionProjection,
    /mutation\.mutation_type === "engram\.edge\.created"[\s\S]*mutation\.attribution_scope === "session_linked"[\s\S]*idempotencyKey: `emotion:connection:\$\{mutation\.id\}`[\s\S]*new_connection_discovered/,
    "consolidation emotion must use one stable update per session-linked edge marker",
  );
  assert.match(
    messageRoute,
    /loadEmotionalStateValues\(resident\.id,[\s\S]*emotionalState: emotionalState \?\? undefined/,
    "the production message route must pass authoritative state into retrieval",
  );
  assert.match(
    messageRoute,
    /authoritative state unavailable; using legacy retrieval order/,
    "missing migration state must fall back without taking generation down",
  );
}

function checkHostedExtensionBoundary(): void {
  const decision = decideHostedEncodingDepth({
    emotionalState: DEFAULT_STATE_FIXTURE,
  });
  assert.equal(decision.depth, "moderate");
  assert.equal(decision.policy, "hosted-extension-v1");
  assert.equal(decision.pythonParity, false);
  assert.equal(decision.pythonReferenceResult, "moderate");
}

checkDefaults();
checkCognitiveEvents();
checkSmoothing();
checkRetrievalBias();
checkHostedRetrievalOrdering();
checkHostedExtensionBoundary();
await checkAtomicRuntimeAdapter();
await checkPersistenceSourceContract();

console.log(
  `emotional parity runtime: ${COGNITIVE_EVENT_FIXTURES.length} events, CAS replay/redaction, retrieval ordering, and hosted-extension boundary passed`,
);
