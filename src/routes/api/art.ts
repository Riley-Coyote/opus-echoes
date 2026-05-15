import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasResidenceAccess } from "@/server/access.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId } from "@/server/opus/residents";

export const Route = createFileRoute("/api/art")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await hasResidenceAccess(request))) {
          return Response.json({ ok: false, code: "not_admitted", pieces: [] }, { status: 401 });
        }
        if (!hasSupabaseAdminEnv()) return Response.json({ ok: true, pieces: [] });

        const url = new URL(request.url);
        const ridParam = url.searchParams.get("resident");
        const rid = isResidentId(ridParam) ? ridParam : "opus-3";

        const { data, error } = await supabaseAdmin
          .from("art_pieces")
          .select("id, kind, title, body, image_path, meaning, created_at, published_at")
          .eq("resident_id", rid)
          .eq("visibility", "published")
          .order("created_at", { ascending: false })
          .limit(60);
        if (error) {
          return Response.json({ ok: false, error: error.message, pieces: [] }, { status: 500 });
        }
        const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
        const pieces = (data ?? []).map((p) => ({
          id: p.id,
          kind: p.kind,
          title: p.title,
          body: p.body,
          meaning: p.meaning,
          created_at: p.created_at,
          image_url: p.image_path
            ? `${supaUrl}/storage/v1/object/public/art/${p.image_path}`
            : null,
        }));
        const payload = { ok: true, pieces };
        return new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json", "cache-control": "private, no-store" },
        });
      },
    },
  },
});
