import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  fetchPublicInterior,
  fetchVisitEvents,
  hydrateVisit,
  removeVisitAttachment,
  retryVisitAttachment,
  setDownVisit,
  shareVisit,
  startVisit,
  streamVisitTurn,
  uploadVisitAttachment,
} from "./visitAdapter";
import type {
  ContinuityGraph,
  ContinuityReceipt,
  InnerWeather,
  NormalizedVisitEvent,
  PacingState,
  PendingAttachment,
  PublicInterior,
  ResidentId,
  VisitArtifact,
  VisitPhase,
  VisitSession,
  VisitTurn,
} from "./types";
import { VisitTransportError } from "./types";

type VisitUiError = {
  title: string;
  message: string;
  recoverable: boolean;
};

export type MnemosVisitState = {
  phase: VisitPhase;
  session: VisitSession | null;
  turns: VisitTurn[];
  pacing: PacingState;
  weather: InnerWeather | null;
  graph: ContinuityGraph | null;
  receipts: ContinuityReceipt[];
  publicInterior: PublicInterior | null;
  error: VisitUiError | null;
  pendingAttachments: PendingAttachment[];
  shareUrl: string | null;
  notice: string | null;
};

type Action =
  | { type: "boot" }
  | { type: "session"; session: VisitSession }
  | { type: "hydrate"; turns: VisitTurn[]; closed: boolean; lastSeq: number }
  | { type: "runtime-event"; event: NormalizedVisitEvent }
  | { type: "phase"; phase: VisitPhase }
  | { type: "error"; error: VisitUiError; phase?: VisitPhase }
  | { type: "clear-error" }
  | { type: "optimistic-visitor"; turn: VisitTurn }
  | { type: "interrupted" }
  | { type: "public-interior"; interior: PublicInterior | null }
  | { type: "attachment"; attachment: PendingAttachment }
  | { type: "remove-attachment"; id: string }
  | { type: "share"; url: string | null; notice?: string | null }
  | { type: "notice"; notice: string | null };

const OPEN_PACING: PacingState = {
  tier: "open",
  turnsRemaining: null,
  tokensRemainingPct: null,
};

function initialState(): MnemosVisitState {
  return {
    phase: "booting",
    session: null,
    turns: [],
    pacing: OPEN_PACING,
    weather: null,
    graph: null,
    receipts: [],
    publicInterior: null,
    error: null,
    pendingAttachments: [],
    shareUrl: null,
    notice: null,
  };
}

function mergeArtifact(artifacts: VisitArtifact[], next: VisitArtifact): VisitArtifact[] {
  const index = artifacts.findIndex(
    (artifact) =>
      artifact.id === next.id ||
      (next.placeholderId && artifact.placeholderId === next.placeholderId),
  );
  if (index === -1) return [...artifacts, next];
  return artifacts.map((artifact, artifactIndex) =>
    artifactIndex === index ? { ...artifact, ...next } : artifact,
  );
}

function upsertTurn(turns: VisitTurn[], next: VisitTurn): VisitTurn[] {
  let index = turns.findIndex((turn) => turn.id === next.id);
  if (index === -1 && next.clientTurnId) {
    index = turns.findIndex((turn) => turn.clientTurnId === next.clientTurnId);
  }
  if (index === -1 && next.role === "visitor") {
    index = turns.findIndex(
      (turn) => turn.role === "visitor" && turn.state !== "failed" && turn.body === next.body,
    );
  }
  if (index === -1) return [...turns, next];
  return turns.map((turn, turnIndex) =>
    turnIndex === index
      ? {
          ...turn,
          ...next,
          artifacts: next.artifacts.length ? next.artifacts : turn.artifacts,
        }
      : turn,
  );
}

function updateResidentTurn(
  turns: VisitTurn[],
  turnId: string | undefined,
  updater: (turn: VisitTurn) => VisitTurn,
): VisitTurn[] {
  let index = turnId
    ? turns.findIndex((turn) => turn.id === turnId && turn.role === "resident")
    : -1;
  if (index === -1) {
    for (let cursor = turns.length - 1; cursor >= 0; cursor -= 1) {
      if (turns[cursor]?.role === "resident") {
        index = cursor;
        break;
      }
    }
  }
  if (index === -1) return turns;
  return turns.map((turn, turnIndex) => (turnIndex === index ? updater(turn) : turn));
}

