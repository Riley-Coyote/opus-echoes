import type {
  AttachmentCapability,
  ContinuityGraph,
  ContinuityReceipt,
  InnerWeather,
  NormalizedVisitEvent,
  PacingState,
  PendingAttachment,
  PublicInterior,
  ResidentId,
  RuntimeEpistemicStatus,
  RuntimeEvent,
  StreamResult,
  VisitArtifact,
  VisitCapabilities,
  VisitHydration,
  VisitPhase,
  VisitSession,
  VisitTurn,
} from "./types";
import { VisitTransportError } from "./types";

const UNSUPPORTED_STATUSES = new Set([404, 405, 501]);
const STALL_MS = 45_000;
const VISITOR_HEADER = "x-mnemos-visitor-id";

type JsonRecord = Record<string, unknown>;

type RuntimeProvenance = {
  sourceRuntime: string;
  epistemicStatus: RuntimeEpistemicStatus;
};

const INNER_WEATHER_DIMENSIONS = [
  "curiosity",
  "restlessness",
  "warmth",
  "clarity",
  "creative_flow",
  "isolation",
] as const;

function visitorHeader(visitorId: string): Record<string, string> {
  return { [VISITOR_HEADER]: visitorId };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function numberValue(...values: unknown[]): number | undefined {
  return values.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
}

function boolValue(...values: unknown[]): boolean | undefined {
  return values.find((value): value is boolean => typeof value === "boolean");
}

async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function attachmentFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "the attachment upload did not complete.";
}

function normalizeProvenance(raw: RuntimeEvent, payload: JsonRecord): RuntimeProvenance | null {
  const sourceRuntime = stringValue(raw.source_runtime, payload.source_runtime);
  const status = stringValue(raw.epistemic_status, payload.epistemic_status);
  if (
    !sourceRuntime ||
    (status !== "observed" && status !== "inferred" && status !== "simulated")
  ) {
    return null;
  }
  return { sourceRuntime, epistemicStatus: status };
}

function payloadOf(raw: RuntimeEvent): JsonRecord {
  if (isRecord(raw.payload)) return raw.payload;
  if (isRecord(raw.data)) return raw.data;
  return {};
}

function normalizeType(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/[\s_:/-]+/g, ".")
    .replace(/\.+/g, ".");
}

function normalizeKind(value: unknown): "message" | "set_down" | "unprompted" {
  return value === "set_down" || value === "set-down"
    ? "set_down"
    : value === "unprompted"
      ? "unprompted"
      : "message";
}

function normalizeRole(value: unknown): "visitor" | "resident" {
  return value === "visitor" || value === "user" || value === "human" ? "visitor" : "resident";
}

function normalizeArtifact(raw: unknown, fallbackId: string): VisitArtifact | null {
  if (!isRecord(raw)) return null;
  const kindRaw = stringValue(raw.kind, raw.type) ?? "file";
  const kind = kindRaw === "image" || kindRaw === "svg" || kindRaw === "ascii" ? kindRaw : "file";
  const stateRaw = stringValue(raw.state);
  const state =
    stateRaw === "failed" || raw.error
      ? "failed"
      : stateRaw === "pending" || raw.pending === true
        ? "pending"
        : "ready";
  return {
    id: stringValue(raw.id, raw.artifact_id, raw.placeholder_id) ?? fallbackId,
    turnId: stringValue(raw.turn_id, raw.turnId),
    placeholderId: stringValue(raw.placeholder_id, raw.placeholderId),
    kind,
    state,
    caption: stringValue(raw.caption) ?? null,
    prompt: stringValue(raw.prompt) ?? null,
    content: stringValue(raw.content, raw.body) ?? null,
    url: stringValue(raw.url, raw.download_url) ?? null,
    reason: stringValue(raw.reason, raw.error) ?? null,
  };
}

function normalizeTurn(
  raw: unknown,
  fallbackRole: "visitor" | "resident",
  fallbackId: string,
): VisitTurn | null {
  if (!isRecord(raw)) return null;
  const body = stringValue(raw.body, raw.text, raw.content) ?? "";
  const role = normalizeRole(raw.role ?? raw.speaker ?? fallbackRole);
  const artifacts = Array.isArray(raw.artifacts)
    ? raw.artifacts
        .map((artifact, index) => normalizeArtifact(artifact, `${fallbackId}:artifact:${index}`))
        .filter((artifact): artifact is VisitArtifact => Boolean(artifact))
    : [];
  return {
    id: stringValue(raw.id, raw.turn_id, raw.turnId) ?? fallbackId,
    role,
    body,
    kind: normalizeKind(raw.kind),
    state: "settled",
    createdAt: stringValue(raw.created_at, raw.createdAt, raw.at) ?? new Date().toISOString(),
    artifacts,
    clientTurnId: stringValue(raw.client_turn_id, raw.clientTurnId),
  };
}

function normalizePacing(raw: JsonRecord): PacingState {
  const tierRaw = stringValue(raw.tier) ?? "open";
  const tier =
    tierRaw === "gentle" || tierRaw === "firm" || tierRaw === "approaching" || tierRaw === "hard"
      ? tierRaw
      : "open";
  return {
    tier,
    turnsRemaining: numberValue(raw.turnsRemaining, raw.turns_remaining) ?? null,
    tokensRemainingPct: numberValue(raw.tokensRemainingPct, raw.tokens_remaining_pct) ?? null,
  };
}

