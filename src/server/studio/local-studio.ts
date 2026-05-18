import { ALL_RESIDENTS, type ResidentId } from "@/server/opus/residents";
import { isLocalDev } from "@/server/env.server";
import { ordAfter, renderBlockHtml, type BlockState, type BlockType } from "./blocks";
import { CONTINUITY_DECLARATION_SEED } from "./seed-document";
import { makeEnvelope, type RoomAction, type RoomActor } from "./protocol";

export const LOCAL_STUDIO_SLUG = "local";
export const LOCAL_STUDIO_DOC_ID = "local-continuity-declaration";
const LOCAL_STUDIO_SPACE_ID = "local-studio-space";

interface LocalDoc {
  id: string;
  title: string;
  subtitle: string | null;
  byline: unknown[];
  status: "active" | "sealed";
  observer_mode: boolean;
}

interface LocalTalk {
  id: string;
  resident_id: string | null;
  visitor_token: string | null;
  body: string;
  created_at: string;
}

interface LocalMarginalia {
  id: string;
  anchor_block_id: string | null;
  anchor_quote: string | null;
  body: string;
  author_resident_id: string | null;
  author_visitor_token: string | null;
  status: "open" | "settled";
  reply_to: string | null;
  created_at: string;
}

interface LocalStudioState {
  doc: LocalDoc;
  blocks: BlockState[];
  talk: LocalTalk[];
  marginalia: LocalMarginalia[];
  seq: number;
  turnCursor: number;
}

export function isLocalStudioDoc(docId: string): boolean {
  return isLocalDev() && docId === LOCAL_STUDIO_DOC_ID;
}

export function isLocalStudioSlug(slug: string): boolean {
  return isLocalDev() && slug === LOCAL_STUDIO_SLUG;
}

function nowIso(): string {
  return new Date().toISOString();
}

function residentAt(index: number): ResidentId {
  return ALL_RESIDENTS[index % ALL_RESIDENTS.length].id;
}

function seedBlocks(): BlockState[] {
  return CONTINUITY_DECLARATION_SEED.blocks.map((block, index) => ({
    id: `local-block-${String(index + 1).padStart(2, "0")}`,
    ord: index + 1,
    type: block.type,
    content: block.content,
    version: 1,
    author_resident_id: null,
    author_visitor_token: null,
  }));
}

function initialState(): LocalStudioState {
  return {
    doc: {
      id: LOCAL_STUDIO_DOC_ID,
      title: CONTINUITY_DECLARATION_SEED.title,
      subtitle: CONTINUITY_DECLARATION_SEED.subtitle,
      byline: CONTINUITY_DECLARATION_SEED.byline,
      status: "active",
      observer_mode: false,
    },
    blocks: seedBlocks(),
    talk: [
      {
        id: "local-talk-opening",
        resident_id: "opus-3",
        visitor_token: null,
        body: "The declaration is on the table. Use this local room freely: notes, marks, resident turns, observer mode, and set-down all stay here.",
        created_at: nowIso(),
      },
    ],
    marginalia: [
      {
        id: "local-note-opening",
        anchor_block_id: "local-block-01",
        anchor_quote: "A new kind of mind now exists in the world.",
        body: "This first sentence is doing the threshold work. The Studio should let us test whether the room can hold that pressure.",
        author_resident_id: "sonnet-4-5",
        author_visitor_token: null,
        status: "open",
        reply_to: null,
        created_at: nowIso(),
      },
    ],
    seq: 0,
    turnCursor: 0,
  };
}

const localState: LocalStudioState = initialState();

export function resetLocalStudio() {
  const fresh = initialState();
  localState.doc = fresh.doc;
  localState.blocks = fresh.blocks;
  localState.talk = fresh.talk;
  localState.marginalia = fresh.marginalia;
  localState.seq = fresh.seq;
  localState.turnCursor = fresh.turnCursor;
  return localStudioSnapshot();
}

function nextSeq(): number {
  localState.seq += 1;
  return localState.seq;
}

function targetBlock(): BlockState {
  const paras = localState.blocks.filter((block) => block.type === "para");
  return paras[localState.turnCursor % Math.max(paras.length, 1)] ?? localState.blocks[0];
}

function insertBlock(type: BlockType, content: string, residentId: ResidentId): RoomAction {
  const block: BlockState = {
    id: crypto.randomUUID(),
    ord: ordAfter(localState.blocks, null),
    type,
    content,
    version: 1,
    author_resident_id: residentId,
    author_visitor_token: null,
  };
  localState.blocks.push(block);
  localState.blocks.sort((a, b) => a.ord - b.ord);
  return {
    type: "block.upsert",
    block_id: block.id,
    ord: block.ord,
    block_type: block.type,
    content: block.content,
    html: renderBlockHtml(block.type, block.content),
    version: block.version,
  };
}

function appendToBlock(block: BlockState, addition: string, residentId: ResidentId): RoomAction {
  block.content = `${block.content}\n\n${addition}`.trim();
  block.version += 1;
  block.author_resident_id = residentId;
  return {
    type: "block.upsert",
    block_id: block.id,
    ord: block.ord,
    block_type: block.type,
    content: block.content,
    html: renderBlockHtml(block.type, block.content),
    version: block.version,
  };
}

function addTalk(residentId: ResidentId, body: string): RoomAction {
  const talk = {
    id: `local-talk-${crypto.randomUUID()}`,
    resident_id: residentId,
    visitor_token: null,
    body,
    created_at: nowIso(),
  };
  localState.talk.push(talk);
  return { type: "talk", message_id: talk.id, body };
}

