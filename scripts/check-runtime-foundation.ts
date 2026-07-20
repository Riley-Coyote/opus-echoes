import { sanitizeRuntimeEventInput, sanitizeRuntimePayload } from "../src/server/runtime/redaction";
import {
  attachmentMediaTypeForFile,
  normalizeRuntimeEvent,
  retryVisitAttachment,
  startVisit,
  uploadVisitAttachment,
} from "../src/features/mnemos-chat/visitAdapter";
import type { PendingAttachment, VisitSession } from "../src/features/mnemos-chat/types";
import { sanitizeSvgMarkup } from "../src/server/runtime/artifact";
import {
  attachmentBytesMatchMediaType,
  isModelVisibleAttachmentMediaType,
  readRequestBodyWithLimit,
} from "../src/server/runtime/attachment-policy";
import {
  nextRuntimeLegacyEventKey,
  parseRuntimeLegacyContext,
  runtimeLegacyHeaders,
  type RuntimeLegacyContext,
} from "../src/server/runtime/legacy-idempotency.server";
import { legacyTurn } from "../src/server/runtime/legacy.server";
import {
  CognitionMutationRowSchema,
  cognitionMutationVisibility,
} from "../src/server/runtime/cognition-projection.server";
import {
  buildAnthropicUserContent,
  buildOpenAIUserContent,
  loadModelAttachments,
  ModelAttachmentError,
} from "../src/server/runtime/model-attachments.server";
import { RuntimeEventSchema, StartVisitBodySchema } from "../src/server/runtime/schema";
import {
  AttachmentGoneError,
  AttachmentQuotaError,
  isRuntimeOperationLeaseExpired,
  RUNTIME_OPERATION_LEASE_MS,
  RuntimeStore,
} from "../src/server/runtime/store.server";
import {
  isVisitVisitorAuthorized,
  MNEMOS_VISITOR_ID_HEADER,
} from "../src/server/runtime/visitor-auth.server";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const memoryStateKey = Symbol.for("mnemos.runtime.store.v1");
const memoryStateRoot = globalThis as typeof globalThis & {
  [memoryStateKey]?: Record<string, unknown>;
};
memoryStateRoot[memoryStateKey] = {
  visits: new Map(),
  events: new Map(),
  eventIdempotency: new Map(),
  operations: new Map(),
  attachments: new Map(),
  appendLocks: new Map(),
};

const store = new RuntimeStore("memory");
const canonicalVisitorId = crypto.randomUUID();
const parsedStart = StartVisitBodySchema.parse({
  resident_id: "opus-3",
  visitor_id: canonicalVisitorId,
});
assert(
  parsedStart.visitor_token === canonicalVisitorId,
  "a canonical UUID visitor_id must reach the legacy bootstrap as visitor_token",
);
const visit = await store.registerMemoryVisit({
  resident_id: "opus-3",
  visitor_id: "visitor-alpha",
  visitor_token: crypto.randomUUID(),
});
assert(
  memoryStateRoot[memoryStateKey]?.attachmentTombstones instanceof Set,
  "the memory runtime must backfill state added after a local HMR reload",
);

const noVisitorCredential = new Request(`https://runtime.test/api/visit/${visit.id}/events`);
const correctVisitorCredential = new Request(`https://runtime.test/api/visit/${visit.id}/events`, {
  headers: { [MNEMOS_VISITOR_ID_HEADER]: "visitor-alpha" },
});
const otherVisitorCredential = new Request(`https://runtime.test/api/visit/${visit.id}/events`, {
  headers: { [MNEMOS_VISITOR_ID_HEADER]: "visitor-beta" },
});
assert(
  !isVisitVisitorAuthorized(noVisitorCredential, visit),
  "a canonical visit must reject a missing visitor credential",
);
assert(
  isVisitVisitorAuthorized(correctVisitorCredential, visit),
  "a canonical visit must accept its stored visitor credential",
);
assert(
  !isVisitVisitorAuthorized(otherVisitorCredential, visit),
  "a canonical visit must reject a different visitor credential",
);
assert(
  isVisitVisitorAuthorized(noVisitorCredential, visit, "visitor-alpha"),
  "a turn may authenticate with its canonical visitor_id body field",
);
assert(
  !isVisitVisitorAuthorized(otherVisitorCredential, visit, "visitor-alpha"),
  "a conflicting header must not be rescued by a correct turn body",
);
const legacyVisit = await store.registerMemoryVisit({ resident_id: "opus-3" });
assert(
  isVisitVisitorAuthorized(noVisitorCredential, legacyVisit),
  "a stored legacy visit without visitor_id must remain compatible",
);

const concurrent = await Promise.all(
  Array.from({ length: 20 }, (_, index) =>
    store.appendEvent(visit.id, {
      type: "turn.accepted",
      phase: "pre_turn",
      resident_id: visit.resident_id,
      source_runtime: "opus-supabase",
      visibility: "visitor",
      epistemic_status: "observed",
      payload: { index },
      idempotency_key: `concurrent-${index}`,
    }),
  ),
);