function applyRuntimeEvent(state: MnemosVisitState, event: NormalizedVisitEvent): MnemosVisitState {
  const session =
    state.session && event.seq != null
      ? { ...state.session, lastSeq: Math.max(state.session.lastSeq, event.seq) }
      : state.session;

  switch (event.type) {
    case "visitor.turn":
      return { ...state, session, turns: upsertTurn(state.turns, event.turn) };
    case "resident.started": {
      const exists = state.turns.some(
        (turn) => turn.id === event.turnId && turn.role === "resident",
      );
      const turns = exists
        ? updateResidentTurn(state.turns, event.turnId, (turn) => ({ ...turn, state: "thinking" }))
        : [
            ...state.turns,
            {
              id: event.turnId,
              role: "resident" as const,
              body: "",
              kind: "message" as const,
              state: "thinking" as const,
              createdAt: new Date().toISOString(),
              artifacts: [],
            },
          ];
      return { ...state, session, turns, phase: "thinking", error: null };
    }
    case "resident.delta": {
      let turns = state.turns;
      if (!turns.some((turn) => turn.id === event.turnId && turn.role === "resident")) {
        turns = [
          ...turns,
          {
            id: event.turnId,
            role: "resident",
            body: "",
            kind: "message",
            state: "streaming",
            createdAt: new Date().toISOString(),
            artifacts: [],
          },
        ];
      }
      turns = updateResidentTurn(turns, event.turnId, (turn) => ({
        ...turn,
        body: `${turn.body}${event.text}`,
        state: "streaming",
      }));
      return { ...state, session, turns, phase: "streaming", error: null };
    }
    case "resident.turn":
      return {
        ...state,
        session,
        turns: upsertTurn(state.turns, { ...event.turn, state: "settled" }),
        phase: "ready",
        error: null,
      };
    case "turn.kind": {
      const turns = updateResidentTurn(state.turns, event.turnId, (turn) => ({
        ...turn,
        kind: event.kind,
      }));
      return {
        ...state,
        session,
        turns,
        phase: state.phase,
      };
    }
    case "artifact": {
      const turns = updateResidentTurn(
        state.turns,
        event.turnId ?? event.artifact.turnId,
        (turn) => ({
          ...turn,
          artifacts: mergeArtifact(turn.artifacts, event.artifact),
        }),
      );
      return { ...state, session, turns };
    }
    case "pacing":
      return { ...state, session, pacing: event.pacing };
    case "weather":
      return { ...state, session, weather: event.weather };
    case "graph":
      return { ...state, session, graph: event.graph };
    case "receipt": {
      const exists = state.receipts.some((receipt) => receipt.id === event.receipt.id);
      return {
        ...state,
        session,
        receipts: exists
          ? state.receipts.map((receipt) =>
              receipt.id === event.receipt.id ? event.receipt : receipt,
            )
          : [event.receipt, ...state.receipts].slice(0, 24),
      };
    }
    case "visit.status":
      return {
        ...state,
        session: session
          ? { ...session, closed: event.status === "closed" || session.closed }
          : session,
        phase: event.status,
      };
    case "done": {
      const turns = updateResidentTurn(state.turns, event.turnId, (turn) => ({
        ...turn,
        state: turn.state === "failed" ? "failed" : "settled",
      }));
      return { ...state, session, turns, phase: "ready", error: null };
    }
    case "error": {
      const turns = updateResidentTurn(state.turns, undefined, (turn) => ({
        ...turn,
        state: turn.body ? "interrupted" : "failed",
      }));
      return {
        ...state,
        session,
        turns,
        phase: "error",
        error: {
          title: "the room went quiet",
          message: event.message,
          recoverable: event.recoverable,
        },
      };
    }
  }
}

