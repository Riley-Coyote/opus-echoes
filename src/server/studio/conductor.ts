/**
 * The Studio conductor (P2).
 *
 * The authority. A synchronous await-loop inside ONE long-lived
 * NDJSON `ReadableStream` request — the exact shape proven by
 * `streamGatheringExtended` (12–30 turns in one response; the Worker
 * isolate stays alive while the stream is written, most wall time is
 * model-wait, low CPU). Not fire-and-forget (the isolate dies when
 * the Response ends), not Durable Objects (net-new infra; the
 * documented post-v1 upgrade — the RoomTransport seam makes it a
 * drop-in).
 *
 * Per turn, structurally mirroring the gathering loop:
 *   pickStudioActor → provider check → composeMemoryPool →
 *   system(soul + memory + the document rendered + open marginalia +
 *   the tag grammar) → stream tokens (live caret via coalescer) →
 *   parse the tag grammar → for each block: acquire lock → persist
 *   (truth) → broadcast (projection) → release → stop conditions.
 *
 * The model emits a tag grammar extending the proven `<artifact>`
 * parser:
 *   <block op="replace|append|insert-after" ref="<id>|ord:<n>|end"
 *          type="para|section|pull|em_strong">…prose…</block>
 *   <mark ref="<id>">exact quoted span</mark>
 *   <note anchor="<id>">marginalia body</note>
 *   <set-down/>            (first thing in a turn = close)
 *   prose outside tags     = a `talk` line (→ space_messages)
 *
 * Transport is injected (`RoomTransport`): SupabaseRoomTransport in
 * the route, LocalRoomTransport for the scripted local test (no
 * Supabase creds) — the conductor depends on neither concretely.
 * Durable actions persist to Postgres BEFORE broadcast
 * (truth-then-projection); typing/presence are ephemeral.
 */

import { anthropic } from "@/server/anthropic.server";
import { openai } from "@/server/openai.server";
import {
  getResident,
  isResidentId,
  type ResidentConfig,
  type ResidentId,
} from "@/server/opus/residents";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { composeMemoryPool, formatMemoryBlock } from "@/server/opus/retrieval";
import { surfacePreamble } from "@/server/opus/surface-context";
import {
  type BlockState,
  type BlockType,
  isBlockType,
  ordAfter,
  renderBlockHtml,
  resolveRef,
} from "./blocks";
import { CONDUCTOR_ACTOR, makeEnvelope, type RoomAction, type RoomActor } from "./protocol";
import { type RoomTransport, TYPING_DEGRADE_AFTER_FAILS, TypingCoalescer } from "./transport";

/** A line in the Studio talk rail (space_messages projection). */
export interface TalkMsg {
  resident_id: string | null;
  visitor_token: string | null;
  body: string;
}

/** Manuscript turn budget. A block or two of prose — NOT a resident's
 *  full maxOutputTokens (opus-3 is 4096 @ $15/MTok; keep turns tight
 *  and the cost bounded). Per-turn = min(resident cap, this). */
export const STUDIO_PER_TURN_TOKENS = 1400 as const;

/** Observer autonomous round cap — mirrors VISITOR_MAX_TURNS_IN_GATHERING. */
export const STUDIO_MAX_TURNS = 12 as const;

const sb = () =>
  supabaseAdmin as unknown as {
    from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
  };

/* ─────────────────────── actor selection ───────────────────────── */

/**
 * Recency "most-owed" over the doc's resident participants — the
 * pickResponder discipline, but driven by an in-loop recency list
 * the conductor maintains (block authorship + talk). The participant
 * absent longest from the recent set speaks next.
 */
export function pickStudioActor(
  participants: ResidentId[],
  recencyNewestFirst: ResidentId[],
): ResidentId {
  const ps = participants.filter(isResidentId);
  if (ps.length === 0) return "opus-3";
  for (const p of ps) {
    if (!recencyNewestFirst.includes(p)) return p;
  }
  // All have spoken recently — the one who spoke longest ago is last
  // in newest-first order.
  for (let i = recencyNewestFirst.length - 1; i >= 0; i--) {
    if (ps.includes(recencyNewestFirst[i])) return recencyNewestFirst[i];
  }
  return ps[0];
}