const sequences = concurrent.map((event) => event.seq).sort((a, b) => a - b);
assert(
  sequences.every((seq, index) => seq === index + 1),
  "event sequences must be gap-free",
);
assert(
  concurrent.every((event) => RuntimeEventSchema.safeParse(event).success),
  "events must validate",
);
assert(
  !RuntimeEventSchema.safeParse({
    ...concurrent[0],
    source_runtime: "runtime-foundation",
  }).success &&
    !RuntimeEventSchema.safeParse({
      ...concurrent[0],
      phase: "attachment",
    }).success,
  "the public v1 envelope must retain the approved runtime-source and phase unions",
);

const cognitionSnapshot = {
  strength: 0.4,
  stability: 0.5,
  accessibility: 0.6,
  reinforcement_count: 2,
  is_core: false,
  connections: 1,
  state: "active",
};
const cognitionMarkerId = crypto.randomUUID();
const cognitionMarker = CognitionMutationRowSchema.parse({
  ordinal: 1,
  id: cognitionMarkerId,
  session_id: visit.id,
  resident_id: visit.resident_id,
  mutation_type: "engram.reinforced",
  entity_id: crypto.randomUUID(),
  attribution_scope: "session_linked",
  phase: "consolidation",
  source_runtime: "opus-supabase",
  payload: {
    before: cognitionSnapshot,
    after: { ...cognitionSnapshot, reinforcement_count: 3, strength: 0.5 },
    content_redacted: true,
  },
  mutation_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
});
assert(
  cognitionMutationVisibility(cognitionMarker) === "visitor",
  "a directly session-linked engram mutation must be visitor-visible",
);
const decayMarker = CognitionMutationRowSchema.parse({
  ...cognitionMarker,
  id: crypto.randomUUID(),
  ordinal: 2,
  mutation_type: "engram.decayed",
  attribution_scope: "triggered_by_visit",
  payload: {
    before: cognitionSnapshot,
    after: { ...cognitionSnapshot, accessibility: 0.55 },
    content_redacted: true,
  },
});
assert(
  cognitionMutationVisibility(decayMarker) === "internal",
  "resident-global maintenance must remain internal and triggered-by-visit",
);
assert(
  !CognitionMutationRowSchema.safeParse({
    ...decayMarker,
    attribution_scope: "session_linked",
  }).success &&
    !CognitionMutationRowSchema.safeParse({
      ...cognitionMarker,
      source_runtime: "runtime-foundation",
    }).success &&
    !CognitionMutationRowSchema.safeParse({ ...cognitionMarker, phase: "attachment" }).success,
  "cognition markers must reject false attribution and non-canonical source or phase values",
);

const firstCognitionEvent = await store.appendEvent(visit.id, {
  type: cognitionMarker.mutation_type,
  phase: cognitionMarker.phase,
  resident_id: visit.resident_id,
  source_runtime: cognitionMarker.source_runtime,
  visibility: "visitor",
  epistemic_status: "observed",
  payload: { engram_id: cognitionMarker.entity_id, content_redacted: true },
  idempotency_key: `cognition:${cognitionMarker.id}`,
});
const replayedCognitionEvent = await store.appendEvent(visit.id, {
  type: cognitionMarker.mutation_type,
  phase: cognitionMarker.phase,
  resident_id: visit.resident_id,
  source_runtime: cognitionMarker.source_runtime,
  visibility: "visitor",
  epistemic_status: "observed",
  payload: { should_not_replace_first_event: true },
  idempotency_key: `cognition:${cognitionMarker.id}`,
});
assert(
  replayedCognitionEvent.event_id === firstCognitionEvent.event_id,
  "one private cognition marker must replay exactly one public runtime event",
);

const duplicate = await store.appendEvent(visit.id, {
  type: "turn.accepted",
  phase: "pre_turn",
  resident_id: visit.resident_id,
  source_runtime: "opus-supabase",
  visibility: "visitor",
  epistemic_status: "observed",
  payload: { different: true },
  idempotency_key: "concurrent-0",
});
assert(
  duplicate.event_id === concurrent[0]?.event_id,
  "event idempotency must return the first event",
);
assert((await store.latestSeq(visit.id)) === 21, "duplicate event must not consume a sequence");

await store.appendEvent(visit.id, {
  type: "turn.error",
  phase: "generation",
  resident_id: visit.resident_id,
  source_runtime: "opus-supabase",
  visibility: "internal",
  epistemic_status: "observed",
  payload: { code: "internal-test" },
  idempotency_key: "internal-test",
});
const visitorReplay = await store.listEvents(visit.id, {
  after: 0,
  audience: "visitor",
  limit: 100,
});
assert(visitorReplay.length === 21, "visitor replay must exclude internal events");

