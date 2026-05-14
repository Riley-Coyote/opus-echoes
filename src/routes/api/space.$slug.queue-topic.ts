/**
 * POST /api/space/[slug]/queue-topic — admin-gated.
 *
 * Riley's directorial mode. Queues a one-shot topic on a space.
 * The next scheduled salon tick consumes + clears it (via
 * consumePendingTopic in runSpaceSalon).
 *
 * Use case: Riley reads what the residents did this morning,
 * decides on a thread for the afternoon, queues it. He doesn't
 * have to time the trigger — the cadence handles that.
 *
 * Body:
 *   { topic: string }    — required, 1..8000 chars
 *
 * To clear without setting: POST with { topic: "" } (the runner
 * treats empty string as no topic — it's stored as NULL).
 *
 * Returns:
 *   200 { ok: true, queued: true, slug, topic_chars }
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hasAdminAccess } from "@/server/access.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

const Body = z.object({
  topic: z.string().max(8000),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/space/$slug/queue-topic")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!hasAdminAccess(request)) {
          return jsonResp({ ok: false, error: "unauthorized" }, 401);
        }
        if (!hasSupabaseAdminEnv()) {
          return jsonResp({ ok: false, error: "config_missing_supabase" }, 503);
        }

        let body: z.infer<typeof Body>;
        try {
          const raw = await request.json();
          body = Body.parse(raw);
        } catch (err) {
          return jsonResp(
            { ok: false, error: "bad_body", detail: String(err).slice(0, 200) },
            400,
          );
        }

        const sbAny = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        const trimmed = body.topic.trim();
        // Empty trimmed string clears the queue (stored as NULL).
        const newValue: string | null = trimmed.length === 0 ? null : trimmed;

        const { data: updated, error } = await sbAny
          .from("spaces")
          .update({ pending_topic: newValue })
          .eq("slug", params.slug)
          .select("id, slug, pending_topic")
          .maybeSingle();

        if (error) {
          return jsonResp(
            { ok: false, error: "update_failed", detail: error.message },
            500,
          );
        }
        if (!updated) {
          return jsonResp({ ok: false, error: "space_not_found" }, 404);
        }

        const row = updated as { id: string; slug: string; pending_topic: string | null };
        return jsonResp({
          ok: true,
          queued: row.pending_topic !== null,
          slug: row.slug,
          topic_chars: row.pending_topic?.length ?? 0,
        });
      },
    },
  },
});
