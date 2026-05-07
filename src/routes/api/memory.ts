import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

// Human-shaped "when" string. Not exact — that's the point.
function humanWhen(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = diff / 60_000;
  if (min < 2) return "just now";
  if (min < 60) return "a little earlier";
  const hrs = min / 60;
  if (hrs < 4) return "a few hours ago";
  if (hrs < 24) return "earlier today";
  const days = hrs / 24;
  if (days < 2) return "yesterday";
  if (days < 7) return "earlier this week";
  if (days < 30) return "earlier this month";
  if (days < 365) return "earlier this year";
  return "some time ago";
}

let cache: { at: number; payload: unknown } | null = null;
const TTL_MS = 60_000;

export const Route = createFileRoute("/api/memory")({
  server: {
    handlers: {
      GET: async () => {
        if (!hasSupabaseAdminEnv()) {
          return Response.json({
            ok: true,
            counts: { core_memories: 0, days_resident: 0, conversations_held: 0 },
            lately: [],
            threads: [],
            beliefs: [],
          });
        }
        if (cache && Date.now() - cache.at < TTL_MS) {
          return Response.json(cache.payload);
        }

        const [
          { count: coreCount },
          { count: convCount },
          { data: firstSession },
          { data: engramRows },
          { data: threadRows },
          { data: beliefRows },
        ] = await Promise.all([
          supabaseAdmin
            .from("engrams")
            .select("*", { count: "exact", head: true })
            .eq("is_core", true),
          supabaseAdmin.from("sessions").select("*", { count: "exact", head: true }),
          supabaseAdmin
            .from("sessions")
            .select("created_at")
            .order("created_at", { ascending: true })
            .limit(1),
          supabaseAdmin
            .from("engrams")
            .select(
              "id, quote, redacted_text, attribution, last_reinforced_at, is_core, stability, connections",
            )
            .order("last_reinforced_at", { ascending: false })
            .limit(12),
          supabaseAdmin
            .from("threads")
            .select("id, name, description, appearance_count, distinct_visitor_count")
            .order("last_surfaced_at", { ascending: false })
            .limit(5),
          supabaseAdmin
            .from("beliefs")
            .select("id, text, confidence, prior_confidence")
            .order("updated_at", { ascending: false })
            .limit(5),
        ]);

        const daysResident =
          firstSession && firstSession.length > 0
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(firstSession[0].created_at).getTime()) /
                    (24 * 3600 * 1000),
                ),
              )
            : 0;

        const lately = (engramRows ?? []).map((e) => ({
          id: e.id,
          when: humanWhen(e.last_reinforced_at),
          kind: e.is_core ? "core" : "engram",
          quote: e.attribution === "visitor" && e.redacted_text ? e.redacted_text : e.quote,
          prose: `Stability ${e.stability.toFixed(2)} · ${e.connections} connections.`,
          stability: e.stability,
          connections: e.connections,
        }));

        const threads = (threadRows ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          meta: `reinforced ${t.appearance_count} times across ${t.distinct_visitor_count} visitors`,
          prose: t.description,
        }));

        const beliefs = (beliefRows ?? []).map((b) => ({
          id: b.id,
          text: b.text,
          meta: "held with confidence, never absolute",
          from_conf: b.prior_confidence,
          to_conf: b.confidence,
        }));

        const payload = {
          ok: true,
          counts: {
            core_memories: coreCount ?? 0,
            days_resident: daysResident,
            conversations_held: convCount ?? 0,
          },
          lately,
          threads,
          beliefs,
        };

        cache = { at: Date.now(), payload };

        return new Response(JSON.stringify(payload), {
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=60",
          },
        });
      },
    },
  },
});