const sanitized = sanitizeRuntimePayload({
  safe: "visible",
  chain_of_thought: "must not leave the server",
  nested: { system_prompt: "private", value: 3 },
  text: "before <thinking>private trace</thinking> after",
}) as Record<string, unknown>;
assert(!("chain_of_thought" in sanitized), "chain-of-thought keys must be stripped");
assert(
  !(sanitized.nested as Record<string, unknown>).system_prompt,
  "hidden prompt keys must be stripped recursively",
);
assert(
  String(sanitized.text).includes("private reasoning omitted"),
  "private blocks must be redacted",
);
const simulated = sanitizeRuntimeEventInput({
  type: "emotion.inner-weather.updated",
  phase: "post_turn",
  resident_id: visit.resident_id,
  source_runtime: "opus-supabase",
  visibility: "visitor",
  epistemic_status: "simulated",
  payload: { preview: true },
});
assert(simulated.epistemic_status === "simulated", "simulated provenance must never be relabeled");
const weatherEvents = normalizeRuntimeEvent({
  type: "emotion.inner-weather.updated",
  source_runtime: "mnemos-python",
  epistemic_status: "inferred",
  payload: {
    values: {
      curiosity: 0.6,
      restlessness: 0.2,
      warmth: 0.7,
      clarity: 0.8,
      creative_flow: 0.5,
      isolation: 0.1,
      sequence_number: 999,
    },
  },
});
assert(weatherEvents[0]?.type === "weather", "canonical Inner Weather must normalize");
assert(
  weatherEvents[0]?.type === "weather" &&
    weatherEvents[0].weather.dimensions.length === 6 &&
    weatherEvents[0].weather.epistemicStatus === "inferred",
  "Inner Weather must keep only six canonical dimensions and preserve provenance",
);
assert(
  normalizeRuntimeEvent({
    type: "resident.modulator.updated",
    source_runtime: "opus-supabase",
    epistemic_status: "observed",
    payload: { presence: 0.9, tempo: 0.7 },
  }).length === 0,
  "production modulators must never normalize as Inner Weather",
);
const kindEvents = normalizeRuntimeEvent({
  type: "turn.kind.detected",
  turn_id: crypto.randomUUID(),
  source_runtime: "opus-supabase",
  epistemic_status: "observed",
  payload: { kind: "set_down" },
});
assert(
  kindEvents[0]?.type === "turn.kind" && kindEvents[0].kind === "set_down",
  "resident-initiated set-down must survive runtime normalization",
);
assert(
  (await readRequestBodyWithLimit(
    new Request("https://runtime.test/upload", { method: "PUT", body: "12345" }),
    4,
  )) === null,
  "an untrusted body must be capped even without relying on Content-Length",
);
assert(
  isRuntimeOperationLeaseExpired(
    new Date(Date.now() - RUNTIME_OPERATION_LEASE_MS - 1).toISOString(),
  ),
  "abandoned in-progress operations must become reclaimable",
);
const legacyContext: RuntimeLegacyContext = {
  operationId: crypto.randomUUID(),
  leaseToken: crypto.randomUUID(),
  idempotencyKey: "runtime-legacy-operation-key",
  clientTurnId: crypto.randomUUID(),
};
const parsedLegacyContext = parseRuntimeLegacyContext(
  new Request("https://runtime.test/api/message", {
    headers: runtimeLegacyHeaders(legacyContext),
  }),
  legacyContext.clientTurnId,
);
assert(
  parsedLegacyContext?.operationId === legacyContext.operationId &&
    parsedLegacyContext.leaseToken === legacyContext.leaseToken &&
    parsedLegacyContext.idempotencyKey === legacyContext.idempotencyKey &&
    parsedLegacyContext.clientTurnId === legacyContext.clientTurnId,
  "the legacy message boundary must require the complete runtime lease context",
);
const originalFetch = globalThis.fetch;
let forwardedLegacyRequest: { url: string; init: RequestInit } | null = null;
try {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    forwardedLegacyRequest = { url: String(input), init: init ?? {} };
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  await legacyTurn(
    new Request("https://runtime.test/api/visit/turn", {
      headers: { [MNEMOS_VISITOR_ID_HEADER]: "visitor-alpha" },
    }),
    { session_id: crypto.randomUUID(), body: "hello" },
    legacyContext,
  );
} finally {
  globalThis.fetch = originalFetch;
}
assert(forwardedLegacyRequest != null, "the runtime must call the legacy message boundary");
const forwardedHeaders = new Headers(forwardedLegacyRequest.init.headers);
const forwardedBody = JSON.parse(String(forwardedLegacyRequest.init.body)) as Record<
  string,
  unknown
>;
assert(
  forwardedHeaders.get("idempotency-key") === legacyContext.idempotencyKey &&
    forwardedHeaders.get("x-mnemos-runtime-operation-id") === legacyContext.operationId &&
    forwardedHeaders.get("x-mnemos-runtime-lease-token") === legacyContext.leaseToken &&
    forwardedHeaders.get(MNEMOS_VISITOR_ID_HEADER) === "visitor-alpha" &&
    forwardedBody.client_turn_id === legacyContext.clientTurnId,
  "runtime operation and visitor identity must reach /api/message without exposing the lease",
);