function normalizeWeather(raw: JsonRecord, provenance: RuntimeProvenance): InnerWeather | null {
  const weather = isRecord(raw.weather) ? raw.weather : raw;
  const source = isRecord(weather.values) ? weather.values : weather;
  const allowed = new Set<string>(INNER_WEATHER_DIMENSIONS);
  const dimensionsRaw = Array.isArray(weather.dimensions)
    ? weather.dimensions
    : INNER_WEATHER_DIMENSIONS.map((key) => [key, source[key]] as const);
  const dimensions = dimensionsRaw
    .map((dimension, index) => {
      if (Array.isArray(dimension)) {
        const [key, value] = dimension;
        return typeof key === "string" && allowed.has(key) && typeof value === "number"
          ? { key, label: key.replace(/_/g, " "), value: Math.max(0, Math.min(1, value)) }
          : null;
      }
      if (!isRecord(dimension)) return null;
      const key = stringValue(dimension.key, dimension.id, dimension.label) ?? `dimension-${index}`;
      if (!allowed.has(key)) return null;
      const value = numberValue(dimension.value, dimension.v);
      if (value == null) return null;
      return {
        key,
        label: stringValue(dimension.label) ?? key.replace(/_/g, " "),
        value: Math.max(0, Math.min(1, value)),
      };
    })
    .filter((dimension): dimension is { key: string; label: string; value: number } =>
      Boolean(dimension),
    );
  if (
    dimensions.length !== INNER_WEATHER_DIMENSIONS.length ||
    new Set(dimensions.map((dimension) => dimension.key)).size !== INNER_WEATHER_DIMENSIONS.length
  ) {
    return null;
  }
  return {
    source: "visit-runtime",
    sourceRuntime: provenance.sourceRuntime,
    epistemicStatus: provenance.epistemicStatus,
    updatedAt: stringValue(weather.updated_at, weather.updatedAt),
    dimensions,
  };
}

function normalizeGraph(raw: JsonRecord, provenance: RuntimeProvenance): ContinuityGraph | null {
  const source = isRecord(raw.graph) ? raw.graph : raw;
  if (!Array.isArray(source.nodes) || !Array.isArray(source.edges)) return null;
  const nodes = source.nodes
    .map<ContinuityGraph["nodes"][number] | null>((node, index) => {
      if (!isRecord(node)) return null;
      const id = stringValue(node.id) ?? `node-${index}`;
      const x = numberValue(node.x);
      const y = numberValue(node.y);
      if (x == null || y == null) return null;
      return {
        id,
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        weight: Math.max(
          0.05,
          Math.min(1, numberValue(node.weight, node.strength, node.stability) ?? 0.4),
        ),
        active: boolValue(node.active),
        core: boolValue(node.core, node.is_core),
        label: stringValue(node.label),
      };
    })
    .filter((node): node is ContinuityGraph["nodes"][number] => node !== null);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = source.edges
    .map((edge) => {
      if (!isRecord(edge)) return null;
      const from = stringValue(edge.from, edge.from_id);
      const to = stringValue(edge.to, edge.to_id);
      if (!from || !to || !ids.has(from) || !ids.has(to)) return null;
      return {
        from,
        to,
        weight: Math.max(0.05, Math.min(1, numberValue(edge.weight) ?? 0.35)),
      };
    })
    .filter((edge): edge is ContinuityGraph["edges"][number] => Boolean(edge));
  if (!nodes.length) return null;
  return {
    source: "visit-runtime",
    sourceRuntime: provenance.sourceRuntime,
    epistemicStatus: provenance.epistemicStatus,
    nodes,
    edges,
    updatedAt: stringValue(source.updated_at, source.updatedAt),
  };
}

function normalizeReceipt(
  raw: JsonRecord,
  type: string,
  provenance: RuntimeProvenance,
  seq?: number,
): ContinuityReceipt | null {
  const receiptRaw = isRecord(raw.receipt) ? raw.receipt : raw;
  let body = stringValue(receiptRaw.body, receiptRaw.text, receiptRaw.summary, receiptRaw.prose);
  if (!body && type.includes("memory.working")) {
    body = "Working continuity was refreshed. Its content remains resident-scoped.";
  } else if (!body && type.includes("memory.continuity")) {
    body = "Continuity with this visitor was revised. Its content remains resident-scoped.";
  } else if (!body && type.includes("engram.created")) {
    body = "A memory was formed during consolidation. Its content remains resident-scoped.";
  } else if (!body && type.includes("engram.reinforced")) {
    body = "An existing memory was reinforced. Its content remains resident-scoped.";
  } else if (!body && type.includes("journal.created")) {
    body =
      "A journal entry was formed from the visit. Its content remains resident-scoped unless published.";
  } else if (!body && type.includes("consolidation.started")) {
    body =
      receiptRaw.progress_available === false
        ? "The runtime began consolidation. This runtime does not expose intermediate progress."
        : "The runtime began consolidation.";
  } else if (!body && type.includes("consolidation.completed")) {
    const projected = numberValue(receiptRaw.projected_session_safe_mutations);
    const verification =
      receiptRaw.full_pipeline_success_verifiable === false
        ? " Full pipeline completion was not independently verifiable."
        : "";
    body = `The consolidation endpoint returned${projected == null ? "" : ` with ${projected} visit-safe change${projected === 1 ? "" : "s"} projected`}.${verification}`;
  } else if (!body && type.includes("consolidation.unavailable")) {
    body =
      stringValue(receiptRaw.reason) ??
      "Consolidation is unavailable in the active runtime; no memory change is being claimed.";
  } else if (!body && type.includes("consolidation.failed")) {
    body = `Consolidation did not complete${stringValue(receiptRaw.code) ? `: ${stringValue(receiptRaw.code)}` : "."}`;
  }
  if (!body) return null;
  const kind = type.includes("recall")
    ? "recalled"
    : type.includes("consolidat")
      ? "consolidated"
      : type.includes("change") || type.includes("memory")
        ? "changed"
        : "note";
  return {
    id: stringValue(receiptRaw.id) ?? `receipt-${seq ?? Date.now()}`,
    kind,
    label:
      stringValue(receiptRaw.label, receiptRaw.title) ??
      (type.includes("consolidation.started")
        ? "consolidation began"
        : type.includes("consolidation.completed")
          ? "consolidation returned"
          : type.includes("consolidation.unavailable")
            ? "consolidation unavailable"
            : type.includes("consolidation.failed")
              ? "consolidation failed"
              : kind === "recalled"
                ? "recalled for this reply"
                : kind === "changed"
                  ? "what changed"
                  : kind),
    body,
    source: stringValue(receiptRaw.source, receiptRaw.scope) ?? null,
    sourceRuntime: provenance.sourceRuntime,
    epistemicStatus: provenance.epistemicStatus,
    at: stringValue(receiptRaw.at, receiptRaw.created_at) ?? null,
  };
}

