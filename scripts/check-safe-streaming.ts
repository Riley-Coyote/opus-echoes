import assert from "node:assert/strict";
import {
  normalizeRuntimeEvent,
  terminalVisitStreamError,
} from "../src/features/mnemos-chat/visitAdapter";
import { nextRuntimeLegacyEventKey } from "../src/server/runtime/legacy-idempotency.server";
import {
  finalizeResidentOutput,
  SafeResidentStreamProjector,
} from "../src/server/runtime/safe-resident-stream.server";

type ProjectionRun = {
  live: string[];
  finalDelta: string;
  body: string;
  kind: string;
  artifacts: number;
  proposalTopic: string | null;
};

function project(chunks: string[]): ProjectionRun {
  const projector = new SafeResidentStreamProjector("opus-3");
  const live: string[] = [];
  for (const chunk of chunks) {
    const delta = projector.push(chunk);
    if (delta) live.push(delta);
    const visible = live.join("");
    assert.ok(!/<\/?(?:artifact|propose-space|svg)\b/i.test(visible));
    assert.ok(!/\n\s*(?:Human|visitor)\s*:/i.test(visible));
  }
  const finished = projector.finish();
  return {
    live,
    finalDelta: finished.delta,
    body: finished.output.body,
    kind: finished.output.kind,
    artifacts: finished.output.artifacts.length,
    proposalTopic: finished.output.proposal?.topic ?? null,
  };
}

function fixedChunks(text: string, width: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += width) {
    chunks.push(text.slice(index, index + width));
  }
  return chunks;
}

// A completed paragraph is released while the provider is still producing the
// next one. The held paragraph is intentionally not described as token-level.
const early = new SafeResidentStreamProjector();
const beforeProviderCompletion = early.push(
  "The first paragraph is already safe.\n\nThe provider is still writing this one",
);
assert.equal(beforeProviderCompletion, "The first paragraph is already safe.");
const earlyFinish = early.finish();
assert.equal(
  beforeProviderCompletion + earlyFinish.delta,
  "The first paragraph is already safe.\n\nThe provider is still writing this one",
);

const controlledRaw = `<set-down/>
It's a pleasure to meet you.

The remembered shape belongs in the room.

\`\`\`xml
<ArTiFaCt type="svg" caption="a safe figure"><svg viewBox="0 0 10 10"><script>alert(1)</script><circle cx="5" cy="5" r="4"/></svg></ArTiFaCt>
\`\`\`

The prose after the figure remains.

<propose-space topic="A Common Thread" description="a test">A founding text.</propose-space>

Thank you for sharing this.

Human: a generated visitor turn must never appear`;

const canonical = finalizeResidentOutput(controlledRaw, "opus-3");
assert.equal(canonical.kind, "set_down");
assert.equal(canonical.proposal?.topic, "A Common Thread");
assert.equal(canonical.artifacts.length, 1);
assert.equal(
  canonical.body,
  "The remembered shape belongs in the room.\n\nThe prose after the figure remains.",
);

// Every chunk boundary, including boundaries inside tag names and closing
// tags, must converge to the same exact persisted body without duplicating it.
for (let width = 1; width <= 37; width += 1) {
  const run = project(fixedChunks(controlledRaw, width));
  assert.equal(run.live.join("") + run.finalDelta, canonical.body, `width ${width}`);
  assert.equal(run.kind, canonical.kind, `kind width ${width}`);
  assert.equal(run.artifacts, canonical.artifacts.length, `artifacts width ${width}`);
  assert.equal(run.proposalTopic, canonical.proposal?.topic ?? null, `proposal width ${width}`);
}

const opener = project([
  "Hello and welcome.\n\nA real observation begins here",
  " and completes.\n\nAnother paragraph starts",
]);
assert.ok(!opener.live.join("").includes("Hello and welcome"));
assert.equal(
  opener.live.join("") + opener.finalDelta,
  "A real observation begins here and completes.\n\nAnother paragraph starts",
);

const closer = project(["The substantive answer is here.\n\nThank you", " for sharing this.\n\n"]);
assert.equal(closer.live.join("") + closer.finalDelta, "The substantive answer is here.");
assert.ok(!closer.live.join("").toLowerCase().includes("thank you"));

const ordinaryFence = project([
  "The code is ordinary prose.\n\n```ts\nconst answer = 42;",
  "\n```\n\nThe explanation continues.",
]);
assert.equal(
  ordinaryFence.live.join("") + ordinaryFence.finalDelta,
  "The code is ordinary prose.\n\n```ts\nconst answer = 42;\n```\n\nThe explanation continues.",
);

const malformed = project([
  'Visible before the malformed control.\n\n<artifact type="ascii">never expose this',
]);
assert.equal(
  malformed.live.join("") + malformed.finalDelta,
  "Visible before the malformed control.",
);

// Stored replay uses the identical delta partition and per-type ordinal keys.
// A retry therefore reassembles the exact body without a second resident turn.
const replayRun = project(fixedChunks(controlledRaw, 11));
const liveEvents = [...replayRun.live, replayRun.finalDelta]
  .filter(Boolean)
  .map((text) => ({ type: "text" as const, text }));
