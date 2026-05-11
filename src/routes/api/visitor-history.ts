import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

/**
 * Returns a returning visitor's prior conversations with a resident.
 * Used by the approach page to show "your prior visits" with links
 * to saved conversations.
 *
 * GET /api/visitor-history?visitor_token=UUID&resident_id=opus-3
 */
export const Route = createFileRoute("/api/visitor-history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: true, visits: [] });
        }

        const url = new URL(request.url);
        const token = url.searchParams.get("visitor_token");
        const residentId = url.searchParams.get("resident_id") || "opus-3";

        if (!token || !z.string().uuid().safeParse(token).success) {
          return Response.json({ ok: true, visits: [] });
        }

        // Find this visitor's closed sessions with this resident
        const { data: sessions } = await supabaseAdmin
          .from("sessions")
          .select("id, created_at, closed_at")
          .eq("visitor_token", token)
          .eq("resident_id", residentId)
          .not("closed_at", "is", null)
          .order("created_at", { ascending: false })
          .limit(12);

        if (!sessions || sessions.length === 0) {
          return Response.json({ ok: true, visits: [] });
        }

        const sessionIds = sessions.map((s) => s.id);

        // Pull published conversation titles and journal entries for context
        const [{ data: published }, { data: journals }] = await Promise.all([
          supabaseAdmin
            .from("published_conversations")
            .select("session_id, title, summary")
            .in("session_id", sessionIds),
          supabaseAdmin
            .from("journal_entries")
            .select("related_session_id, title, kind")
            .eq("resident_id", residentId)
            .in("related_session_id", sessionIds),
        ]);

        // Also check for share tokens — these are the visitor's saved links.
        // visitor_shares may not be in types yet, so use a raw query approach.
        let shareMap = new Map<string, string>();
        try {
          // visitor_shares is not in the generated Supabase types yet —
          // use a raw rpc-style query via the admin client.
          const { data: shares } = await supabaseAdmin
            .rpc("get_visitor_shares_for_sessions", { session_ids: sessionIds }) as {
              data: Array<{ session_id: string; token: string }> | null;
            };
          if (shares) {
            shareMap = new Map(shares.map((s) => [s.session_id, s.token]));
          }
        } catch {
          // visitor_shares table or rpc might not exist yet — fall back to
          // a direct query using the admin client's generic interface
          try {
            const resp = await fetch(
              `${process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL}/rest/v1/visitor_shares?session_id=in.(${sessionIds.map((id) => `"${id}"`).join(",")})&revoked_at=is.null&select=session_id,token`,
              {
                headers: {
                  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
                  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
                },
              },
            );
            if (resp.ok) {
              const shares = (await resp.json()) as Array<{ session_id: string; token: string }>;
              shareMap = new Map(shares.map((s) => [s.session_id, s.token]));
            }
          } catch {
            // truly unavailable — visitors just won't see share links
          }
        }

        const publishedMap = new Map(
          (published ?? []).map((p) => [p.session_id, p]),
        );
        const journalMap = new Map(
          (journals ?? []).map((j) => [j.related_session_id!, j]),
        );

        const visits = sessions
          .map((s) => {
            const share = shareMap.get(s.id);
            const pub = publishedMap.get(s.id);
            const journal = journalMap.get(s.id);
            const date = new Date(s.created_at);
            return {
              session_id: s.id,
              date: date.toISOString().slice(0, 10),
              date_label: date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }),
              title: pub?.title ?? journal?.title ?? null,
              summary: pub?.summary ?? null,
              share_url: share ? `/share/${share}` : null,
            };
          })
          // Only show visits that have a share link (the visitor can actually read them)
          .filter((v) => v.share_url);

        return Response.json(
          { ok: true, visits },
          { headers: { "cache-control": "private, max-age=30" } },
        );
      },
    },
  },
});