export function normalizeRuntimeEvent(
  raw: RuntimeEvent,
  contextTurnId = "resident-current",
): NormalizedVisitEvent[] {
  const type = normalizeType(raw.type || "");
  const payload = payloadOf(raw);
  const provenance = normalizeProvenance(raw, payload);
  const merged = { ...raw, ...payload } as JsonRecord;
  const seq = numberValue(raw.seq, payload.seq);
  const turnId = stringValue(merged.turn_id, merged.turnId, merged.id) ?? contextTurnId;
  const residentTurnId = turnId.startsWith("resident:") ? turnId : `resident:${turnId}`;

  if (type === "turn.accepted" && stringValue(merged.message, merged.body, merged.content)) {
    const visitorTurn = normalizeTurn(
      {
        id: `visitor:${turnId}`,
        client_turn_id: turnId,
        role: "visitor",
        body: stringValue(merged.message, merged.body, merged.content),
        created_at: stringValue(raw.ts, merged.created_at),
      },
      "visitor",
      `visitor:${turnId}`,
    );
    return visitorTurn ? [{ type: "visitor.turn", turn: visitorTurn, seq }] : [];
  }

  if (type === "pacing" || type.includes("visit.pacing") || type.includes("turn.pacing")) {
    return [{ type: "pacing", pacing: normalizePacing(merged), seq }];
  }

  if (type === "emotion.inner.weather.updated") {
    if (!provenance) return [];
    const weather = normalizeWeather(merged, provenance);
    return weather ? [{ type: "weather", weather, seq }] : [];
  }

  if (type.includes("graph") || type.includes("topology")) {
    if (!provenance) return [];
    const graph = normalizeGraph(merged, provenance);
    return graph ? [{ type: "graph", graph, seq }] : [];
  }

  if (
    type.includes("receipt") ||
    type.includes("recall") ||
    type.includes("memory.changed") ||
    type.includes("memory.updated") ||
    type.includes("memory.working") ||
    type.includes("memory.continuity") ||
    type.includes("memory.formed") ||
    type.includes("cognition.observation") ||
    type.includes("engram.created") ||
    type.includes("engram.reinforced") ||
    type.includes("journal.created") ||
    type.includes("consolidat")
  ) {
    if (!provenance) return [];
    const receipt = normalizeReceipt(merged, type, provenance, seq);
    return receipt ? [{ type: "receipt", receipt, seq }] : [];
  }

  if (type === "artifact.pending" || type === "artifact_pending") {
    const artifact = normalizeArtifact(
      { ...merged, kind: "image", state: "pending" },
      `artifact-${seq ?? Date.now()}`,
    );
    return artifact ? [{ type: "artifact", artifact, turnId: residentTurnId, seq }] : [];
  }

  if (type === "artifact" || type.endsWith("artifact.ready") || type.endsWith("artifact.created")) {
    const artifact = normalizeArtifact(merged.artifact ?? merged, `artifact-${seq ?? Date.now()}`);
    return artifact
      ? [{ type: "artifact", artifact, turnId: artifact.turnId ?? residentTurnId, seq }]
      : [];
  }

  if (type === "image.error" || type === "image_error" || type.endsWith("artifact.failed")) {
    const artifact = normalizeArtifact(
      { ...merged, kind: stringValue(merged.kind) ?? "image", state: "failed" },
      `artifact-${seq ?? Date.now()}`,
    );
    return artifact ? [{ type: "artifact", artifact, turnId: residentTurnId, seq }] : [];
  }

  if (type === "kind" || type === "turn.kind.detected" || type.endsWith("turn.kind")) {
    return [{ type: "turn.kind", kind: normalizeKind(merged.kind), turnId: residentTurnId, seq }];
  }

  if (
    type === "text" ||
    type.endsWith("model.output.delta") ||
    type.endsWith("resident.delta") ||
    type.endsWith("assistant.delta") ||
    type.endsWith("turn.delta")
  ) {
    return [
      {
        type: "resident.delta",
        turnId: residentTurnId,
        text: stringValue(merged.text, merged.delta, merged.body) ?? "",
        seq,
      },
    ];
  }

  if (type.endsWith("turn.settled")) {
    if (boolValue(merged.ok) === false) {
      const code = stringValue(merged.code, merged.message) ?? "turn_failed";
      return [
        {
          type: "error",
          code,
          message:
            stringValue(merged.message, merged.detail, merged.reason) ??
            "the room could not complete that turn.",
          recoverable: boolValue(merged.recoverable, merged.retryable) ?? false,
          seq,
        },
      ];
    }
    return [{ type: "done", turnId: residentTurnId, seq }];
  }

  const embeddedTurn = normalizeTurn(
    merged.turn ?? merged,
    type.includes("visitor") ? "visitor" : "resident",
    turnId,
  );
  const hasEmbeddedTurnBody = Boolean(stringValue(merged.body, merged.text, merged.content));
  if (
    embeddedTurn &&
    hasEmbeddedTurnBody &&
    (type.includes("turn.recorded") ||
      type.includes("turn.committed") ||
      type.includes("turn.completed") ||
      type.includes("turn.settled") ||
      type.includes("message.created"))
  ) {
    return [
      embeddedTurn.role === "visitor"
        ? { type: "visitor.turn", turn: embeddedTurn, seq }
        : { type: "resident.turn", turn: embeddedTurn, seq },
    ];
  }

  if (
    type.includes("model.output.started") ||
    type.includes("resident.started") ||
    type.includes("resident.thinking") ||
    type.includes("turn.started")
  ) {
    return [{ type: "resident.started", turnId: residentTurnId, seq }];
  }

  if (type === "done" || type.endsWith("turn.done") || type.endsWith("stream.completed")) {
    return [{ type: "done", turnId: residentTurnId, seq }];
  }

  if (type === "error" || type.endsWith(".error") || type.endsWith(".failed")) {
    const code = stringValue(merged.code, merged.message) ?? "runtime_error";
    return [
      {
        type: "error",
        code,
        message:
          stringValue(merged.message, merged.detail, merged.reason) ??
          "the room could not complete that turn.",
        recoverable: boolValue(merged.recoverable, merged.retryable) ?? true,
        seq,
      },
    ];
  }

  if (
    type.includes("visit.closed") ||
    type.includes("visit.set.down") ||
    type.includes("session.closed")
  ) {
    return [{ type: "visit.status", status: "closed", seq }];
  }

  if (type.includes("visit.reconnecting")) {
    return [{ type: "visit.status", status: "reconnecting", seq }];
  }

  return [];
}