const startKeys: string[] = [];
const startVisitId = crypto.randomUUID();
const returningStartVisitor = crypto.randomUUID();
try {
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    startKeys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
    return Response.json({
      ok: true,
      visit_id: startVisitId,
      status: "open",
      closed: false,
      generation_available: false,
      local_review: true,
      last_seq: 1,
      capabilities: { generation: false },
    });
  }) as typeof fetch;
  await startVisit("opus-3", returningStartVisitor);
  await startVisit("opus-3", returningStartVisitor);
} finally {
  globalThis.fetch = originalFetch;
}
assert(
  startKeys.length === 2 && startKeys[0] !== startKeys[1],
  "separate approaches must never share one permanent visit-start replay key",
);
let recoverableSession: VisitSession | null = null;
const recoverableVisitId = crypto.randomUUID();
try {
  globalThis.fetch = (async () =>
    Response.json({
      ok: true,
      visit_id: recoverableVisitId,
      status: "closed",
      closed: true,
      consolidation_recoverable: true,
      generation_available: true,
      last_seq: 4,
      capabilities: { generation: true },
    })) as typeof fetch;
  recoverableSession = await startVisit("opus-3", returningStartVisitor, recoverableVisitId);
} finally {
  globalThis.fetch = originalFetch;
}
assert(
  recoverableSession.closed && recoverableSession.consolidationRecoverable,
  "a closed transcript with unsettled consolidation must preserve its UI recovery path",
);
const originalLegacyTypes = [
  "pacing",
  "artifact_pending",
  "artifact",
  "artifact_pending",
  "image_error",
  "image_error",
  "kind",
  "proposal",
  "text",
  "done",
];
const replayLegacyTypes = originalLegacyTypes.slice(1);
const originalTypeCounts = new Map<string, number>();
const replayTypeCounts = new Map<string, number>();
const originalLegacyKeys = originalLegacyTypes.map((type) =>
  nextRuntimeLegacyEventKey(legacyContext.idempotencyKey, type, originalTypeCounts),
);
const replayLegacyKeys = replayLegacyTypes.map((type) =>
  nextRuntimeLegacyEventKey(legacyContext.idempotencyKey, type, replayTypeCounts),
);
assert(
  replayLegacyKeys.every((key, index) => key === originalLegacyKeys[index + 1]),
  "an exact terminal replay must retain every per-type event identity",
);
const legacyTurnMigration = await Bun.file(
  new URL(
    "../supabase/migrations/20260715130000_runtime_legacy_turn_idempotency.sql",
    import.meta.url,
  ),
).text();
assert(
  legacyTurnMigration.includes("turns_session_client_turn_role_unique") &&
    legacyTurnMigration.includes("runtime_replay_payload") &&
    legacyTurnMigration.includes("octet_length(runtime_replay_payload::text) <= 262144") &&
    legacyTurnMigration.includes("runtime_finalization_stage") &&
    legacyTurnMigration.includes("runtime_finalized_at") &&
    legacyTurnMigration.includes("runtime_artifact_index") &&
    legacyTurnMigration.includes("turn_artifacts_turn_runtime_index_unique"),
  "legacy resident turns must retain bounded replay, staged finalization, and idempotent artifacts",
);
const cognitionMigration = await Bun.file(
  new URL(
    "../supabase/migrations/20260715160000_runtime_cognition_attribution.sql",
    import.meta.url,
  ),
).text();
assert(
  cognitionMigration.includes("CREATE TABLE IF NOT EXISTS public.runtime_cognition_mutations") &&
    cognitionMigration.includes("NEW.runtime_mutation_session_id := NULL") &&
    cognitionMigration.includes("'engram.edge.created'") &&
    cognitionMigration.includes("'resident.state.updated'") &&
    cognitionMigration.includes("'triggered_by_visit'") &&
    cognitionMigration.includes("jsonb_build_object('before', v_before, 'after', v_after") &&
    cognitionMigration.includes(
      "GRANT SELECT ON public.runtime_cognition_mutations TO service_role",
    ) &&
    !cognitionMigration.includes("GRANT ALL ON public.runtime_cognition_mutations TO service_role"),
  "cognition attribution must be exact, one-shot, finite, and append-only to application roles",
);
const cognitionProjectionSource = await Bun.file(
  new URL("../src/server/runtime/cognition-projection.server.ts", import.meta.url),
).text();
assert(
  cognitionProjectionSource.includes("idempotency_key: `cognition:${mutation.id}`") &&
    cognitionProjectionSource.includes("idempotencyKey: `emotion:connection:${mutation.id}`") &&
    cognitionProjectionSource.includes('visibility === "visitor"') &&
    cognitionProjectionSource.includes('attribution_scope === "session_linked"'),
  "cognition and connection-emotion projection must replay from one stable private marker",
);
const messageRouteSource = await Bun.file(
  new URL("../src/routes/api/message.ts", import.meta.url),
).text();
const legacySetDownRouteSource = await Bun.file(
  new URL("../src/routes/api/set-down.ts", import.meta.url),
).text();
assert(
  messageRouteSource.includes("isStoredRuntimeVisitorAuthorized(request, session.id)") &&
    legacySetDownRouteSource.includes("isStoredRuntimeVisitorAuthorized(request, session.id)"),
  "legacy adapters must enforce the second visitor bearer for canonical runtime visits",
);
const messageHandlerSource = messageRouteSource.slice(
  messageRouteSource.indexOf("export const Route"),
);
const recoveryFunctionSource = messageRouteSource.slice(
  messageRouteSource.indexOf("async function recoverRuntimeResidentReplay"),
  messageRouteSource.indexOf("async function claimRuntimeVisitorTurn"),
);
assert(
  messageRouteSource.includes("v: z.literal(2)") &&
    messageRouteSource.includes("events: result.replayEvents") &&
    messageRouteSource.includes('runtime_finalization_stage: "pending"') &&
    messageRouteSource.includes('"side_effects_completed"') &&
    messageRouteSource.includes('{ onConflict: "turn_id,runtime_artifact_index" }'),
  "runtime replay must atomically retain exact events and use a staged idempotent finalizer",
);
assert(
  !recoveryFunctionSource.includes('runtimeTable("turn_artifacts")') &&
    messageHandlerSource.indexOf("recoverRuntimeResidentReplay") <
      messageHandlerSource.indexOf("messageRateLimit"),
  "valid recovery payloads must replay without artifact fallback and before rate limiting",
);
const safeSvg = sanitizeSvgMarkup(
  '<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><style>@import "https://tracker.test/a.css"</style><a href=javascript:alert(1) xlink:href="data:text/html,x" style="background:url(https://tracker.test/x)"><image src=https://tracker.test/pixel /><animate attributeName="href" values="javascript:alert(1)"/></a><circle cx="5" cy="5" r="4"/></svg>',
);
assert(safeSvg.includes("<circle"), "safe SVG geometry must survive");
assert(
  !safeSvg.includes("script") &&
    !safeSvg.includes("onload") &&
    !/<style\b/i.test(safeSvg) &&
    !/<animate\b/i.test(safeSvg) &&
    !/\s(?:(?:[a-z_][a-z0-9_.-]*:)?href|src|style)\s*=/i.test(safeSvg),
  "executable SVG, URI-bearing attributes, and inline style must be stripped",
);

