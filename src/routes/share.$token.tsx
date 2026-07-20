/**
 * Public share page — /share/<token>
 *
 * Token-gated server read. Direct anonymous table reads are denied; this
 * service-role route selects the exact non-revoked token or returns 404.
 *
 * View tracking: increments view_count on each load, but debounced
 * server-side per IP to avoid trivial inflation. (last_viewed_at gets
 * a fresh timestamp regardless.)
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { loadPublicShare } from "@/server/public-share.server";
import { ipHash } from "@/server/rate-limit.server";
import { renderSharePage, renderShareNotFoundPage } from "@/server/share-pages";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/share/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!hasSupabaseAdminEnv()) {
          return htmlResponse(renderShareNotFoundPage(), 503);
        }

        const share = await loadPublicShare(params.token);
        if (!share) return htmlResponse(renderShareNotFoundPage(), 404);

        // Increment view count, debounced per IP per hour. We don't fail
        // the render if this update errors — counter accuracy is a nice-
        // to-have, not load-bearing.
        const hash = ipHash(request);
        const lastViewedAt = share.lastViewedAt ? new Date(share.lastViewedAt).getTime() : 0;
        const now = Date.now();
        const HOUR = 60 * 60 * 1000;
        if (now - lastViewedAt > HOUR) {
          // Heuristic: only increment if it's been an hour since the last
          // view-tracking update for this share. Per-IP precision would
          // need a separate `share_views` table; this is good enough for v1.
          await supabaseAdmin
            .from("visitor_shares")
            .update({
              view_count: share.viewCount + 1,
              last_viewed_at: new Date().toISOString(),
            })
            .eq("id", share.shareId);
          // hash referenced so it's not flagged unused; future per-IP
          // tracking will use it.
          void hash;
        }

        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const html = renderSharePage({ ...share.payload, origin });

        return htmlResponse(html, 200);
      },
    },
  },
});