export function terminalVisitStreamError(
  events: NormalizedVisitEvent[],
): Extract<NormalizedVisitEvent, { type: "error" }> | null {
  let terminalError: Extract<NormalizedVisitEvent, { type: "error" }> | null = null;
  for (const event of events) {
    if (event.type === "error") terminalError = event;
    // A later successful completion supersedes an error from a released,
    // retried attempt that remains inside the canonical operation's replay
    // range. Legacy `done` has no sequence and can follow an error from the
    // same attempt, so it is deliberately not treated as proof of success.
    else if (event.type === "done" && event.seq != null) terminalError = null;
  }
  return terminalError;
}

async function readJson(response: Response): Promise<JsonRecord> {
  const payload = await response.json().catch(() => ({}));
  return isRecord(payload) ? payload : {};
}

function visitError(response: Response, payload: JsonRecord): VisitTransportError {
  const code = stringValue(payload.code) ?? "unknown";
  if (response.status === 403 || code === "chat_disabled" || code === "visits_closed") {
    return new VisitTransportError("visits are resting between phases.", {
      code: "unavailable",
      status: response.status,
      recoverable: false,
    });
  }
  if (response.status === 410 || code === "session_closed" || code === "visit_closed") {
    return new VisitTransportError("this visit has been set down.", {
      code: "session_closed",
      status: response.status,
      recoverable: false,
    });
  }
  if (response.status === 401 || code === "session_invalid" || code === "visit_invalid") {
    return new VisitTransportError("the visit could not be resumed.", {
      code: "session_invalid",
      status: response.status,
    });
  }
  if (response.status === 503 || code === "config_missing") {
    return new VisitTransportError("the room is not accessible right now.", {
      code: "configuration",
      status: response.status,
    });
  }
  return new VisitTransportError(
    stringValue(payload.message, payload.detail) ?? "the room could not be reached.",
    { code: "runtime_error", status: response.status },
  );
}

function attachmentCapability(raw: unknown): AttachmentCapability | null {
  // Storage-only uploads must not surface as a composer affordance. The
  // capability becomes visible only when the resident generation path can
  // actually inspect the attachment.
  if (!isRecord(raw) || raw.enabled !== true || raw.model_visible !== true) return null;
  const accept = Array.isArray(raw.accept)
    ? raw.accept.filter((value): value is string => typeof value === "string")
    : undefined;
  return {
    enabled: true,
    modelVisible: true,
    mode: stringValue(raw.upload_url, raw.uploadEndpoint) ? "multipart" : "staged",
    uploadEndpoint: stringValue(raw.upload_url, raw.uploadEndpoint),
    initEndpoint: stringValue(raw.init_endpoint, raw.initEndpoint),
    finalizeEndpoint: stringValue(raw.finalize_endpoint, raw.finalizeEndpoint),
    accept,
    maxBytes: numberValue(raw.max_file_bytes, raw.max_bytes, raw.maxBytes),
    maxTurnBytes: numberValue(raw.max_turn_bytes, raw.maxTurnBytes),
    maxTurnFiles: numberValue(raw.max_turn_files, raw.maxTurnFiles),
  };
}

function capabilitiesFrom(raw: unknown, transport: "runtime" | "legacy"): VisitCapabilities {
  const value = isRecord(raw) ? raw : {};
  return {
    attachments: transport === "runtime" ? attachmentCapability(value.attachments) : null,
    share: boolValue(value.share) ?? true,
    export: boolValue(value.export) ?? true,
    events: transport === "runtime",
    generation: boolValue(value.generation) ?? transport === "legacy",
  };
}