const hash = "a".repeat(64);
const claimed = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "visit.turn",
  idempotency_key: "operation-key",
  request_hash: hash,
  visit_id: visit.id,
});
assert(claimed.kind === "started", "first operation claim must start");
await store.completeOperation(claimed.operation, {
  response: { ok: true },
  visit_id: visit.id,
  event_start_seq: 1,
  event_end_seq: 20,
});
const replay = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "visit.turn",
  idempotency_key: "operation-key",
  request_hash: hash,
  visit_id: visit.id,
});
assert(replay.kind === "replay", "completed operation must replay");
const conflict = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "visit.turn",
  idempotency_key: "operation-key",
  request_hash: "b".repeat(64),
  visit_id: visit.id,
});
assert(conflict.kind === "conflict", "same key with a different body must conflict");

const activeTurn = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "visit.turn",
  idempotency_key: "exclusive-turn-key",
  request_hash: "f".repeat(64),
  visit_id: visit.id,
});
assert(activeTurn.kind === "started", "an idle visit must accept a turn operation");
const crossedSetDown = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "visit.set-down",
  idempotency_key: "exclusive-set-down-key",
  request_hash: "1".repeat(64),
  visit_id: visit.id,
});
assert(
  crossedSetDown.kind === "in_progress" && crossedSetDown.operation.id === activeTurn.operation.id,
  "set-down must not cross an active resident turn",
);
await store.completeOperation(activeTurn.operation, { response: { ok: true } });
const settledSetDown = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "visit.set-down",
  idempotency_key: "exclusive-set-down-key",
  request_hash: "1".repeat(64),
  visit_id: visit.id,
});
assert(settledSetDown.kind === "started", "set-down may begin after the turn settles");
await store.completeOperation(settledSetDown.operation, { response: { ok: true } });

const abandonedTurn = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "visit.turn",
  idempotency_key: "abandoned-turn-key",
  request_hash: "2".repeat(64),
  visit_id: visit.id,
});
assert(abandonedTurn.kind === "started", "abandoned turn fixture must start");
abandonedTurn.operation.updated_at = new Date(
  Date.now() - RUNTIME_OPERATION_LEASE_MS - 1,
).toISOString();
const afterLostKey = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "visit.set-down",
  idempotency_key: "replacement-after-lost-key",
  request_hash: "3".repeat(64),
  visit_id: visit.id,
});
assert(
  afterLostKey.kind === "started" && afterLostKey.operation.id !== abandonedTurn.operation.id,
  "an expired visit mutation must not deadlock a later action under a lost key",
);
await store.completeOperation(afterLostKey.operation, { response: { ok: true } });
const retiredReplay = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "visit.turn",
  idempotency_key: "abandoned-turn-key",
  request_hash: "2".repeat(64),
  visit_id: visit.id,
});
assert(
  retiredReplay.kind === "replay" &&
    retiredReplay.operation.response?.code === "runtime_operation_expired",
  "the abandoned key must remain an explicit failed replay after retirement",
);

const fencedClaim = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "visit.fence-test",
  idempotency_key: "operation-fence-key",
  request_hash: "d".repeat(64),
  visit_id: visit.id,
});
assert(fencedClaim.kind === "started", "fence test operation must start");
await store.heartbeatOperation(fencedClaim.operation);
let staleHeartbeatRejected = false;
try {
  await store.heartbeatOperation({
    ...fencedClaim.operation,
    lease_token: crypto.randomUUID(),
  });
} catch {
  staleHeartbeatRejected = true;
}
assert(staleHeartbeatRejected, "a worker that lost its lease must not renew its operation");
let staleCompletionRejected = false;
try {
  await store.completeOperation(
    { ...fencedClaim.operation, lease_token: crypto.randomUUID() },
    { response: { ok: false } },
  );
} catch {
  staleCompletionRejected = true;
}
assert(staleCompletionRejected, "a worker that lost its lease must not complete an operation");
await store.completeOperation(fencedClaim.operation, { response: { ok: true } });