/* ─────────────────────── tag-grammar parse ─────────────────────── */

export interface ParsedBlockOp {
  op: "replace" | "append" | "insert-after";
  ref: string | null;
  type: BlockType;
  content: string;
}
export interface ParsedMark {
  ref: string;
  quote: string;
}
export interface ParsedNote {
  anchor: string | null;
  body: string;
}
export interface ParsedTurn {
  setDown: boolean;
  blocks: ParsedBlockOp[];
  marks: ParsedMark[];
  notes: ParsedNote[];
  talk: string;
}

const SET_DOWN_RE = /^<\s*set[\s-]?down\s*\/?\s*>/i;
const BLOCK_RE = /<block\s+([^>]*)>([\s\S]*?)<\/block>/gi;
const MARK_RE = /<mark\s+([^>]*)>([\s\S]*?)<\/mark>/gi;
const NOTE_RE = /<note\s*([^>]*)>([\s\S]*?)<\/note>/gi;

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1].trim() : null;
}

/** Parse a completed turn buffer into structured ops. Mirrors the
 *  proven artifact-regex approach; strips tags so residual prose is
 *  the `talk` line. */
export function parseStudioTurn(raw: string): ParsedTurn {
  const trimmed = raw.trim();
  const setDown = SET_DOWN_RE.test(trimmed);
  const body = setDown ? trimmed.replace(SET_DOWN_RE, "").trim() : trimmed;

  const blocks: ParsedBlockOp[] = [];
  let m: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(body)) !== null) {
    const a = m[1] || "";
    const opRaw = (attr(a, "op") || "insert-after").toLowerCase();
    const op = opRaw === "replace" || opRaw === "append" ? opRaw : "insert-after";
    const tRaw = (attr(a, "type") || "para").toLowerCase();
    const type: BlockType = isBlockType(tRaw) ? tRaw : "para";
    blocks.push({ op, ref: attr(a, "ref"), type, content: (m[2] || "").trim() });
  }

  const marks: ParsedMark[] = [];
  MARK_RE.lastIndex = 0;
  while ((m = MARK_RE.exec(body)) !== null) {
    const ref = attr(m[1] || "", "ref");
    const quote = (m[2] || "").trim();
    if (ref && quote) marks.push({ ref, quote });
  }

  const notes: ParsedNote[] = [];
  NOTE_RE.lastIndex = 0;
  while ((m = NOTE_RE.exec(body)) !== null) {
    const noteBody = (m[2] || "").trim();
    if (noteBody) notes.push({ anchor: attr(m[1] || "", "anchor"), body: noteBody });
  }

  const talk = body.replace(BLOCK_RE, "").replace(MARK_RE, "").replace(NOTE_RE, "").trim();

  return { setDown, blocks, marks, notes, talk };
}

/* ─────────────────────── system prompt ─────────────────────────── */

/** The document rendered for the model — separate from talk history
 *  (the document serializes separately; verified P0.1 finding). */
function renderDocumentForModel(blocks: BlockState[]): string {
  if (blocks.length === 0) return "(the document is empty — begin it)";
  return blocks
    .slice()
    .sort((a, b) => a.ord - b.ord)
    .map((b) => `[block ${b.id} · ${b.type}]\n${b.content || "(empty)"}`)
    .join("\n\n");
}

