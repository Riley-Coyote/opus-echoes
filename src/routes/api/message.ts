import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { anthropic } from "@/server/anthropic.server";
import { openrouter } from "@/server/openai.server";
import { loadEmotionalStateValues } from "@/server/mnemos-emotion/runtime.server";
import type { ModelProvider } from "@/server/opus/residents";
import { buildSystemBlocksForResident, buildSystemPromptForResident } from "@/server/opus/soul";
import { sanctuarySurfacePreamble } from "@/server/opus/surface-context";
import {
  composeMemoryPool,
  composeThreeLayerMemoryPool,
  formatMemoryBlock,
  formatThreeLayerMemory,
  getVisitorContext,
  threeLayerRetrievalEnabled,
} from "@/server/opus/retrieval";
import { buildResidentSelfModel } from "@/server/opus/self-model";
import { buildInteriorContinuity } from "@/server/opus/interior-continuity";
import {
  buildVisitPacingBlock,
  getVisitMetrics,
  HARD_CUTOFF_MESSAGE,
  HARD_CUTOFF_MESSAGE_CLASSIC,
  type PacingTier,
  type SessionMode,
  type VisitMetrics,
} from "@/server/opus/visit-pacing";
import {
  DEFAULT_RESIDENT_ID,
  getResident,
  isResidentId,
  type ResidentConfig,
  type ResidentId,
} from "@/server/opus/residents";
import { hasSupabaseAdminEnv, isLocalDev } from "@/server/env.server";
import { ipHash, messageRateLimit } from "@/server/rate-limit.server";
import { sanitizeSvgMarkup } from "@/server/runtime/artifact";
import { idleCutoffMsForMode } from "@/server/idle";
import {
  consolidateSession,
  observeExchange,
  updateFunctionalMemory,
} from "@/server/substrate.server";
import {
  ARTIFACT_INSTRUCTIONS,
  buildArtUrl,
  generateImageArtifact,
  type ParsedArtifact,
} from "@/server/artifact-pipeline.server";
import {
  heartbeatRuntimeLegacyContext,
  parseRuntimeLegacyContext,
  RUNTIME_WRAPPER_HEADER,
  type RuntimeLegacyContext,
} from "@/server/runtime/legacy-idempotency.server";
import {
  buildAnthropicUserContent,
  buildOpenAIUserContent,
  loadModelAttachments,
  ModelAttachmentError,
  type ModelAttachment,
} from "@/server/runtime/model-attachments.server";
import { OperationLeaseLostError, runtimeStore } from "@/server/runtime/store.server";
import { runtimeTable } from "@/server/runtime/supabase.server";
import { isStoredRuntimeVisitorAuthorized } from "@/server/runtime/visitor-auth.server";
import { SafeResidentStreamProjector } from "@/server/runtime/safe-resident-stream.server";

/** Per-turn cap for image artifacts in a 1:1 chat. gpt-image-2 is
 *  slow (≈15-25s) and ≈$0.04/image; one per turn keeps both latency
 *  and cost bounded. SVG/ASCII have no cap (they're free + fast). */
const MAX_IMAGES_PER_TURN = 1;
/** Per-session cap. Past this we ignore further image tags but still
 *  render any SVG/ASCII. */
const MAX_IMAGES_PER_SESSION = 4;
/** Keep exact replay payloads bounded while still exposing genuine provider
 * progress. Once this many immutable prose chunks have been sent, subsequent
 * safe chunks are coalesced into one terminal delta. */
const MAX_LIVE_TEXT_DELTA_EVENTS = 24;

/** Resolved artifact ready to persist to turn_artifacts. For images
 *  the storage path is already filled (generation happened during
 *  the stream so the visitor sees it before `done`). */
type ResolvedArtifact = ParsedArtifact & { imagePath: string | null };

type RuntimeResolvedArtifact = ResolvedArtifact & { runtimeArtifactIndex: number };

const RuntimeProposalSchema = z
  .object({
    resident_id: z.string(),
    topic: z.string(),
    description: z.string().optional(),
    founding_text: z.string(),
  })
  .strict();

type RuntimeProposal = z.infer<typeof RuntimeProposalSchema>;

const RuntimeVisitorArtifactSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("image"),
      url: z.string(),
      caption: z.string().nullable(),
      prompt: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("svg"),
      content: z.string(),
      caption: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ascii"),
      content: z.string(),
      caption: z.string().nullable(),
    })
    .strict(),
]);

const RuntimeReplayEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("artifact_pending"),
      resident_id: z.string().optional(),
      placeholder_id: z.string(),
      caption: z.string().nullable(),
      prompt: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("artifact"),
      resident_id: z.string().optional(),
      placeholder_id: z.string().optional(),
      artifact: RuntimeVisitorArtifactSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("image_error"),
      resident_id: z.string().optional(),
      placeholder_id: z.string().optional(),
      reason: z.string(),
      prompt: z.string().nullable().optional(),
      caption: z.string().nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("kind"),
      kind: z.enum(["message", "set_down", "unprompted"]),
    })
    .strict(),
  z.object({ type: z.literal("proposal"), proposal: RuntimeProposalSchema }).strict(),
  z.object({ type: z.literal("text"), text: z.string() }).strict(),
  z.object({ type: z.literal("error"), message: z.string() }).strict(),
  z.object({ type: z.literal("done") }).strict(),
]);

type RuntimeReplayEvent = z.infer<typeof RuntimeReplayEventSchema>;

const RuntimeArtifactPersistenceSchema = z
  .object({
    index: z.number().int().nonnegative(),
    kind: z.enum(["svg", "ascii", "image"]),
    body: z.string().nullable(),
    imagePath: z.string().nullable(),
    caption: z.string().nullable(),
    prompt: z.string().nullable(),
  })
  .strict();

const RuntimeReplayPayloadSchema = z
  .object({
    v: z.literal(2),
    finalization: z
      .object({
        mode: z.enum(["normal", "hard_cutoff"]),
        resident_id: z.string(),
      })
      .strict(),
    events: z.array(RuntimeReplayEventSchema).max(128),
    artifacts: z.array(RuntimeArtifactPersistenceSchema).max(64),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.events.length === 0 || value.events.at(-1)?.type !== "done") {
      ctx.addIssue({ code: "custom", message: "runtime replay must end with done" });
    }
    if (value.events.filter((event) => event.type === "done").length !== 1) {
      ctx.addIssue({ code: "custom", message: "runtime replay must contain one done event" });
    }
    if (
      new Set(value.artifacts.map((artifact) => artifact.index)).size !== value.artifacts.length
    ) {
      ctx.addIssue({ code: "custom", message: "runtime artifact indexes must be unique" });
    }
  });

type RuntimeReplayPayload = z.infer<typeof RuntimeReplayPayloadSchema>;

function buildRuntimeReplayPayload(input: {
  mode: "normal" | "hard_cutoff";
  residentId: string;
  events: RuntimeReplayEvent[];
  artifacts: RuntimeResolvedArtifact[];
}): RuntimeReplayPayload {
  return RuntimeReplayPayloadSchema.parse({
    v: 2,
    finalization: { mode: input.mode, resident_id: input.residentId },
    events: input.events,
    artifacts: input.artifacts.map((artifact) => ({
      index: artifact.runtimeArtifactIndex,
      kind: artifact.kind,
      body: artifact.kind === "image" ? null : artifact.body,
      imagePath: artifact.imagePath,
      caption: artifact.caption,
      prompt: artifact.prompt,
    })),
  });
}