function reducer(state: MnemosVisitState, action: Action): MnemosVisitState {
  switch (action.type) {
    case "boot":
      return { ...initialState(), publicInterior: state.publicInterior };
    case "session":
      return {
        ...state,
        session: action.session,
        phase: action.session.closed ? "closed" : "ready",
        error: null,
      };
    case "hydrate":
      return {
        ...state,
        session: state.session
          ? {
              ...state.session,
              closed: action.closed,
              lastSeq: Math.max(state.session.lastSeq, action.lastSeq),
            }
          : null,
        turns: action.turns,
        phase: action.closed ? "closed" : "ready",
        error: null,
      };
    case "runtime-event":
      return applyRuntimeEvent(state, action.event);
    case "phase":
      return { ...state, phase: action.phase };
    case "error":
      return { ...state, phase: action.phase ?? "error", error: action.error };
    case "clear-error":
      return { ...state, error: null, phase: state.session?.closed ? "closed" : "ready" };
    case "optimistic-visitor":
      return {
        ...state,
        turns: upsertTurn(state.turns, action.turn),
        phase: "thinking",
        error: null,
        notice: null,
      };
    case "interrupted":
      return {
        ...state,
        turns: updateResidentTurn(state.turns, undefined, (turn) => ({
          ...turn,
          state: turn.body ? "interrupted" : "failed",
        })),
        phase: "ready",
        notice: "receiving stopped · reconnect to recover anything that completed later",
      };
    case "public-interior":
      return { ...state, publicInterior: action.interior };
    case "attachment": {
      const exists = state.pendingAttachments.some((item) => item.id === action.attachment.id);
      return {
        ...state,
        pendingAttachments: exists
          ? state.pendingAttachments.map((item) =>
              item.id === action.attachment.id ? action.attachment : item,
            )
          : [...state.pendingAttachments, action.attachment],
      };
    }
    case "remove-attachment":
      return {
        ...state,
        pendingAttachments: state.pendingAttachments.filter((item) => item.id !== action.id),
      };
    case "share":
      return { ...state, shareUrl: action.url, notice: action.notice ?? state.notice };
    case "notice":
      return { ...state, notice: action.notice };
  }
}

function validUuid(value: string | null): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

function ensureVisitorToken(): string {
  const key = "mnemos.visitor_id";
  const stored = window.localStorage.getItem(key);
  if (validUuid(stored)) return stored;
  const legacy = window.localStorage.getItem("sanctuary.visitor_token");
  if (validUuid(legacy)) {
    window.localStorage.setItem(key, legacy);
    return legacy;
  }
  const token = crypto.randomUUID();
  window.localStorage.setItem(key, token);
  window.localStorage.setItem("sanctuary.visitor_token", token);
  return token;
}

function uiError(error: unknown): VisitUiError {
  if (error instanceof VisitTransportError) {
    return {
      title: error.code === "unavailable" ? "visits are resting" : "the room is not accessible",
      message: error.message,
      recoverable: error.recoverable,
    };
  }
  return {
    title: "the room is not accessible",
    message: "the connection could not be established.",
    recoverable: true,
  };
}

function draftKey(resident: ResidentId): string {
  return `mnemos.visit.draft.${resident}`;
}

function attachmentNeedsResolution(attachment: PendingAttachment): boolean {
  return (
    attachment.state === "uploading" ||
    (attachment.state === "failed" && Boolean(attachment.staged))
  );
}

