import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { humanWhen, redactPublicText } from "@/server/redact";

export const Route = createFileRoute("/api/public-conversations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: true, conversations: [], has_more: false });
        }

        const url = new URL(request.url);
        const limit = Math.min(40, Math.max(1, Number(url.searchParams.get("limit") ?? 12)));
        const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

        const { data: published, error } = await supabaseAdmin
          .from("published_conversations")
          .select(
            "id, session_id, title, summary, reason, significance_kind, selected_by, published_at",
          )
          .order("published_at", { ascending: false })
          .range(offset, offset + limit);

        if (error) {
          console.error("published_conversations", error);
          return Response.json({ ok: false, code: "archive_unavailable" }, { status: 500 });
        }

        const rows = (published ?? []).slice(0, limit);
        const hasMore = (published ?? []).length > limit;
        const sessionIds = rows.map((row) => row.session_id);
        const { data: turns } = sessionIds.length
          ? await supabaseAdmin
              .from("turns")
              .select("id, session_id, role, body, kind, created_at")
              .in("session_id", sessionIds)
              .order("created_at", { ascending: true })
          : { data: [] };

        const bySession = new Map<string, typeof turns>();
        for (const turn of turns ?? []) {
          const list = bySession.get(turn.session_id) ?? [];
          list.push(turn);
          bySession.set(turn.session_id, list);
        }

        const conversations = rows.map((row) => ({
          ...row,
          published_at_label: humanWhen(row.published_at),
          turns: (bySession.get(row.session_id) ?? []).map((turn) => ({
            ...turn,
            body: redactPublicText(turn.body ?? ""),
          })),
        }));

        return Response.json({ ok: true, conversations, has_more: hasMore });
      },
    },
  },
});
