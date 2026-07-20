import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sha256Hex } from "@/server/runtime/hash";
import { errorJson, json, operationConflict } from "@/server/runtime/http";
import { legacySetDown, readJsonResponse } from "@/server/runtime/legacy.server";
import { projectAttributedConsolidation } from "@/server/runtime/cognition-projection.server";
import { parseIdempotencyKey, RUNTIME_EVENT_VERSION } from "@/server/runtime/schema";
import { runtimeStore } from "@/server/runtime/store.server";
import { isVisitVisitorAuthorized } from "@/server/runtime/visitor-auth.server";

export const Route = createFileRoute("/api/visit/$id/set-down")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!z.string().uuid().safeParse(params.id).success) return errorJson("bad_visit_id", 400);
        const idempotencyKey = parseIdempotencyKey(request, `visit-set-down:${params.id}`);
        if (!idempotencyKey) return errorJson("idempotency_key_required", 400);
        const store = runtimeStore();
        const visit = await store.getVisit(params.id).catch(() => null);
        if (!visit) return errorJson("visit_not_found", 404);
        if (!isVisitVisitorAuthorized(request, visit)) {
          return errorJson("visitor_access_denied", 403);
        }
        const eventContext = {
          visitor_id: visit.visitor_id,
          surface: visit.surface,
          location: visit.location,
        } as const;

        const requestHash = await sha256Hex({ visit_id: visit.id, action: "set-down" });
        const claimed = await store.beginOperation({
          scope_key: `visit:${visit.id}`,
          operation: "visit.set-down",
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          visit_id: visit.id,
        });
        if (claimed.kind === "conflict" || claimed.kind === "in_progress") {
          return operationConflict(claimed.kind);
        }
        if (claimed.kind === "replay") {
          const replay = claimed.operation.response ?? { ok: true };
          return json(replay, Number(replay.http_status ?? 200), {
            "x-mnemos-runtime-replay": "true",
          });
        }

        if (visit.closed_at && store.backend === "memory") {
          const response = {
            ok: true,
            visit_id: visit.id,
            already_closed: true,
            runtime_event_version: RUNTIME_EVENT_VERSION,
          };
          await store.completeOperation(claimed.operation, { response, visit_id: visit.id });
          return json(response);
        }

        let firstSeq: number | null = null;
        let lastSeq: number | null = null;
        try {
          if (store.backend === "memory") {
            const unavailable = await store.appendEvent(visit.id, {
              type: "consolidation.unavailable",
              phase: "consolidation",
              resident_id: visit.resident_id,
              ...eventContext,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: {
                reason: "Supabase-backed consolidation is unavailable in the in-memory fallback",
              },
              idempotency_key: `${idempotencyKey}:consolidation-unavailable`,
            });
            firstSeq = unavailable.seq;
            await store.closeMemoryVisit(visit.id);
            const closed = await store.appendEvent(visit.id, {
              type: "visit.closed",
              phase: "consolidation",
              resident_id: visit.resident_id,
              ...eventContext,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: { closed_by: "visitor", consolidated: false },
              idempotency_key: `${idempotencyKey}:visit-closed`,
            });
            lastSeq = closed.seq;
            const response = {
              ok: true,
              visit_id: visit.id,
              consolidated: false,
              runtime_backend: "memory",
              event_cursor: lastSeq,
              runtime_event_version: RUNTIME_EVENT_VERSION,
            };
            await store.completeOperation(claimed.operation, {
              response,
              visit_id: visit.id,
              event_start_seq: firstSeq,
              event_end_seq: lastSeq,
            });
            return json(response);
          }

          const started = await store.appendEvent(visit.id, {
            type: "consolidation.started",
            phase: "consolidation",
            resident_id: visit.resident_id,
            ...eventContext,
            source_runtime: "opus-supabase",
            visibility: "visitor",
            epistemic_status: "observed",
            payload: {
              progress_available: false,
              expected_duration_seconds: { min: 10, max: 30 },
            },
            idempotency_key: `${idempotencyKey}:consolidation-started`,
          });
          firstSeq = started.seq;
          // A reclaimed attempt receives the original idempotent event. Its
          // timestamp keeps projection queries anchored before any mutations
          // the interrupted attempt may already have written.
          const since = started.ts;

          const upstream = await legacySetDown(request, visit.id);
          const upstreamBody = await readJsonResponse(upstream);
          if (!upstream.ok || upstreamBody.ok !== true) {
            const failed = await store.appendEvent(visit.id, {
              type: "consolidation.failed",
              phase: "consolidation",
              resident_id: visit.resident_id,
              ...eventContext,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: {
                upstream_status: upstream.status,
                code: upstreamBody.code ?? "consolidation_failed",
                retryable: upstream.status >= 500,
              },
              idempotency_key: `${idempotencyKey}:consolidation-failed`,
            });
            lastSeq = failed.seq;
            const response = {
              ok: false,
              code: upstreamBody.code ?? "consolidation_failed",
              visit_id: visit.id,
              event_cursor: lastSeq,
              runtime_event_version: RUNTIME_EVENT_VERSION,
              http_status: upstream.status,
            };
            if (upstream.status >= 500 || upstream.status === 429) {
              await store.releaseOperation(claimed.operation).catch(() => undefined);
            } else {
              await store.completeOperation(claimed.operation, {
                response,
                visit_id: visit.id,
                event_start_seq: firstSeq,
                event_end_seq: lastSeq,
              });
            }
            return json(response, upstream.status, { "retry-after": "1" });
          }

          const projected = await projectAttributedConsolidation({
            store,
            visit,
            since,
          });
          await store.appendEvent(visit.id, {
            type: "consolidation.completed",
            phase: "consolidation",
            resident_id: visit.resident_id,
            ...eventContext,
            source_runtime: "opus-supabase",
            visibility: "visitor",
            epistemic_status: "inferred",
            payload: {
              projected_visit_safe_mutations:
                projected.visitorCognitionEventCount +
                projected.continuityEventCount +
                projected.emotionalEventCount,
              attribution_model: "durable_write_site_markers",
              resident_global_maintenance_visibility: "internal",
              legacy_endpoint_returned_ok: true,
              full_pipeline_success_verifiable: false,
              recovered_after_close: Boolean(visit.closed_at),
            },
            idempotency_key: `${idempotencyKey}:consolidation-completed`,
          });
          const closed = await store.appendEvent(visit.id, {
            type: "visit.closed",
            phase: "consolidation",
            resident_id: visit.resident_id,
            ...eventContext,
            source_runtime: "opus-supabase",
            visibility: "visitor",
            epistemic_status: "observed",
            payload: {
              closed_by: "visitor",
              consolidation_requested: true,
              consolidation_completion_verified: false,
            },
            idempotency_key: `${idempotencyKey}:visit-closed`,
          });
          lastSeq = closed.seq;
          const response = {
            ok: true,
            visit_id: visit.id,
            consolidation_endpoint_completed: true,
            consolidation_verified: false,
            projected_event_count:
              projected.visitorCognitionEventCount +
              projected.continuityEventCount +
              projected.emotionalEventCount,
            event_cursor: lastSeq,
            events_url: `/api/visit/${visit.id}/events`,
            runtime_event_version: RUNTIME_EVENT_VERSION,
          };
          await store.completeOperation(claimed.operation, {
            response,
            visit_id: visit.id,
            event_start_seq: firstSeq,
            event_end_seq: lastSeq,
          });
          return json(response);
        } catch (error) {
          console.error("[runtime] set-down failed", error);
          try {
            const failed = await store.appendEvent(visit.id, {
              type: "consolidation.failed",
              phase: "consolidation",
              resident_id: visit.resident_id,
              ...eventContext,
              source_runtime: "opus-supabase",
              visibility: "visitor",
              epistemic_status: "observed",
              payload: { code: "runtime_set_down_failed", retryable: true },
              idempotency_key: `${idempotencyKey}:runtime-failed`,
            });
            firstSeq ??= failed.seq;
            lastSeq = failed.seq;
          } catch {
            // Preserve the original failure response even if event storage is down.
          }
          const response = {
            ok: false,
            code: "runtime_set_down_failed",
            visit_id: visit.id,
            event_cursor: lastSeq,
            runtime_event_version: RUNTIME_EVENT_VERSION,
            http_status: 500,
          };
          await store.releaseOperation(claimed.operation).catch(() => undefined);
          return json(response, 500, { "retry-after": "1" });
        }
      },
    },
  },
});
