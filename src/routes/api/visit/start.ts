import { createFileRoute } from "@tanstack/react-router";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ipHash } from "@/server/rate-limit.server";
import { isResidentId, getResident } from "@/server/opus/residents";
import {
  emotionalStateValuesFromRow,
  loadAuthoritativeEmotionalState,
} from "@/server/mnemos-emotion/runtime.server";
import { sha256Hex } from "@/server/runtime/hash";
import { errorJson, json, operationConflict } from "@/server/runtime/http";
import { legacyStartVisit, readJsonResponse } from "@/server/runtime/legacy.server";
import {
  MAX_MODEL_ATTACHMENT_BYTES,
  MAX_MODEL_ATTACHMENTS,
  MODEL_VISIBLE_ATTACHMENT_MEDIA_TYPES,
} from "@/server/runtime/attachment-policy";
import {
  parseIdempotencyKey,
  RUNTIME_EVENT_VERSION,
  StartVisitBodySchema,
} from "@/server/runtime/schema";
import { runtimeStore } from "@/server/runtime/store.server";

export const Route = createFileRoute("/api/visit/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = StartVisitBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return errorJson("bad_request", 400);
        if (!parsed.data.visitor_id) return errorJson("visitor_id_required", 400);
        if (!isResidentId(parsed.data.resident_id)) return errorJson("unknown_resident", 400);

        const resident = getResident(parsed.data.resident_id);
        const configured = hasSupabaseAdminEnv();
        const localReview = !configured;
        if (configured && !resident.acceptingVisits) return errorJson("chat_disabled", 403);

        const store = runtimeStore();
        const anonymousScope =
          parsed.data.visitor_token ?? parsed.data.visitor_id ?? ipHash(request);
        const compatibilityWindow = Math.floor(Date.now() / (60 * 60 * 1000));
        const fallbackIdempotency = parsed.data.requested_visit_id
          ? `visit-start:${parsed.data.requested_visit_id}`
          : `compat-start:${await sha256Hex({ resident: resident.id, anonymousScope, compatibilityWindow })}`;
        const idempotencyKey = parseIdempotencyKey(request, fallbackIdempotency);
        if (!idempotencyKey) return errorJson("idempotency_key_required", 400);
        const scopeKey = `visit-start:${resident.id}:${anonymousScope}`;
        const requestHash = await sha256Hex(parsed.data);
        const claimed = await store.beginOperation({
          scope_key: scopeKey,
          operation: "visit.start",
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
        });
        if (claimed.kind === "conflict" || claimed.kind === "in_progress") {
          return operationConflict(claimed.kind);
        }
        if (claimed.kind === "replay") {
          const replay = claimed.operation.response ?? { ok: false, code: "replay_unavailable" };
          return json(replay, Number(replay.http_status ?? 200), {
            "x-mnemos-runtime-replay": "true",
          });
        }

        try {
          let visitId: string;
          let resumed = false;
          const requestedVisit = parsed.data.requested_visit_id
            ? await store.getVisit(parsed.data.requested_visit_id)
            : null;
          if (parsed.data.requested_visit_id && !requestedVisit) {
            const response = { ok: false, code: "visit_not_found", http_status: 404 };
            await store.completeOperation(claimed.operation, { response });
            return json(response, 404);
          }
          if (
            requestedVisit &&
            (requestedVisit.resident_id !== resident.id ||
              (requestedVisit.visitor_id && requestedVisit.visitor_id !== parsed.data.visitor_id))
          ) {
            const response = { ok: false, code: "visitor_access_denied", http_status: 403 };
            await store.completeOperation(claimed.operation, { response });
            return json(response, 403);
          }
          if (requestedVisit) {
            visitId = requestedVisit.id;
            resumed = true;
          } else if (configured) {
            const upstream = await legacyStartVisit(request, {
              resident: resident.id,
              visitor_token: parsed.data.visitor_token,
            });
            const data = await readJsonResponse(upstream);
            if (!upstream.ok || data.ok !== true || typeof data.session_id !== "string") {
              const response = {
                ...data,
                ok: false,
                http_status: upstream.status,
                runtime_event_version: RUNTIME_EVENT_VERSION,
              };
              await store.completeOperation(claimed.operation, { response });
              return json(response, upstream.status);
            }
            visitId = data.session_id;
            resumed = data.resumed === true;
          } else {
            const visit = await store.registerMemoryVisit({
              resident_id: resident.id,
              visitor_id: parsed.data.visitor_id,
              visitor_token: parsed.data.visitor_token ?? null,
              client_visit_id: parsed.data.requested_visit_id,
              surface: parsed.data.surface,
              location: parsed.data.location,
              mode: "classic",
            });
            visitId = visit.id;
          }

          await store.setVisitContext(visitId, {
            visitor_id: parsed.data.visitor_id,
            client_visit_id: parsed.data.requested_visit_id,
            surface: parsed.data.surface,
            location: parsed.data.location,
          });

          const visitEvent = await store.appendEvent(visitId, {
            type: resumed ? "visit.resumed" : "visit.started",
            phase: "pre_turn",
            resident_id: resident.id,
            visitor_id: parsed.data.visitor_id,
            surface: parsed.data.surface,
            location: parsed.data.location,
            source_runtime: "opus-supabase",
            visibility: "visitor",
            epistemic_status: "observed",
            payload: {
              mode: "classic",
              persistent: store.backend === "supabase",
              generation_available: store.backend === "supabase",
              local_review: localReview,
              visitor_id: parsed.data.visitor_id,
              client_visit_id: parsed.data.requested_visit_id,
              surface: parsed.data.surface,
              location: parsed.data.location,
            },
            idempotency_key: `${idempotencyKey}:visit`,
          });

          // A room may begin at rest with a previously persisted resident state.
          // Project only the six visitor-safe dimensions; if the newer emotion
          // migration is not present yet, room start must remain available and
          // the instrument stays intentionally empty.
          let cursorEvent = visitEvent;
          if (store.backend === "supabase") {
            try {
              const state = await loadAuthoritativeEmotionalState(resident.id);
              if (state) {
                cursorEvent = await store.appendEvent(visitId, {
                  type: "emotion.inner-weather.updated",
                  phase: "pre_turn",
                  resident_id: resident.id,
                  visitor_id: parsed.data.visitor_id,
                  surface: parsed.data.surface,
                  location: parsed.data.location,
                  source_runtime: state.source_runtime,
                  visibility: "visitor",
                  epistemic_status: "observed",
                  payload: {
                    values: emotionalStateValuesFromRow(state),
                    revision: state.revision,
                    state_timestamp: state.state_timestamp,
                    updated_at: state.updated_at,
                    trigger_scope: "pre_turn",
                    applied_event_count: 0,
                    provenance: "persisted-authoritative-state",
                  },
                  idempotency_key: `${idempotencyKey}:inner-weather-snapshot`,
                });
              }
            } catch (error) {
              console.warn("[runtime] authoritative Inner Weather snapshot unavailable", error);
            }
          }
          const response = {
            ok: true,
            visit_id: visitId,
            session_id: visitId,
            client_visit_id: parsed.data.requested_visit_id,
            visitor_id: parsed.data.visitor_id,
            resident_id: resident.id,
            surface: parsed.data.surface,
            location: parsed.data.location,
            resumed,
            mode: "classic",
            runtime_backend: store.backend,
            local_review: localReview,
            generation_available: store.backend === "supabase",
            status: requestedVisit?.closed_at ? "closed" : "open",
            closed: Boolean(requestedVisit?.closed_at),
            consolidation_recoverable: Boolean(
              requestedVisit?.closed_at &&
              requestedVisit.runtime_consolidation_started_at &&
              !requestedVisit.runtime_consolidation_settled_at,
            ),
            runtime_event_version: RUNTIME_EVENT_VERSION,
            event_cursor: cursorEvent.seq,
            last_seq: cursorEvent.seq,
            events_url: `/api/visit/${visitId}/events`,
            turn_url: `/api/visit/${visitId}/turn`,
            set_down_url: `/api/visit/${visitId}/set-down`,
            attachments_url: `/api/visit/${visitId}/attachments`,
            capabilities: {
              event_replay: true,
              ndjson_turns: true,
              generation: store.backend === "supabase",
              attachments: {
                enabled: true,
                model_visible: store.backend === "supabase",
                init_endpoint: `/api/visit/${visitId}/attachments/init`,
                finalize_endpoint: `/api/visit/${visitId}/attachments/finalize`,
                accept: MODEL_VISIBLE_ATTACHMENT_MEDIA_TYPES,
                max_bytes: 10 * 1024 * 1024,
                max_visit_bytes: 40 * 1024 * 1024,
                max_turn_bytes: MAX_MODEL_ATTACHMENT_BYTES,
                max_turn_files: MAX_MODEL_ATTACHMENTS,
              },
            },
            http_status: 200,
          };
          await store.completeOperation(claimed.operation, {
            response,
            visit_id: visitId,
            event_start_seq: visitEvent.seq,
            event_end_seq: cursorEvent.seq,
          });
          return json(response);
        } catch (error) {
          console.error("[runtime] visit start failed", error);
          const response = {
            ok: false,
            code: "runtime_start_failed",
            http_status: 500,
            runtime_event_version: RUNTIME_EVENT_VERSION,
          };
          await store.completeOperation(claimed.operation, { response }).catch(() => undefined);
          return json(response, 500);
        }
      },
    },
  },
});