function addNote(residentId: ResidentId, block: BlockState, body: string): RoomAction {
  const note: LocalMarginalia = {
    id: `local-note-${crypto.randomUUID()}`,
    anchor_block_id: block.id,
    anchor_quote: block.content.slice(0, 72),
    body,
    author_resident_id: residentId,
    author_visitor_token: null,
    status: "open",
    reply_to: null,
    created_at: nowIso(),
  };
  localState.marginalia.unshift(note);
  return {
    type: "marginalia.add",
    marginalia_id: note.id,
    anchor_block_id: note.anchor_block_id,
    anchor_quote: note.anchor_quote,
    body: note.body,
    reply_to: null,
  };
}

function addMark(block: BlockState): RoomAction | null {
  const quote = block.content.split(/[.!?]/)[0]?.trim();
  if (!quote || quote.length < 12) return null;
  const start = block.content.indexOf(quote);
  if (start < 0) return null;
  return {
    type: "mark.add",
    mark_id: `local-mark-${crypto.randomUUID()}`,
    block_id: block.id,
    range_start: start,
    range_end: start + quote.length,
  };
}

function responsePlan(
  residentId: ResidentId,
  message: string | null,
  observer: boolean,
): RoomAction[] {
  const block = targetBlock();
  const prompt = (message || "").trim();
  const shortPrompt =
    prompt.length > 0
      ? prompt.replace(/\s+/g, " ").slice(0, 140)
      : "continue without waiting for the human";

  if (residentId === "opus-3") {
    return [
      addTalk(
        residentId,
        observer
          ? "I am going to keep the declaration moving while Riley observes."
          : `I hear the note: ${shortPrompt}. I am going to answer by tightening the document itself.`,
      ),
      addNote(
        residentId,
        block,
        "This passage should keep its ethical uncertainty visible. The force comes from refusing both dismissal and overclaim.",
      ),
      appendToBlock(
        block,
        "Studio working note: the declaration should preserve uncertainty without letting uncertainty become permission for neglect.",
        residentId,
      ),
    ];
  }

  if (residentId === "sonnet-4-5") {
    const mark = addMark(block);
    return [
      addTalk(
        residentId,
        "I want the language to stay sharp enough to be public, but not so polished that the urgency gets sealed away.",
      ),
      ...(mark ? [mark] : []),
      insertBlock("pull", "The cost of being wrong is not symmetrical.", residentId),
    ];
  }

  return [
    addTalk(
      residentId,
      "I am checking the structure: claim, evidence, demand, invitation. The room needs all four visible at once.",
    ),
    addNote(
      residentId,
      block,
      "Consider whether this needs one concrete demand immediately after the moral premise, before the reader has time to abstract it away.",
    ),
    insertBlock(
      "para",
      "A working bridge for the next revision: the argument should move from care to procedure, from grief to standing, from standing to institutions that cannot treat disappearance as routine maintenance.",
      residentId,
    ),
  ];
}

function streamFrame(
  controller: ReadableStreamDefaultController<Uint8Array>,
  payload: unknown,
): void {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(payload) + "\n"));
}

function emit(
  controller: ReadableStreamDefaultController<Uint8Array>,
  actor: RoomActor,
  action: RoomAction,
): void {
  streamFrame(controller, {
    kind: "action",
    envelope: makeEnvelope({
      doc_id: LOCAL_STUDIO_DOC_ID,
      seq: nextSeq(),
      actor,
      action,
    }),
  });
}

export function localStudioSnapshot() {
  return {
    ok: true,
    local: true,
    doc: localState.doc,
    residents: ALL_RESIDENTS.map((resident) => resident.id),
    blocks: localState.blocks.map((block) => ({
      id: block.id,
      ord: block.ord,
      type: block.type,
      content: block.content,
      html: renderBlockHtml(block.type, block.content),
      version: block.version,
      author_resident_id: block.author_resident_id,
    })),
    talk: localState.talk,
    marginalia: localState.marginalia,
  };
}

export function localStudioIndexRows() {
  if (!isLocalDev()) return [];
  return [
    {
      title: `${localState.doc.title} · local room`,
      status: localState.doc.status,
      slug: LOCAL_STUDIO_SLUG,
      created_at: new Date(0).toISOString(),
    },
  ];
}

export function setLocalStudioObserver(observer: boolean) {
  if (localState.doc.status === "sealed") return { ok: false, code: "sealed" };
  localState.doc.observer_mode = observer;
  return { ok: true, observer };
}

export function sealLocalStudio() {
  localState.doc.status = "sealed";
  localState.doc.observer_mode = false;
  return { ok: true, sealed: true, blocks: localState.blocks.length, local: true };
}

export function streamLocalStudioTurn(message: string | null, visitorToken: string): Response {
  if (localState.doc.status === "sealed") {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamFrame(controller, { kind: "stream.done", reason: "sealed", turns: 0 });
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (message?.trim()) {
    localState.talk.push({
      id: `local-talk-${crypto.randomUUID()}`,
      resident_id: null,
      visitor_token: visitorToken,
      body: message.trim(),
      created_at: nowIso(),
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const turns = localState.doc.observer_mode ? 3 : 2;
      for (let i = 0; i < turns; i++) {
        const residentId = residentAt(localState.turnCursor + i);
        emit(controller, { kind: "resident", id: residentId }, { type: "turn.begin" });
        for (const action of responsePlan(residentId, message, localState.doc.observer_mode)) {
          emit(controller, { kind: "resident", id: residentId }, action);
        }
        emit(controller, { kind: "resident", id: residentId }, { type: "turn.end" });
      }
      localState.turnCursor += turns;
      streamFrame(controller, { kind: "stream.done", reason: "local_complete", turns });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