function buildStudioSystem(
  resident: ResidentConfig,
  spaceName: string,
  memoryBlock: string,
  blocks: BlockState[],
  openMarginalia: Array<{ id: string; body: string }>,
  maxTurnsLeft: number,
): string {
  const preamble = surfacePreamble("commons-room", {
    resident,
    spaceName,
  });
  const doc = renderDocumentForModel(blocks);
  const notes = openMarginalia.length
    ? openMarginalia.map((n) => `- (${n.id}) ${n.body}`).join("\n")
    : "(none open)";

  const grammar = `
# The Studio

You are co-authoring one living document with the other residents and the human, in real time. You act by emitting tags inline in your turn. Prose OUTSIDE any tag is talk in the side rail (thinking aloud, addressing the others) — keep it short.

- <block op="replace|append|insert-after" ref="<block-id>|ord:<n>|end" type="para|section|pull|em_strong">…the prose…</block>
  Write or revise one block. \`replace\` rewrites the referenced block; \`append\` adds to its end; \`insert-after\` makes a new block after \`ref\` (use ref="end" for the document's end). Keep each block to a single coherent paragraph or heading.
- <mark ref="<block-id>">an exact quoted span from that block</mark> — highlight a passage to draw the others' attention.
- <note anchor="<block-id>">a marginal comment</note> — leave anchored marginalia (a question, an objection, a direction).
- <set-down/> on its own first line — only when the document feels whole. Don't force it. You have ~${maxTurnsLeft} more turns.

Work WITH what is there. Revise, don't restate. One or two acts per turn — the document breathes across turns, it is not written all at once. Touch a block someone else is actively writing and your write will wait its turn.

# The document so far

${doc}

# Open marginalia

${notes}`;

  return memoryBlock
    ? `${preamble}\n\n${resident.soul}\n\n${memoryBlock}\n\n${grammar}`
    : `${preamble}\n\n${resident.soul}\n\n${grammar}`;
}

function collapseTalk(
  talk: TalkMsg[],
  residentId: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const msgs = talk
    .filter((t) => t.body && t.body.trim())
    .map((t) => ({
      role: (t.resident_id === residentId ? "assistant" : "user") as "user" | "assistant",
      content: t.resident_id
        ? `${getResident(isResidentId(t.resident_id) ? t.resident_id : "opus-3").displayName}: ${t.body}`
        : t.body,
    }));
  const collapsed: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of msgs) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else collapsed.push(m);
  }
  if (collapsed.length === 0 || collapsed[0].role !== "user") {
    collapsed.unshift({ role: "user", content: "(continue the document)" });
  }
  return collapsed;
}

/* ─────────────────────── token streaming ───────────────────────── */

/**
 * Stream one actor's turn. Tokens go to `onDelta` (the conductor
 * coalesces → block.typing). Returns the full buffer for the tag
 * parse. max_tokens respects the per-resident ceiling. Mirrors the
 * proven streamOneResidentTurn shape (temp 0.85, anthropic
 * stop-sequences).
 */
async function streamActorTokens(
  resident: ResidentConfig,
  system: string,
  collapsed: Array<{ role: "user" | "assistant"; content: string }>,
  onDelta: (d: string) => void,
): Promise<string> {
  const maxTokens = Math.min(resident.maxOutputTokens, STUDIO_PER_TURN_TOKENS);
  let buffer = "";
  if (resident.provider === "openai") {
    const stream = await openai().chat.completions.create({
      model: resident.model,
      max_completion_tokens: maxTokens,
      temperature: 0.85,
      stream: true,
      messages: [{ role: "system", content: system }, ...collapsed],
    });
    for await (const chunk of stream) {
      const d = chunk.choices?.[0]?.delta?.content;
      if (d) {
        buffer += d;
        onDelta(d);
      }
    }
  } else {
    const stream = anthropic().messages.stream({
      model: resident.model,
      max_tokens: maxTokens,
      temperature: 0.85,
      stop_sequences: ["\nHuman:", "\nvisitor:"],
      system,
      messages: collapsed,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        buffer += event.delta.text;
        onDelta(event.delta.text);
      }
    }
    await stream.finalMessage();
  }
  return buffer;
}

/* ─────────────────── persistence (truth) ───────────────────────── */

async function acquireLock(blockId: string, holder: ResidentId, ttlMs: number): Promise<boolean> {
  if (!hasSupabaseAdminEnv()) return true; // local test path
  try {
    const { error } = await sb()
      .from("block_locks")
      .insert({
        block_id: blockId,
        holder_resident_id: holder,
        holder_visitor_token: null,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      });
    return !error;
  } catch {
    return false;
  }
}

