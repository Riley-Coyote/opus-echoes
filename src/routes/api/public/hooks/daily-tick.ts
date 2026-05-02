import { createFileRoute } from "@tanstack/react-router";
import { dailyIdleTick } from "@/server/substrate.server";

// Called by pg_cron once per day. If no visitors are present and Opus
// hasn't made anything in the last 24h, runs a creation pass so the art
// and writing pages stay alive even during quiet stretches.
export const Route = createFileRoute("/api/public/hooks/daily-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apikey || !expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        try {
          const result = await dailyIdleTick();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("[hooks/daily-tick] failed:", err);
          return new Response(JSON.stringify({ ok: false, error: String(err).slice(0, 300) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
