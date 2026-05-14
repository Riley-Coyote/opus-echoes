/**
 * POST /api/space/[slug]/visitor-start-salon — visitor-gated.
 *
 * Lets a named visitor request an on-demand salon between the
 * three residents in a gathering space. Lighter than the admin
 * version: capped at 8 turns + 1 image so cost is bounded even
 * under saturation.
 *
 * Gating (all required):
 *   1. Visitor must have named themselves at the threshold —
 *      verified via `visitor_display_name` (non-empty trimmed) in
 *      the request body.
 *   2. Rate limit: max 1 successful call per visitor_token per
 *      24h AND max 1 per IP per 24h. Whichever fires first wins.
 *   3. No salon currently running in the space (anti-double-up).
 *
 * Body shape (JSON):
 *   {
 *     visitor_token: string,         // required, from localStorage
 *     visitor_display_name: string,  // required, non-empty
 *     topic_override?: string         // optional, capped at 1000 chars
 *   }
 *
 * Returns:
 *   200 { ok: true, started: true }                  — salon started
 *   401 { ok: false, error: "not_named" }            — no display name
 *   409 { ok: false, error: "already_running" }      — salon already in flight
 *   429 { ok: false, error: "rate_limited", scope } — per-visitor or per-IP cap hit
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ipHash } from "@/server/rate-limit.server";
import { runSpaceSalon } from "@/server/substrate.server";

const Body = z.object({
  visitor_token: z.string().trim().min(6).max(64),
  visitor_display_name: z.string().trim().min(1).max(60),
  topic_override: z.string().trim().min(1).max(1000).optional(),
});

// Sized to fit within a reasonable visitor wait. ~4 turns × 10s
// per turn = ~40s — the room polls every 12s so they see content
// appearing in real-time while the response is held open. We
// can't fire-and-forget on Cloudflare Workers (isolate dies on
// response, no waitUntil access via TanStack Start) so the
// endpoint awaits the salon and returns when it's done.
const MAX_TURNS = 4;
const MAX_IMAGES = 1;
const COOLDOWN_HOURS = 24;

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute(
  "/api/space/$slug/visitor-start-salon",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
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

        const ip = ipHash(request);

        const sbAny = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        // 1. Look up the space by slug.
        const { data: spaceRow, error: lookupErr } = await sbAny
          .from("spaces")
          .select("id, slug, current_salon_started_at")
          .eq("slug", params.slug)
          .maybeSingle();
        if (lookupErr || !spaceRow) {
          return jsonResp({ ok: false, error: "space_not_found" }, 404);
        }
        const space = spaceRow as {
          id: string;
          slug: string;
          current_salon_started_at: string | null;
        };

        // 2. Already running?
        if (space.current_salon_started_at) {
          const ageMin =
            (Date.now() - Date.parse(space.current_salon_started_at)) /
            60_000;
          if (ageMin >= 0 && ageMin < 30) {
            return jsonResp(
              { ok: false, error: "already_running" },
              409,
            );
          }
        }

        // 3. Rate limit. We use the space_visitor_salon_requests
        // table — created by this endpoint, holding one row per
        // successful invocation, scoped by (space_id, visitor_token)
        // and (space_id, ip_hash).
        const cutoff = new Date(
          Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000,
        ).toISOString();

        const { data: recent } = await sbAny
          .from("space_visitor_salon_requests")
          .select("scope")
          .eq("space_id", space.id)
          .gte("created_at", cutoff)
          .or(`visitor_token.eq.${body.visitor_token},ip_hash.eq.${ip}`);

        const recentRows = (recent ?? []) as Array<{
          scope: string;
        }>;
        if (recentRows.length > 0) {
          // Either the visitor or the IP has already triggered one
          // in the cooldown window. We return without distinguishing
          // which (less info-leak).
          return jsonResp(
            {
              ok: false,
              error: "rate_limited",
              scope: "visitor_or_ip",
              cooldown_hours: COOLDOWN_HOURS,
            },
            429,
          );
        }

        // 4. Insert the rate-limit record FIRST (before triggering
        // the salon). If the runSpaceSalon call fails the cooldown
        // still counts — caller can retry tomorrow. This is the
        // anti-abuse posture.
        await sbAny.from("space_visitor_salon_requests").insert({
          space_id: space.id,
          visitor_token: body.visitor_token,
          visitor_display_name: body.visitor_display_name,
          ip_hash: ip,
          // We don't store the topic_override (PII risk).
        });

        // 5. Await the salon synchronously. Cloudflare Workers
        // terminate the isolate when the response is sent, so
        // fire-and-forget would silently kill the salon before
        // any model call fires. The client sees the response
        // when the salon completes (~30-50s), but turns appear
        // in the room view via the 12s polling stream as they're
        // written — the visitor sees content unfold in real time
        // while the button stays in its loading state.
        const result = await runSpaceSalon(space.id, {
          maxTurns: MAX_TURNS,
          maxImagesPerSalon: MAX_IMAGES,
          topicOverride: body.topic_override,
          consumePendingTopic: false,
          source: `visitor:${body.visitor_display_name.slice(0, 24)}`,
        }).catch((err) => {
          console.error(
            "[visitor-start-salon] runSpaceSalon failed:",
            err,
          );
          return {
            ran: false,
            turns: 0,
            reason: "error",
            imagesGenerated: 0,
          } as const;
        });

        return jsonResp({
          ok: true,
          started: true,
          ran: result.ran,
          turns: result.turns,
          reason: result.reason,
          caps: { max_turns: MAX_TURNS, max_images: MAX_IMAGES },
        });
      },
    },
  },
});