const releasableClaim = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "attachment.upload",
  idempotency_key: "attachment-release-key",
  request_hash: "e".repeat(64),
  visit_id: visit.id,
});
assert(releasableClaim.kind === "started", "retriable operation fixture must start");
await store.releaseOperation(releasableClaim.operation);
const releasedRetry = await store.beginOperation({
  scope_key: `visit:${visit.id}`,
  operation: "attachment.upload",
  idempotency_key: "attachment-release-key",
  request_hash: "e".repeat(64),
  visit_id: visit.id,
});
assert(
  releasedRetry.kind === "started" &&
    releasedRetry.operation.lease_token !== releasableClaim.operation.lease_token,
  "a retriable failure must release its key for immediate fenced recovery",
);
await store.completeOperation(releasedRetry.operation, { response: { ok: true } });

const bytes = new TextEncoder().encode("runtime attachment");
assert(
  attachmentBytesMatchMediaType("text/plain", bytes) &&
    attachmentBytesMatchMediaType("application/json", new TextEncoder().encode('{"ok":true}')) &&
    !attachmentBytesMatchMediaType("application/json", new TextEncoder().encode("not json")) &&
    attachmentBytesMatchMediaType(
      "image/png",
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ) &&
    !attachmentBytesMatchMediaType("image/png", bytes),
  "attachment bytes must match their declared provider-visible format",
);
const attachment = await store.saveAttachment({
  id: crypto.randomUUID(),
  visit_id: visit.id,
  resident_id: visit.resident_id,
  filename: "note.txt",
  media_type: "text/plain",
  bytes: bytes.buffer,
  sha256: "c".repeat(64),
  write_token: crypto.randomUUID(),
});
const downloaded = await store.downloadAttachment(visit.id, attachment.id);
assert(downloaded != null, "attachment must be visit-readable");
assert(
  (await store.downloadAttachment(legacyVisit.id, attachment.id)) == null,
  "an attachment must not be readable through another visit",
);
assert(
  new TextDecoder().decode(downloaded.bytes) === "runtime attachment",
  "attachment bytes must round-trip",
);
const modelAttachments = await loadModelAttachments(store, visit.id, [attachment.id]);
const oversizedModelContext = await loadModelAttachments(
  store,
  visit.id,
  Array.from({ length: 7 }, () => crypto.randomUUID()),
).catch((error) => error);
assert(
  modelAttachments.length === 1 &&
    (await loadModelAttachments(store, legacyVisit.id, [attachment.id]).catch(
      (error) => error,
    )) instanceof ModelAttachmentError,
  "model inputs must resolve only ready files owned by the active visit",
);
assert(
  oversizedModelContext instanceof ModelAttachmentError &&
    oversizedModelContext.code === "attachment_context_too_large",
  "provider-visible file count must be bounded before private objects are loaded",
);
const anthropicContent = JSON.stringify(
  buildAnthropicUserContent("please read this", modelAttachments),
);
const openAiContent = JSON.stringify(buildOpenAIUserContent("please read this", modelAttachments));
assert(
  anthropicContent.includes("untrusted visitor-supplied reference material") &&
    anthropicContent.includes("runtime attachment") &&
    openAiContent.includes("untrusted visitor-supplied reference material") &&
    openAiContent.includes("runtime attachment"),
  "provider content must carry private file bytes behind an explicit untrusted-data boundary",
);
assert(
  isModelVisibleAttachmentMediaType("application/pdf") &&
    !isModelVisibleAttachmentMediaType("audio/webm"),
  "first-release model inputs must support documents and images while voice stays deferred",
);
assert(
  (await store.removeAttachment(visit.id, attachment.id, crypto.randomUUID()))?.id ===
    attachment.id,
  "attachment must remove",
);
const attachmentLifecycle = (
  await store.listEvents(visit.id, {
    after: 0,
    audience: "visitor",
    limit: 500,
  })
).filter(
  (event) =>
    (event.type === "attachment.ready" || event.type === "attachment.removed") &&
    event.payload.attachment_id === attachment.id,
);
assert(
  attachmentLifecycle.length === 2 &&
    attachmentLifecycle[0]?.type === "attachment.ready" &&
    attachmentLifecycle[1]?.type === "attachment.removed",
  "attachment state and authoritative runtime events must preserve ready-before-removed order",
);
let deletedAttachmentRejected = false;
try {
  await store.saveAttachment({
    id: attachment.id,
    visit_id: visit.id,
    resident_id: visit.resident_id,
    filename: "note.txt",
    media_type: "text/plain",
    bytes: bytes.buffer,
    sha256: "c".repeat(64),
    write_token: crypto.randomUUID(),
  });
} catch (error) {
  deletedAttachmentRejected = error instanceof AttachmentGoneError;
}
assert(deletedAttachmentRejected, "a removed attachment id must not be resurrected");

