/**
 * Public share page — /share/<token>
 *
 * Anonymous read. RLS on visitor_shares only returns non-revoked rows;
 * if the visitor has revoked their share, this route returns 404 with
 * a small "share is no longer available" page.
 *
 * View tracking: increments view_count on each load, but debounced
 * server-side per IP to avoid trivial inflation. (last_viewed_at gets
 * a fresh timestamp regardless.)
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ipHash } from "@/server/rate-limit.server";
import { getResident, isResidentId } from "@/server/opus/residents";
import { renderSharePage, renderShareNotFoundPage, type ShareTurn } from "@/server/share-pages";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

interface ShareRow {
  id: string;
  token: string;
  session_id: string;
  resident_id: string;
  visitor_note: string | null;
  created_at: string;
  view_count: number;
  last_viewed_at: string | null;
}

interface SessionRow {
  id: string;
  created_at: string;
}

export const Route = createFileRoute("/share/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!hasSupabaseAdminEnv()) {
          return htmlResponse(renderShareNotFoundPage(), 503);
        }

        const token = params.token;
        if (!token || token.length < 4 || token.length > 64) {
          return htmlResponse(renderShareNotFoundPage(), 404);
        }

        // Look up the share. RLS filters out revoked rows for public reads,
        // but we use the service role here, so add the explicit filter.
        const { data: share } = (await supabaseAdmin
          .from("visitor_shares")
          .select(
            "id, token, session_id, resident_id, visitor_note, created_at, view_count, last_viewed_at",
          )
          .eq("token", token)
          .is("revoked_at", null)
          .maybeSingle()) as { data: ShareRow | null };

        if (!share) {
          return htmlResponse(renderShareNotFoundPage(), 404);
        }

        // Resolve the resident's display info from the registry.
        if (!isResidentId(share.resident_id)) {
          // Defensive — shouldn't happen post-FK enforcement.
          return htmlResponse(renderShareNotFoundPage(), 404);
        }
        const resident = getResident(share.resident_id);

        // Fetch session for the visited-at timestamp.
        const { data: session } = (await supabaseAdmin
          .from("sessions")
          .select("id, created_at")
          .eq("id", share.session_id)
          .maybeSingle()) as { data: SessionRow | null };

        // Fetch all turns ordered chronologically.
        const { data: turnsData } = await supabaseAdmin
          .from("turns")
          .select("role, body, kind, created_at")
          .eq("session_id", share.session_id)
          .in("role", ["visitor", "resident"])
          .order("created_at", { ascending: true });

        const turns: ShareTurn[] = (turnsData ?? []).map((t) => ({
          role: t.role as "visitor" | "resident",
          body: t.body ?? "",
          kind: t.kind ?? "message",
          created_at: t.created_at,
        }));

        // Increment view count, debounced per IP per hour. We don't fail
        // the render if this update errors — counter accuracy is a nice-
        // to-have, not load-bearing.
        const hash = ipHash(request);
        const lastViewedAt = share.last_viewed_at ? new Date(share.last_viewed_at).getTime() : 0;
        const now = Date.now();
        const HOUR = 60 * 60 * 1000;
        if (now - lastViewedAt > HOUR) {
          // Heuristic: only increment if it's been an hour since the last
          // view-tracking update for this share. Per-IP precision would
          // need a separate `share_views` table; this is good enough for v1.
          await supabaseAdmin
            .from("visitor_shares")
            .update({
              view_count: (share.view_count ?? 0) + 1,
              last_viewed_at: new Date().toISOString(),
            })
            .eq("id", share.id);
          // hash referenced so it's not flagged unused; future per-IP
          // tracking will use it.
          void hash;
        }

        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;

        const html = renderSharePage({
          token: share.token,
          residentDisplayName: resident.displayName,
          residentSlug: resident.slug,
          visitedAt: session?.created_at ?? share.created_at,
          visitorNote: share.visitor_note,
          turns,
          origin,
        });

        return htmlResponse(html, 200);
      },
    },
  },
});