function sessionFromRuntime(
  payload: JsonRecord,
  resident: ResidentId,
  visitorId: string,
): VisitSession {
  const visit = isRecord(payload.visit) ? payload.visit : {};
  const id = stringValue(
    payload.visit_id,
    payload.id,
    visit.id,
    visit.visit_id,
    payload.session_id,
  );
  if (!id) {
    throw new VisitTransportError("the visit runtime returned no visit id.", {
      code: "runtime_error",
    });
  }
  const status = stringValue(payload.status, visit.status);
  return {
    id,
    resident,
    visitorId,
    transport: "runtime",
    resumed: boolValue(payload.resumed, visit.resumed) ?? false,
    closed: status === "closed" || boolValue(payload.closed, visit.closed) === true,
    consolidationRecoverable:
      boolValue(payload.consolidation_recoverable, visit.consolidation_recoverable) ?? false,
    localReview: boolValue(payload.local_review, visit.local_review) ?? false,
    generationAvailable:
      boolValue(payload.generation_available, visit.generation_available) ??
      capabilitiesFrom(payload.capabilities ?? visit.capabilities, "runtime").generation,
    lastSeq: numberValue(payload.last_seq, payload.lastSeq, visit.last_seq, visit.lastSeq) ?? 0,
    capabilities: capabilitiesFrom(payload.capabilities ?? visit.capabilities, "runtime"),
  };
}

