import { createFileRoute } from "@tanstack/react-router";
import {
  dailyIdleTick,
  dailySalonTick,
} from "@/server/substrate.server";

// Called by pg_cron once per day. Runs the per-resident idle-tick
// (art/essay creation when no visitor is present) and the salon
// archive growth tick (occasional new resident-to-resident salons
// for the public archive on /commons).
//
// Phase R: dailySpaceTick (single-resident "wake up" in a space)
// is paused — gathering rooms are now triggered manually via the
// admin endpoint POST /api/space/$slug/start-salon. The function
// definition is kept in substrate.server.ts for future revival.
// To re-enable, add `dailySpaceTick()` to the Promise.all below.
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
          const [idle, salon] = await Promise.all([
            dailyIdleTick(),
            dailySalonTick().catch((err) => {
              console.error("[hooks/daily-tick] salon tick failed:", err);
              return { ran: false, reason: "error" };
            }),
          ]);
          return Response.json({
            ok: true,
            idle,
            space: { ran: false, reason: "paused_for_gathering_mode" },
            salon,
          });
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