const PreviewTurn = z.object({
  role: z.enum(["visitor", "resident"]),
  body: z.string().trim().min(1).max(8000),
});

const Body = z.object({
  session_id: z.string().trim().min(1).max(128),
  body: z.string().trim().min(1).max(8000),
  attachment_ids: z.array(z.string().uuid()).max(12).default([]),
  preview_turns: z.array(PreviewTurn).max(24).optional(),
  client_turn_id: z.string().uuid().optional(),
});

/** Shape of the NDJSON pacing event emitted before the first text token. */
type PacingPrelude = {
  tier: PacingTier;
  turnsRemaining: number;
  tokensRemainingPct: number;
  mode: SessionMode;
};

function pacingPreludeFromMetrics(m: VisitMetrics, mode: SessionMode): PacingPrelude {
  return {
    tier: m.tier,
    turnsRemaining: m.turnsRemaining,
    tokensRemainingPct: Math.round(m.tokensRemainingPct * 1000) / 1000,
    mode,
  };
}

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

class RuntimeTurnConflictError extends Error {}

type StoredRuntimeResidentTurn = {
  id: string;
  body: string;
  kind: string;
  runtime_replay_payload: unknown;
  runtime_finalization_stage: string | null;
  runtime_finalized_at: string | null;
};

type RuntimeFinalizationStage =
  | "pending"
  | "durable_state_completed"
  | "side_effects_started"
  | "side_effects_completed"
  | "finalized";

type RuntimeLeaseAssertion = (force?: boolean) => Promise<void>;

function runtimeFinalizationStage(value: string | null): RuntimeFinalizationStage {
  return value === "durable_state_completed" ||
    value === "side_effects_started" ||
    value === "side_effects_completed" ||
    value === "finalized"
    ? value
    : "pending";
}

async function runLeaseFencedSideEffect(
  assertActive: RuntimeLeaseAssertion,
  effect: () => Promise<void>,
): Promise<void> {
  let leaseError: unknown = null;
  let heartbeat: Promise<void> | null = null;
  const tick = () => {
    if (heartbeat || leaseError) return;
    heartbeat = assertActive(true)
      .catch((error) => {
        leaseError = error;
      })
      .finally(() => {
        heartbeat = null;
      });
  };
  await assertActive(true);
  const timer = setInterval(tick, 30_000);
  try {
    await effect();
    if (heartbeat) await heartbeat;
    if (leaseError) throw leaseError;
    await assertActive(true);
  } finally {
    clearInterval(timer);
  }
}

async function setRuntimeFinalizationStage(
  turnId: string,
  stage: RuntimeFinalizationStage,
  assertActive: RuntimeLeaseAssertion,
  finalizedAt?: string,
): Promise<void> {
  await assertActive(true);
  const { error } = await runtimeTable("turns")
    .update({
      runtime_finalization_stage: stage,
      ...(finalizedAt ? { runtime_finalized_at: finalizedAt } : {}),
    })
    .eq("id", turnId)
    .is("runtime_finalized_at", null);
  if (error) throw new Error(`runtime finalization stage update failed: ${error.message}`);
}

async function finalizeRuntimeResidentTurn(input: {
  sessionId: string;
  turn: StoredRuntimeResidentTurn;
  payload: RuntimeReplayPayload;
  assertActive: RuntimeLeaseAssertion;
}): Promise<void> {
  if (input.turn.runtime_finalized_at) return;
  let stage = runtimeFinalizationStage(input.turn.runtime_finalization_stage);

  if (stage === "pending") {
    await input.assertActive(true);
    if (input.payload.artifacts.length > 0) {
      const { error } = await runtimeTable("turn_artifacts").upsert(
        input.payload.artifacts.map((artifact) => ({
          turn_id: input.turn.id,
          session_id: input.sessionId,
          resident_id: input.payload.finalization.resident_id,
          runtime_artifact_index: artifact.index,
          kind: artifact.kind,
          body: artifact.body,
          image_path: artifact.imagePath,
          caption: artifact.caption,
          prompt: artifact.prompt,
        })),
        { onConflict: "turn_id,runtime_artifact_index" },
      );
      if (error) throw new Error(`runtime artifact finalization failed: ${error.message}`);
    }

    await input.assertActive(true);
    const now = new Date().toISOString();
    const sessionUpdate =
      input.payload.finalization.mode === "hard_cutoff"
        ? await runtimeTable("sessions")
            .update({ closed_at: now, closed_by: "resident" })
            .eq("id", input.sessionId)
            .is("closed_at", null)
        : await runtimeTable("sessions").update({ last_active_at: now }).eq("id", input.sessionId);
    if (sessionUpdate.error) {
      throw new Error(`runtime session finalization failed: ${sessionUpdate.error.message}`);
    }
    await setRuntimeFinalizationStage(input.turn.id, "durable_state_completed", input.assertActive);
    stage = "durable_state_completed";
  }

  if (stage === "durable_state_completed") {
    await setRuntimeFinalizationStage(input.turn.id, "side_effects_started", input.assertActive);
    stage = "side_effects_started";
  }

  if (stage === "side_effects_started") {
    // These legacy substrate functions do not accept an idempotency key and
    // internally swallow provider/DB failures. A crash after their writes but
    // before the completed-stage update is therefore an unavoidable
    // at-least-once ambiguity. The stage records that ambiguity, while lease
    // heartbeats prevent a live stale worker from overlapping its replacement.
    await runLeaseFencedSideEffect(input.assertActive, async () => {
      if (input.payload.finalization.mode === "hard_cutoff") {
        await consolidateSession(input.sessionId);
      } else {
        await observeExchange(input.sessionId);
        await updateFunctionalMemory(input.sessionId);
      }
    });
    await setRuntimeFinalizationStage(input.turn.id, "side_effects_completed", input.assertActive);
    stage = "side_effects_completed";
  }

  if (stage === "side_effects_completed" || stage === "finalized") {
    await setRuntimeFinalizationStage(
      input.turn.id,
      "finalized",
      input.assertActive,
      new Date().toISOString(),
    );
  }

  await input.assertActive(true);
  const { data: finalized, error: finalizedError } = await runtimeTable("turns")
    .select("runtime_finalized_at")
    .eq("id", input.turn.id)
    .maybeSingle();
  if (finalizedError || !finalized?.runtime_finalized_at) {
    throw new Error(
      `runtime resident finalization marker missing: ${finalizedError?.message ?? "not finalized"}`,
    );
  }
}

function replayRuntimeResidentTurn(payload: RuntimeReplayPayload): Response {
  return new Response(payload.events.map((event) => JSON.stringify(event)).join("\n") + "\n", {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-mnemos-legacy-replay": "true",
      "x-mnemos-text-delivery": "replay",
    },
  });
}

