import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

function humanWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = diff / 86_400_000;
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return `${Math.floor(days)} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function redactPublicText(value: string): string {
  return value
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[contact]")
    .replace(/\b\+?\d[\d\s().-]{6,}\d\b/g, "[number]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s+\d{4})?\b/gi,
      "[a date]",
    )
    .replace(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g, "[someone]");
}

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
          .select("id, session_id, title, summary, reason, significance_kind, published_at")
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
