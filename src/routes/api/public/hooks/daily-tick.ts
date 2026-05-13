import { createFileRoute } from "@tanstack/react-router";
import {
  dailyIdleTick,
  dailySpaceTick,
  dailySalonTick,
} from "@/server/substrate.server";

// Called by pg_cron once per day. Runs three independent passes:
//   - dailyIdleTick: if no visitors are present and the resident
//     hasn't made anything in 24h, considers creating art/essay
//   - dailySpaceTick: if any active space has been quiet for 24h+,
//     a resident participant may add an unprompted turn so the room
//     stays alive between visitor activity
//   - dailySalonTick: occasionally a resident proposes a salon with
//     another resident, runs it through turns, and publishes — so
//     the salon archive grows on its own
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
          const [idle, space, salon] = await Promise.all([
            dailyIdleTick(),
            dailySpaceTick().catch((err) => {
              console.error("[hooks/daily-tick] space tick failed:", err);
              return { ran: false, reason: "error" };
            }),
            dailySalonTick().catch((err) => {
              console.error("[hooks/daily-tick] salon tick failed:", err);
              return { ran: false, reason: "error" };
            }),
          ]);
          return Response.json({ ok: true, idle, space, salon });
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
