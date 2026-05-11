import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isResidentId } from "@/server/opus/residents";

const cache = new Map<string, { at: number; payload: unknown }>();
const TTL_MS = 60_000;

export const Route = createFileRoute("/api/writing")({
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
          .from("essays")
          .select("id, kind, title, body, word_count, created_at")
          .eq("resident_id", rid)
          .order("created_at", { ascending: false })
          .limit(40);
        if (error) {
          return Response.json({ ok: false, error: error.message, essays: [] }, { status: 500 });
        }
        const payload = { ok: true, essays: data ?? [] };
        cache.set(rid, { at: Date.now(), payload });
        return new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
        });
      },
    },
  },
});
