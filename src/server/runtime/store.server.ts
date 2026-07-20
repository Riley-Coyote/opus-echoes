import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import {
  isModelVisibleAttachmentMediaType,
  MAX_VISIT_ATTACHMENT_BYTES,
  MAX_VISIT_ATTACHMENTS,
} from "./attachment-policy";
import {
  RUNTIME_EVENT_VERSION,
  RuntimeEventSchema,
  type RuntimeEvent,
  type RuntimeEventInput,
  type RuntimeLocation,
  type RuntimeSurface,
  type RuntimeVisibility,
} from "./schema";
import { isVisibleTo, sanitizeRuntimeEventInput } from "./redaction";
import { sha256Bytes } from "./hash";
import {
  appendRuntimeEventRpc,
  beginRuntimeAttachmentDeleteRpc,
  finalizeRuntimeAttachmentDeleteRpc,
  finalizeRuntimeAttachmentRpc,
  reserveRuntimeAttachmentRpc,
  runtimeTable,
} from "./supabase.server";

export type RuntimeBackend = "supabase" | "memory";

export const RUNTIME_OPERATION_LEASE_MS = 5 * 60 * 1000;

export function isRuntimeOperationLeaseExpired(updatedAt: string, now = Date.now()): boolean {
  const updated = Date.parse(updatedAt);
  return Number.isFinite(updated) && now - updated > RUNTIME_OPERATION_LEASE_MS;
}

export type RuntimeVisit = {
  id: string;
  resident_id: string;
  visitor_id: string | null;
  visitor_token: string | null;
  client_visit_id: string | null;
  surface: RuntimeSurface;
  location: RuntimeLocation | null;
  mode: string;
  closed_at: string | null;
  runtime_consolidation_started_at: string | null;
  runtime_consolidation_settled_at: string | null;
  backend: RuntimeBackend;
};

export type RuntimeOperation = {
  id: string;
  scope_key: string;
  operation: string;
  idempotency_key: string;
  request_hash: string;
  lease_token: string;
  visit_id: string | null;
  status: "in_progress" | "completed";
  response: Record<string, unknown> | null;
  event_start_seq: number | null;
  event_end_seq: number | null;
  created_at: string;
  updated_at: string;
};

export class AttachmentQuotaError extends Error {
  constructor() {
    super("attachment_quota_exceeded");
    this.name = "AttachmentQuotaError";
  }
}

export class AttachmentBusyError extends Error {
  readonly code: "attachment_upload_in_progress" | "attachment_delete_in_progress";

  constructor(code: AttachmentBusyError["code"]) {
    super(code);
    this.name = "AttachmentBusyError";
    this.code = code;
  }
}

export class AttachmentLeaseLostError extends Error {
  constructor() {
    super("attachment state lease lost");
    this.name = "AttachmentLeaseLostError";
  }
}

export class AttachmentGoneError extends Error {
  constructor() {
    super("attachment_deleted");
    this.name = "AttachmentGoneError";
  }
}

export class OperationLeaseLostError extends Error {
  constructor() {
    super("runtime operation lease lost");
    this.name = "OperationLeaseLostError";
  }
}

export type BeginOperationResult =
  | { kind: "started"; operation: RuntimeOperation }
  | { kind: "replay"; operation: RuntimeOperation }
  | { kind: "conflict"; operation: RuntimeOperation }
  | { kind: "in_progress"; operation: RuntimeOperation };

export type RuntimeAttachment = {
  id: string;
  visit_id: string;
  resident_id: string;
  filename: string;
  media_type: string;
  byte_size: number;
  sha256: string;
  storage_path: string | null;
  label: string | null;
  created_at: string;
};

type MemoryAttachment = RuntimeAttachment & { bytes: Uint8Array };

type SaveAttachmentInput = {
  id: string;
  visit_id: string;
  resident_id: string;
  filename: string;
  media_type: string;
  bytes: ArrayBuffer;
  sha256: string;
  write_token: string;
  label?: string | null;
};

type MemoryState = {
  visits: Map<string, RuntimeVisit>;
  events: Map<string, RuntimeEvent[]>;
  eventIdempotency: Map<string, Map<string, RuntimeEvent>>;
  operations: Map<string, RuntimeOperation>;
  attachments: Map<string, MemoryAttachment>;
  attachmentTombstones: Set<string>;
  appendLocks: Map<string, Promise<void>>;
};

const MEMORY_STATE_KEY = Symbol.for("mnemos.runtime.store.v1");

function memoryState(): MemoryState {
  const root = globalThis as typeof globalThis & { [MEMORY_STATE_KEY]?: MemoryState };
  let state = root[MEMORY_STATE_KEY] as Partial<MemoryState> | undefined;

  // Vite keeps this global store alive across server-module reloads. Backfill
  // newly introduced collections so a local review session created by an
  // older module shape remains usable after HMR instead of requiring a full
  // process restart.
  if (!state) state = {};
  state.visits ??= new Map();
  state.events ??= new Map();
  state.eventIdempotency ??= new Map();
  state.operations ??= new Map();
  state.attachments ??= new Map();
  state.attachmentTombstones ??= new Set();
  state.appendLocks ??= new Map();

  root[MEMORY_STATE_KEY] = state as MemoryState;
  return root[MEMORY_STATE_KEY];
}

