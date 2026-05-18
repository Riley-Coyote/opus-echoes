/**
 * POST /api/group/$id/set-down — withdraw a resident from the round,
 * or close the whole room.
 *
 * Body: { visitor_token, resident_id? }
 *   - resident_id present: that resident withdraws, room continues.
 *   - resident_id omitted: whole room closes.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isResidentId } from "@/server/opus/residents";

const Body = z.object({
  visitor_token: z.string().trim().min(8).max(64),
  resident_id: z.string().trim().min(1).max(64).optional(),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/group/$id/set-down")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const threadId = params.id;
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        const { data: thread } = await supabaseAdmin
          .from("group_threads")
          .select("id, visitor_token, status")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return jsonResp({ ok: false, code: "not_found" }, 404);
        if (thread.visitor_token !== body.visitor_token) {
          return jsonResp({ ok: false, code: "unauthorized" }, 401);
        }

        if (body.resident_id) {
          if (!isResidentId(body.resident_id)) {
            return jsonResp({ ok: false, code: "bad_request" }, 400);
          }
          const { error } = await supabaseAdmin
            .from("group_thread_participants")
            .update({ status: "withdrawn", withdrew_at: new Date().toISOString() })
            .eq("thread_id", threadId)
            .eq("resident_id", body.resident_id);
          if (error) {
            console.error("[group/set-down] withdraw:", error);
            return jsonResp({ ok: false, code: "server_error" }, 500);
          }
          return jsonResp({ ok: true, withdrew: body.resident_id });
        }

        const nowIso = new Date().toISOString();
        const { error } = await supabaseAdmin
          .from("group_threads")
          .update({ status: "closed", closed_at: nowIso })
          .eq("id", threadId);
        if (error) {
          console.error("[group/set-down] close thread:", error);
          return jsonResp({ ok: false, code: "server_error" }, 500);
        }
        // Mark everyone still attending as withdrawn so the participant
        // list is consistent.
        await supabaseAdmin
          .from("group_thread_participants")
          .update({ status: "withdrawn", withdrew_at: nowIso })
          .eq("thread_id", threadId)
          .eq("status", "attending");
        return jsonResp({ ok: true, closed: true });
      },
    },
  },
});
