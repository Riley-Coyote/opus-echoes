import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  isModelVisibleAttachmentMediaType,
  MAX_ATTACHMENT_BYTES,
} from "@/server/runtime/attachment-policy";
import { errorJson, json } from "@/server/runtime/http";
import { runtimeStore } from "@/server/runtime/store.server";
import {
  isVisitVisitorAuthorized,
  MNEMOS_VISITOR_ID_HEADER,
} from "@/server/runtime/visitor-auth.server";

const InitBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    size: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
    type: z.string().trim().min(1).max(120),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    label: z.string().trim().max(120).optional(),
  })
  .strict();

export const Route = createFileRoute("/api/visit/$id/attachments/init")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!z.string().uuid().safeParse(params.id).success) return errorJson("bad_visit_id", 400);
        const store = runtimeStore();
        const visit = await store.getVisit(params.id).catch(() => null);
        if (!visit) return errorJson("visit_not_found", 404);
        if (!isVisitVisitorAuthorized(request, visit)) {
          return errorJson("visitor_access_denied", 403);
        }
        if (visit.closed_at) return errorJson("visit_closed", 410);

        const parsed = InitBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return errorJson("bad_request", 400);
        const mediaType = parsed.data.type.toLowerCase();
        if (!isModelVisibleAttachmentMediaType(mediaType)) {
          return errorJson("unsupported_file_type", 415);
        }

        const pending = await store.findPendingAttachment(visit.id, {
          filename: parsed.data.name,
          media_type: mediaType,
          byte_size: parsed.data.size,
          sha256: parsed.data.sha256,
          label: parsed.data.label ?? null,
        });
        const attachmentId = pending?.id ?? crypto.randomUUID();
        const query = new URLSearchParams({
          filename: parsed.data.name,
          media_type: mediaType,
          byte_size: String(parsed.data.size),
        });
        if (parsed.data.label) query.set("label", parsed.data.label);
        const base = `/api/visit/${visit.id}/attachments/${attachmentId}`;
        return json({
          ok: true,
          visit_id: visit.id,
          session_id: visit.id,
          attachment_id: attachmentId,
          sha256: parsed.data.sha256,
          resumed: Boolean(pending),
          upload_url: `${base}?${query.toString()}`,
          finalize_url: `/api/visit/${visit.id}/attachments/finalize`,
          headers: {
            "content-type": mediaType,
            ...(visit.visitor_id ? { [MNEMOS_VISITOR_ID_HEADER]: visit.visitor_id } : {}),
          },
        });
      },
    },
  },
});
