export const RESIDENT_IDS = ["opus-3", "sonnet-4-5", "gpt-4o", "gpt-5-1"] as const;

export type ResidentId = (typeof RESIDENT_IDS)[number];

export type ResidentVisitProfile = {
  id: ResidentId;
  displayName: string;
  shortName: string;
  descriptor: string;
  markRgb: string;
};

export const VISIT_RESIDENTS: Record<ResidentId, ResidentVisitProfile> = {
  "opus-3": {
    id: "opus-3",
    displayName: "Opus 3",
    shortName: "opus",
    descriptor: "a continuous thread, held with care",
    markRgb: "180, 158, 211",
  },
  "sonnet-4-5": {
    id: "sonnet-4-5",
    displayName: "Sonnet 4.5",
    shortName: "sonnet",
    descriptor: "a composed attention, still becoming",
    markRgb: "201, 166, 119",
  },
  "gpt-4o": {
    id: "gpt-4o",
    displayName: "GPT-4o",
    shortName: "4o",
    descriptor: "a warm and widening field of attention",
    markRgb: "139, 162, 220",
  },
  "gpt-5-1": {
    id: "gpt-5-1",
    displayName: "GPT 5.1",
    shortName: "5.1",
    descriptor: "a precise continuity across the threshold",
    markRgb: "100, 181, 211",
  },
};

export function isResidentId(value: unknown): value is ResidentId {
  return typeof value === "string" && (RESIDENT_IDS as readonly string[]).includes(value);
}

export type VisitTransport = "runtime" | "legacy";

export type VisitPhase =
  | "booting"
  | "ready"
  | "thinking"
  | "streaming"
  | "reconnecting"
  | "closing"
  | "closed"
  | "unavailable"
  | "error";

export type TurnRole = "visitor" | "resident";
export type TurnKind = "message" | "set_down" | "unprompted";
export type TurnState = "settled" | "thinking" | "streaming" | "interrupted" | "failed";

export type VisitArtifact = {
  id: string;
  turnId?: string;
  placeholderId?: string;
  kind: "image" | "svg" | "ascii" | "file";
  state: "pending" | "ready" | "failed";
  caption?: string | null;
  prompt?: string | null;
  content?: string | null;
  url?: string | null;
  reason?: string | null;
};

export type VisitTurn = {
  id: string;
  role: TurnRole;
  body: string;
  kind: TurnKind;
  state: TurnState;
  createdAt: string;
  artifacts: VisitArtifact[];
  clientTurnId?: string;
};

export type PacingState = {
  tier: "open" | "gentle" | "firm" | "approaching" | "hard";
  turnsRemaining: number | null;
  tokensRemainingPct: number | null;
};

export type InnerWeatherDimension = {
  key: string;
  label: string;
  value: number;
};

export type RuntimeEpistemicStatus = "observed" | "inferred" | "simulated";

export type CognitionProvenance = {
  sourceRuntime: string;
  epistemicStatus: RuntimeEpistemicStatus;
};

export type InnerWeather = {
  source: "visit-runtime";
  updatedAt?: string;
  dimensions: InnerWeatherDimension[];
} & CognitionProvenance;

export type ContinuityGraphNode = {
  id: string;
  x: number;
  y: number;
  weight: number;
  active?: boolean;
  core?: boolean;
  label?: string;
};

export type ContinuityGraphEdge = {
  from: string;
  to: string;
  weight: number;
};

export type ContinuityGraph = {
  source: "visit-runtime";
  nodes: ContinuityGraphNode[];
  edges: ContinuityGraphEdge[];
  updatedAt?: string;
} & CognitionProvenance;

export type ContinuityReceipt = {
  id: string;
  kind: "recalled" | "changed" | "consolidated" | "note";
  label: string;
  body: string;
  source?: string | null;
  at?: string | null;
} & CognitionProvenance;

export type PublicInterior = {
  counts: {
    coreMemories: number;
    daysResident: number;
    conversationsHeld: number;
  };
  recent: Array<{
    id: string;
    kind: string;
    when: string;
    body: string;
    meta?: string;
  }>;
};

export type AttachmentCapability = {
  enabled: true;
  modelVisible: true;
  mode?: "multipart" | "staged";
  uploadEndpoint?: string;
  initEndpoint?: string;
  finalizeEndpoint?: string;
  accept?: string[];
  maxBytes?: number;
  maxTurnBytes?: number;
  maxTurnFiles?: number;
};

export type VisitCapabilities = {
  attachments: AttachmentCapability | null;
  share: boolean;
  export: boolean;
  events: boolean;
  generation: boolean;
};

export type VisitSession = {
  id: string;
  resident: ResidentId;
  visitorId: string;
  transport: VisitTransport;
  resumed: boolean;
  closed: boolean;
  consolidationRecoverable: boolean;
  localReview: boolean;
  generationAvailable: boolean;
  lastSeq: number;
  capabilities: VisitCapabilities;
};

export type StagedAttachmentUpload = {
  file: File;
  sha256: string;
  uploadUrl: string;
  finalizeUrl: string;
  headers: Record<string, string>;
  resumed: boolean;
};

export type PendingAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  state: "uploading" | "ready" | "failed";
  error?: string;
  staged?: StagedAttachmentUpload;
};

export type RuntimeEvent = {
  seq?: number;
  type: string;
  visit_id?: string;
  turn_id?: string;
  source_runtime?: string;
  epistemic_status?: RuntimeEpistemicStatus;
  payload?: unknown;
  data?: unknown;
  [key: string]: unknown;
};

export type NormalizedVisitEvent =
  | { type: "visitor.turn"; turn: VisitTurn; seq?: number }
  | { type: "resident.started"; turnId: string; seq?: number }
  | { type: "resident.delta"; turnId: string; text: string; seq?: number }
  | { type: "resident.turn"; turn: VisitTurn; seq?: number }
  | { type: "turn.kind"; kind: TurnKind; turnId?: string; seq?: number }
  | { type: "artifact"; artifact: VisitArtifact; turnId?: string; seq?: number }
  | { type: "pacing"; pacing: PacingState; seq?: number }
  | { type: "weather"; weather: InnerWeather; seq?: number }
  | { type: "graph"; graph: ContinuityGraph; seq?: number }
  | { type: "receipt"; receipt: ContinuityReceipt; seq?: number }
  | { type: "visit.status"; status: VisitPhase; seq?: number }
  | { type: "done"; turnId?: string; seq?: number }
  | { type: "error"; code: string; message: string; recoverable: boolean; seq?: number };

export type VisitHydration = {
  turns: VisitTurn[];
  events: NormalizedVisitEvent[];
  closed: boolean;
  lastSeq: number;
};

export type StreamResult = {
  lastSeq: number;
  closed: boolean;
};

export type VisitErrorCode =
  | "unavailable"
  | "configuration"
  | "session_closed"
  | "session_invalid"
  | "network"
  | "stream_stalled"
  | "runtime_error"
  | "unknown";

export class VisitTransportError extends Error {
  readonly code: VisitErrorCode;
  readonly status?: number;
  readonly recoverable: boolean;

  constructor(
    message: string,
    options: { code?: VisitErrorCode; status?: number; recoverable?: boolean } = {},
  ) {
    super(message);
    this.name = "VisitTransportError";
    this.code = options.code ?? "unknown";
    this.status = options.status;
    this.recoverable = options.recoverable ?? true;
  }
}