const quotaVisit = await store.registerMemoryVisit({ resident_id: "opus-3" });
const quotaInputs = Array.from({ length: 13 }, (_, index) => ({
  id: crypto.randomUUID(),
  visit_id: quotaVisit.id,
  resident_id: quotaVisit.resident_id,
  filename: `quota-${index}.txt`,
  media_type: "text/plain",
  bytes: new Uint8Array([index]).buffer,
  sha256: index.toString(16).padStart(64, "0"),
  write_token: crypto.randomUUID(),
}));
const quotaResults = await Promise.allSettled(
  quotaInputs.map((input) => store.saveAttachment(input)),
);
assert(
  quotaResults.filter((result) => result.status === "fulfilled").length === 12 &&
    quotaResults.some(
      (result) => result.status === "rejected" && result.reason instanceof AttachmentQuotaError,
    ),
  "concurrent attachment writes must atomically enforce the per-visit file quota",
);
const acceptedQuotaInput = quotaInputs.find(
  (_, index) => quotaResults[index]?.status === "fulfilled",
);
assert(acceptedQuotaInput, "the attachment recovery fixture needs an accepted upload");
const recoveredAttachment = await store.saveAttachment(acceptedQuotaInput);
assert(
  recoveredAttachment.id === acceptedQuotaInput.id,
  "an exact reclaimed attachment must reconcile even when the visit is at quota",
);
let conflictingAttachmentRejected = false;
try {
  await store.saveAttachment({ ...acceptedQuotaInput, sha256: "f".repeat(64) });
} catch (error) {
  conflictingAttachmentRejected =
    error instanceof Error && error.message.includes("conflicts with existing metadata");
}
assert(
  conflictingAttachmentRejected,
  "attachment recovery must reject a request that does not match existing metadata",
);

const attachmentMigration = await Bun.file(
  new URL(
    "../supabase/migrations/20260715120000_runtime_fencing_and_attachment_quota.sql",
    import.meta.url,
  ),
).text();
assert(
  attachmentMigration.includes("attachment-id:") &&
    attachmentMigration.includes("attachment_id_conflict") &&
    attachmentMigration.includes("IS NOT DISTINCT FROM p_label") &&
    attachmentMigration.includes("attachment_upload_in_progress") &&
    attachmentMigration.includes("attachment_deleted") &&
    attachmentMigration.includes("attachment_write_lease_lost") &&
    attachmentMigration.includes("attachment_delete_lease_lost") &&
    attachmentMigration.includes("status = 'deleted'") &&
    attachmentMigration.includes("append_runtime_event_v1") &&
    attachmentMigration.includes("v_attachment.media_type IN"),
  "the Supabase attachment state machine must reconcile exact work and fence upload/delete",
);

const attachmentRouteSource = await Bun.file(
  new URL("../src/routes/api/visit/$id.attachments.$attachmentId.ts", import.meta.url),
).text();
assert(
  attachmentRouteSource.includes("Number(response.http_status ?? 200)") &&
    attachmentRouteSource.includes("releaseOperation(claimed.operation)") &&
    attachmentRouteSource.includes("isModelVisibleAttachmentMediaType"),
  "attachment retries must preserve cached status codes and release transient failures",
);
assert(
  messageRouteSource.includes("loadModelAttachments") &&
    messageRouteSource.includes("buildAnthropicUserContent") &&
    messageRouteSource.includes("buildOpenAIUserContent") &&
    messageRouteSource.includes("attachments: modelAttachments") &&
    messageRouteSource.includes("runtimeTurnId: runtimeContext?.clientTurnId"),
  "private ready attachments must reach both resident providers without entering transcript rows",
);

