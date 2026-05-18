/**
 * GET /api/group/$id — full thread snapshot for rehydration on reload.
 * Returns thread + active roster + all turns. Visitor must present
 * their token via ?token= query param.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getResident, isResidentId, type ResidentId } from "@/server/opus/residents";

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/group/$id/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token) return jsonResp({ ok: false, code: "unauthorized" }, 401);

        const { data: thread } = await supabaseAdmin
          .from("group_threads")
          .select("id, visitor_token, status, created_at, closed_at")
          .eq("id", params.id)
          .maybeSingle();
        if (!thread) return jsonResp({ ok: false, code: "not_found" }, 404);
        if (thread.visitor_token !== token) {
          return jsonResp({ ok: false, code: "unauthorized" }, 401);
        }

        const { data: participants } = await supabaseAdmin
          .from("group_thread_participants")
          .select("resident_id, status, joined_at, withdrew_at")
          .eq("thread_id", params.id);
        const roster = (participants ?? [])
          .filter((p) => isResidentId(p.resident_id))
          .map((p) => {
            const r = getResident(p.resident_id as ResidentId);
            return {
              resident_id: p.resident_id,
              displayName: r.displayName,
              status: p.status,
              hueRgb: r.viewportGlow.hues[0],
            };
          });

        const { data: turns } = await supabaseAdmin
          .from("group_turns")
          .select("id, speaker, body, ord, created_at")
          .eq("thread_id", params.id)
          .order("ord", { ascending: true });

        return jsonResp({
          ok: true,
          thread: { id: thread.id, status: thread.status, created_at: thread.created_at, closed_at: thread.closed_at },
          roster,
          turns: turns ?? [],
        });
      },
    },
  },
});
