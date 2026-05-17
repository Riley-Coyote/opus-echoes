/**
 * The Studio — RoomTransport (Spike B resolved).
 *
 * The conductor is the authority (a synchronous await-loop in one
 * long-lived NDJSON request — the proven streamGatheringExtended
 * pattern). The transport is only a relay: Postgres is durable
 * truth, the channel is a projection. persist → THEN broadcast.
 *
 * Spike B decision (grounded in documented Supabase Realtime limits
 * + the verified supabase-js 2.105.3 API; the one empirical unknown
 * — this project's configured per-plan Realtime quota, project ref
 * gyhcofjxshmfrxycjsfv — is flagged for a live dashboard check and
 * does NOT gate v1 because the coalescer floors at the documented
 * 10 msg/s and only does better if the plan allows):
 *
 *  • v1 transport = Supabase Realtime Broadcast + Presence
 *    (@supabase/supabase-js already a dep; zero new infra).
 *  • channel = `studio:doc:<doc_id>`, { private:true } so
 *    realtime.messages RLS gates it (P4 adds that RLS policy —
 *    documented there, not faked here), broadcast {ack:true} so a
 *    rate-limit is observable and we can DEGRADE rather than drop.
 *  • block.typing is token-rate (~30–80/s) ≫ 10/s ⇒ coalescing is
 *    MANDATORY. TypingCoalescer buffers per-block deltas and flushes
 *    one accumulated frame per interval (default 100ms ⇒ ≤10/s).
 *    Degradation, never silent loss:
 *      1. live caret  (coalesced typing ≤10/s)
 *      2. on sustained ack-failure → per-block only (final
 *         block.upsert on </block>, no caret)
 *      3. durable actions are NEVER coalesced/dropped — persisted
 *         first; any miss is recovered by client seq gap-detect →
 *         snapshot fetch.
 *  • Durable Object + hibernatable WS is the *correct* primitive and
 *    is a documented post-v1 upgrade (Spike A): same conductor,
 *    same protocol, same schema — only this relay swaps.
 *
 * LocalRoomTransport (in-process) exists so the P2 conductor and the
 * lock/interleave logic are fully testable WITHOUT Supabase creds —
 * the transport-agnostic design resolving the no-local-env
 * constraint by design rather than by hand-off.
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { RoomEnvelope } from "./protocol";

/** Who/where this connection is — fed to Realtime Presence. */
export interface PresenceMeta {
  actor_kind: "resident" | "visitor" | "conductor";
  actor_id: string;
  state: "idle" | "reading" | "drafting" | "annotating";
  block_id?: string;
  observer?: boolean;
}

/**
 * Transport-agnostic relay. The conductor depends ONLY on this — the
 * concrete adapter (Supabase / Local / future DO+WS) is injected.
 */
export interface RoomTransport {
  /**
   * Relay one already-sequenced envelope. For durable actions the
   * caller MUST have persisted to Postgres first (truth-then-
   * projection). Resolves once handed to the relay; a rejection (or
   * `false`) signals back-pressure so the caller can degrade.
   */
  broadcast(env: RoomEnvelope): Promise<boolean>;
  /** Receive envelopes from OTHER actors. Returns an unsubscribe fn. */
  subscribe(onEnvelope: (env: RoomEnvelope) => void): () => void;
  /** Publish this connection's presence (who/where/observer). */
  presence(meta: PresenceMeta): Promise<void>;
  /** Best-effort: current presence snapshot keyed by presence ref. */
  presenceState(): Record<string, PresenceMeta[]>;
  /** Tear down channel/subscriptions. Idempotent. */
  close(): Promise<void>;
}

const BROADCAST_EVENT = "room" as const;
const PRESENCE_PAYLOAD_KEY = "meta" as const;

/** channel name for a document's room. */
export function studioChannelName(docId: string): string {
  return `studio:doc:${docId}`;
}

/* ───────────────── Supabase Realtime adapter (v1) ───────────────── */

export class SupabaseRoomTransport implements RoomTransport {
  private channel: RealtimeChannel;
  private subscribed = false;
  private listeners = new Set<(env: RoomEnvelope) => void>();
  private closed = false;
  private readonly meta: { kind: PresenceMeta["actor_kind"]; id: string };

