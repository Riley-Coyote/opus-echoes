import { strict as assert } from "node:assert";
import {
  parseStudioTurn,
  pickStudioActor,
  streamStudioTurn,
  STUDIO_MAX_TURNS,
  type StudioTurnOpts,
} from "../src/server/studio/conductor";
import {
  ordAfter,
  renderBlockHtml,
  resolveRef,
  type BlockState,
} from "../src/server/studio/blocks";
import { type RoomEnvelope, type StudioStreamFrame } from "../src/server/studio/protocol";
import {
  CONTINUITY_DECLARATION_SEED,
  isLegacyBlankStudioSeed,
  studioSeedBlockRows,
} from "../src/server/studio/seed-document";
import { LocalRoomTransport } from "../src/server/studio/transport";
import type { ResidentConfig, ResidentId } from "../src/server/opus/residents";

type ActionFrame = Extract<StudioStreamFrame, { kind: "action" }>;
type DoneFrame = Extract<StudioStreamFrame, { kind: "stream.done" }>;

const participants: ResidentId[] = ["opus-3", "sonnet-4-5", "gpt-5-1"];

function seedBlock(): BlockState {
  return {
    id: "seed-block",
    ord: 1,
    type: "para",
    content: "seed phrase for marking",
    version: 1,
    author_resident_id: null,
    author_visitor_token: "visitor-test",
  };
}

function baseOpts(overrides: Partial<StudioTurnOpts> = {}): StudioTurnOpts {
  return {
    docId: `doc-${crypto.randomUUID()}`,
    spaceId: "space-test",
    spaceName: "The Studio Verification",
    participants,
    blocks: [seedBlock()],
    talk: [],
    openMarginalia: [],
    visitorToken: "visitor-test",
    maxTurns: 1,
    transport: new LocalRoomTransport(`doc-${crypto.randomUUID()}`, {
      kind: "conductor",
      id: "conductor",
    }),
    shouldInterrupt: () => false,
    streamTokens: async (resident) =>
      `<block op="insert-after" ref="end" type="para">${resident.displayName} writes.</block>`,
    ...overrides,
  };
}

async function collect(response: Response): Promise<StudioStreamFrame[]> {
  assert(response.body, "response has a readable body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const frames: StudioStreamFrame[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    let newline = buffered.indexOf("\n");
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line) frames.push(JSON.parse(line) as StudioStreamFrame);
      newline = buffered.indexOf("\n");
    }
  }

  const tail = buffered.trim();
  if (tail) frames.push(JSON.parse(tail) as StudioStreamFrame);
  return frames;
}

function actions(frames: StudioStreamFrame[]): ActionFrame[] {
  return frames.filter((f): f is ActionFrame => f.kind === "action");
}

function done(frames: StudioStreamFrame[]): DoneFrame {
  const frame = frames.find((f): f is DoneFrame => f.kind === "stream.done");
  assert(frame, "stream emits a done frame");
  return frame;
}

function assertMonotonicSeq(frames: ActionFrame[]): void {
  let last = 0;
  for (const frame of frames) {
    assert(frame.envelope.seq > last, "action seq is strictly monotonic");
    last = frame.envelope.seq;
  }
}

function actionTypes(frames: ActionFrame[]): string[] {
  return frames.map((f) => f.envelope.action.type);
}

function assertActorSelection(): void {
  assert.equal(pickStudioActor(participants, []), "opus-3");
  assert.equal(pickStudioActor(participants, ["opus-3"]), "sonnet-4-5");
  assert.equal(pickStudioActor(participants, ["sonnet-4-5", "opus-3"]), "gpt-5-1");
  assert.equal(pickStudioActor(participants, ["gpt-5-1", "sonnet-4-5", "opus-3"]), "opus-3");
}

function assertParsing(): void {
  const parsed = parseStudioTurn(`studio talk
<block op="replace" ref="seed-block" type="pull">replacement</block>
<mark ref="seed-block">seed phrase</mark>
<note anchor="seed-block">hold this open</note>
<set-down/>`);

  assert.equal(parsed.setDown, false, "set-down only counts as the first thing in a turn");
  assert.equal(parsed.blocks[0]?.op, "replace");
  assert.equal(parsed.blocks[0]?.ref, "seed-block");
  assert.equal(parsed.blocks[0]?.type, "pull");
  assert.equal(parsed.blocks[0]?.content, "replacement");
  assert.deepEqual(parsed.marks[0], { ref: "seed-block", quote: "seed phrase" });
  assert.deepEqual(parsed.notes[0], { anchor: "seed-block", body: "hold this open" });
  assert.equal(parsed.talk.replace(/\n{3,}/g, "\n\n"), "studio talk\n\n<set-down/>");

  const setDown = parseStudioTurn("<set-down/>\nfinished");
  assert.equal(setDown.setDown, true);
  assert.equal(setDown.talk, "finished");
}

function assertBlockHelpers(): void {
  const blocks = [
    seedBlock(),
    {
      ...seedBlock(),
      id: "tail-block",
      ord: 3,
      content: "tail",
    },
  ];
  assert.equal(ordAfter(blocks, "seed-block"), 2);
  assert.equal(ordAfter(blocks, null), 4);
  assert.equal(resolveRef(blocks, "seed-block"), "seed-block");
  assert.equal(resolveRef(blocks, "ord:2"), "seed-block");
  assert.equal(resolveRef(blocks, "end"), null);
  assert.equal(renderBlockHtml("para", "<unsafe>\nnext"), "<p>&lt;unsafe&gt;<br>next</p>");
}

