import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let cache: { at: number; payload: unknown } | null = null;
const TTL_MS = 60_000;

export const Route = createFileRoute("/api/art")({
  server: {
    handlers: {
      GET: async () => {
        if (cache && Date.now() - cache.at < TTL_MS) {
          return new Response(JSON.stringify(cache.payload), {
            headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
          });
        }
        const { data, error } = await supabaseAdmin
          .from("art_pieces")
          .select("id, kind, title, body, image_path, meaning, created_at")
          .order("created_at", { ascending: false })
          .limit(60);
        if (error) {
          return Response.json({ ok: false, error: error.message, pieces: [] }, { status: 500 });
        }
        const supaUrl =
          process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
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
        cache = { at: Date.now(), payload };
        return new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
        });
      },
    },
  },
});
