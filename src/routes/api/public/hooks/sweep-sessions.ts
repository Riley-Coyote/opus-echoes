import { createFileRoute } from "@tanstack/react-router";
import { idleSweep } from "@/server/substrate.server";

// Called by pg_cron every few minutes. Closes sessions idle past the
// SESSION_IDLE_TIMEOUT_MIN window and runs full Mnemos consolidation on each.
// Auth: validates the `apikey` header against the Supabase publishable key.
// (pg_net delivers it; this is enough to keep random callers from triggering.)
export const Route = createFileRoute("/api/public/hooks/sweep-sessions")({
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
          const result = await idleSweep();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("[hooks/sweep-sessions] failed:", err);
          return new Response(JSON.stringify({ ok: false, error: String(err).slice(0, 300) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