function operationMapKey(scopeKey: string, operation: string, idempotencyKey: string): string {
  return `${scopeKey}\u0000${operation}\u0000${idempotencyKey}`;
}

function isExclusiveVisitOperation(operation: string): boolean {
  return operation === "visit.turn" || operation === "visit.set-down";
}

function rowToEvent(row: Record<string, unknown>): RuntimeEvent {
  return RuntimeEventSchema.parse({
    v: RUNTIME_EVENT_VERSION,
    event_id: row.id,
    session_id: row.visit_id,
    visit_id: row.visit_id,
    seq: Number(row.seq),
    ts: row.created_at,
    type: row.event_type,
    phase: row.phase,
    resident_id: row.resident_id,
    visitor_id: row.visitor_id ?? null,
    turn_id: row.turn_id ?? null,
    surface: row.surface ?? "visit",
    location: row.location ?? null,
    source_runtime: row.source_runtime,
    visibility: row.visibility,
    epistemic_status: row.epistemic_status,
    payload: row.payload ?? {},
  });
}

function rowToOperation(row: Record<string, unknown>): RuntimeOperation {
  return {
    id: String(row.id),
    scope_key: String(row.scope_key),
    operation: String(row.operation),
    idempotency_key: String(row.idempotency_key),
    request_hash: String(row.request_hash),
    lease_token: String(row.lease_token),
    visit_id: row.visit_id ? String(row.visit_id) : null,
    status: row.status === "completed" ? "completed" : "in_progress",
    response:
      row.response && typeof row.response === "object"
        ? (row.response as Record<string, unknown>)
        : null,
    event_start_seq: row.event_start_seq == null ? null : Number(row.event_start_seq),
    event_end_seq: row.event_end_seq == null ? null : Number(row.event_end_seq),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToAttachment(row: Record<string, unknown>): RuntimeAttachment {
  return {
    id: String(row.id),
    visit_id: String(row.visit_id),
    resident_id: String(row.resident_id),
    filename: String(row.filename),
    media_type: String(row.media_type),
    byte_size: Number(row.byte_size),
    sha256: String(row.sha256),
    storage_path: row.storage_path ? String(row.storage_path) : null,
    label: row.label ? String(row.label) : null,
    created_at: String(row.created_at),
  };
}

function attachmentMatchesInput(
  attachment: RuntimeAttachment,
  input: SaveAttachmentInput,
  storagePath: string | null,
): boolean {
  return (
    attachment.id === input.id &&
    attachment.visit_id === input.visit_id &&
    attachment.resident_id === input.resident_id &&
    attachment.filename === input.filename &&
    attachment.media_type === input.media_type &&
    attachment.byte_size === input.bytes.byteLength &&
    attachment.sha256 === input.sha256 &&
    attachment.storage_path === storagePath &&
    attachment.label === (input.label ?? null)
  );
}

async function withMemoryAppendLock<T>(visitId: string, work: () => Promise<T>): Promise<T> {
  const state = memoryState();
  const previous = state.appendLocks.get(visitId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  state.appendLocks.set(visitId, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (state.appendLocks.get(visitId) === queued) state.appendLocks.delete(visitId);
  }
}

export class RuntimeStore {
  readonly backend: RuntimeBackend;

  constructor(forceBackend?: RuntimeBackend) {
    this.backend = forceBackend ?? (hasSupabaseAdminEnv() ? "supabase" : "memory");
  }

  async registerMemoryVisit(input: {
    id?: string;
    resident_id: string;
    visitor_id?: string | null;
    visitor_token?: string | null;
    client_visit_id?: string | null;
    surface?: RuntimeSurface;
    location?: RuntimeLocation | null;
    mode?: string;
  }): Promise<RuntimeVisit> {
    const visit: RuntimeVisit = {
      id: input.id ?? crypto.randomUUID(),
      resident_id: input.resident_id,
      visitor_id: input.visitor_id ?? null,
      visitor_token: input.visitor_token ?? null,
      client_visit_id: input.client_visit_id ?? null,
      surface: input.surface ?? "visit",
      location: input.location ?? null,
      mode: input.mode ?? "classic",
      closed_at: null,
      runtime_consolidation_started_at: null,
      runtime_consolidation_settled_at: null,
      backend: "memory",
    };
    memoryState().visits.set(visit.id, visit);
    return visit;
  }

  async getVisit(visitId: string): Promise<RuntimeVisit | null> {
    if (this.backend === "memory") return memoryState().visits.get(visitId) ?? null;

    type RuntimeSessionRow = {
      id: string;
      resident_id: string;
      visitor_token: string | null;
      mode: string | null;
      closed_at: string | null;
      runtime_consolidation_started_at: string | null;
      runtime_consolidation_settled_at: string | null;
    };
    const { data, error } = (await supabaseAdmin
      .from("sessions")
      .select(
        "id, resident_id, visitor_token, mode, closed_at, runtime_consolidation_started_at, runtime_consolidation_settled_at",
      )
      .eq("id", visitId)
      .maybeSingle()) as unknown as {
      data: RuntimeSessionRow | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`runtime visit lookup failed: ${error.message}`);
    if (!data) return null;
    const contextResult = await runtimeTable("runtime_visit_contexts")
      .select("visitor_id, client_visit_id, surface, location")
      .eq("visit_id", visitId)
      .maybeSingle();
    if (contextResult.error) {
      throw new Error(`runtime visit context lookup failed: ${contextResult.error.message}`);
    }
    const context = contextResult.data;
    return {
      id: data.id,
      resident_id: data.resident_id,
      visitor_id: context?.visitor_id ?? null,
      visitor_token: data.visitor_token,
      client_visit_id: context?.client_visit_id ?? null,
      surface: context?.surface ?? "visit",
      location: context?.location ?? null,
      mode: data.mode ?? "classic",
      closed_at: data.closed_at,
      runtime_consolidation_started_at: data.runtime_consolidation_started_at ?? null,
      runtime_consolidation_settled_at: data.runtime_consolidation_settled_at ?? null,
      backend: "supabase",
    };
  }

  async setVisitContext(
    visitId: string,
    input: {
      visitor_id?: string | null;
      client_visit_id?: string | null;
      surface: RuntimeSurface;
      location?: RuntimeLocation | null;
    },
  ): Promise<void> {
    if (this.backend === "memory") {
      const state = memoryState();
      const visit = state.visits.get(visitId);
      if (!visit) return;
      state.visits.set(visitId, {
        ...visit,
        visitor_id: input.visitor_id ?? visit.visitor_id,
        client_visit_id: input.client_visit_id ?? visit.client_visit_id,
        surface: input.surface,
        location: input.location ?? null,
      });
      return;
    }
    const { error } = await runtimeTable("runtime_visit_contexts").upsert(
      {
        visit_id: visitId,
        visitor_id: input.visitor_id ?? null,
        client_visit_id: input.client_visit_id ?? null,
        surface: input.surface,
        location: input.location ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "visit_id" },
    );
    if (error) throw new Error(`runtime visit context write failed: ${error.message}`);
  }

  async closeMemoryVisit(visitId: string): Promise<void> {
    const state = memoryState();
    const visit = state.visits.get(visitId);
    if (visit) state.visits.set(visitId, { ...visit, closed_at: new Date().toISOString() });
  }

  async appendEvent(visitId: string, rawInput: RuntimeEventInput): Promise<RuntimeEvent> {
    const input = sanitizeRuntimeEventInput(rawInput);
    if (this.backend === "memory") {
      return withMemoryAppendLock(visitId, async () => {
        const state = memoryState();
        const events = state.events.get(visitId) ?? [];
        if (input.idempotency_key) {
          const existing = state.eventIdempotency.get(visitId)?.get(input.idempotency_key);
          if (existing) return existing;
        }
        const event = RuntimeEventSchema.parse({
          v: RUNTIME_EVENT_VERSION,
          event_id: crypto.randomUUID(),
          session_id: visitId,
          visit_id: visitId,
          seq: (events.at(-1)?.seq ?? 0) + 1,
          ts: new Date().toISOString(),
          type: input.type,
          phase: input.phase,
          resident_id: input.resident_id,
          visitor_id: input.visitor_id ?? null,
          turn_id: input.turn_id ?? null,
          surface: input.surface ?? "visit",
          location: input.location ?? null,
          source_runtime: input.source_runtime,
          visibility: input.visibility,
          epistemic_status: input.epistemic_status,
          payload: input.payload,
        });
        events.push(event);
        state.events.set(visitId, events);
        if (input.idempotency_key) {
          const keys = state.eventIdempotency.get(visitId) ?? new Map<string, RuntimeEvent>();
          keys.set(input.idempotency_key, event);
          state.eventIdempotency.set(visitId, keys);
        }
        return event;
      });
    }

    const { data, error } = await appendRuntimeEventRpc({
      p_visit_id: visitId,
      p_event_type: input.type,
      p_phase: input.phase,
      p_resident_id: input.resident_id,
      p_visitor_id: input.visitor_id ?? null,
      p_turn_id: input.turn_id ?? null,
      p_surface: input.surface ?? "visit",
      p_location: input.location ?? null,
      p_source_runtime: input.source_runtime,
      p_visibility: input.visibility,
      p_epistemic_status: input.epistemic_status,
      p_payload: input.payload,
      p_idempotency_key: input.idempotency_key ?? null,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      throw new Error(`runtime event append failed: ${error?.message ?? "empty RPC result"}`);
    }
    return rowToEvent(row);
  }

  async listEvents(
    visitId: string,
    options: {
      after?: number;
      through?: number;
      limit?: number;
      audience?: RuntimeVisibility;
    } = {},
  ): Promise<RuntimeEvent[]> {
    const after = Math.max(0, options.after ?? 0);
    const through = options.through;
    const limit = Math.max(1, Math.min(500, options.limit ?? 200));
    const audience = options.audience ?? "visitor";

    if (this.backend === "memory") {
      return (memoryState().events.get(visitId) ?? [])
        .filter((event) => event.seq > after && (through == null || event.seq <= through))
        .filter((event) => isVisibleTo(event, audience))
        .slice(0, limit);
    }

    let query = runtimeTable("runtime_events")
      .select(
        "id, visit_id, seq, event_type, phase, resident_id, visitor_id, turn_id, surface, location, source_runtime, visibility, epistemic_status, payload, created_at",
      )
      .eq("visit_id", visitId)
      .gt("seq", after)
      .order("seq", { ascending: true })
      .limit(limit);
    if (through != null) query = query.lte("seq", through);
    if (audience === "visitor") query = query.eq("visibility", "visitor");
    else if (audience === "resident") query = query.in("visibility", ["visitor", "resident"]);
    const { data, error } = await query;
    if (error) throw new Error(`runtime event replay failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(rowToEvent);
  }

  async latestSeq(visitId: string): Promise<number> {
    if (this.backend === "memory") return memoryState().events.get(visitId)?.at(-1)?.seq ?? 0;
    const { data, error } = await runtimeTable("runtime_events")
      .select("seq")
      .eq("visit_id", visitId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`runtime latest seq failed: ${error.message}`);
    return data?.seq == null ? 0 : Number(data.seq);
  }

  async beginOperation(input: {
    scope_key: string;
    operation: string;
    idempotency_key: string;
    request_hash: string;
    visit_id?: string | null;
  }): Promise<BeginOperationResult> {
    if (this.backend === "memory") {
      const state = memoryState();
      const key = operationMapKey(input.scope_key, input.operation, input.idempotency_key);
      const existing = state.operations.get(key);
      if (existing) {
        if (existing.request_hash !== input.request_hash)
          return { kind: "conflict", operation: existing };
        if (
          existing.status === "in_progress" &&
          isRuntimeOperationLeaseExpired(existing.updated_at)
        ) {
          const reclaimed = {
            ...existing,
            lease_token: crypto.randomUUID(),
            updated_at: new Date().toISOString(),
          };
          state.operations.set(key, reclaimed);
          return { kind: "started", operation: reclaimed };
        }
        return existing.status === "completed"
          ? { kind: "replay", operation: existing }
          : { kind: "in_progress", operation: existing };
      }
      if (input.visit_id && isExclusiveVisitOperation(input.operation)) {
        const activeVisitMutation = [...state.operations.values()].find(
          (operation) =>
            operation.visit_id === input.visit_id &&
            operation.status === "in_progress" &&
            isExclusiveVisitOperation(operation.operation),
        );
        if (activeVisitMutation) {
          if (!isRuntimeOperationLeaseExpired(activeVisitMutation.updated_at)) {
            return { kind: "in_progress", operation: activeVisitMutation };
          }
          const retired = {
            ...activeVisitMutation,
            status: "completed" as const,
            response: {
              ok: false,
              code: "runtime_operation_expired",
              retryable: true,
              http_status: 409,
            },
            updated_at: new Date().toISOString(),
          };
          state.operations.set(
            operationMapKey(
              activeVisitMutation.scope_key,
              activeVisitMutation.operation,
              activeVisitMutation.idempotency_key,
            ),
            retired,
          );
        }
      }
      const now = new Date().toISOString();
      const operation: RuntimeOperation = {
        id: crypto.randomUUID(),
        scope_key: input.scope_key,
        operation: input.operation,
        idempotency_key: input.idempotency_key,
        request_hash: input.request_hash,
        lease_token: crypto.randomUUID(),
        visit_id: input.visit_id ?? null,
        status: "in_progress",
        response: null,
        event_start_seq: null,
        event_end_seq: null,
        created_at: now,
        updated_at: now,
      };
      state.operations.set(key, operation);
      return { kind: "started", operation };
    }

    const row = {
      scope_key: input.scope_key,
      operation: input.operation,
      idempotency_key: input.idempotency_key,
      request_hash: input.request_hash,
      lease_token: crypto.randomUUID(),
      visit_id: input.visit_id ?? null,
      status: "in_progress",
    };
    const inserted = await runtimeTable("runtime_operations").insert(row).select("*").maybeSingle();
    if (!inserted.error && inserted.data) {
      return { kind: "started", operation: rowToOperation(inserted.data) };
    }
    const existingRes = await runtimeTable("runtime_operations")
      .select("*")
      .eq("scope_key", input.scope_key)
      .eq("operation", input.operation)
      .eq("idempotency_key", input.idempotency_key)
      .maybeSingle();
    if (existingRes.error) {
      throw new Error(
        `runtime operation claim failed: ${inserted.error?.message ?? existingRes.error.message}`,
      );
    }
    if (!existingRes.data) {
      // Migration 1700 serializes generation and set-down for one visit. A
      // partial-index collision is intentionally reported as in-progress even
      // though the conflicting operation has a different idempotency key.
      if (input.visit_id && isExclusiveVisitOperation(input.operation)) {
        const activeRes = await runtimeTable("runtime_operations")
          .select("*")
          .eq("visit_id", input.visit_id)
          .eq("status", "in_progress")
          .in("operation", ["visit.turn", "visit.set-down"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (activeRes.error) {
          throw new Error(`runtime visit-operation fence failed: ${activeRes.error.message}`);
        }
        if (activeRes.data) {
          const active = rowToOperation(activeRes.data);
          if (!isRuntimeOperationLeaseExpired(active.updated_at)) {
            return { kind: "in_progress", operation: active };
          }

          // A browser can lose an idempotency key after a crash. Retire the
          // expired fenced operation so its old key remains an explicit failed
          // replay, then allow a genuinely new visitor action to claim the
          // visit. The lease-token/status predicate prevents a stale worker
          // from completing after retirement.
          const retiredRes = await runtimeTable("runtime_operations")
            .update({
              status: "completed",
              response: {
                ok: false,
                code: "runtime_operation_expired",
                retryable: true,
                http_status: 409,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", active.id)
            .eq("lease_token", active.lease_token)
            .eq("status", "in_progress")
            .lt("updated_at", new Date(Date.now() - RUNTIME_OPERATION_LEASE_MS).toISOString())
            .select("id")
            .maybeSingle();
          if (retiredRes.error) {
            throw new Error(
              `runtime expired visit-operation retirement failed: ${retiredRes.error.message}`,
            );
          }
          if (retiredRes.data) {
            const retried = await runtimeTable("runtime_operations")
              .insert(row)
              .select("*")
              .maybeSingle();
            if (!retried.error && retried.data) {
              return { kind: "started", operation: rowToOperation(retried.data) };
            }
          }

          const replacementRes = await runtimeTable("runtime_operations")
            .select("*")
            .eq("visit_id", input.visit_id)
            .eq("status", "in_progress")
            .in("operation", ["visit.turn", "visit.set-down"])
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (replacementRes.error) {
            throw new Error(
              `runtime replacement visit-operation lookup failed: ${replacementRes.error.message}`,
            );
          }
          if (replacementRes.data) {
            return { kind: "in_progress", operation: rowToOperation(replacementRes.data) };
          }
        }
      }
      throw new Error(`runtime operation claim failed: ${inserted.error?.message ?? "not found"}`);
    }
    const existing = rowToOperation(existingRes.data);
    if (existing.request_hash !== input.request_hash)
      return { kind: "conflict", operation: existing };
    if (existing.status === "in_progress" && isRuntimeOperationLeaseExpired(existing.updated_at)) {
      const leaseToken = crypto.randomUUID();
      const reclaimedRes = await runtimeTable("runtime_operations")
        .update({ lease_token: leaseToken, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("status", "in_progress")
        .lt("updated_at", new Date(Date.now() - RUNTIME_OPERATION_LEASE_MS).toISOString())
        .select("*")
        .maybeSingle();
      if (reclaimedRes.error) {
        throw new Error(`runtime operation reclaim failed: ${reclaimedRes.error.message}`);
      }
      if (reclaimedRes.data) {
        return { kind: "started", operation: rowToOperation(reclaimedRes.data) };
      }
    }
    return existing.status === "completed"
      ? { kind: "replay", operation: existing }
      : { kind: "in_progress", operation: existing };
  }

  async completeOperation(
    operation: RuntimeOperation,
    input: {
      response: Record<string, unknown>;
      visit_id?: string | null;
      event_start_seq?: number | null;
      event_end_seq?: number | null;
    },
  ): Promise<RuntimeOperation> {
    const update = {
      status: "completed" as const,
      response: input.response,
      visit_id: input.visit_id ?? operation.visit_id,
      event_start_seq: input.event_start_seq ?? operation.event_start_seq,
      event_end_seq: input.event_end_seq ?? operation.event_end_seq,
      updated_at: new Date().toISOString(),
    };
    if (this.backend === "memory") {
      const key = operationMapKey(
        operation.scope_key,
        operation.operation,
        operation.idempotency_key,
      );
      const current = memoryState().operations.get(key);
      if (!current || current.lease_token !== operation.lease_token) {
        throw new OperationLeaseLostError();
      }
      if (current.status === "completed") return current;
      const completed = { ...operation, ...update };
      memoryState().operations.set(key, completed);
      return completed;
    }
    const { data, error } = await runtimeTable("runtime_operations")
      .update(update)
      .eq("id", operation.id)
      .eq("lease_token", operation.lease_token)
      .eq("status", "in_progress")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`runtime operation complete failed: ${error.message}`);
    if (!data) throw new OperationLeaseLostError();
    return rowToOperation(data);
  }

  /**
   * Assert ownership immediately before an externally visible side effect and
   * renew the lease while the worker is still making progress. Reclaimed work
   * receives a new token, so a stale worker cannot append events after this
   * check or keep its claim alive.
   */
  async heartbeatOperation(operation: RuntimeOperation): Promise<RuntimeOperation> {
    const updatedAt = new Date().toISOString();
    if (this.backend === "memory") {
      const key = operationMapKey(
        operation.scope_key,
        operation.operation,
        operation.idempotency_key,
      );
      const current = memoryState().operations.get(key);
      if (
        !current ||
        current.status !== "in_progress" ||
        current.lease_token !== operation.lease_token
      ) {
        throw new OperationLeaseLostError();
      }
      const renewed = { ...current, updated_at: updatedAt };
      memoryState().operations.set(key, renewed);
      return renewed;
    }

    const { data, error } = await runtimeTable("runtime_operations")
      .update({ updated_at: updatedAt })
      .eq("id", operation.id)
      .eq("lease_token", operation.lease_token)
      .eq("status", "in_progress")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`runtime operation heartbeat failed: ${error.message}`);
    if (!data) throw new OperationLeaseLostError();
    return rowToOperation(data);
  }

  /**
   * Release retriable work without caching a failure response. Attachment
   * state transitions are independently fenced, so the same deterministic
   * idempotency key can immediately reconcile a partial Storage/RPC attempt.
   */
  async releaseOperation(operation: RuntimeOperation): Promise<void> {
    if (this.backend === "memory") {
      const key = operationMapKey(
        operation.scope_key,
        operation.operation,
        operation.idempotency_key,
      );
      const current = memoryState().operations.get(key);
      if (
        !current ||
        current.status !== "in_progress" ||
        current.lease_token !== operation.lease_token
      ) {
        throw new OperationLeaseLostError();
      }
      memoryState().operations.delete(key);
      return;
    }

    const { data, error } = await runtimeTable("runtime_operations")
      .delete()
      .eq("id", operation.id)
      .eq("lease_token", operation.lease_token)
      .eq("status", "in_progress")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`runtime operation release failed: ${error.message}`);
    if (!data) throw new OperationLeaseLostError();
  }

  async saveAttachment(input: SaveAttachmentInput): Promise<RuntimeAttachment> {
    const createdAt = new Date().toISOString();
    if (this.backend === "memory") {
      return withMemoryAppendLock(`attachment:${input.visit_id}`, async () => {
        const state = memoryState();
        if (state.attachmentTombstones.has(input.id)) throw new AttachmentGoneError();
        const current = state.attachments.get(input.id);
        if (current) {
          if (attachmentMatchesInput(current, input, null)) {
            const visit = state.visits.get(input.visit_id);
            if (!visit) throw new Error("attachment visit not found");
            await this.appendEvent(input.visit_id, {
              type: "attachment.ready",
              phase: "pre_turn",
              resident_id: visit.resident_id,
              visitor_id: visit.visitor_id,
              surface: visit.surface,
              location: visit.location,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: {
                attachment_id: current.id,
                filename: current.filename,
                media_type: current.media_type,
                byte_size: current.byte_size,
                sha256: current.sha256,
                label: current.label,
                model_visible:
                  this.backend === "supabase" &&
                  isModelVisibleAttachmentMediaType(current.media_type),
              },
              idempotency_key: `attachment:${current.id}:ready`,
            });
            return current;
          }
          throw new Error("attachment id conflicts with existing metadata");
        }
        const existing = Array.from(state.attachments.values()).filter(
          (attachment) => attachment.visit_id === input.visit_id,
        );
        const existingBytes = existing.reduce(
          (total, attachment) => total + attachment.byte_size,
          0,
        );
        if (
          existing.length >= MAX_VISIT_ATTACHMENTS ||
          existingBytes + input.bytes.byteLength > MAX_VISIT_ATTACHMENT_BYTES
        ) {
          throw new AttachmentQuotaError();
        }
        const attachment: MemoryAttachment = {
          id: input.id,
          visit_id: input.visit_id,
          resident_id: input.resident_id,
          filename: input.filename,
          media_type: input.media_type,
          byte_size: input.bytes.byteLength,
          sha256: input.sha256,
          storage_path: null,
          label: input.label ?? null,
          created_at: createdAt,
          bytes: new Uint8Array(input.bytes),
        };
        state.attachments.set(attachment.id, attachment);
        const visit = state.visits.get(input.visit_id);
        if (!visit) throw new Error("attachment visit not found");
        await this.appendEvent(input.visit_id, {
          type: "attachment.ready",
          phase: "pre_turn",
          resident_id: visit.resident_id,
          visitor_id: visit.visitor_id,
          surface: visit.surface,
          location: visit.location,
          source_runtime: "opus-supabase",
          visibility: "visitor",
          epistemic_status: "observed",
          payload: {
            attachment_id: attachment.id,
            filename: attachment.filename,
            media_type: attachment.media_type,
            byte_size: attachment.byte_size,
            sha256: attachment.sha256,
            label: attachment.label,
            model_visible:
              this.backend === "supabase" &&
              isModelVisibleAttachmentMediaType(attachment.media_type),
          },
          idempotency_key: `attachment:${attachment.id}:ready`,
        });
        return attachment;
      });
    }

    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "attachment";
    const storagePath = `${input.visit_id}/${input.id}/${safeName}`;

    // Reserve quota and move the row into `pending` before touching object
    // storage. The write token is the operation lease, so a reclaimed worker
    // can take over safely while upload/delete remain mutually exclusive.
    const reservation = await reserveRuntimeAttachmentRpc({
      p_id: input.id,
      p_visit_id: input.visit_id,
      p_resident_id: input.resident_id,
      p_filename: input.filename,
      p_media_type: input.media_type,
      p_byte_size: input.bytes.byteLength,
      p_sha256: input.sha256,
      p_storage_path: storagePath,
      p_label: input.label ?? null,
      p_write_token: input.write_token,
    });
    if (reservation.error || !reservation.data) {
      if (reservation.error?.message.includes("attachment_quota_exceeded")) {
        throw new AttachmentQuotaError();
      }
      if (reservation.error?.message.includes("attachment_delete_in_progress")) {
        throw new AttachmentBusyError("attachment_delete_in_progress");
      }
      if (reservation.error?.message.includes("attachment_deleted")) {
        throw new AttachmentGoneError();
      }
      throw new Error(`attachment reservation failed: ${reservation.error?.message}`);
    }
    const reservationRow = Array.isArray(reservation.data) ? reservation.data[0] : reservation.data;
    if (!reservationRow) throw new Error("attachment reservation failed: empty RPC result");
    const reservedAttachment = rowToAttachment(reservationRow);
    if (!attachmentMatchesInput(reservedAttachment, input, storagePath)) {
      throw new Error("attachment reservation returned conflicting metadata");
    }

    const verifyStoredObject = async (): Promise<boolean> => {
      const recovered = await supabaseAdmin.storage.from("visit-attachments").download(storagePath);
      if (recovered.error || !recovered.data) return false;
      const recoveredBytes = await recovered.data.arrayBuffer();
      const recoveredDigest = await sha256Bytes(recoveredBytes);
      if (
        recoveredBytes.byteLength !== input.bytes.byteLength ||
        recoveredDigest !== input.sha256
      ) {
        throw new Error("attachment object conflicts with idempotent upload");
      }
      return true;
    };

    if (reservationRow.status === "ready") {
      // A completed attachment stays visible during operation recovery. Do
      // not issue another Storage write: exact verification is sufficient and
      // avoids a late repair upload racing deletion.
      if (!(await verifyStoredObject())) {
        throw new Error("ready attachment object is unavailable");
      }
    } else {
      const upload = await supabaseAdmin.storage
        .from("visit-attachments")
        .upload(storagePath, new Uint8Array(input.bytes), {
          contentType: input.media_type,
          upsert: false,
        });
      if (upload.error && !(await verifyStoredObject())) {
        throw new Error(`attachment upload failed: ${upload.error.message}`);
      }
    }

    const finalized = await finalizeRuntimeAttachmentRpc({
      p_id: input.id,
      p_visit_id: input.visit_id,
      p_write_token: input.write_token,
    });
    if (finalized.error || !finalized.data) {
      // A committed finalize may lose its response. A ready, exact row is the
      // only safe success recovery; pending/deleting means another token owns
      // the state transition.
      const recoveredMetadata = await this.getAttachment(input.visit_id, input.id);
      if (recoveredMetadata) {
        if (attachmentMatchesInput(recoveredMetadata, input, storagePath)) {
          return recoveredMetadata;
        }
        throw new Error("attachment id conflicts with existing metadata");
      }
      if (finalized.error?.message.includes("attachment_write_lease_lost")) {
        throw new AttachmentLeaseLostError();
      }
      throw new Error(`attachment finalize failed: ${finalized.error?.message}`);
    }
    const row = Array.isArray(finalized.data) ? finalized.data[0] : finalized.data;
    if (!row || row.status !== "ready") {
      throw new Error("attachment finalize failed: invalid RPC result");
    }
    const attachment = rowToAttachment(row);
    if (!attachmentMatchesInput(attachment, input, storagePath)) {
      throw new Error("attachment finalize returned conflicting metadata");
    }
    return attachment;
  }

  async listAttachments(visitId: string): Promise<RuntimeAttachment[]> {
    if (this.backend === "memory") {
      return Array.from(memoryState().attachments.values())
        .filter((attachment) => attachment.visit_id === visitId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(({ bytes: _bytes, ...attachment }) => attachment);
    }
    const { data, error } = await runtimeTable("runtime_visit_attachments")
      .select("*")
      .eq("visit_id", visitId)
      .eq("status", "ready")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`attachment list failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(rowToAttachment);
  }

  async findPendingAttachment(
    visitId: string,
    input: {
      filename: string;
      media_type: string;
      byte_size: number;
      sha256: string;
      label?: string | null;
    },
  ): Promise<RuntimeAttachment | null> {
    if (this.backend === "memory") return null;
    let query = runtimeTable("runtime_visit_attachments")
      .select("*")
      .eq("visit_id", visitId)
      .eq("status", "pending")
      .eq("filename", input.filename)
      .eq("media_type", input.media_type)
      .eq("byte_size", input.byte_size)
      .eq("sha256", input.sha256);
    query = input.label == null ? query.is("label", null) : query.eq("label", input.label);
    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`pending attachment lookup failed: ${error.message}`);
    return data ? rowToAttachment(data) : null;
  }

  async getAttachment(visitId: string, attachmentId: string): Promise<RuntimeAttachment | null> {
    if (this.backend === "memory") {
      const attachment = memoryState().attachments.get(attachmentId);
      if (!attachment || attachment.visit_id !== visitId) return null;
      const { bytes: _bytes, ...metadata } = attachment;
      return metadata;
    }
    const { data, error } = await runtimeTable("runtime_visit_attachments")
      .select("*")
      .eq("visit_id", visitId)
      .eq("id", attachmentId)
      .eq("status", "ready")
      .maybeSingle();
    if (error) throw new Error(`attachment lookup failed: ${error.message}`);
    return data ? rowToAttachment(data) : null;
  }

  async downloadAttachment(
    visitId: string,
    attachmentId: string,
  ): Promise<{ metadata: RuntimeAttachment; bytes: Uint8Array } | null> {
    if (this.backend === "memory") {
      const attachment = memoryState().attachments.get(attachmentId);
      if (!attachment || attachment.visit_id !== visitId) return null;
      const { bytes, ...metadata } = attachment;
      return { metadata, bytes };
    }
    const metadata = await this.getAttachment(visitId, attachmentId);
    if (!metadata?.storage_path) return null;
    const { data, error } = await supabaseAdmin.storage
      .from("visit-attachments")
      .download(metadata.storage_path);
    if (error || !data) throw new Error(`attachment download failed: ${error?.message}`);
    return { metadata, bytes: new Uint8Array(await data.arrayBuffer()) };
  }

  async removeAttachment(
    visitId: string,
    attachmentId: string,
    deleteToken: string,
  ): Promise<RuntimeAttachment | null> {
    if (this.backend === "memory") {
      return withMemoryAppendLock(`attachment:${visitId}`, async () => {
        const attachment = memoryState().attachments.get(attachmentId);
        if (!attachment || attachment.visit_id !== visitId) return null;
        memoryState().attachments.delete(attachmentId);
        memoryState().attachmentTombstones.add(attachmentId);
        const { bytes: _bytes, ...metadata } = attachment;
        const visit = memoryState().visits.get(visitId);
        if (!visit) throw new Error("attachment visit not found");
        await this.appendEvent(visitId, {
          type: "attachment.removed",
          phase: "pre_turn",
          resident_id: visit.resident_id,
          visitor_id: visit.visitor_id,
          surface: visit.surface,
          location: visit.location,
          source_runtime: "opus-supabase",
          visibility: "visitor",
          epistemic_status: "observed",
          payload: { attachment_id: metadata.id, sha256: metadata.sha256 },
          idempotency_key: `attachment:${metadata.id}:removed`,
        });
        return metadata;
      });
    }

    const begun = await beginRuntimeAttachmentDeleteRpc({
      p_id: attachmentId,
      p_visit_id: visitId,
      p_delete_token: deleteToken,
    });
    if (begun.error) {
      if (begun.error.message.includes("attachment_upload_in_progress")) {
        throw new AttachmentBusyError("attachment_upload_in_progress");
      }
      throw new Error(`attachment delete claim failed: ${begun.error.message}`);
    }
    const begunRow = Array.isArray(begun.data) ? begun.data[0] : begun.data;
    if (!begunRow) return null;
    const metadata = rowToAttachment(begunRow);

    if (metadata.storage_path) {
      const removed = await supabaseAdmin.storage
        .from("visit-attachments")
        .remove([metadata.storage_path]);
      if (removed.error)
        throw new Error(`attachment storage removal failed: ${removed.error.message}`);
    }

    const finalized = await finalizeRuntimeAttachmentDeleteRpc({
      p_id: attachmentId,
      p_visit_id: visitId,
      p_delete_token: deleteToken,
    });
    if (finalized.error) {
      const current = await runtimeTable("runtime_visit_attachments")
        .select("id, status, write_token")
        .eq("visit_id", visitId)
        .eq("id", attachmentId)
        .maybeSingle();
      if (current.error) {
        throw new Error(`attachment delete recovery failed: ${current.error.message}`);
      }
      if (!current.data) return metadata;
      if (finalized.error.message.includes("attachment_delete_lease_lost")) {
        throw new AttachmentLeaseLostError();
      }
      throw new Error(`attachment metadata removal failed: ${finalized.error.message}`);
    }
    return metadata;
  }
}

export function runtimeStore(): RuntimeStore {
  return new RuntimeStore();
}
