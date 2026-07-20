import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { errorJson, json } from "@/server/runtime/http";
import { isModelVisibleAttachmentMediaType } from "@/server/runtime/attachment-policy";
import { runtimeStore } from "@/server/runtime/store.server";
import { isVisitVisitorAuthorized } from "@/server/runtime/visitor-auth.server";

const FinalizeBodySchema = z.object({ attachment_id: z.string().uuid() }).strict();

export const Route = createFileRoute("/api/visit/$id/attachments/finalize")({
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
        const parsed = FinalizeBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return errorJson("bad_request", 400);
        const attachment = await store.getAttachment(visit.id, parsed.data.attachment_id);
        if (!attachment) return errorJson("attachment_not_uploaded", 409);
        return json({
          ok: true,
          visit_id: visit.id,
          session_id: visit.id,
          attachment: {
            ...attachment,
            content_url: `/api/visit/${visit.id}/attachments/${attachment.id}`,
            model_visible:
              store.backend === "supabase" &&
              isModelVisibleAttachmentMediaType(attachment.media_type),
          },
        });
      },
    },
  },
});
