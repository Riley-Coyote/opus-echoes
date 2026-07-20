import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  isModelVisibleAttachmentMediaType,
  MAX_MODEL_ATTACHMENT_BYTES,
  MAX_MODEL_ATTACHMENTS,
} from "@/server/runtime/attachment-policy";
import { sha256Hex } from "@/server/runtime/hash";
import { errorJson, json, ndjsonEvents, operationConflict } from "@/server/runtime/http";
import { parseIdempotencyKey, TurnBodySchema } from "@/server/runtime/schema";
import { runtimeStore } from "@/server/runtime/store.server";
import { streamTurn } from "@/server/runtime/turn.server";
import { isVisitVisitorAuthorized } from "@/server/runtime/visitor-auth.server";

export const Route = createFileRoute("/api/visit/$id/turn")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!z.string().uuid().safeParse(params.id).success) return errorJson("bad_visit_id", 400);
        const parsed = TurnBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return errorJson("bad_request", 400);
        if (parsed.data.visit_id && parsed.data.visit_id !== params.id) {
          return errorJson("visit_id_mismatch", 409);
        }
        const idempotencyKey = parseIdempotencyKey(request, `visit-turn:${parsed.data.turn_id}`);
        if (!idempotencyKey) return errorJson("idempotency_key_required", 400);

        const store = runtimeStore();
        const visit = await store.getVisit(params.id).catch((error) => {
          console.error("[runtime] visit lookup failed", error);
          return null;
        });
        if (!visit) return errorJson("visit_not_found", 404);
        if (!isVisitVisitorAuthorized(request, visit, parsed.data.visitor_id)) {
          return errorJson("visitor_access_denied", 403);
        }
        if (visit.closed_at) return errorJson("visit_closed", 410);
        if (parsed.data.resident_id && parsed.data.resident_id !== visit.resident_id) {
          return errorJson("resident_id_mismatch", 409);
        }
        const surface = parsed.data.surface ?? visit.surface;
        const location = parsed.data.location ?? visit.location;
        const visitorId = parsed.data.visitor_id ?? visit.visitor_id;
        await store.setVisitContext(visit.id, {
          visitor_id: visitorId,
          client_visit_id: visit.client_visit_id,
          surface,
          location,
        });
        if (parsed.data.attachment_ids.length > 0) {
          if (new Set(parsed.data.attachment_ids).size > MAX_MODEL_ATTACHMENTS) {
            return errorJson("attachment_context_too_large", 413);
          }
          const attachments = await store.listAttachments(visit.id);
          const available = new Map(
            attachments.map((attachment) => [attachment.id, attachment] as const),
          );
          if (parsed.data.attachment_ids.some((id) => !available.has(id))) {
            return errorJson("attachment_not_found", 400);
          }
          if (
            parsed.data.attachment_ids.some(
              (id) => !isModelVisibleAttachmentMediaType(available.get(id)?.media_type ?? ""),
            )
          ) {
            return errorJson("attachment_type_not_model_visible", 415);
          }
          const selectedBytes = Array.from(new Set(parsed.data.attachment_ids)).reduce(
            (total, id) => total + (available.get(id)?.byte_size ?? 0),
            0,
          );
          if (selectedBytes > MAX_MODEL_ATTACHMENT_BYTES) {
            return errorJson("attachment_context_too_large", 413);
          }
        }

        const requestHash = await sha256Hex(parsed.data);
        const claimed = await store.beginOperation({
          scope_key: `visit:${visit.id}`,
          operation: "visit.turn",
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          visit_id: visit.id,
        });
        if (claimed.kind === "conflict" || claimed.kind === "in_progress") {
          return operationConflict(claimed.kind);
        }
        if (claimed.kind === "replay") {
          const start = claimed.operation.event_start_seq;
          const end = claimed.operation.event_end_seq;
          if (start == null || end == null) {
            const replay = claimed.operation.response;
            return replay
              ? json(replay, Number(replay.http_status ?? 409), {
                  "x-mnemos-runtime-replay": "true",
                })
              : errorJson("replay_unavailable", 409);
          }
          const events = await store.listEvents(visit.id, {
            after: Math.max(0, start - 1),
            through: end,
            limit: 500,
            audience: "visitor",
          });
          return ndjsonEvents(events, true);
        }

        return streamTurn({
          request,
          store,
          visit,
          body: {
            ...parsed.data,
            visitor_id: visitorId,
            visit_id: visit.id,
            resident_id: visit.resident_id,
            surface,
            location,
          },
          operation: claimed.operation,
          idempotencyKey,
        });
      },
    },
  },
});
