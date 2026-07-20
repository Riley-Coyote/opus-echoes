import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  attachmentBytesMatchMediaType,
  isModelVisibleAttachmentMediaType,
  MAX_ATTACHMENT_BYTES,
  readRequestBodyWithLimit,
} from "@/server/runtime/attachment-policy";
import { sha256Bytes, sha256Hex } from "@/server/runtime/hash";
import { errorJson, json, operationConflict } from "@/server/runtime/http";
import { parseIdempotencyKey } from "@/server/runtime/schema";
import {
  AttachmentBusyError,
  AttachmentGoneError,
  AttachmentLeaseLostError,
  AttachmentQuotaError,
  runtimeStore,
} from "@/server/runtime/store.server";
import { isVisitVisitorAuthorized } from "@/server/runtime/visitor-auth.server";

function safeDispositionName(filename: string): string {
  return filename.replace(/["\\\r\n]/g, "_").slice(0, 160) || "attachment";
}

export const Route = createFileRoute("/api/visit/$id/attachments/$attachmentId")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const routeParams = params as typeof params & { attachmentId: string };
        if (
          !z.string().uuid().safeParse(params.id).success ||
          !z.string().uuid().safeParse(routeParams.attachmentId).success
        ) {
          return errorJson("bad_request", 400);
        }
        const store = runtimeStore();
        const visit = await store.getVisit(params.id).catch(() => null);
        if (!visit) return errorJson("visit_not_found", 404);
        if (!isVisitVisitorAuthorized(request, visit)) {
          return errorJson("visitor_access_denied", 403);
        }
        if (visit.closed_at) return errorJson("visit_closed", 410);

        const url = new URL(request.url);
        const metadata = z
          .object({
            filename: z.string().trim().min(1).max(160),
            media_type: z.string().trim().min(1).max(120),
            byte_size: z.coerce.number().int().positive().max(MAX_ATTACHMENT_BYTES),
            label: z.string().trim().max(120).nullable(),
          })
          .strict()
          .safeParse({
            filename: url.searchParams.get("filename"),
            media_type: url.searchParams.get("media_type")?.toLowerCase(),
            byte_size: url.searchParams.get("byte_size"),
            label: url.searchParams.get("label"),
          });
        if (!metadata.success) return errorJson("bad_upload_metadata", 400);
        if (!isModelVisibleAttachmentMediaType(metadata.data.media_type)) {
          return errorJson("unsupported_file_type", 415);
        }
        const bytes = await readRequestBodyWithLimit(request, MAX_ATTACHMENT_BYTES);
        if (!bytes) return errorJson("file_too_large", 413);
        if (bytes.byteLength !== metadata.data.byte_size) {
          return errorJson("attachment_size_mismatch", 400);
        }
        if (!attachmentBytesMatchMediaType(metadata.data.media_type, bytes)) {
          return errorJson("attachment_content_mismatch", 415);
        }
        const digest = await sha256Bytes(bytes);
        const requestHash = await sha256Hex({
          attachment_id: routeParams.attachmentId,
          ...metadata.data,
          digest,
        });
        const idempotencyKey = parseIdempotencyKey(
          request,
          `attachment-upload:${routeParams.attachmentId}`,
        );
        if (!idempotencyKey) return errorJson("idempotency_key_required", 400);
        const claimed = await store.beginOperation({
          scope_key: `visit:${visit.id}`,
          operation: "attachment.upload",
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          visit_id: visit.id,
        });
        if (claimed.kind === "conflict" || claimed.kind === "in_progress") {
          return operationConflict(claimed.kind);
        }
        if (claimed.kind === "replay") {
          const response = claimed.operation.response ?? { ok: true };
          return json(response, Number(response.http_status ?? 200), {
            "x-mnemos-runtime-replay": "true",
          });
        }

        try {
          const attachment = await store.saveAttachment({
            id: routeParams.attachmentId,
            visit_id: visit.id,
            resident_id: visit.resident_id,
            filename: metadata.data.filename,
            media_type: metadata.data.media_type,
            bytes,
            sha256: digest,
            write_token: claimed.operation.lease_token,
            label: metadata.data.label,
          });
          const event = await store.appendEvent(visit.id, {
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
                store.backend === "supabase" &&
                isModelVisibleAttachmentMediaType(attachment.media_type),
            },
            idempotency_key: `attachment:${attachment.id}:ready`,
          });
          const response = {
            ok: true,
            visit_id: visit.id,
            session_id: visit.id,
            attachment_id: attachment.id,
            event_cursor: event.seq,
            last_seq: event.seq,
          };
          await store.completeOperation(claimed.operation, {
            response,
            visit_id: visit.id,
            event_start_seq: event.seq,
            event_end_seq: event.seq,
          });
          return json(response, 201);
        } catch (error) {
          if (error instanceof AttachmentQuotaError) {
            const response = {
              ok: false,
              code: "attachment_quota_exceeded",
              visit_id: visit.id,
              http_status: 413,
            };
            await store
              .completeOperation(claimed.operation, { response, visit_id: visit.id })
              .catch(() => undefined);
            return json(response, 413);
          }
          if (error instanceof AttachmentBusyError || error instanceof AttachmentLeaseLostError) {
            const response = {
              ok: false,
              code:
                error instanceof AttachmentBusyError ? error.code : "attachment_upload_superseded",
              visit_id: visit.id,
              http_status: 409,
            };
            await store.releaseOperation(claimed.operation).catch(() => undefined);
            return json(response, 409, { "retry-after": "1" });
          }
          if (error instanceof AttachmentGoneError) {
            const response = {
              ok: false,
              code: "attachment_deleted",
              visit_id: visit.id,
              http_status: 410,
            };
            await store
              .completeOperation(claimed.operation, { response, visit_id: visit.id })
              .catch(() => undefined);
            return json(response, 410);
          }
          console.error("[runtime] attachment upload failed", error);
          const response = {
            ok: false,
            code: "attachment_upload_failed",
            visit_id: visit.id,
            http_status: 500,
          };
          await store.releaseOperation(claimed.operation).catch(() => undefined);
          return json(response, 500, { "retry-after": "1" });
        }
      },

      GET: async ({ request, params }) => {
        const routeParams = params as typeof params & { attachmentId: string };
        if (
          !z.string().uuid().safeParse(params.id).success ||
          !z.string().uuid().safeParse(routeParams.attachmentId).success
        ) {
          return errorJson("bad_request", 400);
        }
        const store = runtimeStore();
        const visit = await store.getVisit(params.id).catch(() => null);
        if (!visit) return errorJson("visit_not_found", 404);
        if (!isVisitVisitorAuthorized(request, visit)) {
          return errorJson("visitor_access_denied", 403);
        }
        const download = await store.downloadAttachment(visit.id, routeParams.attachmentId);
        if (!download) return errorJson("attachment_not_found", 404);
        return new Response(download.bytes.buffer as ArrayBuffer, {
          headers: {
            "content-type": download.metadata.media_type,
            "content-length": String(download.metadata.byte_size),
            "content-disposition": `inline; filename="${safeDispositionName(download.metadata.filename)}"`,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "content-security-policy": "sandbox; default-src 'none'",
          },
        });
      },

      DELETE: async ({ request, params }) => {
        const routeParams = params as typeof params & { attachmentId: string };
        if (
          !z.string().uuid().safeParse(params.id).success ||
          !z.string().uuid().safeParse(routeParams.attachmentId).success
        ) {
          return errorJson("bad_request", 400);
        }
        const idempotencyKey = parseIdempotencyKey(
          request,
          `attachment-remove:${routeParams.attachmentId}`,
        );
        if (!idempotencyKey) return errorJson("idempotency_key_required", 400);
        const store = runtimeStore();
        const visit = await store.getVisit(params.id).catch(() => null);
        if (!visit) return errorJson("visit_not_found", 404);
        if (!isVisitVisitorAuthorized(request, visit)) {
          return errorJson("visitor_access_denied", 403);
        }
        const requestHash = await sha256Hex({
          attachment_id: routeParams.attachmentId,
          action: "remove",
        });
        const claimed = await store.beginOperation({
          scope_key: `visit:${visit.id}`,
          operation: "attachment.remove",
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          visit_id: visit.id,
        });
        if (claimed.kind === "conflict" || claimed.kind === "in_progress") {
          return operationConflict(claimed.kind);
        }
        if (claimed.kind === "replay") {
          const response = claimed.operation.response ?? { ok: true };
          return json(response, Number(response.http_status ?? 200), {
            "x-mnemos-runtime-replay": "true",
          });
        }

        try {
          const removed = await store.removeAttachment(
            visit.id,
            routeParams.attachmentId,
            claimed.operation.lease_token,
          );
          if (!removed) {
            const response = { ok: true, visit_id: visit.id, already_removed: true };
            await store.completeOperation(claimed.operation, { response, visit_id: visit.id });
            return json(response);
          }
          const event = await store.appendEvent(visit.id, {
            type: "attachment.removed",
            phase: "pre_turn",
            resident_id: visit.resident_id,
            visitor_id: visit.visitor_id,
            surface: visit.surface,
            location: visit.location,
            source_runtime: "opus-supabase",
            visibility: "visitor",
            epistemic_status: "observed",
            payload: { attachment_id: removed.id, sha256: removed.sha256 },
            idempotency_key: `attachment:${removed.id}:removed`,
          });
          const response = {
            ok: true,
            visit_id: visit.id,
            session_id: visit.id,
            attachment_id: removed.id,
            event_cursor: event.seq,
            last_seq: event.seq,
          };
          await store.completeOperation(claimed.operation, {
            response,
            visit_id: visit.id,
            event_start_seq: event.seq,
            event_end_seq: event.seq,
          });
          return json(response);
        } catch (error) {
          const stateConflict =
            error instanceof AttachmentBusyError || error instanceof AttachmentLeaseLostError;
          const response = {
            ok: false,
            code:
              error instanceof AttachmentBusyError
                ? error.code
                : error instanceof AttachmentLeaseLostError
                  ? "attachment_delete_superseded"
                  : "attachment_remove_failed",
            visit_id: visit.id,
            http_status: stateConflict ? 409 : 500,
          };
          if (!stateConflict) console.error("[runtime] attachment removal failed", error);
          await store.releaseOperation(claimed.operation).catch(() => undefined);
          return json(response, response.http_status, { "retry-after": "1" });
        }
      },
    },
  },
});
