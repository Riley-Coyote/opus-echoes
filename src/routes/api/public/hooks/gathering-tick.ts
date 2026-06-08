/**
 * POST /api/public/hooks/gathering-tick — pg_cron entry point.
 *
 * Triggers the scheduled salon in "the-gathering" space three times
 * a day (morning / afternoon / evening UTC — schedule lives in the
 * pg_cron migration, not in code).
 *
 * Auth: same shape as /api/public/hooks/daily-tick. pg_cron sends
 * the project anon key in the `apikey` header.
 *
 * Execution model — IMPORTANT:
 *   On Cloudflare Workers, the isolate terminates the moment the
 *   Response is sent or the request is cancelled. We do NOT have
 *   access to ctx.waitUntil() through TanStack Start, so the
 *   fire-and-forget pattern silently kills runSpaceSalon before
 *   any model call is issued (verified in worker logs 2026-05-14).
 *
 *   Fix: await the salon synchronously. The HTTP response only
 *   returns once the salon finishes. To fit inside pg_cron's
 *   net.http_post timeout, we cap the salon at 4 turns + 1 image
 *   per tick (≈30-50s wall time depending on model latency). The
 *   matching pg_cron migration bumps timeout_milliseconds to 90s
 *   so the connection holds long enough.
 *
 *   Three ticks/day × 4 turns = 12 model-rotations of content
 *   daily, which is plenty for the residents to develop a thread
 *   across the day. If we want longer salons later, the right
 *   path is to break them into multiple ticks rather than make
 *   one tick hold the worker open longer.
 *
 * Behavior:
 *   - Looks up "the-gathering" space by slug.
 *   - If a salon is already running there (current_salon_started_at
 *     within the last 30 min), returns 200 with reason="already_running"
 *     instead of starting another.
 *   - Otherwise calls runSpaceSalon and awaits its completion.
 *   - consumePendingTopic=true so any queued topic from
 *     /api/space/$slug/queue-topic is consumed.
 */

import { createFileRoute } from "@tanstack/react-router";
import { runSpaceSalon } from "@/server/substrate.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isAuthorizedCronRequest } from "@/server/cron-auth.server";

const GATHERING_SLUG = "the-gathering";
// Sized to fit inside pg_cron's HTTP timeout (90s in the migration).
// 4 turns × ~10-15s per turn = ~40-60s wall time. Leaves headroom
// for the image-gen call if it fires.
const MAX_TURNS_PER_TICK = 4;
const MAX_IMAGES_PER_TICK = 1;

export const Route = createFileRoute("/api/public/hooks/gathering-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) {
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

        // Await the salon synchronously — fire-and-forget is killed
        // by Cloudflare's isolate-on-response-end semantics (see
        // top-of-file note). The pg_cron migration sets a 90s
        // timeout on the http_post to give this room.
        //
        // Turns are written to space_messages as they happen, so
        // visitors polling /api/space/$slug/messages see content
        // appear in real time — they don't wait for the full
        // salon to finish before content shows up in the room.
        const result = await runSpaceSalon(row.id, {
          maxTurns: MAX_TURNS_PER_TICK,
          maxImagesPerSalon: MAX_IMAGES_PER_TICK,
          consumePendingTopic: true,
          source: "scheduled",
        }).catch((err) => {
          console.error("[gathering-tick] runSpaceSalon failed:", err);
          return {
            ran: false,
            turns: 0,
            reason: "error",
            imagesGenerated: 0,
          } as const;
        });

        return Response.json({
          ok: true,
          ran: result.ran,
          reason: result.reason,
          turns: result.turns,
          images_generated: result.imagesGenerated,
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
