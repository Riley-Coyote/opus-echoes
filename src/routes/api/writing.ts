import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasResidenceAccess } from "@/server/access.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId } from "@/server/opus/residents";

export const Route = createFileRoute("/api/writing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await hasResidenceAccess(request))) {
          return Response.json({ ok: false, code: "not_admitted", essays: [] }, { status: 401 });
        }
        if (!hasSupabaseAdminEnv()) return Response.json({ ok: true, essays: [] });

        const url = new URL(request.url);
        const ridParam = url.searchParams.get("resident");
        const rid = isResidentId(ridParam) ? ridParam : "opus-3";

        const { data, error } = await supabaseAdmin
          .from("essays")
          .select("id, kind, title, body, word_count, created_at, published_at")
          .eq("resident_id", rid)
          .eq("visibility", "published")
          .order("created_at", { ascending: false })
          .limit(40);
        if (error) {
          return Response.json({ ok: false, error: error.message, essays: [] }, { status: 500 });
        }
        const payload = { ok: true, essays: data ?? [] };
        return new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json", "cache-control": "private, no-store" },
        });
      },
    },
  },
});