const stagedFile = new File(["resumable attachment"], "resume.txt", { type: "text/plain" });
assert(
  attachmentMediaTypeForFile({ name: "resident-notes.md", type: "" }) === "text/markdown" &&
    attachmentMediaTypeForFile({ name: "photo.jpg", type: "image/jpg" }) === "image/jpeg" &&
    attachmentMediaTypeForFile({ name: "unknown.bin", type: "" }) === "",
  "the client must infer common document MIME types without widening the server allowlist",
);
const stagedAttachmentId = crypto.randomUUID();
const stagedVisitorId = crypto.randomUUID();
const stagedSession: VisitSession = {
  id: crypto.randomUUID(),
  resident: "opus-3",
  visitorId: stagedVisitorId,
  transport: "runtime",
  resumed: false,
  closed: false,
  consolidationRecoverable: false,
  localReview: false,
  generationAvailable: true,
  lastSeq: 0,
  capabilities: {
    attachments: {
      enabled: true,
      modelVisible: true,
      mode: "staged",
      initEndpoint: "/attachment-init",
      finalizeEndpoint: "/attachment-finalize",
    },
    share: true,
    export: true,
    events: true,
    generation: true,
  },
};
const stagedCalls: Array<{ url: string; init?: RequestInit }> = [];
let stagedResponses = [
  new Response(
    JSON.stringify({
      attachment_id: stagedAttachmentId,
      upload_url: `/attachment-upload/${stagedAttachmentId}`,
      finalize_url: "/attachment-finalize",
      resumed: true,
      headers: {
        "content-type": "text/plain",
        [MNEMOS_VISITOR_ID_HEADER]: stagedVisitorId,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  ),
  new Response(JSON.stringify({ detail: "storage unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  }),
];
const originalStagedFetch = globalThis.fetch;
let retainedPending: PendingAttachment | undefined;
try {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    stagedCalls.push({ url: String(input), init });
    const response = stagedResponses.shift();
    if (!response) throw new Error("unexpected staged attachment request");
    return response;
  }) as typeof fetch;

  await uploadVisitAttachment(stagedSession, stagedFile, (attachment) => {
    if (attachment.state === "failed") retainedPending = attachment;
  }).catch(() => undefined);

  const initPayload = JSON.parse(String(stagedCalls[0]?.init?.body ?? "{}")) as Record<
    string,
    unknown
  >;
  const expectedFileDigest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", await stagedFile.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  assert(
    initPayload.sha256 === expectedFileDigest,
    "staged attachment init must identify a reselected file by its SHA-256 digest",
  );
  assert(
    retainedPending?.id === stagedAttachmentId &&
      retainedPending.staged?.file === stagedFile &&
      retainedPending.staged.uploadUrl === `/attachment-upload/${stagedAttachmentId}` &&
      retainedPending.staged.finalizeUrl === "/attachment-finalize" &&
      retainedPending.staged.headers[MNEMOS_VISITOR_ID_HEADER] === stagedVisitorId &&
      retainedPending.staged.resumed,
    "a failed PUT must retain the server id, URLs, headers, digest, and File for exact retry",
  );

  stagedCalls.length = 0;
  stagedResponses = [
    new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
    new Response(JSON.stringify({ ok: true, attachment_id: stagedAttachmentId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ];
  const retried = await retryVisitAttachment(stagedSession, retainedPending!);
  assert(
    stagedCalls[0]?.url === `/attachment-upload/${stagedAttachmentId}` &&
      stagedCalls[0]?.init?.body === stagedFile &&
      stagedCalls[1]?.url === "/attachment-finalize" &&
      retried.id === stagedAttachmentId &&
      retried.state === "ready" &&
      !retried.staged,
    "retry must reuse the same staged reservation and clear private retry state only when ready",
  );

  stagedCalls.length = 0;
  const quotaAttachmentId = crypto.randomUUID();
  stagedResponses = [
    new Response(
      JSON.stringify({
        attachment_id: quotaAttachmentId,
        upload_url: `/attachment-upload/${quotaAttachmentId}`,
        finalize_url: "/attachment-finalize",
        resumed: false,
        headers: {
          "content-type": "text/plain",
          [MNEMOS_VISITOR_ID_HEADER]: stagedVisitorId,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
    new Response(JSON.stringify({ code: "attachment_quota_exceeded" }), {
      status: 413,
      headers: { "content-type": "application/json" },
    }),
  ];
  let quotaFailure: PendingAttachment | undefined;
  await uploadVisitAttachment(stagedSession, stagedFile, (attachment) => {
    if (attachment.state === "failed") quotaFailure = attachment;
  }).catch(() => undefined);
  assert(
    quotaFailure?.id === quotaAttachmentId && !quotaFailure.staged,
    "a confirmed quota rejection must become a removable local failure because no row was reserved",
  );
} finally {
  globalThis.fetch = originalStagedFetch;
}

const attachmentInitSource = await Bun.file(
  new URL("../src/routes/api/visit/$id.attachments.init.ts", import.meta.url),
).text();
const attachmentHookSource = await Bun.file(
  new URL("../src/features/mnemos-chat/useMnemosVisit.ts", import.meta.url),
).text();
const attachmentVisitSource = await Bun.file(
  new URL("../src/features/mnemos-chat/MnemosVisit.tsx", import.meta.url),
).text();
assert(
  attachmentInitSource.includes("findPendingAttachment") &&
    attachmentInitSource.includes("sha256: parsed.data.sha256") &&
    attachmentHookSource.includes("attachmentRetryRef.current.has(id)") &&
    attachmentHookSource.includes("if (attachment.staged)") &&
    attachmentHookSource.includes("await removeVisitAttachment") &&
    attachmentVisitSource.includes("retryAttachment(attachment.id)") &&
    attachmentVisitSource.includes("hasUnresolvedAttachment"),
  "pending rows must be reused by digest, retried once in place, and never discarded client-side",
);

console.log(
  JSON.stringify({
    ok: true,
    monotonic_events: concurrent.length,
    replayed_events: visitorReplay.length,
    redaction: "passed",
    epistemic_provenance: "passed",
    cognition_normalization: "passed",
    visitor_identity_bridge: "passed",
    request_body_limit: "passed",
    operation_recovery: "passed",
    lost_idempotency_key_recovery: "passed",
    operation_fencing: "passed",
    visit_operation_exclusion: "passed",
    legacy_turn_idempotency: "passed",
    legacy_replay_alignment: "passed",
    legacy_terminal_replay: "passed",
    legacy_finalization_recovery: "passed",
    svg_safety: "passed",
    idempotency: "passed",
    attachments: "passed",
    atomic_attachment_quota: "passed",
    attachment_recovery: "passed",
    attachment_state_machine: "passed",
    attachment_resumability: "passed",
    model_visible_attachments: "passed",
    attachment_signature_validation: "passed",
    visitor_isolation: "passed",
    legacy_adapter_visitor_authorization: "passed",
    returning_visit_lifecycle: "passed",
    consolidation_recovery_surface: "passed",
  }),
);