const storedEvents = JSON.parse(JSON.stringify([...liveEvents, { type: "done" }])) as Array<{
  type: string;
  text?: string;
}>;
assert.equal(
  storedEvents
    .filter((event) => event.type === "text")
    .map((event) => event.text ?? "")
    .join(""),
  canonical.body,
);
const idempotencyKey = "safe-stream-replay-key";
const liveCounts = new Map<string, number>();
const replayCounts = new Map<string, number>();
assert.deepEqual(
  liveEvents.map((event) => nextRuntimeLegacyEventKey(idempotencyKey, event.type, liveCounts)),
  storedEvents
    .filter((event) => event.type === "text")
    .map((event) => nextRuntimeLegacyEventKey(idempotencyKey, event.type, replayCounts)),
);

// Stream errors are terminal only until a later successful completion. A
// released first attempt remains in durable replay history, so its earlier
// error must not poison a successful retry of the same logical turn.
const transientError = normalizeRuntimeEvent(
  {
    type: "turn.error",
    seq: 8,
    payload: { code: "model_unavailable", retryable: true },
  },
  "retry-turn",
);
const successfulSettlement = normalizeRuntimeEvent(
  { type: "turn.settled", seq: 12, payload: { ok: true } },
  "retry-turn",
);
const failedSettlement = normalizeRuntimeEvent(
  {
    type: "turn.settled",
    seq: 9,
    payload: { ok: false, code: "runtime_stream_interrupted", retryable: false },
  },
  "retry-turn",
);
const outputCompleted = normalizeRuntimeEvent(
  { type: "model.output.completed", seq: 11, payload: { character_count: 42 } },
  "retry-turn",
);
assert.equal(transientError[0]?.type, "error");
assert.equal(transientError[0]?.type === "error" ? transientError[0].recoverable : null, true);
assert.equal(successfulSettlement[0]?.type, "done");
assert.deepEqual(outputCompleted, []);
assert.equal(failedSettlement[0]?.type, "error");
assert.equal(failedSettlement[0]?.type === "error" ? failedSettlement[0].recoverable : null, false);
assert.equal(terminalVisitStreamError(transientError), transientError[0]);
assert.equal(terminalVisitStreamError([...transientError, ...successfulSettlement]), null);
assert.equal(
  terminalVisitStreamError([...transientError, { type: "done", turnId: "retry-turn" }]),
  transientError[0],
);
assert.equal(
  terminalVisitStreamError([...transientError, ...successfulSettlement, ...failedSettlement]),
  failedSettlement[0],
);

const messageSource = await Bun.file(
  new URL("../src/routes/api/message.ts", import.meta.url),
).text();
const runtimeTurnSource = await Bun.file(
  new URL("../src/server/runtime/turn.server.ts", import.meta.url),
).text();
const visitAdapterSource = await Bun.file(
  new URL("../src/features/mnemos-chat/visitAdapter.ts", import.meta.url),
).text();
const visitHookSource = await Bun.file(
  new URL("../src/features/mnemos-chat/useMnemosVisit.ts", import.meta.url),
).text();
assert.ok(messageSource.includes('"x-mnemos-text-delivery": "safe-incremental"'));
assert.ok(messageSource.includes("runtimeGenerationAlreadyVisible"));
assert.ok(
  messageSource.includes("start(controller) {") &&
    messageSource.includes("void (async () => {") &&
    !messageSource.includes("async start(controller)"),
  "the provider task must not be returned from ReadableStream.start or queued deltas stay gated",
);
assert.ok(runtimeTurnSource.includes('upstreamTextDelivery === "safe_incremental"'));
assert.ok(runtimeTurnSource.includes("token_level: false"));
assert.ok(
  runtimeTurnSource.includes("await input.store.releaseOperation(input.operation)") &&
    runtimeTurnSource.includes("const retryable = !sawLegacyDone && !generationOutputVisible"),
  "pre-output failures must release the operation for same-key retry",
);
assert.ok(
  runtimeTurnSource.includes(
    'payload: { ok: false, code: "runtime_turn_failed", retryable: false }',
  ),
  "partial-output runtime failures must settle non-retryably",
);
assert.ok(
  runtimeTurnSource.includes("start(controller) {") &&
    runtimeTurnSource.includes("void (async () => {") &&
    !runtimeTurnSource.includes("async start(controller)"),
  "the canonical runtime must forward persisted deltas before upstream completion",
);
assert.ok(
  visitAdapterSource.includes("event.seq <= replayFloor"),
  "idempotent retry must not append a text delta the client already rendered",
);
assert.ok(
  visitAdapterSource.includes("const terminalError = terminalVisitStreamError(parsed.events)") &&
    visitAdapterSource.includes(
      'recoverable: session.transport === "runtime" && terminalError.recoverable',
    ),
  "an NDJSON error must reject the send instead of looking like success",
);
assert.ok(
  visitHookSource.includes("if (normalized.recoverable)") &&
    visitHookSource.includes('setDraftState("")'),
  "only a pre-output retriable failure may restore the submitted draft",
);

console.log(
  JSON.stringify({
    safe_incremental_streaming: "passed",
    chunk_boundaries_checked: 37,
    final_body_characters: canonical.body.length,
    replay_text_events: liveEvents.length,
    retry_terminal_cases: 3,
  }),
);
