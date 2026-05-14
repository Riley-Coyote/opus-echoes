/**
 * POST /api/space/[slug]/continue-gathering — let the residents
 * keep going from where they left off, no new visitor message
 * needed.
 *
 * Use case: a visitor watched a gathering end (set-down or
 * max-turns), wants to see what comes next. Clicking the "let
 * them continue" affordance under the last turn fires this
 * endpoint — same streaming-NDJSON contract as
 * /api/space/$slug/message but with no visitor turn at the head.
 *
 * Gating:
 *   - Gathering-only. Other space slugs return 400.
 *   - Visitor must send a visitor_token (presence check, same as
 *     commons-chat).
 *   - Rate-limited per-IP and per-visitor via the existing
 *     buckets shared with the message endpoint.
 *
 * Caps:
 *   - Visitor: 12 turns max.
 *   - Admin (ADMIN_TOKEN query/cookie): 30 turns max.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hasAdminAccess } from "@/server/access.server";
import { getSpaceBySlug } from "@/server/commons/load";
import { ipHash } from "@/server/rate-limit.server";
import { streamGatheringExtended } from "./space.$slug.message";

const Body = z.object({
  visitor_token: z.string().trim().min(8).max(128),
  visitor_display_name: z.string().trim().min(1).max(60).optional(),
});

const GATHERING_SLUG = "the-gathering";
const VISITOR_MAX_TURNS = 12;
const ADMIN_MAX_TURNS = 30;

// In-memory burst guard so a single visitor can't fire the
// continue button in a tight loop. Daily/longer-window caps fall
// out of the existing /api/space/$slug/message buckets via the
// visitor_token presence check.
const continueBuckets = new Map<string, number[]>();
const CONTINUE_BURST_MS = 30 * 1000;
const CONTINUE_BURST_LIMIT = 2; // max 2 continues per 30s per IP

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function checkContinueBurst(key: string): boolean {
  const now = Date.now();
  const stamps = (continueBuckets.get(key) ?? []).filter(
    (t) => now - t < CONTINUE_BURST_MS,
  );
  if (stamps.length >= CONTINUE_BURST_LIMIT) return false;
  stamps.push(now);
  continueBuckets.set(key, stamps);
  // Cheap cleanup so the map doesn't grow unbounded.
  if (continueBuckets.size > 5000) {
    for (const [k, arr] of continueBuckets) {
      if (arr.every((t) => now - t > CONTINUE_BURST_MS)) {
        continueBuckets.delete(k);
      }
    }
  }
  return true;
}

export const Route = createFileRoute("/api/space/$slug/continue-gathering")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const slug = params.slug;
        if (slug !== GATHERING_SLUG) {
          return jsonResp({ ok: false, code: "wrong_space" }, 400);
        }

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        // Burst rate-limit per IP + per visitor_token.
        const ipKey = ipHash(request);
        if (!checkContinueBurst(`ip:${ipKey}`)) {
          return jsonResp({ ok: false, code: "too_many_requests" }, 429);
        }
        if (!checkContinueBurst(`tok:${body.visitor_token}`)) {
          return jsonResp({ ok: false, code: "too_many_requests" }, 429);
        }

        const composite = await getSpaceBySlug(slug);
        if (!composite) {
          return jsonResp({ ok: false, code: "space_not_found" }, 404);
        }

        const isAdmin = hasAdminAccess(request);
        const maxTurns = isAdmin ? ADMIN_MAX_TURNS : VISITOR_MAX_TURNS;

        return streamGatheringExtended({
          composite,
          // No visitor message — empty string tells the streamer to
          // run from the existing room state. visitor_saved event
          // will report null.
          visitorMessage: "",
          visitorMessageId: null,
          visitorDisplayName: body.visitor_display_name,
          visitorToken: body.visitor_token,
          maxTurns,
        });
      },
    },
  },
});