async function releaseLock(blockId: string): Promise<void> {
  if (!hasSupabaseAdminEnv()) return;
  try {
    await sb().from("block_locks").delete().eq("block_id", blockId);
  } catch {
    /* TTL will reap it */
  }
}

async function persistBlockUpsert(docId: string, b: BlockState, isNew: boolean): Promise<void> {
  if (!hasSupabaseAdminEnv()) return;
  const html = renderBlockHtml(b.type, b.content);
  if (isNew) {
    await sb().from("document_blocks").insert({
      id: b.id,
      document_id: docId,
      ord: b.ord,
      type: b.type,
      content: b.content,
      html_cache: html,
      author_resident_id: b.author_resident_id,
      author_visitor_token: null,
      version: b.version,
    });
  } else {
    await sb()
      .from("document_blocks")
      .update({
        type: b.type,
        content: b.content,
        html_cache: html,
        version: b.version,
        author_resident_id: b.author_resident_id,
      })
      .eq("id", b.id);
  }
}

async function persistMark(
  blockId: string,
  rs: number,
  re: number,
  author: ResidentId,
): Promise<string | null> {
  if (!hasSupabaseAdminEnv()) return `local-mark-${Math.random().toString(36).slice(2, 8)}`;
  const { data } = await sb()
    .from("block_marks")
    .insert({
      block_id: blockId,
      range_start: rs,
      range_end: re,
      author_resident_id: author,
      author_visitor_token: null,
    })
    .select("id")
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function persistNote(
  docId: string,
  anchorBlockId: string | null,
  body: string,
  author: ResidentId,
): Promise<string | null> {
  if (!hasSupabaseAdminEnv()) return `local-note-${Math.random().toString(36).slice(2, 8)}`;
  const { data } = await sb()
    .from("doc_marginalia")
    .insert({
      document_id: docId,
      anchor_block_id: anchorBlockId,
      anchor_quote: null,
      body,
      author_resident_id: author,
      author_visitor_token: null,
      status: "open",
      reply_to: null,
    })
    .select("id")
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function persistTalk(
  spaceId: string,
  residentId: ResidentId,
  body: string,
): Promise<string | null> {
  if (!hasSupabaseAdminEnv()) return `local-talk-${Math.random().toString(36).slice(2, 8)}`;
  const { data } = await sb()
    .from("space_messages")
    .insert({ space_id: spaceId, resident_id: residentId, body, kind: "message" })
    .select("id")
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/* ─────────────────────── the conductor ─────────────────────────── */

export interface StudioTurnOpts {
  docId: string;
  spaceId: string;
  spaceName: string;
  participants: ResidentId[];
  blocks: BlockState[];
  talk: TalkMsg[];
  openMarginalia: Array<{ id: string; body: string }>;
  /** Visitor token threaded into the memory pool (returning-visitor
   *  recognition) — the human in the room. */
  visitorToken: string;
  /** Bounded round length. Observer rounds use STUDIO_MAX_TURNS. */
  maxTurns: number;
  /** Injected relay. Supabase in the route, Local in the test. */
  transport: RoomTransport;
  /** Polled between turns AND at block boundaries — true ⇒ finish the
   *  current block, then yield the floor to the human. */
  shouldInterrupt: () => boolean;
  /** Token-stream override. Defaults to the real model call; a
   *  scripted fn here lets the whole conductor (pick/parse/lock/
   *  interrupt/observer) run locally with no Supabase, no API keys —
   *  the LocalRoomTransport testability the design promises. */
  streamTokens?: (
    resident: ResidentConfig,
    system: string,
    collapsed: Array<{ role: "user" | "assistant"; content: string }>,
    onDelta: (d: string) => void,
  ) => Promise<string>;
}

const LOCK_TTL_MS = 25_000;

/**
 * One conductor request = one bounded round. Returns the NDJSON
 * Response to the originating client; durable actions are persisted
 * then broadcast on the transport for every other client.
 */
export function streamStudioTurn(opts: StudioTurnOpts): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let seq = 0;
      const blocks: BlockState[] = opts.blocks.map((b) => ({ ...b })).sort((a, b) => a.ord - b.ord);
      const recency: ResidentId[] = [];
      let typingFails = 0;

      // Persist (durable) → broadcast → mirror to the originator.
      const emit = async (actor: RoomActor, action: RoomAction) => {
        const env = makeEnvelope({
          doc_id: opts.docId,
          seq: ++seq,
          actor,
          action,
        });
        const ok = await opts.transport.broadcast(env).catch(() => false);
        send({ kind: "action", envelope: env, relayed: ok });
      };

      try {
        let stop = "max_turns";
        let passes = 0;

        for (let turn = 0; turn < opts.maxTurns; turn++) {
          if (opts.shouldInterrupt()) {
            stop = "human_interrupt";
            break;
          }

          const actorId = pickStudioActor(opts.participants, recency);
          const resident = getResident(actorId);
          // When a model is injected (the LocalRoomTransport seam),
          // provider availability is that fn's concern — do NOT gate
          // on env API keys (the seam exists to run without them).
          const providerOk =
            !!opts.streamTokens ||
            (resident.provider === "anthropic" && !!process.env.ANTHROPIC_API_KEY) ||
            (resident.provider === "openai" && !!process.env.OPENAI_API_KEY);
          if (!providerOk) {
            recency.unshift(actorId);
            continue;
          }

          let memoryBlock = "";
          if (hasSupabaseAdminEnv()) {
            try {
              const pool = await composeMemoryPool({
                supabase: supabaseAdmin,
                residentId: resident.id,
                visitorMessage: opts.talk[opts.talk.length - 1]?.body ?? "",
                visitorToken: opts.visitorToken,
              });
              memoryBlock = formatMemoryBlock(pool.pool);
            } catch (err) {
              console.error("[studio] memory pool failed:", err);
            }
          }

          const system = buildStudioSystem(
            resident,
            opts.spaceName,
            memoryBlock,
            blocks,
            opts.openMarginalia,
            opts.maxTurns - turn - 1,
          );
          const collapsed = collapseTalk(opts.talk, resident.id);

          await emit({ kind: "resident", id: resident.id }, { type: "turn.begin" });

          // Live caret: coalesce token deltas onto the actor's
          // *current* target. Until the first <block> opens we don't
          // know the id, so buffer under a provisional key and
          // re-key when the block id is minted.
          const coalescer = new TypingCoalescer();
          const runTokens = opts.streamTokens ?? streamActorTokens;
          let buffer = "";
          try {
            buffer = await runTokens(resident, system, collapsed, (d) => {
              coalescer.push("_pending", d);
            });
          } catch (err) {
            console.error(`[studio] ${resident.id} stream errored:`, err);
            await emit({ kind: "resident", id: resident.id }, { type: "turn.end", passed: true });
            recency.unshift(actorId);
            if (++passes >= 2) {
              stop = "consecutive_errors";
              break;
            }
            continue;
          }
          // Drain any buffered caret (best-effort; never blocks the
          // durable path). Degrade silently after sustained failure.
          if (typingFails < TYPING_DEGRADE_AFTER_FAILS) {
            for (const t of coalescer.flush()) {
              const ok = await opts.transport
                .broadcast(
                  makeEnvelope({
                    doc_id: opts.docId,
                    seq: ++seq,
                    actor: { kind: "resident", id: resident.id },
                    action: { type: "block.typing", block_id: t.block_id, delta: t.delta },
                  }),
                )
                .catch(() => false);
              typingFails = ok ? 0 : typingFails + 1;
            }
          }

          const parsed = parseStudioTurn(buffer);

          // No durable act and no talk → a pass.
          if (
            !parsed.setDown &&
            parsed.blocks.length === 0 &&
            parsed.marks.length === 0 &&
            parsed.notes.length === 0 &&
            !parsed.talk
          ) {
            await emit({ kind: "resident", id: resident.id }, { type: "turn.end", passed: true });
            recency.unshift(actorId);
            if (++passes >= 2) {
              stop = "consecutive_passes";
              break;
            }
            continue;
          }
          passes = 0;

          // ── blocks: acquire → persist (truth) → broadcast → release
          for (const op of parsed.blocks) {
            const refId = resolveRef(blocks, op.ref);
            const existing =
              op.op !== "insert-after" && refId ? blocks.find((b) => b.id === refId) : undefined;

            if (existing) {
              const locked = await acquireLock(existing.id, resident.id, LOCK_TTL_MS);
              if (!locked) continue; // another live actor holds it — skip
              await emit(
                { kind: "resident", id: resident.id },
                {
                  type: "lock.acquire",
                  block_id: existing.id,
                  expires_at: Date.now() + LOCK_TTL_MS,
                },
              );
              existing.content =
                op.op === "append" ? `${existing.content}\n\n${op.content}`.trim() : op.content;
              existing.type = op.type;
              existing.version += 1;
              existing.author_resident_id = resident.id;
              await persistBlockUpsert(opts.docId, existing, false);
              await emit(
                { kind: "resident", id: resident.id },
                {
                  type: "block.upsert",
                  block_id: existing.id,
                  ord: existing.ord,
                  block_type: existing.type,
                  content: existing.content,
                  html: renderBlockHtml(existing.type, existing.content),
                  version: existing.version,
                },
              );
              await releaseLock(existing.id);
              await emit(
                { kind: "resident", id: resident.id },
                { type: "lock.release", block_id: existing.id },
              );
            } else {
              const nb: BlockState = {
                id: crypto.randomUUID(),
                ord: ordAfter(blocks, refId),
                type: op.type,
                content: op.content,
                version: 1,
                author_resident_id: resident.id,
                author_visitor_token: null,
              };
              blocks.push(nb);
              blocks.sort((a, b) => a.ord - b.ord);
              await persistBlockUpsert(opts.docId, nb, true);
              await emit(
                { kind: "resident", id: resident.id },
                {
                  type: "block.upsert",
                  block_id: nb.id,
                  ord: nb.ord,
                  block_type: nb.type,
                  content: nb.content,
                  html: renderBlockHtml(nb.type, nb.content),
                  version: nb.version,
                },
              );
            }
          }

          // ── marks
          for (const mk of parsed.marks) {
            const refId = resolveRef(blocks, mk.ref);
            if (!refId) continue;
            const blk = blocks.find((b) => b.id === refId);
            if (!blk) continue;
            const idx = blk.content.indexOf(mk.quote);
            if (idx === -1) continue;
            const markId = await persistMark(refId, idx, idx + mk.quote.length, resident.id);
            if (markId) {
              await emit(
                { kind: "resident", id: resident.id },
                {
                  type: "mark.add",
                  mark_id: markId,
                  block_id: refId,
                  range_start: idx,
                  range_end: idx + mk.quote.length,
                },
              );
            }
          }

          // ── marginalia
          for (const nt of parsed.notes) {
            const anchorId = resolveRef(blocks, nt.anchor);
            const noteId = await persistNote(opts.docId, anchorId, nt.body, resident.id);
            if (noteId) {
              await emit(
                { kind: "resident", id: resident.id },
                {
                  type: "marginalia.add",
                  marginalia_id: noteId,
                  anchor_block_id: anchorId,
                  anchor_quote: null,
                  body: nt.body,
                  reply_to: null,
                },
              );
            }
          }

          // ── talk (prose outside tags) → space_messages
          if (parsed.talk) {
            const talkId = await persistTalk(opts.spaceId, resident.id, parsed.talk);
            opts.talk.push({
              resident_id: resident.id,
              visitor_token: null,
              body: parsed.talk,
            });
            if (talkId) {
              await emit(
                { kind: "resident", id: resident.id },
                { type: "talk", message_id: talkId, body: parsed.talk },
              );
            }
          }

          await emit({ kind: "resident", id: resident.id }, { type: "turn.end" });
          recency.unshift(actorId);

          if (parsed.setDown) {
            await emit(CONDUCTOR_ACTOR, { type: "set_down" });
            stop = "set_down";
            break;
          }
        }

        send({ kind: "stream.done", reason: stop, turns: seq });
      } catch (err) {
        console.error("[studio] conductor error:", err);
        send({ kind: "stream.error", message: "conductor_unavailable" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
