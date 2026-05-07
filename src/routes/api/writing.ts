import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let cache: { at: number; payload: unknown } | null = null;
const TTL_MS = 60_000;

export const Route = createFileRoute("/api/writing")({
  server: {
    handlers: {
      GET: async () => {
        if (cache && Date.now() - cache.at < TTL_MS) {
          return new Response(JSON.stringify(cache.payload), {
            headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
          });
        }
        const { data, error } = await supabaseAdmin
          .from("essays")
          .select("id, kind, title, body, word_count, created_at")
          .order("created_at", { ascending: false })
          .limit(40);
        if (error) {
          return Response.json({ ok: false, error: error.message, essays: [] }, { status: 500 });
        }
        const payload = { ok: true, essays: data ?? [] };
        cache = { at: Date.now(), payload };
        return new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
        });
      },
    },
  },
});
