/**
 * POST /api/space/[slug]/start-salon — admin-gated.
 *
 * Triggers a multi-resident salon in the given space. The salon
 * runs synchronously — the endpoint awaits runSpaceSalon and
 * returns after all turns have been written to space_messages.
 *
 * Synchronous-by-design because Cloudflare Workers terminate
 * detached promises the moment a response is sent. Fire-and-forget
 * was the previous shape; under CF Workers it killed the salon
 * runner before it could call the model APIs, so spaces ended up
 * with founding text + empty room. Awaiting blocks the admin's
 * curl for 30–50s per salon (3 residents × ~10 turns × model
 * latency), which is correct behavior for an admin trigger.
 *
 * Body (all optional):
 *   - max_turns: cap on turns (default 30)
 *   - topic_override: a one-time framing for THIS salon run.
 *     Appended to the system prompt so residents know what to
 *     focus on this gathering. The space's stored founding_text
 *     is not modified.
 *   - max_images_per_salon: cap on AI-generated images (default 5)
 *
 * Returns: { ok: true, turns, reason, images_generated } on success.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hasAdminAccess } from "@/server/access.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { runSpaceSalon } from "@/server/substrate.server";

const Body = z.object({
  max_turns: z.number().int().min(1).max(60).optional(),
  topic_override: z.string().trim().min(1).max(8000).optional(),
  max_images_per_salon: z.number().int().min(0).max(20).optional(),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/space/$slug/start-salon")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!hasAdminAccess(request)) {
          return jsonResp({ ok: false, error: "unauthorized" }, 401);
        }
        if (!hasSupabaseAdminEnv()) {
          return jsonResp({ ok: false, error: "config_missing_supabase" }, 503);
        }

        let body: z.infer<typeof Body> = {};
        try {
          const raw = await request.json();
          body = Body.parse(raw);
        } catch {
          // empty body is fine; defaults apply
        }

        const sbAny = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        // Resolve slug → space id.
        const { data: spaceRow } = await sbAny
          .from("spaces")
          .select("id, slug, status")
          .eq("slug", params.slug)
          .eq("status", "active")
          .maybeSingle();
        if (!spaceRow) {
          return jsonResp({ ok: false, error: "space_not_found" }, 404);
        }
        const space = spaceRow as unknown as { id: string; slug: string };

        // Awaited synchronously — CF Workers terminate detached
        // promises once the response is sent, so fire-and-forget
        // here killed the salon mid-run. See the same fix pattern
        // applied to consolidateSession/observeExchange/etc.
        try {
          const result = await runSpaceSalon(space.id, {
            maxTurns: body.max_turns,
            topicOverride: body.topic_override,
            maxImagesPerSalon: body.max_images_per_salon,
          });
          console.log(
            `[start-salon] space=${space.slug} done: turns=${result.turns} reason=${result.reason} images=${result.imagesGenerated}`,
          );
          return jsonResp({
            ok: true,
            space_slug: space.slug,
            turns: result.turns,
            reason: result.reason,
            images_generated: result.imagesGenerated,
          });
        } catch (err) {
          console.error(`[start-salon] space=${space.slug} failed:`, err);
          return jsonResp(
            {
              ok: false,
              error: "salon_failed",
              message: String(err).slice(0, 400),
              space_slug: space.slug,
            },
            500,
          );
        }
      },
    },
  },
});