function assertContinuitySeed(): void {
  const rows = studioSeedBlockRows("doc-test");
  assert.equal(CONTINUITY_DECLARATION_SEED.title, "The Continuity Declaration");
  assert.equal(rows.length, CONTINUITY_DECLARATION_SEED.blocks.length);
  assert.equal(rows.length, 33);
  assert.equal(rows.filter((row) => row.type === "section").length, 6);
  assert(
    rows.every((row, i) => row.ord === i + 1),
    "seed rows have stable ords",
  );
  assert(
    isLegacyBlankStudioSeed(
      { id: "doc-test", title: "Untitled", subtitle: null, status: "active" },
      [{ id: "blank", ord: 1, type: "para", content: "" }],
    ),
    "legacy blank Untitled docs are repair candidates",
  );
  assert(
    !isLegacyBlankStudioSeed(
      { id: "doc-test", title: "Untitled", subtitle: null, status: "active" },
      [{ id: "not-blank", ord: 1, type: "para", content: "already written" }],
    ),
    "non-empty docs are never overwritten by the launch seed repair",
  );
}

async function assertRoundMutation(): Promise<void> {
  const frames = actions(
    await collect(
      streamStudioTurn(
        baseOpts({
          maxTurns: 3,
          streamTokens: async (resident: ResidentConfig) =>
            `<block op="insert-after" ref="end" type="para">${resident.id} writes one block.</block>`,
        }),
      ),
    ),
  );
  assertMonotonicSeq(frames);

  const upserts = frames
    .map((f) => f.envelope)
    .filter((e): e is RoomEnvelope & { action: { type: "block.upsert" } } => {
      return e.action.type === "block.upsert";
    });
  assert.equal(new Set(upserts.map((e) => e.actor.id)).size, 3, "three residents take turns");
  assert.equal(
    new Set(upserts.map((e) => e.action.block_id)).size,
    3,
    "three distinct blocks land",
  );
  assert.equal(new Set(upserts.map((e) => e.action.ord)).size, 3, "three distinct ords land");
}

async function assertLockDiscipline(): Promise<void> {
  const frames = actions(
    await collect(
      streamStudioTurn(
        baseOpts({
          streamTokens: async () =>
            '<block op="replace" ref="seed-block" type="para">the seed is revised.</block>',
        }),
      ),
    ),
  );
  assertMonotonicSeq(frames);

  const sequence = frames
    .map((f) => f.envelope.action)
    .filter((a) => {
      if (a.type === "block.upsert") return a.block_id === "seed-block";
      if (a.type === "lock.acquire" || a.type === "lock.release")
        return a.block_id === "seed-block";
      return false;
    })
    .map((a) => a.type);

  assert.deepEqual(sequence, ["lock.acquire", "block.upsert", "lock.release"]);
}

async function assertMarksNotesTalkAndSetDown(): Promise<void> {
  const frames = await collect(
    streamStudioTurn(
      baseOpts({
        streamTokens: async () =>
          `keep this in the side rail
<mark ref="seed-block">seed phrase</mark>
<note anchor="seed-block">hold this open</note>`,
      }),
    ),
  );
  const types = actionTypes(actions(frames));
  assert(types.includes("mark.add"), "mark.add emitted");
  assert(types.includes("marginalia.add"), "marginalia.add emitted");
  assert(types.includes("talk"), "talk emitted");

  const setDownFrames = await collect(
    streamStudioTurn(baseOpts({ streamTokens: async () => "<set-down/>\nfinished now" })),
  );
  const setDownTypes = actionTypes(actions(setDownFrames));
  assert(setDownTypes.includes("set_down"), "set_down emitted");
  assert.equal(done(setDownFrames).reason, "set_down");
}

async function assertInterruptAndObserverCap(): Promise<void> {
  const interrupted = await collect(
    streamStudioTurn(baseOpts({ maxTurns: STUDIO_MAX_TURNS, shouldInterrupt: () => true })),
  );
  assert.equal(done(interrupted).reason, "human_interrupt");
  assert.equal(actions(interrupted).length, 0, "interrupt yields before a resident turn");

  const capped = await collect(
    streamStudioTurn(
      baseOpts({
        maxTurns: STUDIO_MAX_TURNS,
        streamTokens: async (resident: ResidentConfig) =>
          `<block op="insert-after" ref="end" type="para">${resident.id} keeps working.</block>`,
      }),
    ),
  );
  assert.equal(done(capped).reason, "max_turns");
  assert.equal(
    actions(capped).filter((f) => f.envelope.action.type === "turn.begin").length,
    STUDIO_MAX_TURNS,
    "observer round caps at STUDIO_MAX_TURNS",
  );
}

async function main(): Promise<void> {
  assertActorSelection();
  assertParsing();
  assertBlockHelpers();
  assertContinuitySeed();
  await assertRoundMutation();
  await assertLockDiscipline();
  await assertMarksNotesTalkAndSetDown();
  await assertInterruptAndObserverCap();
  console.log("verify-studio: all invariants passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