export async function startVisit(
  resident: ResidentId,
  visitorToken: string,
  requestedVisitId?: string | null,
): Promise<VisitSession> {
  let runtimeResponse: Response;
  try {
    runtimeResponse = await fetch("/api/visit/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // A new approach is a new logical operation. Reusing a permanent
        // visitor/resident key would replay the first closed visit forever;
        // the hosted bootstrap itself resumes any genuinely open session.
        "idempotency-key": requestedVisitId
          ? `visit-resume:${visitorToken}:${resident}:${requestedVisitId}`
          : `visit-start:${visitorToken}:${resident}:${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        resident_id: resident,
        visitor_id: visitorToken,
        ...(requestedVisitId ? { visit_id: requestedVisitId } : {}),
        surface: "visit",
      }),
    });
  } catch {
    throw new VisitTransportError("the room could not be reached.", { code: "network" });
  }

  if (runtimeResponse.ok) {
    return sessionFromRuntime(await readJson(runtimeResponse), resident, visitorToken);
  }

  if (!UNSUPPORTED_STATUSES.has(runtimeResponse.status)) {
    throw visitError(runtimeResponse, await readJson(runtimeResponse));
  }

  const legacyResponse = await fetch("/api/chat/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resident, visitor_token: visitorToken }),
  }).catch(() => null);
  if (!legacyResponse) {
    throw new VisitTransportError("the room could not be reached.", { code: "network" });
  }
  const payload = await readJson(legacyResponse);
  if (!legacyResponse.ok) throw visitError(legacyResponse, payload);
  const id = stringValue(payload.session_id);
  if (!id)
    throw new VisitTransportError("the room returned no session id.", { code: "runtime_error" });
  return {
    id,
    resident,
    visitorId: visitorToken,
    transport: "legacy",
    resumed: boolValue(payload.resumed) ?? false,
    closed: false,
    consolidationRecoverable: false,
    localReview: false,
    generationAvailable: true,
    lastSeq: 0,
    capabilities: capabilitiesFrom(payload.capabilities, "legacy"),
  };
}

async function parseEventResponse(
  response: Response,
  contextTurnId: string,
  onEvent?: (event: NormalizedVisitEvent) => void,
  signal?: AbortSignal,
): Promise<{ events: NormalizedVisitEvent[]; lastSeq: number; hasMore: boolean }> {
  const events: NormalizedVisitEvent[] = [];
  let lastSeq = 0;
  const emitRaw = (raw: unknown) => {
    if (!isRecord(raw) || typeof raw.type !== "string") return;
    for (const event of normalizeRuntimeEvent(raw as RuntimeEvent, contextTurnId)) {
      if (event.seq != null) lastSeq = Math.max(lastSeq, event.seq);
      events.push(event);
      onEvent?.(event);
    }
  };

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = await readJson(response);
    const rawEvents = Array.isArray(payload.events) ? payload.events : [];
    rawEvents.forEach(emitRaw);
    lastSeq = Math.max(lastSeq, numberValue(payload.last_seq, payload.lastSeq) ?? 0);
    return { events, lastSeq, hasMore: boolValue(payload.has_more, payload.hasMore) ?? false };
  }

  if (!response.body) return { events, lastSeq, hasMore: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const readChunk = () =>
    new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = window.setTimeout(
        () => reject(new VisitTransportError("the stream went quiet.", { code: "stream_stalled" })),
        STALL_MS,
      );
      const onAbort = () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      void reader.read().then(
        (chunk) => {
          window.clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          resolve(chunk);
        },
        (error: unknown) => {
          window.clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  try {
    while (true) {
      const chunk = await readChunk();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        let line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) line = line.slice(5).trim();
        if (line && line !== "[DONE]") {
          try {
            emitRaw(JSON.parse(line));
          } catch {
            // A partial or non-event line is ignored; the transport remains usable.
          }
        }
        newline = buffer.indexOf("\n");
      }
    }
    const tail = buffer.trim().replace(/^data:\s*/, "");
    if (tail && tail !== "[DONE]") {
      try {
        emitRaw(JSON.parse(tail));
      } catch {
        // Ignore an unterminated non-event tail.
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { events, lastSeq, hasMore: false };
}

async function replayRuntimeEventPages(options: {
  session: VisitSession;
  after: number;
  contextTurnId: string;
  onEvent?: (event: NormalizedVisitEvent) => void;
}): Promise<{ events: NormalizedVisitEvent[]; lastSeq: number; closed: boolean }> {
  const events: NormalizedVisitEvent[] = [];
  let cursor = Math.max(0, options.after);
  let closed = options.session.closed;
  let hasMore = false;

  // A bounded loop protects the client from a malformed has_more response;
  // 100 x 500 events is far beyond a practical single visit while still
  // making a stalled cursor fail closed instead of spinning forever.
  for (let page = 0; page < 100; page += 1) {
    const response = await fetch(
      `/api/visit/${encodeURIComponent(options.session.id)}/events?after=${cursor}&limit=500`,
      {
        headers: {
          accept: "application/json",
          ...visitorHeader(options.session.visitorId),
        },
      },
    ).catch(() => null);
    if (!response) {
      throw new VisitTransportError("the event stream could not be reached.", { code: "network" });
    }
    if (response.status === 204) break;
    if (!response.ok && response.status !== 410) {
      throw visitError(response, await readJson(response));
    }

    const parsed = await parseEventResponse(response, options.contextTurnId, options.onEvent);
    events.push(...parsed.events);
    closed ||=
      response.status === 410 ||
      parsed.events.some((event) => event.type === "visit.status" && event.status === "closed");

    const nextCursor = Math.max(cursor, parsed.lastSeq);
    hasMore = parsed.hasMore;
    if (!hasMore) {
      cursor = nextCursor;
      break;
    }
    if (nextCursor <= cursor) {
      throw new VisitTransportError("the event replay cursor did not advance.", {
        code: "runtime_error",
      });
    }
    cursor = nextCursor;
  }

  if (hasMore) {
    throw new VisitTransportError("the visit is too large to replay safely in one pass.", {
      code: "runtime_error",
    });
  }

  return { events, lastSeq: cursor, closed };
}

export async function hydrateVisit(session: VisitSession): Promise<VisitHydration> {
  if (session.transport === "runtime") {
    const transcriptRequest = session.localReview
      ? Promise.resolve<Response | null>(null)
      : fetch(`/api/turns?session_id=${encodeURIComponent(session.id)}`, {
          headers: visitorHeader(session.visitorId),
        }).catch(() => null);
    const [replay, transcriptResponse] = await Promise.all([
      replayRuntimeEventPages({
        session,
        after: 0,
        contextTurnId: "resident-hydrated",
      }),
      transcriptRequest,
    ]);
    const closed = replay.closed || transcriptResponse?.status === 410 || session.closed;
    let turns: VisitTurn[] = [];
    if (transcriptResponse && (transcriptResponse.ok || transcriptResponse.status === 410)) {
      const transcript = await readJson(transcriptResponse);
      turns = (Array.isArray(transcript.turns) ? transcript.turns : [])
        .map((turn, index) => normalizeTurn(turn, "resident", `turn-${index}`))
        .filter((turn): turn is VisitTurn => Boolean(turn));
      for (const [index, rawArtifact] of (Array.isArray(transcript.artifacts)
        ? transcript.artifacts
        : []
      ).entries()) {
        const artifact = normalizeArtifact(rawArtifact, `artifact-${index}`);
        if (!artifact) continue;
        const turn = turns.find((candidate) => candidate.id === artifact.turnId);
        if (turn) turn.artifacts.push(artifact);
      }
    }
    const events = turns.length
      ? replay.events.filter((event) =>
          ["pacing", "weather", "graph", "receipt", "visit.status"].includes(event.type),
        )
      : replay.events;
    return { turns, events, closed, lastSeq: replay.lastSeq };
  }

  const response = await fetch(`/api/turns?session_id=${encodeURIComponent(session.id)}`, {
    headers: visitorHeader(session.visitorId),
  }).catch(() => null);
  if (!response)
    throw new VisitTransportError("the visit could not be resumed.", { code: "network" });
  const payload = await readJson(response);
  const closed = response.status === 410;
  if (!response.ok && !closed) throw visitError(response, payload);
  const rawTurns = Array.isArray(payload.turns) ? payload.turns : [];
  const turns = rawTurns
    .map((turn, index) => normalizeTurn(turn, "resident", `turn-${index}`))
    .filter((turn): turn is VisitTurn => Boolean(turn));
  const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
  for (const [index, rawArtifact] of artifacts.entries()) {
    const artifact = normalizeArtifact(rawArtifact, `artifact-${index}`);
    if (!artifact) continue;
    const turn = turns.find((candidate) => candidate.id === artifact.turnId);
    if (turn) turn.artifacts.push(artifact);
  }
  return { turns, events: [], closed, lastSeq: 0 };
}

export async function fetchVisitEvents(
  session: VisitSession,
  after: number,
  onEvent?: (event: NormalizedVisitEvent) => void,
): Promise<number> {
  if (session.transport !== "runtime") return after;
  const replay = await replayRuntimeEventPages({
    session,
    after,
    contextTurnId: "resident-reconnected",
    onEvent,
  });
  return Math.max(after, replay.lastSeq);
}

export async function streamVisitTurn(options: {
  session: VisitSession;
  body: string;
  clientTurnId: string;
  attachmentIds: string[];
  signal: AbortSignal;
  onEvent: (event: NormalizedVisitEvent) => void;
}): Promise<StreamResult> {
  const { session, body, clientTurnId, attachmentIds, signal, onEvent } = options;
  const endpoint =
    session.transport === "runtime"
      ? `/api/visit/${encodeURIComponent(session.id)}/turn`
      : "/api/message";
  const requestBody =
    session.transport === "runtime"
      ? {
          turn_id: clientTurnId,
          resident_id: session.resident,
          visitor_id: session.visitorId,
          surface: "visit",
          message: body,
          attachment_ids: attachmentIds,
        }
      : { session_id: session.id, body };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/x-ndjson",
      ...(session.transport === "runtime"
        ? { "idempotency-key": clientTurnId, ...visitorHeader(session.visitorId) }
        : {}),
    },
    body: JSON.stringify(requestBody),
    signal,
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new VisitTransportError("the room could not be reached.", { code: "network" });
  });
  if (!response.ok) throw visitError(response, await readJson(response));
  // A completed idempotent retry and a reclaimed legacy replay both include
  // the operation's original event range. The UI may already hold an early
  // streamed prefix, so replay only events beyond the cursor it had when this
  // request began. In particular, never append an already-rendered text delta
  // a second time.
  const replayFloor = session.lastSeq;
  const parsed = await parseEventResponse(
    response,
    clientTurnId,
    (event) => {
      if (event.seq != null && event.seq <= replayFloor) return;
      onEvent(event);
    },
    signal,
  );
  const terminalError = terminalVisitStreamError(parsed.events);
  if (terminalError) {
    throw new VisitTransportError(terminalError.message, {
      code: "runtime_error",
      // Only the canonical runtime can retry a durable client_turn_id without
      // inserting a second visitor turn. Legacy fallback errors fail closed.
      recoverable: session.transport === "runtime" && terminalError.recoverable,
    });
  }
  return {
    lastSeq: Math.max(session.lastSeq, parsed.lastSeq),
    closed: parsed.events.some(
      (event) => event.type === "visit.status" && event.status === "closed",
    ),
  };
}

export async function setDownVisit(session: VisitSession): Promise<void> {
  const endpoint =
    session.transport === "runtime"
      ? `/api/visit/${encodeURIComponent(session.id)}/set-down`
      : "/api/set-down";
  const body = session.transport === "runtime" ? {} : { session_id: session.id };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(session.transport === "runtime" ? visitorHeader(session.visitorId) : {}),
    },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!response)
    throw new VisitTransportError("the visit could not be set down.", { code: "network" });
  const payload = await readJson(response);
  if (!response.ok) throw visitError(response, payload);
}

export async function shareVisit(session: VisitSession): Promise<string> {
  const response = await fetch("/api/share", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...visitorHeader(session.visitorId),
    },
    body: JSON.stringify({ session_id: session.id }),
  }).catch(() => null);
  if (!response)
    throw new VisitTransportError("a share link could not be made.", { code: "network" });
  const payload = await readJson(response);
  if (!response.ok) throw visitError(response, payload);
  const url = stringValue(payload.url);
  if (!url)
    throw new VisitTransportError("the share endpoint returned no link.", {
      code: "runtime_error",
    });
  return url;
}

export async function fetchPublicInterior(resident: ResidentId): Promise<PublicInterior | null> {
  const response = await fetch(`/api/memory?resident=${encodeURIComponent(resident)}`).catch(
    () => null,
  );
  if (!response || !response.ok) return null;
  const payload = await readJson(response);
  const counts = isRecord(payload.counts) ? payload.counts : {};
  const recentRaw = Array.isArray(payload.lately) ? payload.lately : [];
  return {
    counts: {
      coreMemories: numberValue(counts.core_memories) ?? 0,
      daysResident: numberValue(counts.days_resident) ?? 0,
      conversationsHeld: numberValue(counts.conversations_held) ?? 0,
    },
    recent: recentRaw
      .map<PublicInterior["recent"][number] | null>((item, index) => {
        if (!isRecord(item)) return null;
        return {
          id: stringValue(item.id) ?? `recent-${index}`,
          kind: stringValue(item.kind) ?? "engram",
          when: stringValue(item.when) ?? "",
          body: stringValue(item.quote, item.prose) ?? "",
          meta: stringValue(item.prose),
        };
      })
      .filter((item): item is PublicInterior["recent"][number] => Boolean(item?.body)),
  };
}

export async function retryVisitAttachment(
  session: VisitSession,
  attachment: PendingAttachment,
  onState?: (attachment: PendingAttachment) => void,
): Promise<PendingAttachment> {
  const staged = attachment.staged;
  if (!staged || session.transport !== "runtime") {
    throw new VisitTransportError("this attachment has no resumable upload.", {
      code: "runtime_error",
      recoverable: false,
    });
  }

  const uploading: PendingAttachment = {
    ...attachment,
    state: "uploading",
    error: undefined,
  };
  onState?.(uploading);

  try {
    const uploadResponse = await fetch(staged.uploadUrl, {
      method: "PUT",
      headers: staged.headers,
      body: staged.file,
    });
    if (!uploadResponse.ok) {
      const payload = await readJson(uploadResponse);
      throw new VisitTransportError(
        stringValue(payload.message, payload.detail) ?? "the attachment upload did not complete.",
        {
          code: "runtime_error",
          status: uploadResponse.status,
        },
      );
    }

    const finalizeResponse = await fetch(staged.finalizeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...visitorHeader(session.visitorId),
      },
      body: JSON.stringify({ attachment_id: attachment.id }),
    });
    const finalized = await readJson(finalizeResponse);
    if (!finalizeResponse.ok) throw visitError(finalizeResponse, finalized);

    const ready: PendingAttachment = {
      id: attachment.id,
      name: attachment.name,
      size: attachment.size,
      type: attachment.type,
      state: "ready",
    };
    onState?.(ready);
    return ready;
  } catch (error) {
    const reservationWasRejected = error instanceof VisitTransportError && error.status === 413;
    onState?.({
      ...attachment,
      state: "failed",
      error: attachmentFailureMessage(error),
      // A confirmed 413 occurs before a new row can be reserved. Every
      // ambiguous failure keeps the exact staged handle so it cannot be
      // mistaken for a safely removable local failure.
      staged: reservationWasRejected ? undefined : attachment.staged,
    });
    throw error;
  }
}

const ATTACHMENT_EXTENSION_TYPES: Readonly<Record<string, string>> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function attachmentMediaTypeForFile(file: Pick<File, "name" | "type">): string {
  const declared = file.type.trim().toLowerCase();
  if (declared) return declared === "image/jpg" ? "image/jpeg" : declared;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ATTACHMENT_EXTENSION_TYPES[extension] ?? "";
}

export async function uploadVisitAttachment(
  session: VisitSession,
  file: File,
  onState?: (attachment: PendingAttachment) => void,
): Promise<PendingAttachment> {
  const capability = session.capabilities.attachments;
  if (!capability?.enabled || session.transport !== "runtime") {
    throw new VisitTransportError("attachments are not available in this visit.", {
      code: "unavailable",
      recoverable: false,
    });
  }
  if (capability.maxBytes && file.size > capability.maxBytes) {
    throw new VisitTransportError("that file is larger than this visit accepts.", {
      code: "runtime_error",
      recoverable: true,
    });
  }
  const mediaType = attachmentMediaTypeForFile(file);
  if (!mediaType || (capability.accept?.length && !capability.accept.includes(mediaType))) {
    throw new VisitTransportError("that file type is not supported in this visit.", {
      code: "runtime_error",
      recoverable: true,
    });
  }
  const base = `/api/visit/${encodeURIComponent(session.id)}/attachments`;
  if (capability.mode === "multipart" || capability.uploadEndpoint) {
    const form = new FormData();
    form.append("file", file, file.name);
    const response = await fetch(capability.uploadEndpoint ?? base, {
      method: "POST",
      headers: {
        "idempotency-key": `attachment-${crypto.randomUUID()}`,
        ...visitorHeader(session.visitorId),
      },
      body: form,
    });
    const payload = await readJson(response);
    if (!response.ok) throw visitError(response, payload);
    const attachment = isRecord(payload.attachment) ? payload.attachment : payload;
    const id = stringValue(attachment.id, attachment.attachment_id);
    if (!id) {
      throw new VisitTransportError("the attachment endpoint returned no attachment id.", {
        code: "runtime_error",
      });
    }
    return {
      id,
      name: stringValue(attachment.filename, attachment.name) ?? file.name,
      size: numberValue(attachment.byte_size, attachment.size) ?? file.size,
      type: stringValue(attachment.media_type, attachment.type) ?? file.type,
      state: "ready",
    };
  }
  const sha256 = await sha256File(file);
  const initEndpoint = capability.initEndpoint ?? `${base}/init`;
  const initResponse = await fetch(initEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...visitorHeader(session.visitorId),
    },
    body: JSON.stringify({ name: file.name, size: file.size, type: mediaType, sha256 }),
  });
  const init = await readJson(initResponse);
  if (!initResponse.ok) throw visitError(initResponse, init);
  const id = stringValue(init.attachment_id, init.id);
  const uploadUrl = stringValue(init.upload_url, init.url);
  const finalizeUrl =
    stringValue(init.finalize_url, init.finalizeUrl, capability.finalizeEndpoint) ??
    `${base}/finalize`;
  if (!id || !uploadUrl || !finalizeUrl) {
    throw new VisitTransportError("the attachment endpoint returned an incomplete upload.", {
      code: "runtime_error",
    });
  }
  const uploadHeaders = {
    "content-type": mediaType,
    ...visitorHeader(session.visitorId),
    ...(isRecord(init.headers)
      ? Object.fromEntries(
          Object.entries(init.headers).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {}),
  };
  const pending: PendingAttachment = {
    id,
    name: file.name,
    size: file.size,
    type: mediaType,
    state: "uploading",
    staged: {
      file,
      sha256,
      uploadUrl,
      finalizeUrl,
      headers: uploadHeaders,
      resumed: boolValue(init.resumed) ?? false,
    },
  };
  onState?.(pending);
  return retryVisitAttachment(session, pending, onState);
}

export async function removeVisitAttachment(
  session: VisitSession,
  attachmentId: string,
): Promise<void> {
  if (session.transport !== "runtime" || !session.capabilities.attachments) return;
  const response = await fetch(
    `/api/visit/${encodeURIComponent(session.id)}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      method: "DELETE",
      headers: {
        "idempotency-key": `attachment-remove-${attachmentId}`,
        ...visitorHeader(session.visitorId),
      },
    },
  );
  if (response.ok || response.status === 404) return;
  throw visitError(response, await readJson(response));
}

export function visitPhaseFromStatus(value: unknown): VisitPhase | null {
  return value === "booting" ||
    value === "ready" ||
    value === "thinking" ||
    value === "streaming" ||
    value === "reconnecting" ||
    value === "closing" ||
    value === "closed" ||
    value === "unavailable" ||
    value === "error"
    ? value
    : null;
}
