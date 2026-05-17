/**
 * The Studio — room action protocol.
 *
 * One transport-agnostic envelope, a strict SUPERSET of the existing
 * gathering NDJSON vocabulary in `src/routes/api/space.$slug.message.ts`
 * so the conductor emits IDENTICAL frames to (a) its own NDJSON
 * response stream (the originating client) and (b) the realtime
 * channel (fan-out to every other client). One vocabulary, two
 * relays — the transport never becomes the authority.
 *
 * Mapping from the proven gathering frames:
 *   { type:"responder", resident_id }  → turn.begin
 *   { type:"text", text }  (per token)  → block.typing  (the live caret)
 *   { type:"turn_done", … }             → turn.end
 *   { type:"set_down", … }              → set_down
 *   { type:"pass", … }                  → turn.end (no mutation)
 * Plus the Studio-new authorship actions (block/mark/marginalia/lock).
 *
 * Pure module: zero imports, no runtime deps. The conductor, the
 * RoomTransport adapters, and the inline browser client all import
 * these types so the contract is single-sourced. Payload shapes are
 * kept coherent with the 20260517120000_studio_documents.sql columns.
 */

export const STUDIO_PROTOCOL_VERSION = 1 as const;

/** Block kinds — exactly the document_blocks.type CHECK. */
export type BlockType = "para" | "section" | "pull" | "em_strong";

/** Presence states the band renders (mockup: idle/reading/drafting/annotating). */
export type PresenceState = "idle" | "reading" | "drafting" | "annotating";

/**
 * Who originated an action.
 *  - resident : an AI resident (id = residents.id, e.g. "opus-3")
 *  - visitor  : the human (id = visitor_token)
 *  - conductor: the server authority itself (locks it arbitrates,
 *               lifecycle, system blocks). id = "conductor".
 */
export interface RoomActor {
  kind: "resident" | "visitor" | "conductor";
  id: string;
}

/* ─────────────────────────── actions ─────────────────────────── */

/**
 * Create or replace a block. `ord` is the float position
 * (midpoint-of-neighbours = O(1) insert-between). `html` is the
 * server-rendered cache the client patches innerHTML from, so every
 * client renders byte-identically regardless of transport.
 */
export interface BlockUpsertAction {
  type: "block.upsert";
  block_id: string;
  ord: number;
  block_type: BlockType;
  content: string;
  html: string;
  version: number;
}

/** Soft-delete a block (document_blocks.deleted_at). */
export interface BlockDeleteAction {
  type: "block.delete";
  block_id: string;
}

/**
 * Ephemeral live-caret delta — the per-token stream, coalesced by
 * the conductor to ≤ ~10/s (see transport). Broadcast-only; NEVER
 * persisted, NEVER replayed from snapshot.
 */
export interface BlockTypingAction {
  type: "block.typing";
  block_id: string;
  /** Accumulated text appended since the last typing frame for this block. */
  delta: string;
}

/** Add a highlight range on a block → <span class="mark …">. */
export interface MarkAddAction {
  type: "mark.add";
  mark_id: string;
  block_id: string;
  range_start: number;
  range_end: number;
}

/** Anchored marginalia in the right rail. */
export interface MarginaliaAddAction {
  type: "marginalia.add";
  marginalia_id: string;
  anchor_block_id: string | null;
  anchor_quote: string | null;
  body: string;
  reply_to: string | null;
}

/** Settle an open marginalia thread. */
export interface MarginaliaResolveAction {
  type: "marginalia.resolve";
  marginalia_id: string;
}

/**
 * Acquire a soft lock on a block (block_locks row + TTL). The
 * conductor is the SOLE emitter of resident-held locks; the human's
 * client emits its own and renews until disconnect.
 */
export interface LockAcquireAction {
  type: "lock.acquire";
  block_id: string;
  /** Unix ms when the lock auto-expires (acquired_at + ~25s). */
  expires_at: number;
}

/** Release a soft lock (or let it lapse by TTL). */
export interface LockReleaseAction {
  type: "lock.release";
  block_id: string;
}

