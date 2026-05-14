/**
 * POST /api/public/hooks/gathering-tick — pg_cron entry point.
 *
 * Triggers the scheduled salon in "the-gathering" space three times
 * a day (morning / afternoon / evening UTC — schedule lives in the
 * pg_cron migration, not in code). Fire-and-forget: this endpoint
 * starts the salon in the background and returns 200 immediately
 * so cron doesn't hold a connection open for the full run.
 *
 * Auth: same shape as /api/public/hooks/daily-tick. pg_cron sends
 * the project anon key in the `apikey` header.
 *
 * Behavior:
 *   - Looks up "the-gathering" space by slug.
 *   - If a salon is already running there (current_salon_started_at
 *     within the last 30 min), returns 200 with reason="already_running"
 *     instead of starting another — protects against overlapping
 *     cron firings if a salon ran long.
 *   - Otherwise calls runSpaceSalon with the daily-cadence caps
 *     (10 turns, 1 image) and consumePendingTopic=true so any
 *     queued topic from /api/space/$slug/queue-topic is consumed.
 *
 * Sized smaller than admin-triggered runs (max 30 turns / 5 images)
 * because three of these run per day. ~$2.50/day total.
 */

import { createFileRoute } from "@tanstack/react-router";
import { runSpaceSalon } from "@/server/substrate.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

const GATHERING_SLUG = "the-gathering";
const MAX_TURNS_PER_TICK = 10;
const MAX_IMAGES_PER_TICK = 1;

export const Route = createFileRoute("/api/public/hooks/gathering-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          "";
        if (!apikey || !expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        if (!hasSupabaseAdminEnv()) {
          return Response.json(
            { ok: false, error: "config_missing_supabase" },
            { status: 503 },
          );
        }

        // Look up the gathering space by slug — fail loudly if the
        // migration hasn't seeded it.
        const sbAny = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };
        const { data: space, error: lookupErr } = await sbAny
          .from("spaces")
          .select("id, current_salon_started_at")
          .eq("slug", GATHERING_SLUG)
          .maybeSingle();
        if (lookupErr) {
          console.error("[gathering-tick] space lookup failed:", lookupErr);
          return Response.json(
            { ok: false, error: "lookup_failed" },
            { status: 500 },
          );
        }
        if (!space) {
          return Response.json(
            {
              ok: false,
              error: "gathering_space_missing",
              hint: "Run the 20260514000000_gathering_cadence.sql migration in prod.",
            },
            { status: 404 },
          );
        }
        const row = space as { id: string; current_salon_started_at: string | null };

        // Cheap pre-check so we don't even start the runSpaceSalon
        // pipeline if a salon is already in flight here. The runner
        // does its own check + atomic claim, but doing it here too
        // gives a cleaner response back to cron logs.
        if (row.current_salon_started_at) {
          const ageMin = (Date.now() - Date.parse(row.current_salon_started_at)) / 60_000;
          if (ageMin >= 0 && ageMin < 30) {
            return Response.json({
              ok: true,
              ran: false,
              reason: "already_running",
              started_at: row.current_salon_started_at,
            });
          }
        }

        // Fire-and-forget the salon. We deliberately do NOT await
        // — a 10-turn salon can take 90-180s and pg_cron will time
        // out the http call. The runSpaceSalon function writes to
        // the DB as it goes, so visitors see turns appear via the
        // existing 12s polling on /api/space/$slug/messages.
        runSpaceSalon(row.id, {
          maxTurns: MAX_TURNS_PER_TICK,
          maxImagesPerSalon: MAX_IMAGES_PER_TICK,
          consumePendingTopic: true,
          source: "scheduled",
        }).catch((err) => {
          console.error("[gathering-tick] runSpaceSalon failed:", err);
        });

        return Response.json({
          ok: true,
          ran: true,
          reason: "started",
          space_id: row.id,
          caps: {
            max_turns: MAX_TURNS_PER_TICK,
            max_images: MAX_IMAGES_PER_TICK,
          },
        });
      },
    },
  },
});