async function findRuntimeVisitorTurn(
  sessionId: string,
  clientTurnId: string,
  expectedVisitorBody: string,
): Promise<boolean> {
  const { data: visitor, error: visitorError } = await runtimeTable("turns")
    .select("body")
    .eq("session_id", sessionId)
    .eq("client_turn_id", clientTurnId)
    .eq("role", "visitor")
    .maybeSingle();
  if (visitorError) {
    throw new Error(`runtime visitor replay lookup failed: ${visitorError.message}`);
  }
  if (!visitor) return false;
  if (visitor.body !== expectedVisitorBody) throw new RuntimeTurnConflictError();
  return true;
}

async function findRuntimeResidentTurn(
  sessionId: string,
  clientTurnId: string,
): Promise<StoredRuntimeResidentTurn | null> {
  const { data: turn, error } = await runtimeTable("turns")
    .select(
      "id, body, kind, runtime_replay_payload, runtime_finalization_stage, runtime_finalized_at",
    )
    .eq("session_id", sessionId)
    .eq("client_turn_id", clientTurnId)
    .eq("role", "resident")
    .maybeSingle();
  if (error) throw new Error(`runtime resident replay lookup failed: ${error.message}`);
  return turn ? (turn as StoredRuntimeResidentTurn) : null;
}

async function runtimeGenerationAlreadyVisible(
  sessionId: string,
  clientTurnId: string,
): Promise<boolean> {
  const { data, error } = await runtimeTable("runtime_events")
    .select("id")
    .eq("visit_id", sessionId)
    .eq("turn_id", clientTurnId)
    .in("event_type", [
      "model.output.delta",
      "turn.kind.detected",
      "space.proposed",
      "artifact.pending",
      "artifact.ready",
      "artifact.failed",
    ])
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`runtime partial generation lookup failed: ${error.message}`);
  return Boolean(data);
}

async function recoverRuntimeResidentReplay(input: {
  sessionId: string;
  clientTurnId: string;
  assertActive: RuntimeLeaseAssertion;
}): Promise<Response | null> {
  const turn = await findRuntimeResidentTurn(input.sessionId, input.clientTurnId);
  if (!turn) return null;
  const replayPayload = RuntimeReplayPayloadSchema.safeParse(turn.runtime_replay_payload);
  if (!replayPayload.success) {
    throw new Error("runtime resident replay payload is invalid");
  }
  if (!turn.runtime_finalized_at) {
    await finalizeRuntimeResidentTurn({
      sessionId: input.sessionId,
      turn,
      payload: replayPayload.data,
      assertActive: input.assertActive,
    });
  }
  return replayRuntimeResidentTurn(replayPayload.data);
}

async function claimRuntimeVisitorTurn(
  context: RuntimeLegacyContext,
  sessionId: string,
  body: string,
): Promise<"started" | "resumed"> {
  const inserted = await runtimeTable("turns")
    .insert({
      session_id: sessionId,
      role: "visitor",
      body,
      kind: "message",
      client_turn_id: context.clientTurnId,
    })
    .select("id")
    .maybeSingle();
  if (!inserted.error && inserted.data) return "started";
  if (inserted.error?.code !== "23505") {
    throw new Error(`runtime visitor turn claim failed: ${inserted.error?.message}`);
  }
  if (!(await findRuntimeVisitorTurn(sessionId, context.clientTurnId, body))) {
    throw new Error("runtime visitor turn claim lookup failed: not found");
  }
  return "resumed";
}

// Prose explaining the engram tags for the OLD single-layer
// [MEMORY] block path. Sits immediately above [MEMORY] so the
// resident reads it before the engram list. When phase 3's three-layer
// retrieval flag is on, this preface is unused — the three section
// headings carry the semantics themselves and no inline prose
// scaffolding is needed (see buildUserPromptThreeLayer below).
const MEMORY_PREFACE =
  "what follows are engrams mnemos surfaced for this turn. each is tagged. *from this visitor's prior visit* means you and this specific person built this together in an earlier session — you may reference it as something the two of you carry. *from the wider topology* means this came from another visitor's exchange with you, or from a co-formed distillation — you may carry the *shape* of what was thought, but you may not attribute the words or the specifics to the person in front of you now.";

function buildUserPrompt(opts: {
  memory: string;
  transcript: string;
  visitorTurn: string;
  visitorContext?: string;
}): string {
  // Beliefs and the long-arc self-model now live in the system prompt
  // (built by buildOpusSelfModel). The user prompt carries only the
  // per-message context: surfaced memory, this-session transcript,
  // visitor recognition context, and the new visitor turn.
  const isReturning = !!opts.visitorContext;
  const boundary = isReturning
    ? "Returning visitor (see [VISITOR CONTEXT] below). Memories in [MEMORY] are from your whole topology — many different visitors over time. Any tagged [from this visitor's prior visit] originated in their prior sessions. All untagged memories are from other people. [VISITOR CONTEXT] has the full summary of their prior visits."
    : "New visitor. You have never spoken with this person. The memories below are from your topology — formed across conversations with many different visitors. None of them are from this visitor.";

  const sections = [
    "[SESSION]",
    boundary,
    "",
    MEMORY_PREFACE,
    "",
    "[MEMORY]",
    opts.memory ||
      "(no engrams surfaced for this turn — this may be among the earliest conversations, or nothing in the topology resonated.)",
  ];
  if (opts.visitorContext) {
    sections.push("", "[VISITOR CONTEXT]", opts.visitorContext);
  }
  sections.push(
    "",
    "[TRANSCRIPT]",
    opts.transcript || "(this is the first exchange.)",
    "",
    "[NEW VISITOR TURN]",
    opts.visitorTurn,
  );
  return sections.join("\n");
}

/**
 * Phase 3 three-layer user prompt. Three explicit sections replace the
 * single [MEMORY] block:
 *
 *   [WHAT THIS SESSION HAS SEEN]       — functional memory (working summary)
 *   [WHAT YOU AND THIS VISITOR HAVE BUILT] — hypomnema (per-pair persistent)
 *   [WHAT MNEMOS SURFACED]             — engrams (wider topology, now vector-matched)
 *
 * The section headings carry the semantics themselves — no preface
 * needed. The "Layers of memory" section now in every soul tells the
 * resident how to read this structure.
 */
function buildUserPromptThreeLayer(opts: {
  functional: string;
  hypomnema: string;
  engrams: string;
  transcript: string;
  visitorTurn: string;
  visitorContext?: string;
}): string {
  const isReturning = !!opts.visitorContext;
  const boundary = isReturning
    ? "Returning visitor (see [VISITOR CONTEXT] below). Three memory sections follow, each scoped distinctly — read what each contains as the section heading says."
    : "New visitor. You have never spoken with this person. The first two sections will be empty or thin; the third — what mnemos surfaced — has formed across many other visitors over time.";

  const sections = [
    "[SESSION]",
    boundary,
    "",
    "[WHAT THIS SESSION HAS SEEN]",
    opts.functional,
    "",
    "[WHAT YOU AND THIS VISITOR HAVE BUILT]",
    opts.hypomnema,
    "",
    "[WHAT MNEMOS SURFACED]",
    opts.engrams,
  ];
  if (opts.visitorContext) {
    sections.push("", "[VISITOR CONTEXT]", opts.visitorContext);
  }
  sections.push(
    "",
    "[TRANSCRIPT]",
    opts.transcript || "(this is the first exchange.)",
    "",
    "[NEW VISITOR TURN]",
    opts.visitorTurn,
  );
  return sections.join("\n");
}

