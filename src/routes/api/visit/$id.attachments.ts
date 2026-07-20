import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { errorJson, json } from "@/server/runtime/http";
import { isModelVisibleAttachmentMediaType } from "@/server/runtime/attachment-policy";
import { runtimeStore } from "@/server/runtime/store.server";
import { isVisitVisitorAuthorized } from "@/server/runtime/visitor-auth.server";

/**
 * Attachment collection reads only. Uploads use the bounded staged flow:
 * `POST .../init`, bounded `PUT .../:attachmentId`, then `POST .../finalize`.
 * Multipart parsing is deliberately absent because `Request.formData()` may
 * buffer an untrusted body before application size limits can run.
 */
export const Route = createFileRoute("/api/visit/$id/attachments")({
  server: {
    handlers: {
      POST: async ({ params }) =>
        json(
          {
            ok: false,
            code: "staged_upload_required",
            detail: "Initialize a bounded upload, PUT its bytes, then finalize it.",
            init_endpoint: `/api/visit/${params.id}/attachments/init`,
          },
          405,
          { allow: "GET" },
        ),
      GET: async ({ request, params }) => {
        if (!z.string().uuid().safeParse(params.id).success) return errorJson("bad_visit_id", 400);
        const store = runtimeStore();
        const visit = await store.getVisit(params.id).catch(() => null);
        if (!visit) return errorJson("visit_not_found", 404);
        if (!isVisitVisitorAuthorized(request, visit)) {
          return errorJson("visitor_access_denied", 403);
        }
        const attachments = await store.listAttachments(visit.id);
        return json({
          ok: true,
          visit_id: visit.id,
          attachments: attachments.map((attachment) => ({
            ...attachment,
            content_url: `/api/visit/${visit.id}/attachments/${attachment.id}`,
            model_visible:
              store.backend === "supabase" &&
              isModelVisibleAttachmentMediaType(attachment.media_type),
          })),
        });
      },
    },
  },
});