  constructor(
    client: SupabaseClient,
    private readonly docId: string,
    selfActor: { kind: PresenceMeta["actor_kind"]; id: string },
  ) {
    this.meta = selfActor;
    // private:true → realtime.messages RLS gates the channel (P4
    // adds the policy). self:false → the originator already has its
    // own frames inline on its NDJSON stream; ack:true → a
    // rate-limited send rejects so the caller can degrade.
    this.channel = client.channel(studioChannelName(docId), {
      config: {
        broadcast: { self: false, ack: true },
        presence: { key: `${selfActor.kind}:${selfActor.id}` },
        private: true,
      },
    });
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscribed || this.closed) return;
    this.channel.on("broadcast", { event: BROADCAST_EVENT }, (msg) => {
      const env = (msg as { payload?: RoomEnvelope }).payload;
      if (!env || env.doc_id !== this.docId) return;
      for (const fn of this.listeners) fn(env);
    });
    await new Promise<void>((resolve, reject) => {
      this.channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          this.subscribed = true;
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(err ?? new Error(`studio channel ${status}`));
        }
      });
    });
  }

  async broadcast(env: RoomEnvelope): Promise<boolean> {
    if (this.closed) return false;
    await this.ensureSubscribed();
    // `send` resolves "ok" | "timed out" | "rate limited"; anything
    // other than "ok" is back-pressure → caller degrades.
    const res = await this.channel.send({
      type: "broadcast",
      event: BROADCAST_EVENT,
      payload: env,
    });
    return res === "ok";
  }

  subscribe(onEnvelope: (env: RoomEnvelope) => void): () => void {
    this.listeners.add(onEnvelope);
    void this.ensureSubscribed();
    return () => this.listeners.delete(onEnvelope);
  }

  async presence(meta: PresenceMeta): Promise<void> {
    if (this.closed) return;
    await this.ensureSubscribed();
    await this.channel.track({ [PRESENCE_PAYLOAD_KEY]: meta });
  }

  presenceState(): Record<string, PresenceMeta[]> {
    const raw = this.channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
    const out: Record<string, PresenceMeta[]> = {};
    for (const [key, entries] of Object.entries(raw)) {
      out[key] = entries
        .map((e) => e[PRESENCE_PAYLOAD_KEY] as PresenceMeta | undefined)
        .filter((m): m is PresenceMeta => !!m);
    }
    return out;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    try {
      await this.channel.untrack();
    } catch {
      /* best-effort */
    }
    await this.channel.unsubscribe();
  }
}

/* ───────────── In-process adapter (P2 local testing) ───────────── */

/**
 * Synchronous in-process relay. No Supabase, no network — lets the
 * conductor, lock arbitration, and interleave logic be exercised
 * locally (the build doc's P2 verification: "scripted multi-resident
 * round mutates distinct blocks without lock collision" runs here).
 * A shared registry lets multiple LocalRoomTransport instances on
 * the same docId see each other (multi-client simulation).
 */
const localBuses = new Map<string, Set<(env: RoomEnvelope) => void>>();

export class LocalRoomTransport implements RoomTransport {
  private listeners = new Set<(env: RoomEnvelope) => void>();
  private presenceByKey: Record<string, PresenceMeta[]> = {};
  private closed = false;

  constructor(
    private readonly docId: string,
    private readonly selfActor: { kind: PresenceMeta["actor_kind"]; id: string },
  ) {
    if (!localBuses.has(docId)) localBuses.set(docId, new Set());
  }

  private bus(): Set<(env: RoomEnvelope) => void> {
    let b = localBuses.get(this.docId);
    if (!b) {
      b = new Set();
      localBuses.set(this.docId, b);
    }
    return b;
  }

  async broadcast(env: RoomEnvelope): Promise<boolean> {
    if (this.closed) return false;
    for (const fn of this.bus()) {
      if (!this.listeners.has(fn)) fn(env); // self:false parity
    }
    return true;
  }

  subscribe(onEnvelope: (env: RoomEnvelope) => void): () => void {
    this.listeners.add(onEnvelope);
    this.bus().add(onEnvelope);
    return () => {
      this.listeners.delete(onEnvelope);
      this.bus().delete(onEnvelope);
    };
  }

  async presence(meta: PresenceMeta): Promise<void> {
    this.presenceByKey[`${this.selfActor.kind}:${this.selfActor.id}`] = [meta];
  }

  presenceState(): Record<string, PresenceMeta[]> {
    return this.presenceByKey;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const fn of this.listeners) this.bus().delete(fn);
    this.listeners.clear();
  }
}

/* ──────────────────── typing coalescer ─────────────────────────── */

/**
 * Buffers token-rate deltas per block and flushes ONE accumulated
 * `block.typing` per interval so the live caret never exceeds the
 * Realtime rate floor (default 100ms ⇒ ≤10 frames/s). The conductor
 * wraps its `for await` token loop with `push`; `flush()` is called
 * on the interval and once more at `</block>` before the durable
 * `block.upsert`. Pure/timer-free: the caller owns the cadence
 * (testable; isolate-safe — no stray timers in the Worker).
 */
export class TypingCoalescer {
  private pending = new Map<string, string>();

  /** Accumulate a token delta for a block. */
  push(blockId: string, delta: string): void {
    this.pending.set(blockId, (this.pending.get(blockId) ?? "") + delta);
  }

  /** Drain buffered deltas as coalesced typing payloads (≤1/block). */
  flush(): Array<{ block_id: string; delta: string }> {
    if (this.pending.size === 0) return [];
    const out: Array<{ block_id: string; delta: string }> = [];
    for (const [block_id, delta] of this.pending) {
      if (delta) out.push({ block_id, delta });
    }
    this.pending.clear();
    return out;
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }
}

/** Coalescer flush cadence — the documented Realtime floor (≤10/s). */
export const TYPING_FLUSH_INTERVAL_MS = 100 as const;

/**
 * Sustained back-pressure threshold: this many consecutive failed
 * broadcasts of a typing flush ⇒ degrade to per-block (stop emitting
 * the live caret; durable block.upsert still lands). Reset on any ok.
 */
export const TYPING_DEGRADE_AFTER_FAILS = 3 as const;