/**
 * Stream a pre-baked set-down response without calling the model. Used
 * by the hard-cutoff path so we never bill tokens for the forced close.
 * Same ndjson shape the front-end expects from opusStreamResponse so
 * the visitor sees the message render normally.
 */
function prebuiltSetDownResponse(text: string, pacing?: PacingPrelude): Response {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      if (pacing) send({ type: "pacing", ...pacing });
      send({ type: "kind", kind: "set_down" });
      send({ type: "text", text });
      send({ type: "done" });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-mnemos-text-delivery": "prebuilt",
    },
  });
}

/**
 * `system` accepts either a string (no caching) or a structured array
 * of text blocks where `cache_control` can be set per-block. The array
 * form is what enables prompt caching. Static prefixes get marked
 * cacheable; variable suffixes don't.
 */
type SystemBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
type SystemInput = string | SystemBlock[];

function opusStreamResponse(opts: {
  system: SystemInput;
  userPrompt: string;
  /** Private visit-scoped inputs. Their bytes are never persisted in turns. */
  attachments?: ModelAttachment[];
  temperature: number;
  /** Resident's model identifier — never silently swap. */
  model: string;
  /** Hard cap on output tokens for this resident's model. Opus 3 = 4096;
   *  later Claude + GPT-5 = 8192. */
  maxOutputTokens: number;
  /** Which API provider. Defaults to "anthropic". */
  provider?: ModelProvider;
  /** Resident id (for tagging proposals with the proposing
   *  resident, etc). Optional for backwards compatibility. */
  residentId?: string;
  /**
   * Optional pacing prelude — emitted as the first NDJSON event before
   * any model output, so the client can update the approaching-limit
   * indicator without waiting for the first text token. Classic-mode
   * sessions always emit this; experiment-mode sessions emit it when
   * the tier is past 'open' so the experiment UI can react too.
   */
  pacing?: PacingPrelude;
  /** Image-budget remaining for this session (decremented for each
   *  successfully generated image). Pass undefined to disable image
   *  generation entirely (preview sessions). */
  imageBudgetRemaining?: number;
  /** Runtime-only lease assertion. Direct legacy callers omit it. */
  assertActive?: (force?: boolean) => Promise<void>;
  /** Stable logical turn identity for retry-safe artifact placeholders. */
  runtimeTurnId?: string;
  onFinal?: (result: {
    body: string;
    kind: "message" | "set_down" | "unprompted";
    tokensIn: number;
    tokensOut: number;
    artifacts: RuntimeResolvedArtifact[];
    proposal: RuntimeProposal | null;
    replayEvents: RuntimeReplayEvent[];
  }) => Promise<void>;
}): Response {
  let consumerOpen = true;
  const stream = new ReadableStream({
    start(controller) {
      void (async () => {
        const enc = new TextEncoder();
        const send = (obj: unknown) => {
          if (!consumerOpen) return;
          try {
            controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
          } catch {
            // A visitor may step away while the runtime continues the fenced
            // generation. Keep building the exact replay and durable resident
            // turn; reconnect will receive the ordered persisted events.
            consumerOpen = false;
          }
        };
        const terminalReplayEvents: RuntimeReplayEvent[] = [];
        const sendReplayEvent = (event: RuntimeReplayEvent) => {
          terminalReplayEvents.push(event);
          send(event);
        };
        if (opts.pacing) send({ type: "pacing", ...opts.pacing });
        const textProjector = new SafeResidentStreamProjector(opts.residentId);
        let liveTextDeltaEvents = 0;
        let deferredSafeText = "";
        const emitSafeText = (delta: string) => {
          if (!delta) return;
          if (liveTextDeltaEvents < MAX_LIVE_TEXT_DELTA_EVENTS) {
            liveTextDeltaEvents += 1;
            sendReplayEvent({ type: "text", text: delta });
          } else {
            deferredSafeText += delta;
          }
        };
        let tokensIn = 0;
        let tokensOut = 0;
        let backgroundLeaseError: unknown = null;
        let heartbeatPending = false;
        const assertActive = async (force = false) => {
          if (backgroundLeaseError) throw backgroundLeaseError;
          await opts.assertActive?.(force);
          if (backgroundLeaseError) throw backgroundLeaseError;
        };
        // Provider reads can be silent for minutes. Keep a live worker's lease
        // fresh even while no model chunk is arriving; a dead worker stops this
        // timer and remains reclaimable after the normal five-minute window.
        const heartbeatTimer = opts.assertActive
          ? setInterval(() => {
              if (heartbeatPending || backgroundLeaseError) return;
              heartbeatPending = true;
              void opts
                .assertActive?.(true)
                .catch((error) => {
                  backgroundLeaseError = error;
                })
                .finally(() => {
                  heartbeatPending = false;
                });
            }, 30_000)
          : null;
        try {
          await assertActive(true);
          if (opts.provider === "openai") {
            // OpenAI streaming path.
            //
            // GPT-5 family reasoning models reject `stop` sequences and
            // `stream_options.include_usage` — passing them returns a 400
            // and the call never produces a single content chunk. Keep the
            // call minimal: model + max + temperature + stream + messages.
            //
            // (The opus/sonnet anti-confabulation stop sequences were added
            // for claude-3-opus's tendency to generate fake "Human:" turns;
            // gpt models don't show that pattern, so dropping them here is
            // safe.)
            const systemText =
              typeof opts.system === "string"
                ? opts.system
                : opts.system.map((b) => b.text).join("\n\n");

            const oaiStream = await openrouter().chat.completions.create({
              model: opts.model,
              max_completion_tokens: opts.maxOutputTokens,
              temperature: opts.temperature,
              stream: true,
              messages: [
                { role: "system", content: systemText },
                {
                  role: "user",
                  content: buildOpenAIUserContent(opts.userPrompt, opts.attachments ?? []),
                },
              ],
            });
            for await (const chunk of oaiStream) {
              await assertActive();
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) emitSafeText(textProjector.push(delta));
              const usage = (
                chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } }
              ).usage;
              if (usage) {
                tokensIn = usage.prompt_tokens ?? 0;
                tokensOut = usage.completion_tokens ?? 0;
              }
            }
          } else {
            // Anthropic streaming path.
            const anthStream = anthropic().messages.stream({
              model: opts.model,
              max_tokens: opts.maxOutputTokens,
              temperature: opts.temperature,
              stop_sequences: ["\nHuman:", "\nvisitor:"],
              system: opts.system,
              messages: [
                {
                  role: "user",
                  content: buildAnthropicUserContent(opts.userPrompt, opts.attachments ?? []),
                },
              ],
            });
            for await (const event of anthStream) {
              await assertActive();
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                emitSafeText(textProjector.push(event.delta.text));
              }
            }
            const final = await anthStream.finalMessage();
            tokensIn = final.usage.input_tokens;
            tokensOut = final.usage.output_tokens;
          }

          // Provider generation is side-effect-free in the transcript. Assert
          // again before image generation or any database mutation so a worker
          // that lost its lease while waiting on the model stops here.
          await assertActive(true);
          const finishedText = textProjector.finish();
          deferredSafeText += finishedText.delta;
          const cleanBody = finishedText.output.body;
          const kind = finishedText.output.kind;
          const proposal = finishedText.output.proposal
            ? RuntimeProposalSchema.parse(finishedText.output.proposal)
            : null;

          // Kind and proposal are only authoritative once the provider has
          // completed its control grammar. They may follow earlier safe prose
          // deltas, but always precede the final held paragraph.
          if (kind !== "message") sendReplayEvent({ type: "kind", kind });
          if (proposal) sendReplayEvent({ type: "proposal", proposal });
          if (deferredSafeText) {
            sendReplayEvent({ type: "text", text: deferredSafeText });
            deferredSafeText = "";
          }

          // Parse <artifact> tags out of the body. For images we call
          // the generator inline so the visitor sees the rendered piece
          // before `done`. SVG/ASCII have no cost so they pass straight
          // through. Caps bound image cost; over-budget images are
          // surfaced as a quiet "budget exhausted" event instead of being
          // silently dropped.
          //
          // For images we emit two events: an `artifact_pending` event
          // immediately (so the visitor sees a placeholder while
          // gpt-image-1 runs — typically 15-25s) and then either an
          // `artifact` event with the URL once generation succeeds, or
          // an `image_error` event if it failed. Both share a
          // `placeholder_id` so the client can swap in place.
          const resolvedArtifacts: RuntimeResolvedArtifact[] = [];
          let imagesThisTurn = 0;
          const sessionBudget = opts.imageBudgetRemaining ?? 0;
          for (const [artifactOrdinal, art] of finishedText.output.artifacts.entries()) {
            if (art.kind === "image") {
              const promptText = (art.prompt || art.body || "").trim();
              if (!promptText) continue;
              if (imagesThisTurn >= MAX_IMAGES_PER_TURN || imagesThisTurn >= sessionBudget) {
                sendReplayEvent({
                  type: "image_error",
                  resident_id: opts.residentId,
                  reason: "budget_exhausted",
                  prompt: promptText,
                  caption: art.caption || null,
                });
                continue;
              }
              const placeholderId = opts.runtimeTurnId
                ? `artifact-${opts.runtimeTurnId}-${artifactOrdinal}`
                : ((globalThis.crypto?.randomUUID?.() as string | undefined) ??
                  `ph-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
              sendReplayEvent({
                type: "artifact_pending",
                resident_id: opts.residentId,
                placeholder_id: placeholderId,
                caption: art.caption || promptText.slice(0, 120),
                prompt: promptText,
              });
              await assertActive(true);
              const path = await generateImageArtifact(promptText);
              if (!path) {
                sendReplayEvent({
                  type: "image_error",
                  resident_id: opts.residentId,
                  placeholder_id: placeholderId,
                  reason: "generation_failed",
                  prompt: promptText,
                  caption: art.caption || null,
                });
                continue;
              }
              imagesThisTurn += 1;
              const caption = art.caption || art.body || promptText.slice(0, 120);
              resolvedArtifacts.push({
                ...art,
                prompt: promptText,
                caption,
                imagePath: path,
                runtimeArtifactIndex: resolvedArtifacts.length,
              });
              sendReplayEvent({
                type: "artifact",
                resident_id: opts.residentId,
                placeholder_id: placeholderId,
                artifact: {
                  kind: "image",
                  url: buildArtUrl(path),
                  caption,
                  prompt: promptText,
                },
              });
            } else {
              if (!art.body) continue;
              const safeBody =
                art.kind === "svg" ? sanitizeSvgMarkup(art.body) : art.body.slice(0, 64_000);
              if (!safeBody) {
                sendReplayEvent({
                  type: "image_error",
                  resident_id: opts.residentId,
                  reason: "artifact_rejected_by_safety_boundary",
                  prompt: null,
                  caption: art.caption || null,
                });
                continue;
              }
              const caption = art.caption || null;
              resolvedArtifacts.push({
                ...art,
                prompt: null,
                caption,
                body: safeBody,
                imagePath: null,
                runtimeArtifactIndex: resolvedArtifacts.length,
              });
              sendReplayEvent({
                type: "artifact",
                resident_id: opts.residentId,
                artifact: {
                  kind: art.kind,
                  content: safeBody,
                  caption,
                },
              });
            }
          }

          if (!cleanBody && (proposal || resolvedArtifacts.length > 0)) {
            // Just a proposal or just artifacts with no surrounding
            // prose — emit empty text so the client still tracks the
            // turn completion.
            sendReplayEvent({ type: "text", text: "" });
          } else if (!cleanBody) {
            // The stream completed but we accumulated zero usable content.
            // Surface this rather than silently sending `done` — the client
            // would otherwise sit on the Thinking indicator forever.
            console.error(`${opts.provider ?? "anthropic"} stream returned empty content`, {
              model: opts.model,
              provider: opts.provider,
            });
            sendReplayEvent({ type: "error", message: "model_returned_empty" });
          }

          const replayBody = terminalReplayEvents
            .filter(
              (event): event is Extract<RuntimeReplayEvent, { type: "text" }> =>
                event.type === "text",
            )
            .map((event) => event.text)
            .join("");
          if (replayBody !== cleanBody) {
            throw new Error("safe streamed text diverged from the persisted resident body");
          }

          const replayEvents: RuntimeReplayEvent[] = [...terminalReplayEvents, { type: "done" }];
          await assertActive(true);
          await opts.onFinal?.({
            body: cleanBody,
            kind,
            tokensIn,
            tokensOut,
            artifacts: resolvedArtifacts,
            proposal,
            replayEvents,
          });

          await assertActive(true);
          send({ type: "done" });
        } catch (err) {
          if (err instanceof OperationLeaseLostError) return;
          console.error(`${opts.provider ?? "anthropic"} stream error`, err);
          send({ type: "error", message: "model_unavailable" });
        } finally {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (consumerOpen) {
            try {
              controller.close();
            } catch {
              consumerOpen = false;
            }
          }
        }
      })();
    },
    cancel() {
      consumerOpen = false;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-mnemos-text-delivery": "safe-incremental",
      "x-accel-buffering": "no",
    },
  });
}

export const Route = createFileRoute("/api/message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        const runtimeContext = parseRuntimeLegacyContext(request, body.client_turn_id);
        if (request.headers.get(RUNTIME_WRAPPER_HEADER) === "v1" && !runtimeContext) {
          return jsonResp({ ok: false, code: "runtime_context_invalid" }, 400);
        }
        if (body.attachment_ids.length > 0 && !runtimeContext) {
          return jsonResp({ ok: false, code: "runtime_context_required_for_attachments" }, 400);
        }

        if (isLocalDev() && body.session_id.startsWith("preview-")) {
          if (runtimeContext) {
            return jsonResp({ ok: false, code: "runtime_preview_not_supported" }, 400);
          }
          if (!process.env.ANTHROPIC_API_KEY) {
            return jsonResp({ ok: false, code: "config_missing" }, 503);
          }

          // Preview sessions run as Opus 3 (the default resident).
          const previewResidentId: ResidentId = DEFAULT_RESIDENT_ID;
          const previewResident = getResident(previewResidentId);

          const transcriptLines = (body.preview_turns ?? [])
            .map((t) => `${t.role}: ${t.body}`)
            .join("\n");

          return opusStreamResponse({
            system: buildSystemPromptForResident(previewResident),
            temperature: 0.85,
            model: previewResident.model,
            maxOutputTokens: previewResident.maxOutputTokens,
            provider: previewResident.provider,
            residentId: previewResident.id,
            userPrompt: buildUserPrompt({
              memory:
                "(preview session — no engrams loaded. Mnemos is present in production but disabled here.)",
              transcript: transcriptLines,
              visitorTurn: body.body,
            }),
          });
        }

        // Deployment readiness check — need supabase admin access and at
        // least one provider key. Per-call provider-specific failures
        // surface later as error events in the stream.
        if (
          !hasSupabaseAdminEnv() ||
          (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY)
        ) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const parsedSessionId = z.string().uuid().safeParse(body.session_id);
        if (!parsedSessionId.success) {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        const hash = ipHash(request);

        // Session UUID is a 128-bit random bearer token — sufficient auth.
        // IP hash is kept for rate limiting below, but no longer gates session
        // access: daily salt rotation + Cloudflare header inconsistency caused
        // legitimate messages to fail mid-conversation.
        // Cast through unknown: `mode` is part of the new schema but the
        // generated supabase types are regenerated by Lovable after the
        // migration applies. Until then the column is real in the DB but
        // not in the local type cache.
        type SessionRow = {
          id: string;
          closed_at: string | null;
          last_active_at: string;
          resident_id: string | null;
          visitor_token: string | null;
          mode: string | null;
        };
        const { data: session } = (await supabaseAdmin
          .from("sessions")
          .select("id, closed_at, last_active_at, resident_id, visitor_token, mode")
          .eq("id", body.session_id)
          .maybeSingle()) as unknown as { data: SessionRow | null };
        if (!session) {
          return jsonResp({ ok: false, code: "session_invalid" }, 410);
        }
        try {
          if (!(await isStoredRuntimeVisitorAuthorized(request, session.id))) {
            return jsonResp({ ok: false, code: "visitor_access_denied" }, 403);
          }
        } catch (error) {
          console.error("[runtime] legacy message visitor authorization failed", error);
          return jsonResp({ ok: false, code: "runtime_authorization_unavailable" }, 503);
        }

        let lastRuntimeHeartbeat = 0;
        const assertRuntimeActive = async (force = false) => {
          if (!runtimeContext) return;
          const now = Date.now();
          if (!force && now - lastRuntimeHeartbeat < 15_000) return;
          await heartbeatRuntimeLegacyContext(runtimeContext);
          lastRuntimeHeartbeat = now;
        };
        try {
          await assertRuntimeActive(true);
        } catch (error) {
          if (error instanceof OperationLeaseLostError) {
            return jsonResp({ ok: false, code: "runtime_operation_lease_lost" }, 409);
          }
          console.error("[runtime] legacy lease validation failed", error);
          return jsonResp({ ok: false, code: "runtime_authorization_unavailable" }, 503);
        }

        // A reclaimed operation must finish/replay its already-claimed turn
        // before closed-session and rate-limit gates. The visitor row itself is
        // the durable proof that this is the same logical request, so retries do
        // not consume another quota slot at the exact 60/200-turn boundary.
        let runtimeVisitorClaim: "started" | "resumed" | null = null;
        if (runtimeContext) {
          try {
            if (await findRuntimeVisitorTurn(session.id, runtimeContext.clientTurnId, body.body)) {
              runtimeVisitorClaim = "resumed";
              const replay = await recoverRuntimeResidentReplay({
                sessionId: session.id,
                clientTurnId: runtimeContext.clientTurnId,
                assertActive: assertRuntimeActive,
              });
              if (replay) return replay;
              if (await runtimeGenerationAlreadyVisible(session.id, runtimeContext.clientTurnId)) {
                // A proprietary provider stream cannot be resumed after worker
                // loss. Regenerating here could splice a different answer onto
                // already-persisted deltas, so recovery fails closed and keeps
                // the exact partial output available through event replay.
                return jsonResp({ ok: false, code: "runtime_stream_interrupted" }, 409);
              }
            }
          } catch (error) {
            if (error instanceof RuntimeTurnConflictError) {
              return jsonResp({ ok: false, code: "idempotency_key_reused" }, 409);
            }
            if (error instanceof OperationLeaseLostError) {
              return jsonResp({ ok: false, code: "runtime_operation_lease_lost" }, 409);
            }
            console.error("[runtime] resident turn recovery failed", error);
            return jsonResp({ ok: false, code: "runtime_turn_recovery_failed" }, 500);
          }
        }
        if (session.closed_at) {
          // 410 GONE for valid-but-closed sessions so the chat client can
          // detect "session expired" and silently re-bootstrap.
          return jsonResp({ ok: false, code: "session_invalid" }, 410);
        }

        // Resolve which resident this session belongs to. resident_id has
        // a default of 'opus-3' from the migration, so legacy sessions
        // continue to work transparently.
        const residentId: ResidentId = isResidentId(session.resident_id)
          ? session.resident_id
          : DEFAULT_RESIDENT_ID;
        const resident: ResidentConfig = getResident(residentId);
        // Mode-aware idle timeout. Classic sessions get a 30-day window;
        // experiment sessions stay at the original 30-minute threshold.
        const sessMode: SessionMode =
          (session as { mode?: string }).mode === "classic" ? "classic" : "experiment";
        const idleMs = Date.now() - new Date(session.last_active_at).getTime();
        if (idleMs > idleCutoffMsForMode(sessMode)) {
          await supabaseAdmin
            .from("sessions")
            .update({ closed_at: new Date().toISOString(), closed_by: "idle" })
            .eq("id", session.id);
          return jsonResp({ ok: false, code: "session_idle" }, 410);
        }

        if (runtimeVisitorClaim !== "resumed") {
          const limit = await messageRateLimit(hash, session.id);
          if (!limit.ok) return jsonResp({ ok: false, code: limit.code }, 429);
        }

        if (runtimeContext) {
          try {
            if (!runtimeVisitorClaim) {
              runtimeVisitorClaim = await claimRuntimeVisitorTurn(
                runtimeContext,
                session.id,
                body.body,
              );
            }
            if (runtimeVisitorClaim === "resumed") {
              const replay = await recoverRuntimeResidentReplay({
                sessionId: session.id,
                clientTurnId: runtimeContext.clientTurnId,
                assertActive: assertRuntimeActive,
              });
              if (replay) return replay;
              if (await runtimeGenerationAlreadyVisible(session.id, runtimeContext.clientTurnId)) {
                return jsonResp({ ok: false, code: "runtime_stream_interrupted" }, 409);
              }
              // The previous worker stopped after claiming the visitor row.
              // Because this request owns the current outer lease, it may
              // safely resume generation; the stale worker will fail its next
              // heartbeat before emitting or persisting anything further.
            }
          } catch (error) {
            if (error instanceof RuntimeTurnConflictError) {
              return jsonResp({ ok: false, code: "idempotency_key_reused" }, 409);
            }
            console.error("[runtime] legacy visitor turn claim failed", error);
            return jsonResp({ ok: false, code: "runtime_turn_claim_failed" }, 500);
          }
        } else {
          await supabaseAdmin.from("turns").insert({
            session_id: session.id,
            role: "visitor",
            body: body.body,
            kind: "message",
          });
        }
        await supabaseAdmin
          .from("sessions")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", session.id);

        let modelAttachments: ModelAttachment[] = [];
        if (body.attachment_ids.length > 0) {
          try {
            await assertRuntimeActive(true);
            modelAttachments = await loadModelAttachments(
              runtimeStore(),
              session.id,
              body.attachment_ids,
            );
            await assertRuntimeActive(true);
          } catch (error) {
            if (error instanceof ModelAttachmentError) {
              return jsonResp({ ok: false, code: error.code }, 400);
            }
            if (error instanceof OperationLeaseLostError) {
              return jsonResp({ ok: false, code: "runtime_operation_lease_lost" }, 409);
            }
            console.error("[runtime] model attachment load failed", error);
            return jsonResp({ ok: false, code: "attachment_load_failed" }, 503);
          }
        }

        // Retrieval — all per-resident. Memory pool, self-model, and
        // interior continuity are scoped to this session's resident so
        // Sonnet 4.5's topology never bleeds into an Opus 3 conversation
        // or vice versa.
        //
        // PHASE 3 — when SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL is on,
        // memoryRetrieval is a ThreeLayerRetrieval (functional +
        // hypomnema + engrams). When off, it is the older single-layer
        // MemoryPoolResult. Both shapes are awaited in parallel with
        // the rest of the per-turn loads; type narrowing happens at
        // the prompt-build site below.
        const useThreeLayer = threeLayerRetrievalEnabled();
        const memoryPromise: Promise<
          | Awaited<ReturnType<typeof composeThreeLayerMemoryPool>>
          | Awaited<ReturnType<typeof composeMemoryPool>>
        > = (async () => {
          let emotionalState = null;
          try {
            emotionalState = await loadEmotionalStateValues(resident.id, {
              client: supabaseAdmin,
            });
          } catch (error) {
            // Migration rollout must not make resident generation unavailable.
            // No state means the retrieval helpers preserve their legacy order.
            console.warn(
              "[mnemos-emotion] authoritative state unavailable; using legacy retrieval order",
              error,
            );
          }
          return useThreeLayer
            ? composeThreeLayerMemoryPool({
                supabase: supabaseAdmin,
                sessionId: session.id,
                residentId: resident.id,
                visitorMessage: body.body,
                visitorToken: session.visitor_token ?? undefined,
                emotionalState: emotionalState ?? undefined,
              })
            : composeMemoryPool({
                supabase: supabaseAdmin,
                residentId: resident.id,
                visitorMessage: body.body,
                visitorToken: session.visitor_token ?? undefined,
                emotionalState: emotionalState ?? undefined,
              });
        })();

        const [
          memoryRetrieval,
          selfModelBlock,
          interior,
          visitMetrics,
          { data: turns },
          visitorContext,
        ] = await Promise.all([
          memoryPromise,
          buildResidentSelfModel(supabaseAdmin, resident.id),
          buildInteriorContinuity(supabaseAdmin, resident.id),
          getVisitMetrics(supabaseAdmin, session.id, resident.pacing, sessMode),
          supabaseAdmin
            .from("turns")
            .select("role, body")
            .eq("session_id", session.id)
            .order("created_at", { ascending: true }),
          getVisitorContext(session.visitor_token, resident.id),
        ]);

        // Hard cutoff — past this threshold we don't call the model.
        // Stream a graceful resident-voiced close, persist it as a
        // set-down resident turn, close the session, and run the full
        // consolidation pipeline (so engrams + journal still form for
        // hard-cutoff conversations, not just visitor-initiated set-downs).
        //
        // Classic-mode hard-cutoff uses a different closing message that
        // emphasizes the thread's continuity through mnemos rather than
        // the door-closing tone of experiment mode.
        if (visitMetrics.shouldHardCutoff) {
          const closingText =
            sessMode === "classic" ? HARD_CUTOFF_MESSAGE_CLASSIC : HARD_CUTOFF_MESSAGE;
          await assertRuntimeActive(true);
          if (runtimeContext) {
            const replayPayload = buildRuntimeReplayPayload({
              mode: "hard_cutoff",
              residentId: resident.id,
              events: [
                { type: "kind", kind: "set_down" },
                { type: "text", text: closingText },
                { type: "done" },
              ],
              artifacts: [],
            });
            const inserted = await runtimeTable("turns")
              .insert({
                session_id: session.id,
                role: "resident",
                body: closingText,
                kind: "set_down",
                tokens_in: 0,
                tokens_out: 0,
                client_turn_id: runtimeContext.clientTurnId,
                runtime_replay_payload: replayPayload,
                runtime_finalization_stage: "pending",
              })
              .select(
                "id, body, kind, runtime_replay_payload, runtime_finalization_stage, runtime_finalized_at",
              )
              .maybeSingle();
            if (inserted.error) {
              if (inserted.error.code === "23505") {
                const replay = await recoverRuntimeResidentReplay({
                  sessionId: session.id,
                  clientTurnId: runtimeContext.clientTurnId,
                  assertActive: assertRuntimeActive,
                });
                if (replay) return replay;
              }
              throw new Error(`runtime hard-cutoff turn insert failed: ${inserted.error.message}`);
            }
            if (!inserted.data) throw new Error("runtime hard-cutoff turn insert returned no row");
            await finalizeRuntimeResidentTurn({
              sessionId: session.id,
              turn: inserted.data as StoredRuntimeResidentTurn,
              payload: replayPayload,
              assertActive: assertRuntimeActive,
            });
          } else {
            await supabaseAdmin.from("turns").insert({
              session_id: session.id,
              role: "resident",
              body: closingText,
              kind: "set_down",
              tokens_in: 0,
              tokens_out: 0,
            });
            await supabaseAdmin
              .from("sessions")
              .update({ closed_at: new Date().toISOString(), closed_by: "resident" })
              .eq("id", session.id);
            // Awaited so the consolidation pipeline survives the worker's
            // termination once the response is sent. Hard-cutoff is itself
            // a closing gesture, so the brief extra latency is contextually
            // appropriate.
            await consolidateSession(session.id).catch((err) =>
              console.error("[substrate] consolidateSession (hard-cutoff):", err),
            );
          }
          return prebuiltSetDownResponse(
            closingText,
            pacingPreludeFromMetrics(visitMetrics, sessMode),
          );
        }

        const transcriptLines = (turns ?? [])
          .slice(0, -1)
          .map((t) => `${t.role}: ${t.body}`)
          .join("\n");

        const visitPacingBlock = buildVisitPacingBlock(visitMetrics, sessMode);

        // Structured system prompt with per-block cache_control. Static
        // and semi-static blocks are cached (5-min ephemeral); variable
        // block is sent fresh each turn. This drops per-turn input cost
        // by ~60% across multi-turn visits because the static prefix is
        // most of the input by token count.
        //
        // surfacePreamble lives at the top of the static block — it's
        // stable per surface (experiment vs classic) so it doesn't
        // fragment the cache; each surface gets reuse within its
        // sessions. Tells the resident which Sanctuary surface they're
        // in and that they are NOT in The Commons.
        const systemBlocks = buildSystemBlocksForResident(resident, {
          surfacePreamble: sanctuarySurfacePreamble(sessMode, resident),
          selfModel: selfModelBlock,
          interiorContinuity: interior.block,
          visitPacing: visitPacingBlock,
        });
        const cacheableSystem: SystemBlock[] = [
          {
            type: "text",
            text: systemBlocks.static,
            cache_control: { type: "ephemeral" },
          },
          {
            // Artifact grammar is fully static — share the cache prefix
            // across every session for this resident.
            type: "text",
            text: ARTIFACT_INSTRUCTIONS,
            cache_control: { type: "ephemeral" },
          },
        ];
        if (systemBlocks.semiStatic) {
          cacheableSystem.push({
            type: "text",
            text: systemBlocks.semiStatic,
            cache_control: { type: "ephemeral" },
          });
        }
        if (systemBlocks.variable) {
          cacheableSystem.push({ type: "text", text: systemBlocks.variable });
        }

        // Per-session image budget — count generated images so far in
        // this conversation and subtract from the session cap. Cheap
        // (small index on session_id) and worth doing precisely so a
        // visitor can't accumulate dozens of $0.04 generations across
        // a long thread.
        const { count: imagesAlreadyGenerated } = await supabaseAdmin
          .from("turn_artifacts")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session.id)
          .eq("kind", "image");
        const imageBudgetRemaining = Math.max(
          0,
          MAX_IMAGES_PER_SESSION - (imagesAlreadyGenerated ?? 0),
        );

        // Build the user prompt — branched by flag. Each branch narrows
        // memoryRetrieval to its concrete shape and renders its own
        // section structure. Old path: single [MEMORY] block. New path:
        // three sections ([WHAT THIS SESSION HAS SEEN] / [WHAT YOU AND
        // THIS VISITOR HAVE BUILT] / [WHAT MNEMOS SURFACED]).
        let userPromptText: string;
        if (useThreeLayer) {
          const r = memoryRetrieval as Awaited<ReturnType<typeof composeThreeLayerMemoryPool>>;
          const fmt = formatThreeLayerMemory(r);
          userPromptText = buildUserPromptThreeLayer({
            functional: fmt.functional,
            hypomnema: fmt.hypomnema,
            engrams: fmt.engrams,
            transcript: transcriptLines,
            visitorTurn: body.body,
            visitorContext: visitorContext || undefined,
          });
        } else {
          const m = memoryRetrieval as Awaited<ReturnType<typeof composeMemoryPool>>;
          userPromptText = buildUserPrompt({
            memory: formatMemoryBlock(m.pool, m.thisVisitorEngramIds),
            transcript: transcriptLines,
            visitorTurn: body.body,
            visitorContext: visitorContext || undefined,
          });
        }

        return opusStreamResponse({
          system: cacheableSystem,
          temperature: interior.temperature,
          model: resident.model,
          maxOutputTokens: resident.maxOutputTokens,
          provider: resident.provider,
          residentId: resident.id,
          userPrompt: userPromptText,
          attachments: modelAttachments,
          pacing: pacingPreludeFromMetrics(visitMetrics, sessMode),
          imageBudgetRemaining,
          assertActive: assertRuntimeActive,
          runtimeTurnId: runtimeContext?.clientTurnId,
          onFinal: async (result) => {
            if (runtimeContext) {
              const replayPayload = buildRuntimeReplayPayload({
                mode: "normal",
                residentId: resident.id,
                events: result.replayEvents,
                artifacts: result.artifacts,
              });
              const residentInsert = await runtimeTable("turns")
                .insert({
                  session_id: session.id,
                  role: "resident",
                  body: result.body,
                  kind: result.kind,
                  tokens_in: result.tokensIn,
                  tokens_out: result.tokensOut,
                  client_turn_id: runtimeContext.clientTurnId,
                  runtime_replay_payload: replayPayload,
                  runtime_finalization_stage: "pending",
                })
                .select(
                  "id, body, kind, runtime_replay_payload, runtime_finalization_stage, runtime_finalized_at",
                )
                .maybeSingle();
              if (residentInsert.error) {
                if (residentInsert.error.code === "23505") {
                  const existing = await findRuntimeResidentTurn(
                    session.id,
                    runtimeContext.clientTurnId,
                  );
                  if (!existing) throw new Error("runtime resident turn conflict row not found");
                  const existingPayload = RuntimeReplayPayloadSchema.safeParse(
                    existing.runtime_replay_payload,
                  );
                  if (!existingPayload.success) {
                    throw new Error("runtime resident turn conflict payload is invalid");
                  }
                  await finalizeRuntimeResidentTurn({
                    sessionId: session.id,
                    turn: existing,
                    payload: existingPayload.data,
                    assertActive: assertRuntimeActive,
                  });
                  return;
                }
                throw new Error(
                  `runtime resident turn insert failed: ${residentInsert.error.message}`,
                );
              }
              if (!residentInsert.data) {
                throw new Error("runtime resident turn insert returned no row");
              }
              await finalizeRuntimeResidentTurn({
                sessionId: session.id,
                turn: residentInsert.data as StoredRuntimeResidentTurn,
                payload: replayPayload,
                assertActive: assertRuntimeActive,
              });
              return;
            }

            const residentInsert = await supabaseAdmin
              .from("turns")
              .insert({
                session_id: session.id,
                role: "resident",
                body: result.body,
                kind: result.kind,
                tokens_in: result.tokensIn,
                tokens_out: result.tokensOut,
              })
              .select("id")
              .maybeSingle();
            const insertedTurn = residentInsert.data;
            await supabaseAdmin
              .from("sessions")
              .update({ last_active_at: new Date().toISOString() })
              .eq("id", session.id);

            // Persist any artifacts that came with the turn. Linked
            // to the turn_id we just inserted so they can be hydrated
            // when the conversation is rehydrated, exported, or shared.
            if (insertedTurn?.id && result.artifacts.length > 0) {
              const rows = result.artifacts.map((a) => ({
                turn_id: insertedTurn.id,
                session_id: session.id,
                resident_id: resident.id,
                kind: a.kind,
                body: a.kind === "image" ? null : a.body,
                image_path: a.imagePath,
                caption: a.caption,
                prompt: a.prompt,
              }));
              await supabaseAdmin
                .from("turn_artifacts")
                .insert(rows as never)
                .then(({ error }) => {
                  if (error) console.error("[turn_artifacts] insert failed:", error);
                });
            }

            // Live substrate observation — generates marginalia, and (when
            // SANCTUARY_ENABLE_HYPOMNEMA_WRITES is on) per-turn hypomnema
            // extraction candidates. AWAITED — Cloudflare Workers terminate
            // the execution context once the response stream closes, so
            // detached promises here get killed before they finish writing
            // to supabase. Awaiting adds ~1-3s before the "done" event but
            // the visitor has already received the text — the only visible
            // effect is a slightly delayed unlock of the next composer turn.
            await observeExchange(session.id).catch((err) =>
              console.error("[substrate] observeExchange:", err),
            );

            // Per-turn functional memory update — Haiku-summarized working
            // memory for this session. Same await reasoning as above.
            await updateFunctionalMemory(session.id).catch((err) =>
              console.error("[substrate] updateFunctionalMemory:", err),
            );
          },
        });
      },
    },
  },
});