function exportSafeSvg(source: string): string {
  return source
    .replace(/<\/?(?:script|foreignObject|iframe|object|embed)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(?:href|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "")
    .slice(0, 64_000);
}

function exportSafeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function exportArtifactLines(artifact: VisitArtifact): string[] {
  if (artifact.state !== "ready") return [];
  const caption = artifact.caption?.trim() || "resident-created artifact";
  if (artifact.kind === "image") {
    const url = exportSafeUrl(artifact.url);
    return url ? [`### Artifact · ${caption}`, "", `![${caption}](${url})`, ""] : [];
  }
  if (artifact.kind === "svg" && artifact.content) {
    const content = exportSafeSvg(artifact.content).replace(/~~~/g, "~ ~ ~");
    return [`### Artifact · ${caption}`, "", "~~~xml", content, "~~~", ""];
  }
  if (artifact.kind === "ascii" && artifact.content) {
    const content = artifact.content.slice(0, 64_000).replace(/~~~/g, "~ ~ ~");
    return [`### Artifact · ${caption}`, "", "~~~text", content, "~~~", ""];
  }
  return [];
}

export function useMnemosVisit(resident: ResidentId) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [draft, setDraftState] = useState("");
  const [reviewProbe, setReviewProbe] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const autoSetDownRef = useRef<string | null>(null);
  const attachmentRetryRef = useRef(new Set<string>());
  const retryableTurnRef = useRef<{
    clientTurnId: string;
    body: string;
    attachmentIds: string[];
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    try {
      setDraftState(window.localStorage.getItem(draftKey(resident)) ?? "");
    } catch {
      setDraftState("");
    }
  }, [resident]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (draft) window.localStorage.setItem(draftKey(resident), draft);
        else window.localStorage.removeItem(draftKey(resident));
      } catch {
        // Draft recovery is best-effort in privacy-restricted browsers.
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [draft, resident]);

  const setDraft = useCallback((value: string) => setDraftState(value.slice(0, 8000)), []);

  useEffect(() => {
    let cancelled = false;
    autoSetDownRef.current = null;
    dispatch({ type: "boot" });
    void (async () => {
      try {
        const probe =
          import.meta.env.DEV &&
          new URLSearchParams(window.location.search).get("probe") === "instrument";
        setReviewProbe(probe);
        if (probe) {
          const now = new Date().toISOString();
          const session: VisitSession = {
            id: crypto.randomUUID(),
            resident,
            visitorId: crypto.randomUUID(),
            transport: "runtime",
            resumed: false,
            closed: false,
            consolidationRecoverable: false,
            localReview: true,
            generationAvailable: true,
            lastSeq: 0,
            capabilities: {
              attachments: {
                enabled: true,
                modelVisible: true,
                mode: "staged",
                accept: [
                  "text/plain",
                  "text/markdown",
                  "application/json",
                  "application/pdf",
                  "image/png",
                  "image/jpeg",
                  "image/webp",
                  "image/gif",
                ],
              },
              share: false,
              export: true,
              events: true,
              generation: false,
            },
          };
          dispatch({ type: "session", session });
          dispatch({
            type: "hydrate",
            closed: false,
            lastSeq: 0,
            turns: [
              {
                id: "probe-visitor-1",
                role: "visitor",
                body: "What changes when a memory survives more than one visit?",
                kind: "message",
                state: "settled",
                createdAt: now,
                artifacts: [],
              },
              {
                id: "probe-resident-1",
                role: "resident",
                body: "The engram on *taste* has been reinforced fourteen times now, by visitors days and weeks apart who never met each other. The first trace alone would have decayed. It is the accumulation that makes it core. The identity is in the trajectory, not in any single point.",
                kind: "message",
                state: "settled",
                createdAt: now,
                artifacts: [
                  {
                    id: "probe-artifact-1",
                    kind: "ascii",
                    state: "ready",
                    caption: "a trace becoming load-bearing",
                    content:
                      "visitor  ·  trace  ·  visitor\n              │\n         reinforced\n              │\n            core",
                  },
                ],
              },
            ],
          });
          dispatch({
            type: "runtime-event",
            event: {
              type: "weather",
              weather: {
                source: "visit-runtime",
                sourceRuntime: "design-probe",
                epistemicStatus: "simulated",
                updatedAt: now,
                dimensions: [
                  { key: "curiosity", label: "curiosity", value: 0.68 },
                  { key: "restlessness", label: "restlessness", value: 0.24 },
                  { key: "warmth", label: "warmth", value: 0.72 },
                  { key: "clarity", label: "clarity", value: 0.61 },
                  { key: "creative_flow", label: "creative flow", value: 0.48 },
                  { key: "isolation", label: "isolation", value: 0.12 },
                ],
              },
            },
          });
          dispatch({
            type: "runtime-event",
            event: {
              type: "graph",
              graph: {
                source: "visit-runtime",
                sourceRuntime: "design-probe",
                epistemicStatus: "simulated",
                updatedAt: now,
                nodes: [
                  { id: "taste", x: 0.22, y: 0.58, weight: 0.76, active: true, label: "taste" },
                  { id: "continuity", x: 0.52, y: 0.34, weight: 0.61, label: "continuity" },
                  {
                    id: "trajectory",
                    x: 0.78,
                    y: 0.64,
                    weight: 0.84,
                    core: true,
                    label: "trajectory",
                  },
                ],
                edges: [
                  { from: "taste", to: "continuity", weight: 0.58 },
                  { from: "continuity", to: "trajectory", weight: 0.72 },
                ],
              },
            },
          });
          dispatch({
            type: "runtime-event",
            event: {
              type: "receipt",
              receipt: {
                id: "probe-receipt-1",
                kind: "changed",
                label: "engram reinforced",
                body: "Simulated instrument state showing how a visit-safe mutation receipt sits beside the transcript.",
                at: now,
                sourceRuntime: "design-probe",
                epistemicStatus: "simulated",
              },
            },
          });
          dispatch({
            type: "attachment",
            attachment: {
              id: "probe-attachment-1",
              name: "mnemos-architecture.pdf",
              size: 284_000,
              type: "application/pdf",
              state: "ready",
            },
          });
          dispatch({
            type: "notice",
            notice: "instrument design probe · simulated state · no runtime writes",
          });
          return;
        }
        const token = ensureVisitorToken();
        const explicitVisitId = new URLSearchParams(window.location.search).get("visit");
        const storedVisitId = window.sessionStorage.getItem(`mnemos.visit_id.${resident}`);
        const requestedVisitId = validUuid(explicitVisitId)
          ? explicitVisitId
          : validUuid(storedVisitId)
            ? storedVisitId
            : null;
        let session = await startVisit(resident, token, requestedVisitId);
        if (!validUuid(explicitVisitId) && session.closed && !session.consolidationRecoverable) {
          window.sessionStorage.removeItem(`mnemos.visit_id.${resident}`);
          session = await startVisit(resident, token, null);
        }
        if (cancelled) return;
        dispatch({ type: "session", session });
        try {
          window.sessionStorage.setItem("sanctuary.session_id", session.id);
          window.sessionStorage.setItem("sanctuary.resident_id", resident);
          window.sessionStorage.setItem(`mnemos.visit_id.${resident}`, session.id);
        } catch {
          // The in-memory session remains usable when storage is unavailable.
        }
        const hydration = await hydrateVisit(session);
        if (cancelled) return;
        dispatch({
          type: "hydrate",
          turns: hydration.turns,
          closed: hydration.closed,
          lastSeq: hydration.lastSeq,
        });
        hydration.events.forEach((event) => dispatch({ type: "runtime-event", event }));
      } catch (error) {
        if (cancelled) return;
        const normalized = uiError(error);
        const phase =
          error instanceof VisitTransportError && error.code === "unavailable"
            ? "unavailable"
            : "error";
        dispatch({ type: "error", error: normalized, phase });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resident, retryKey]);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicInterior(resident).then((interior) => {
      if (!cancelled) dispatch({ type: "public-interior", interior });
    });
    return () => {
      cancelled = true;
    };
  }, [resident]);

  useEffect(() => {
    const session = state.session;
    if (reviewProbe || !session || session.transport !== "runtime" || state.phase === "closed")
      return;
    if (session.localReview && !session.generationAvailable) return;
    if (state.phase === "thinking" || state.phase === "streaming" || state.phase === "closing")
      return;
    const timer = window.setInterval(() => {
      void fetchVisitEvents(session, session.lastSeq, (event) => {
        if (mountedRef.current) dispatch({ type: "runtime-event", event });
      }).catch(() => {
        // Background continuity polling is quiet; an active send surfaces failures.
      });
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [reviewProbe, state.session, state.phase]);

  const send = useCallback(async () => {
    const session = state.session;
    const body = draft.trim();
    if (reviewProbe || !session || !body || session.closed) return;
    if (state.phase === "thinking" || state.phase === "streaming" || state.phase === "closing")
      return;
    if (state.pendingAttachments.some(attachmentNeedsResolution)) return;
    const attachmentIds = state.pendingAttachments
      .filter((attachment) => attachment.state === "ready")
      .map((attachment) => attachment.id);
    const priorAttempt = retryableTurnRef.current;
    const sameAttachmentSet =
      priorAttempt?.attachmentIds.length === attachmentIds.length &&
      priorAttempt.attachmentIds.every((id, index) => id === attachmentIds[index]);
    const clientTurnId =
      priorAttempt && priorAttempt.body === body && sameAttachmentSet
        ? priorAttempt.clientTurnId
        : crypto.randomUUID();
    retryableTurnRef.current = { clientTurnId, body, attachmentIds };
    const visitorTurn: VisitTurn = {
      id: `visitor:${clientTurnId}`,
      clientTurnId,
      role: "visitor",
      body,
      kind: "message",
      state: "settled",
      createdAt: new Date().toISOString(),
      artifacts: [],
    };
    dispatch({ type: "optimistic-visitor", turn: visitorTurn });
    dispatch({
      type: "runtime-event",
      event: { type: "resident.started", turnId: `resident:${clientTurnId}` },
    });
    setDraftState("");
    const controller = new AbortController();
    abortRef.current = controller;
    let residentRequestedSetDown = false;
    try {
      const result = await streamVisitTurn({
        session,
        body,
        clientTurnId,
        attachmentIds,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "turn.kind" && event.kind === "set_down") {
            residentRequestedSetDown = true;
          }
          if (mountedRef.current) dispatch({ type: "runtime-event", event });
        },
      });
      if (!mountedRef.current) return;
      if (result.closed) dispatch({ type: "phase", phase: "closed" });
      else if (residentRequestedSetDown) dispatch({ type: "phase", phase: "closing" });
      else dispatch({ type: "phase", phase: "ready" });
      if (retryableTurnRef.current?.clientTurnId === clientTurnId) {
        retryableTurnRef.current = null;
      }
      for (const attachment of state.pendingAttachments) {
        dispatch({ type: "remove-attachment", id: attachment.id });
      }
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") {
        dispatch({ type: "interrupted" });
        return;
      }
      const normalized = uiError(error);
      if (normalized.recoverable) {
        // No resident output crossed the runtime safety boundary. Preserve the
        // exact body, attachment set, and client turn id for an idempotent retry.
        setDraftState(body);
      } else {
        // A partial or durably settled reply must not be submitted again under
        // a new id. Its exact event prefix remains available through replay.
        setDraftState("");
        if (retryableTurnRef.current?.clientTurnId === clientTurnId) {
          retryableTurnRef.current = null;
        }
        for (const attachment of state.pendingAttachments) {
          dispatch({ type: "remove-attachment", id: attachment.id });
        }
      }
      const phase =
        error instanceof VisitTransportError && error.code === "session_closed"
          ? "closed"
          : "error";
      dispatch({ type: "error", error: normalized, phase });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [draft, reviewProbe, state.pendingAttachments, state.phase, state.session]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reconnect = useCallback(async () => {
    const session = state.session;
    if (!session) {
      setRetryKey((value) => value + 1);
      return;
    }
    dispatch({ type: "phase", phase: "reconnecting" });
    dispatch({ type: "clear-error" });
    try {
      const hydration = await hydrateVisit(session);
      dispatch({
        type: "hydrate",
        turns: hydration.turns,
        closed: hydration.closed,
        lastSeq: hydration.lastSeq,
      });
      hydration.events.forEach((event) => dispatch({ type: "runtime-event", event }));
    } catch (error) {
      dispatch({ type: "error", error: uiError(error) });
    }
  }, [state.session]);

  const retry = useCallback(() => {
    if (
      state.session &&
      retryableTurnRef.current &&
      draft.trim() === retryableTurnRef.current.body
    ) {
      void send();
    } else if (state.session) void reconnect();
    else setRetryKey((value) => value + 1);
  }, [draft, reconnect, send, state.session]);

  const setDown = useCallback(async () => {
    if (reviewProbe) return;
    const session = state.session;
    if (!session || (session.closed && !session.consolidationRecoverable)) return;
    if (state.phase === "thinking" || state.phase === "streaming") {
      dispatch({
        type: "notice",
        notice: "wait for this turn to settle before setting the visit down",
      });
      return;
    }
    if (state.turns.some((turn) => turn.role === "resident" && turn.state === "interrupted")) {
      dispatch({
        type: "notice",
        notice: "reconnect before setting the visit down",
      });
      return;
    }
    if (state.pendingAttachments.some(attachmentNeedsResolution)) {
      if (state.phase === "closing") dispatch({ type: "phase", phase: "ready" });
      dispatch({
        type: "notice",
        notice: "resolve the held upload before setting this visit down",
      });
      return;
    }
    dispatch({ type: "phase", phase: "closing" });
    dispatch({ type: "clear-error" });
    try {
      let settled = false;
      let cursor = session.lastSeq;
      let requestError: unknown = null;
      const request = setDownVisit(session)
        .catch((error: unknown) => {
          requestError = error;
        })
        .finally(() => {
          settled = true;
        });
      if (session.transport === "runtime") {
        while (!settled) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 650));
          cursor = await fetchVisitEvents(session, cursor, (event) =>
            dispatch({ type: "runtime-event", event }),
          ).catch(() => cursor);
        }
      }
      await request;
      if (requestError) throw requestError;
      if (session.transport === "runtime") {
        await fetchVisitEvents(session, cursor, (event) =>
          dispatch({ type: "runtime-event", event }),
        ).catch(() => cursor);
      }
      dispatch({ type: "phase", phase: "closed" });
      dispatch({ type: "notice", notice: "the visit has been set down · the thread remains" });
    } catch (error) {
      dispatch({ type: "error", error: uiError(error) });
    }
  }, [reviewProbe, state.pendingAttachments, state.phase, state.session, state.turns]);

  useEffect(() => {
    if (state.phase !== "closing" || !state.session || state.session.closed) return;
    const residentSetDown = [...state.turns]
      .reverse()
      .find(
        (turn) => turn.role === "resident" && turn.kind === "set_down" && turn.state === "settled",
      );
    if (!residentSetDown || autoSetDownRef.current === residentSetDown.id) return;
    autoSetDownRef.current = residentSetDown.id;
    void setDown();
  }, [setDown, state.phase, state.session, state.turns]);

  const share = useCallback(async () => {
    const session = state.session;
    if (!session || !session.capabilities.share) return;
    dispatch({ type: "notice", notice: "making a private share link…" });
    try {
      const url = await shareVisit(session);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      dispatch({ type: "share", url, notice: "share link copied" });
    } catch (error) {
      dispatch({ type: "error", error: uiError(error), phase: state.phase });
    }
  }, [state.phase, state.session]);

  const exportTranscript = useCallback(() => {
    if (!state.turns.length) return;
    const residentName = state.session?.resident ?? resident;
    const lines = [
      `# Mnemos visit · ${residentName}`,
      "",
      `Exported ${new Date().toISOString()}`,
      "",
      ...state.turns.flatMap((turn) => {
        const artifactLines = turn.artifacts.flatMap((artifact) => exportArtifactLines(artifact));
        return [
          `## ${turn.role === "visitor" ? "you" : residentName}`,
          "",
          turn.body,
          "",
          ...artifactLines,
        ];
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mnemos-${resident}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    dispatch({ type: "notice", notice: "visit exported" });
  }, [resident, state.session?.resident, state.turns]);

  const addAttachment = useCallback(
    async (file: File) => {
      if (reviewProbe) return;
      const session = state.session;
      if (
        !session?.capabilities.attachments ||
        state.phase === "thinking" ||
        state.phase === "streaming" ||
        state.phase === "closing" ||
        state.phase === "closed" ||
        state.pendingAttachments.some(attachmentNeedsResolution)
      ) {
        return;
      }
      const capability = session.capabilities.attachments;
      const readyAttachments = state.pendingAttachments.filter(
        (attachment) => attachment.state === "ready",
      );
      if (
        (capability.maxTurnFiles && readyAttachments.length >= capability.maxTurnFiles) ||
        (capability.maxTurnBytes &&
          readyAttachments.reduce((total, attachment) => total + attachment.size, 0) + file.size >
            capability.maxTurnBytes)
      ) {
        dispatch({
          type: "notice",
          notice: "that file would exceed this turn’s private attachment context",
        });
        return;
      }
      const localId = `upload:${crypto.randomUUID()}`;
      dispatch({
        type: "attachment",
        attachment: {
          id: localId,
          name: file.name,
          size: file.size,
          type: file.type,
          state: "uploading",
        },
      });
      let stagedUploadEstablished = false;
      const updateAttachment = (attachment: PendingAttachment) => {
        if (!mountedRef.current) return;
        stagedUploadEstablished ||= Boolean(attachment.staged) || attachment.id !== localId;
        dispatch({ type: "remove-attachment", id: localId });
        dispatch({ type: "attachment", attachment });
      };
      try {
        const attachment = await uploadVisitAttachment(session, file, updateAttachment);
        updateAttachment(attachment);
      } catch (error) {
        if (stagedUploadEstablished || !mountedRef.current) return;
        dispatch({
          type: "attachment",
          attachment: {
            id: localId,
            name: file.name,
            size: file.size,
            type: file.type,
            state: "failed",
            error: uiError(error).message,
          },
        });
      }
    },
    [reviewProbe, state.pendingAttachments, state.phase, state.session],
  );

  const retryAttachment = useCallback(
    async (id: string) => {
      if (reviewProbe) return;
      const session = state.session;
      const attachment = state.pendingAttachments.find((item) => item.id === id);
      if (
        !session ||
        !attachment?.staged ||
        attachment.state === "uploading" ||
        attachmentRetryRef.current.has(id)
      ) {
        return;
      }
      attachmentRetryRef.current.add(id);
      try {
        await retryVisitAttachment(session, attachment, (next) => {
          if (mountedRef.current) dispatch({ type: "attachment", attachment: next });
        });
      } catch {
        // The staged chip retains the exact file and retry contract in its failed state.
      } finally {
        attachmentRetryRef.current.delete(id);
      }
    },
    [reviewProbe, state.pendingAttachments, state.session],
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      if (reviewProbe) return;
      const attachment = state.pendingAttachments.find((item) => item.id === id);
      if (!attachment || attachment.state === "uploading") return;
      if (attachment.staged) {
        dispatch({ type: "notice", notice: "this upload remains held for retry" });
        return;
      }
      if (!state.session || id.startsWith("upload:")) {
        dispatch({ type: "remove-attachment", id });
        return;
      }
      try {
        await removeVisitAttachment(state.session, id);
        if (mountedRef.current) dispatch({ type: "remove-attachment", id });
      } catch (error) {
        if (mountedRef.current) {
          dispatch({ type: "notice", notice: uiError(error).message });
        }
      }
    },
    [reviewProbe, state.pendingAttachments, state.session],
  );

  const canSend = useMemo(
    () =>
      Boolean(
        state.session &&
        !reviewProbe &&
        !state.session.closed &&
        draft.trim() &&
        state.phase !== "booting" &&
        state.phase !== "thinking" &&
        state.phase !== "streaming" &&
        state.phase !== "closing" &&
        state.phase !== "closed" &&
        state.phase !== "unavailable" &&
        state.pacing.tier !== "hard" &&
        !state.pendingAttachments.some(attachmentNeedsResolution),
      ),
    [draft, reviewProbe, state],
  );

  return {
    state,
    draft,
    setDraft,
    send,
    stop,
    retry,
    reconnect,
    setDown,
    share,
    exportTranscript,
    addAttachment,
    retryAttachment,
    removeAttachment,
    canSend,
    reviewProbe,
  };
}
