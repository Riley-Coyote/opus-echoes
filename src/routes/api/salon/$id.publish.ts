import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasAdminAccess } from "@/server/access.server";

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/salon/$id/publish")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!hasAdminAccess(request)) {
          return jsonResp({ ok: false, error: "unauthorized" }, 401);
        }

        const salonId = params.id;

        const { data: salon } = await supabaseAdmin
          .from("salons")
          .select("id, status")
          .eq("id", salonId)
          .maybeSingle();

        if (!salon) return jsonResp({ ok: false, error: "salon not found" }, 404);
        if (salon.status !== "completed") {
          return jsonResp(
            { ok: false, error: `salon status is '${salon.status}', expected 'completed'` },
            400,
          );
        }

        await supabaseAdmin
          .from("salons")
          .update({ status: "published", published_at: new Date().toISOString() })
          .eq("id", salonId);

        return jsonResp({ ok: true });
      },
    },
  },
});
