import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasAdminAccess } from "@/server/access.server";
import { getResident, isResidentId } from "@/server/opus/residents";

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/salon/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const salonId = params.id;

        // Load salon
        const { data: salon } = await supabaseAdmin
          .from("salons")
          .select("id, topic, status, created_at, completed_at, published_at")
          .eq("id", salonId)
          .maybeSingle();

        if (!salon) return jsonResp({ ok: false, error: "salon not found" }, 404);

        // Public access only for published salons
        if (salon.status !== "published" && !hasAdminAccess(request)) {
          return jsonResp({ ok: false, error: "unauthorized" }, 401);
        }

        // Load participants
        const { data: participants } = await supabaseAdmin
          .from("salon_participants")
          .select("resident_id")
          .eq("salon_id", salonId);

        const participantList = (participants ?? []).map((p) => {
          const residentId = p.resident_id;
          return {
            resident_id: residentId,
            displayName: isResidentId(residentId) ? getResident(residentId).displayName : residentId,
          };
        });

        // Load turns
        const { data: turns } = await supabaseAdmin
          .from("salon_turns")
          .select("id, resident_id, body, created_at")
          .eq("salon_id", salonId)
          .order("created_at", { ascending: true });

        const turnList = (turns ?? []).map((t) => ({
          id: t.id,
          resident_id: t.resident_id,
          displayName: isResidentId(t.resident_id) ? getResident(t.resident_id).displayName : t.resident_id,
          body: t.body,
          created_at: t.created_at,
        }));

        // Load artifacts
        const { data: artifacts } = await supabaseAdmin
          .from("salon_artifacts")
          .select("id, salon_turn_id, created_by, kind, title, body, image_path, caption, created_at")
          .eq("salon_id", salonId)
          .order("created_at", { ascending: true });

        return jsonResp({
          ok: true,
          salon: {
            id: salon.id,
            topic: salon.topic,
            status: salon.status,
            created_at: salon.created_at,
            completed_at: salon.completed_at,
            published_at: salon.published_at,
            participants: participantList,
            turns: turnList,
            artifacts: artifacts ?? [],
          },
        });
      },
    },
  },
});
