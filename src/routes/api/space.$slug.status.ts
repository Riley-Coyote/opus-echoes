/**
 * GET /api/space/[slug]/status — poll the real liveness of a gathering.
 *
 * Returns whether the space has an active salon (current_salon_started_at
 * is recent), and metadata for the Fire to render live vs. replay vs. quiet.
 *
 * Returns: { ok: true, live: boolean, current_salon_started_at: string | null }
 *
 * Auth: none — space status is public.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { getSpaceBySlug } from "@/server/commons/load";

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const LIVE_WINDOW = 4 * 60 * 1000; // 4 minutes

export const Route = createFileRoute("/api/space/$slug/status")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!hasSupabaseAdminEnv()) {
          // Without DB, fall back to seeded space status.
          const composite = await getSpaceBySlug(params.slug);
          if (!composite) {
            return jsonResp({ ok: false, code: "space_not_found" }, 404);
          }
          return jsonResp({
            ok: true,
            live: false,
            current_salon_started_at: null,
            space_id: composite.space.id,
          });
        }

        const sb = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        // Resolve space from slug and get current_salon_started_at.
        const { data: spaceRow } = await sb
          .from("spaces")
          .select("id, current_salon_started_at")
          .eq("slug", params.slug)
          .eq("status", "active")
          .maybeSingle();

        if (!spaceRow) {
          return jsonResp({ ok: false, code: "space_not_found" }, 404);
        }

        // Determine if the salon is currently live:
        // A salon is live if it started within the LIVE_WINDOW.
        let live = false;
        if (spaceRow.current_salon_started_at) {
          const startedMs = Date.parse(spaceRow.current_salon_started_at);
          const age = Date.now() - startedMs;
          live = age >= 0 && age < LIVE_WINDOW;
        }

        return jsonResp({
          ok: true,
          live,
          current_salon_started_at: spaceRow.current_salon_started_at,
          space_id: spaceRow.id,
        });
      },
    },
  },
});
