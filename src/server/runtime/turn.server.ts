import type { z } from "zod";
import { sanitizeArtifactForVisitor } from "./artifact";
import { nextRuntimeLegacyEventKey } from "./legacy-idempotency.server";
import { legacyTurn, readJsonResponse } from "./legacy.server";
import { projectPostTurn } from "./projection.server";
import { RUNTIME_EVENT_VERSION, type RuntimeEvent, type TurnBodySchema } from "./schema";
import {
  OperationLeaseLostError,
  type RuntimeOperation,
  type RuntimeStore,
  type RuntimeVisit,
} from "./store.server";

type TurnBody = z.infer<typeof TurnBodySchema>;

function runtimeHeaders(): HeadersInit {
  return {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-accel-buffering": "no",
    "x-mnemos-runtime-version": String(RUNTIME_EVENT_VERSION),
    "x-mnemos-runtime-replay": "false",
  };
}

export function streamTurn(input: {
  request: Request;
  store: RuntimeStore;
  visit: RuntimeVisit;
  body: TurnBody;
  operation: RuntimeOperation;
  idempotencyKey: string;
}): Response {
  let consumerOpen = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        const encoder = new TextEncoder();
        const enqueueVisitorEvent = (event: RuntimeEvent) => {
          if (!consumerOpen) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            // Stop/step-away closes only this delivery channel. The fenced worker
            // keeps draining the provider and persisting ordered replay events.
            consumerOpen = false;
          }
        };
        let firstSeq: number | null = null;
        let lastSeq: number | null = null;
        const legacyTypeCounts = new Map<string, number>();
        let outputStarted = false;
        let outputChars = 0;
        let generationOutputVisible = false;
        let legacyFailureCode: string | null = null;
        let sawLegacyDone = false;
        const startedAt = new Date().toISOString();

        const emit = async (
          event: Parameters<RuntimeStore["appendEvent"]>[1],
        ): Promise<RuntimeEvent> => {
          // The heartbeat and append are intentionally adjacent. Renewing the
          // five-minute lease here prevents an active worker from being
          // reclaimed, while a worker whose token was already replaced stops
          // before it can mix stale output into the new attempt's event stream.
          await input.store.heartbeatOperation(input.operation);
          const appended = await input.store.appendEvent(input.visit.id, {
            ...event,
            visitor_id: event.visitor_id ?? input.body.visitor_id ?? input.visit.visitor_id,
            turn_id: event.turn_id ?? input.body.turn_id,
            surface: event.surface ?? input.body.surface ?? input.visit.surface,
            location: event.location ?? input.body.location ?? input.visit.location,
          });
          firstSeq ??= appended.seq;
          lastSeq = appended.seq;
          if (appended.visibility === "visitor") {
            enqueueVisitorEvent(appended);
          }
          return appended;
        };

        const finishOperation = async (response: Record<string, unknown>) => {
          await input.store.completeOperation(input.operation, {
            response,
            visit_id: input.visit.id,
            event_start_seq: firstSeq,
            event_end_seq: lastSeq,
          });
        };

        try {
          await emit({
            type: "turn.accepted",
            phase: "pre_turn",
            resident_id: input.visit.resident_id,
            source_runtime: "opus-supabase",
            visibility: "visitor",
            epistemic_status: "observed",
            payload: {
              role: "visitor",
              message: input.body.message,
              client_turn_id: input.body.turn_id,
              character_count: input.body.message.length,
              attachment_count: input.body.attachment_ids.length,
              attachments_model_visible: input.body.attachment_ids.length > 0,
              visitor_id: input.body.visitor_id,
              visit_id: input.visit.id,
              turn_id: input.body.turn_id,
              resident_id: input.visit.resident_id,
              surface: input.body.surface,
              location: input.body.location,
            },
            idempotency_key: `${input.idempotencyKey}:turn-accepted`,
          });
          await emit({
            type: "turn.processing.started",
            phase: "pre_turn",
            resident_id: input.visit.resident_id,
            source_runtime: "opus-supabase",
            visibility: "visitor",
            epistemic_status: "observed",
            payload: {
              // The legacy API performs retrieval before generation but exposes
              // no boundary between them. This deliberately makes no retrieval
              // or model-thinking claim.
              stages_exposed: false,
            },
            idempotency_key: `${input.idempotencyKey}:processing-started`,
          });

          if (input.store.backend === "memory") {
            await emit({
              type: "turn.error",
              phase: "generation",
              resident_id: input.visit.resident_id,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: {
                code: "generation_unavailable",
                reason: "Resident generation is not connected in this local review.",
                retryable: false,
              },
              idempotency_key: `${input.idempotencyKey}:memory-unavailable`,
            });
            await emit({
              type: "turn.settled",
              phase: "post_turn",
              resident_id: input.visit.resident_id,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: {
                ok: false,
                persisted: false,
                code: "generation_unavailable",
                reason: "Resident generation is not connected in this local review.",
                retryable: false,
              },
              idempotency_key: `${input.idempotencyKey}:settled`,
            });
            await finishOperation({ ok: false, code: "generation_unavailable", status: 503 });
            return;
          }

          const upstream = await legacyTurn(
            input.request,
            {
              session_id: input.visit.id,
              body: input.body.message,
              attachment_ids: input.body.attachment_ids,
              preview_turns: input.body.preview_turns,
            },
            {
              operationId: input.operation.id,
              leaseToken: input.operation.lease_token,
              idempotencyKey: input.idempotencyKey,
              clientTurnId: input.body.turn_id,
            },
          );
          if (!upstream.ok || !upstream.body) {
            const detail = await readJsonResponse(upstream);
            const retryable =
              upstream.status >= 500 || upstream.status === 429 || upstream.status === 408;
            const code = String(detail.code ?? "legacy_turn_failed");
            await emit({
              type: "turn.error",
              phase: "generation",
              resident_id: input.visit.resident_id,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: {
                code,
                upstream_status: upstream.status,
                retryable,
              },
              idempotency_key: `${input.idempotencyKey}:upstream-error`,
            });
            if (retryable) {
              // No provider output crossed the safety boundary. Release the
              // operation so the same logical turn/key can retry its one durable
              // visitor row instead of caching a terminal failure.
              await input.store.releaseOperation(input.operation);
            } else {
              await emit({
                type: "turn.settled",
                phase: "post_turn",
                resident_id: input.visit.resident_id,
                source_runtime: "opus-supabase",
                visibility: "visitor",
                epistemic_status: "observed",
                payload: {
                  ok: false,
                  code,
                  retryable: false,
                  upstream_status: upstream.status,
                },
                idempotency_key: `${input.idempotencyKey}:settled`,
              });
              await finishOperation({ ok: false, code, status: upstream.status });
            }
            return;
          }

          const upstreamTextDelivery =
            upstream.headers.get("x-mnemos-legacy-replay") === "true"
              ? "replay"
              : upstream.headers.get("x-mnemos-text-delivery") === "safe-incremental"
                ? "safe_incremental"
                : upstream.headers.get("x-mnemos-text-delivery") === "prebuilt"
                  ? "prebuilt"
                  : "buffered";

          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          const handleLegacy = async (legacy: Record<string, unknown>) => {
            // Reclaimed legacy responses omit transient event families such as
            // pacing and artifact_pending. Keying by type + ordinal keeps text,
            // artifacts, kind, and errors aligned with their original writes
            // instead of letting a shortened replay collide by global position.
            const eventKey = nextRuntimeLegacyEventKey(
              input.idempotencyKey,
              legacy.type,
              legacyTypeCounts,
            );
            switch (legacy.type) {
              case "pacing":
                await emit({
                  type: "visit.pacing.changed",
                  phase: "pre_turn",
                  resident_id: input.visit.resident_id,
                  source_runtime: "opus-supabase",
                  visibility: "visitor",
                  epistemic_status: "observed",
                  payload: {
                    tier: legacy.tier,
                    turns_remaining: legacy.turnsRemaining,
                    tokens_remaining_pct: legacy.tokensRemainingPct,
                    mode: legacy.mode,
                  },
                  idempotency_key: eventKey,
                });
                break;
              case "kind":
                await emit({
                  type: "turn.kind.detected",
                  phase: "generation",
                  resident_id: input.visit.resident_id,
                  source_runtime: "opus-supabase",
                  visibility: "visitor",
                  epistemic_status: "observed",
                  payload: { kind: legacy.kind },
                  idempotency_key: eventKey,
                });
                generationOutputVisible = true;
                break;
              case "text": {
                const delta = typeof legacy.text === "string" ? legacy.text : "";
                if (!outputStarted) {
                  outputStarted = true;
                  await emit({
                    type: "model.output.started",
                    phase: "generation",
                    resident_id: input.visit.resident_id,
                    source_runtime: "opus-supabase",
                    visibility: "visitor",
                    epistemic_status: "observed",
                    payload: {
                      upstream_delivery: upstreamTextDelivery,
                      token_level_stream: false,
                      reasoning_exposed: false,
                      ...(upstreamTextDelivery === "safe_incremental"
                        ? { safety_boundary: "immutable_paragraph_prefix" }
                        : {}),
                    },
                    idempotency_key: `${input.idempotencyKey}:output-started`,
                  });
                }
                outputChars += delta.length;
                await emit({
                  type: "model.output.delta",
                  phase: "generation",
                  resident_id: input.visit.resident_id,
                  source_runtime: "opus-supabase",
                  visibility: "visitor",
                  epistemic_status: "observed",
                  payload: {
                    delta,
                    upstream_delivery: upstreamTextDelivery,
                    token_level: false,
                  },
                  idempotency_key: eventKey,
                });
                if (delta.length > 0) generationOutputVisible = true;
                break;
              }
              case "artifact_pending":
                await emit({
                  type: "artifact.pending",
                  phase: "generation",
                  resident_id: input.visit.resident_id,
                  source_runtime: "opus-supabase",
                  visibility: "visitor",
                  epistemic_status: "observed",
                  payload: {
                    placeholder_id: legacy.placeholder_id,
                    caption: legacy.caption,
                    prompt: legacy.prompt,
                  },
                  idempotency_key: eventKey,
                });
                generationOutputVisible = true;
                break;
              case "artifact":
                {
                  const artifact = sanitizeArtifactForVisitor(legacy.artifact);
                  if (artifact) {
                    await emit({
                      type: "artifact.ready",
                      phase: "generation",
                      resident_id: input.visit.resident_id,
                      source_runtime: "opus-supabase",
                      visibility: "visitor",
                      epistemic_status: "observed",
                      payload: {
                        placeholder_id: legacy.placeholder_id,
                        artifact,
                      },
                      idempotency_key: eventKey,
                    });
                  } else {
                    await emit({
                      type: "artifact.failed",
                      phase: "generation",
                      resident_id: input.visit.resident_id,
                      source_runtime: "opus-supabase",
                      visibility: "visitor",
                      epistemic_status: "observed",
                      payload: {
                        placeholder_id: legacy.placeholder_id,
                        reason: "artifact_rejected_by_safety_boundary",
                      },
                      idempotency_key: eventKey,
                    });
                  }
                  generationOutputVisible = true;
                }
                break;
              case "image_error":
                await emit({
                  type: "artifact.failed",
                  phase: "generation",
                  resident_id: input.visit.resident_id,
                  source_runtime: "opus-supabase",
                  visibility: "visitor",
                  epistemic_status: "observed",
                  payload: {
                    placeholder_id: legacy.placeholder_id,
                    reason: legacy.reason,
                    caption: legacy.caption,
                  },
                  idempotency_key: eventKey,
                });
                generationOutputVisible = true;
                break;
              case "proposal":
                await emit({
                  type: "space.proposed",
                  phase: "generation",
                  resident_id: input.visit.resident_id,
                  source_runtime: "opus-supabase",
                  visibility: "visitor",
                  epistemic_status: "observed",
                  payload: { proposal: legacy.proposal },
                  idempotency_key: eventKey,
                });
                generationOutputVisible = true;
                break;
              case "error": {
                const code = String(legacy.message ?? "model_unavailable");
                const retryable = !generationOutputVisible;
                legacyFailureCode = code;
                await emit({
                  type: "turn.error",
                  phase: "generation",
                  resident_id: input.visit.resident_id,
                  source_runtime: "opus-supabase",
                  visibility: "visitor",
                  epistemic_status: "observed",
                  payload: { code, retryable },
                  idempotency_key: eventKey,
                });
                break;
              }
              case "done":
                sawLegacyDone = true;
                break;
              default:
                // Unknown legacy events are ignored rather than relabeled as
                // cognition. A future protocol version can add an exact mapping.
                break;
            }
          };

          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            let newline = buffer.indexOf("\n");
            while (newline >= 0) {
              const line = buffer.slice(0, newline).trim();
              buffer = buffer.slice(newline + 1);
              if (line) {
                try {
                  const parsed = JSON.parse(line);
                  if (parsed && typeof parsed === "object") await handleLegacy(parsed);
                } catch {
                  // A malformed upstream line is transport noise, not cognition.
                }
              }
              newline = buffer.indexOf("\n");
            }
          }
          const tail = buffer.trim();
          if (tail) {
            try {
              const parsed = JSON.parse(tail);
              if (parsed && typeof parsed === "object") await handleLegacy(parsed);
            } catch {
              // Ignore an incomplete final upstream line.
            }
          }

          const logicalSuccess = sawLegacyDone && legacyFailureCode === null;
          if (!logicalSuccess) {
            const code = legacyFailureCode ?? "upstream_stream_incomplete";
            const retryable = !sawLegacyDone && !generationOutputVisible;
            if (!legacyFailureCode) {
              await emit({
                type: "turn.error",
                phase: "generation",
                resident_id: input.visit.resident_id,
                source_runtime: "opus-supabase",
                visibility: "visitor",
                epistemic_status: "observed",
                payload: { code, retryable },
                idempotency_key: `${input.idempotencyKey}:incomplete-stream-error`,
              });
            }
            if (retryable) {
              // A transient transport/provider failure before any public
              // generation output can safely retry this exact logical turn.
              // The visitor row is already keyed by client_turn_id and is
              // resumed, never inserted a second time.
              await input.store.releaseOperation(input.operation);
              return;
            }
            // Once any generation output is public (or the legacy runtime has
            // durably completed its reply), regeneration could splice a second
            // answer onto the first. Preserve the exact partial replay and make
            // the terminal failure explicit instead.
            await emit({
              type: "turn.settled",
              phase: "post_turn",
              resident_id: input.visit.resident_id,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: {
                ok: false,
                code,
                retryable: false,
                character_count: outputChars,
                legacy_done_observed: sawLegacyDone,
              },
              idempotency_key: `${input.idempotencyKey}:settled`,
            });
            await finishOperation({
              ok: false,
              code,
              status: 502,
              visitor_id: input.body.visitor_id,
              visit_id: input.visit.id,
              turn_id: input.body.turn_id,
              resident_id: input.visit.resident_id,
              surface: input.body.surface,
              location: input.body.location,
              event_start_seq: firstSeq,
              event_end_seq: lastSeq,
            });
            return;
          }

          if (outputStarted) {
            await emit({
              type: "model.output.completed",
              phase: "generation",
              resident_id: input.visit.resident_id,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: {
                character_count: outputChars,
                upstream_delivery: upstreamTextDelivery,
                token_level: false,
                legacy_done_observed: sawLegacyDone,
              },
              idempotency_key: `${input.idempotencyKey}:output-completed`,
            });
          }

          let projectionCount = 0;
          try {
            const projected = await projectPostTurn({
              store: input.store,
              visit: input.visit,
              visitorId: input.body.visitor_id,
              turnId: input.body.turn_id,
              surface: input.body.surface ?? input.visit.surface,
              location: input.body.location ?? input.visit.location,
              since: startedAt,
              idempotencyPrefix: input.idempotencyKey,
              // Keep the completion proof explicit even though failed legacy
              // streams return above. Emotional projection must never treat a
              // partial generation as a completed resident interaction.
              residentTurnCompleted: sawLegacyDone && outputStarted,
              beforeAppend: async () => {
                await input.store.heartbeatOperation(input.operation);
              },
            });
            projectionCount = projected.length;
            for (const event of projected) {
              firstSeq ??= event.seq;
              lastSeq = event.seq;
              if (event.visibility === "visitor") {
                enqueueVisitorEvent(event);
              }
            }
          } catch (error) {
            console.error("[runtime] post-turn projection failed", error);
          }

          await emit({
            type: "turn.settled",
            phase: "post_turn",
            resident_id: input.visit.resident_id,
            source_runtime: "opus-supabase",
            visibility: "visitor",
            epistemic_status: "observed",
            payload: {
              ok: true,
              retryable: false,
              post_turn_projection_count: projectionCount,
            },
            idempotency_key: `${input.idempotencyKey}:settled`,
          });
          await finishOperation({
            ok: true,
            status: 200,
            visitor_id: input.body.visitor_id,
            visit_id: input.visit.id,
            turn_id: input.body.turn_id,
            resident_id: input.visit.resident_id,
            surface: input.body.surface,
            location: input.body.location,
            event_start_seq: firstSeq,
            event_end_seq: lastSeq,
          });
        } catch (error) {
          if (error instanceof OperationLeaseLostError) return;
          console.error("[runtime] unified turn failed", error);
          try {
            const retryable = !generationOutputVisible;
            await emit({
              type: "turn.error",
              phase: "generation",
              resident_id: input.visit.resident_id,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: { code: "runtime_turn_failed", retryable },
              idempotency_key: `${input.idempotencyKey}:runtime-error`,
            });
            if (retryable) {
              await input.store.releaseOperation(input.operation);
              return;
            }
            await emit({
              type: "turn.settled",
              phase: "post_turn",
              resident_id: input.visit.resident_id,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: { ok: false, code: "runtime_turn_failed", retryable: false },
              idempotency_key: `${input.idempotencyKey}:settled`,
            });
            await finishOperation({ ok: false, code: "runtime_turn_failed", status: 500 });
          } catch (nested) {
            console.error("[runtime] failed to record turn failure", nested);
          }
        } finally {
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

  return new Response(stream, { headers: runtimeHeaders() });
}
