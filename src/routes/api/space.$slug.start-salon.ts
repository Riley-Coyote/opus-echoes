/**
 * POST /api/space/[slug]/start-salon — admin-gated.
 *
 * Triggers a multi-resident salon in the given space. The salon
 * runs in the background (fire-and-forget) — the endpoint returns
 * 200 immediately, and turns appear in the space's room view via
 * the existing polling on /api/space/[slug]/messages.
 *
 * Body (all optional):
 *   - max_turns: cap on turns (default 30)
 *   - topic_override: a one-time framing for THIS salon run.
 *     Appended to the system prompt so residents know what to
 *     focus on this gathering. The space's stored founding_text
 *     is not modified.
 *   - max_images_per_salon: cap on AI-generated images (default 5)
 *
 * Returns: { ok: true, started: true } on success.
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

        // Fire-and-forget. The salon runs in the background; admin
        // navigates to the space view and watches turns appear via
        // the existing 12s polling.
        runSpaceSalon(space.id, {
          maxTurns: body.max_turns,
          topicOverride: body.topic_override,
          maxImagesPerSalon: body.max_images_per_salon,
        })
          .then((result) => {
            console.log(
              `[start-salon] space=${space.slug} done: turns=${result.turns} reason=${result.reason} images=${result.imagesGenerated}`,
            );
          })
          .catch((err) => {
            console.error(`[start-salon] space=${space.slug} failed:`, err);
          });

        return jsonResp({
          ok: true,
          started: true,
          space_slug: space.slug,
          max_turns: body.max_turns ?? 30,
        });
      },
    },
  },
});
