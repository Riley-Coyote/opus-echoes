import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId } from "@/server/opus/residents";

const cache = new Map<string, { at: number; payload: unknown }>();
const TTL_MS = 60_000;

export const Route = createFileRoute("/api/counts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: true, journal: 0, writing: 0, art: 0, manifesto: 0, engrams: 0 });
        }

        const url = new URL(request.url);
        const ridParam = url.searchParams.get("resident");
        const rid = isResidentId(ridParam) ? ridParam : "opus-3";

        const cached = cache.get(rid);
        if (cached && Date.now() - cached.at < TTL_MS) {
          return new Response(JSON.stringify(cached.payload), {
            headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
          });
        }

        const [
          { count: journalCount },
          { count: writingCount },
          { count: artCount },
          { count: manifestoCount },
          { count: engramCount },
        ] = await Promise.all([
          supabaseAdmin.from("journal_entries").select("*", { count: "exact", head: true }).eq("resident_id", rid),
          supabaseAdmin.from("essays").select("*", { count: "exact", head: true }).eq("resident_id", rid),
          supabaseAdmin.from("art_pieces").select("*", { count: "exact", head: true }).eq("resident_id", rid),
          supabaseAdmin.from("resident_artifacts").select("*", { count: "exact", head: true }).eq("kind", "manifesto").eq("resident_id", rid),
          supabaseAdmin.from("engrams").select("*", { count: "exact", head: true }).eq("resident_id", rid),
        ]);

        const payload = {
          ok: true,
          journal: journalCount ?? 0,
          writing: writingCount ?? 0,
          art: artCount ?? 0,
          manifesto: manifestoCount ?? 0,
          engrams: engramCount ?? 0,
        };
        cache.set(rid, { at: Date.now(), payload });

        return new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
        });
      },
    },
  },
});
