import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isResidentId } from "@/server/opus/residents";

const cache = new Map<string, { at: number; payload: unknown }>();
const TTL_MS = 60_000;

export const Route = createFileRoute("/api/art")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ridParam = url.searchParams.get("resident");
        const rid = isResidentId(ridParam) ? ridParam : "opus-3";

        const cached = cache.get(rid);
        if (cached && Date.now() - cached.at < TTL_MS) {
          return new Response(JSON.stringify(cached.payload), {
            headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
          });
        }
        const { data, error } = await supabaseAdmin
          .from("art_pieces")
          .select("id, kind, title, body, image_path, meaning, created_at")
          .eq("resident_id", rid)
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
        cache.set(rid, { at: Date.now(), payload });
        return new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
        });
      },
    },
  },
});