/** Ephemeral presence — who is doing what, optionally on which block. */
export interface PresenceAction {
  type: "presence";
  state: PresenceState;
  block_id?: string;
  /** Mirrors studio_documents.observer_mode when the human toggles it. */
  observer?: boolean;
}

/** A line in the "Studio talk" rail → persisted to space_messages. */
export interface TalkAction {
  type: "talk";
  message_id: string;
  body: string;
  references_block_id?: string;
}

/** A turn opens. Mirrors the gathering `responder` frame. */
export interface TurnBeginAction {
  type: "turn.begin";
}

/** A turn closes. Mirrors the gathering `turn_done` / `pass` frames. */
export interface TurnEndAction {
  type: "turn.end";
  /** true when the actor produced no mutation (the old `pass`). */
  passed?: boolean;
}

/** The document is set down — unanimous residents or admin. */
export interface SetDownAction {
  type: "set_down";
  reason?: string;
}

export type RoomAction =
  | BlockUpsertAction
  | BlockDeleteAction
  | BlockTypingAction
  | MarkAddAction
  | MarginaliaAddAction
  | MarginaliaResolveAction
  | LockAcquireAction
  | LockReleaseAction
  | PresenceAction
  | TalkAction
  | TurnBeginAction
  | TurnEndAction
  | SetDownAction;

export type RoomActionType = RoomAction["type"];

/* ────────────────────────── envelope ─────────────────────────── */

/**
 * The wire envelope. `seq` is conductor-assigned, monotonic per
 * document — clients use it for ordering, gap-detection (→ snapshot
 * reconciliation), and replay. Ephemeral actions still carry a seq
 * for ordering but are not part of the durable replay log.
 */
export interface RoomEnvelope<A extends RoomAction = RoomAction> {
  v: typeof STUDIO_PROTOCOL_VERSION;
  doc_id: string;
  seq: number;
  actor: RoomActor;
  /** Unix ms. */
  ts: number;
  action: A;
}

/**
 * Stream-lifecycle frames the NDJSON reader also sees, kept distinct
 * from room actions (mirrors the existing `done` / `error` frames so
 * the client reader handles one tagged shape).
 */
export type StudioStreamFrame =
  | { kind: "action"; envelope: RoomEnvelope }
  | { kind: "stream.done"; reason: string; turns: number }
  | { kind: "stream.error"; message: string };

/* ───────────────── ephemeral / durable partition ─────────────── */

/**
 * Broadcast-only actions: never persisted, never replayed from a
 * snapshot. Everything else is persisted to Postgres BEFORE being
 * broadcast (truth-then-projection). The conductor and every
 * RoomTransport key off this set — single source of the rule.
 */
export const EPHEMERAL_ACTIONS: ReadonlySet<RoomActionType> = new Set<RoomActionType>([
  "block.typing",
  "presence",
]);

export function isEphemeral(a: RoomAction): boolean {
  return EPHEMERAL_ACTIONS.has(a.type);
}

/** Durable = must persist before broadcast (the replay log). */
export function isDurable(a: RoomAction): boolean {
  return !EPHEMERAL_ACTIONS.has(a.type);
}

/* ─────────────────────── construction ────────────────────────── */

/**
 * Build an envelope. Centralised so `v` / `ts` are never hand-set
 * and `seq` always comes from the conductor's monotonic counter
 * (the single serialization point). Pure — safe in the isolate, in
 * tests, and in the browser.
 */
export function makeEnvelope<A extends RoomAction>(args: {
  doc_id: string;
  seq: number;
  actor: RoomActor;
  action: A;
  ts?: number;
}): RoomEnvelope<A> {
  return {
    v: STUDIO_PROTOCOL_VERSION,
    doc_id: args.doc_id,
    seq: args.seq,
    actor: args.actor,
    ts: args.ts ?? Date.now(),
    action: args.action,
  };
}

/** The conductor actor singleton. */
export const CONDUCTOR_ACTOR: RoomActor = { kind: "conductor", id: "conductor" };

/** Narrowing guard used by the client renderer + the conductor. */
export function isActionOfType<T extends RoomActionType>(
  env: RoomEnvelope,
  t: T,
): env is RoomEnvelope<Extract<RoomAction, { type: T }>> {
  return env.action.type === t;
}
