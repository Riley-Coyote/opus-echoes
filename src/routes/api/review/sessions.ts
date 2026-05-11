import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { checkReviewAccess } from "@/server/review-shell";

export const Route = createFileRoute("/api/review/sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkReviewAccess(request);
        if (gate) return gate;
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: true, sessions: [], total: 0 });
        }

        const url = new URL(request.url);
        const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

        const { data: sessions, count } = await supabaseAdmin
          .from("sessions")
          .select("id, created_at, closed_at, closed_by, resident_id, intent_id", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        const sessionList = sessions ?? [];
        const ids = sessionList.map((s) => s.id);
        const intentIds = sessionList.map((s) => s.intent_id).filter((x): x is string => Boolean(x));

        const [intentsRes, turnCountsRes, engramsRes] = await Promise.all([
          intentIds.length
            ? supabaseAdmin.from("intents").select("id, text").in("id", intentIds)
            : Promise.resolve({ data: [] as Array<{ id: string; text: string }> }),
          ids.length
            ? supabaseAdmin.from("turns").select("session_id").in("session_id", ids)
            : Promise.resolve({ data: [] as Array<{ session_id: string }> }),
          ids.length
            ? supabaseAdmin
                .from("engrams")
                .select("source_session_ids")
                .overlaps("source_session_ids", ids)
            : Promise.resolve({ data: [] as Array<{ source_session_ids: string[] | null }> }),
        ]);

        const intentMap = new Map<string, string>();
        for (const i of intentsRes.data ?? []) intentMap.set(i.id, i.body);

        const turnCount = new Map<string, number>();
        for (const t of turnCountsRes.data ?? []) {
          turnCount.set(t.session_id, (turnCount.get(t.session_id) ?? 0) + 1);
        }

        const engramCount = new Map<string, number>();
        for (const e of engramsRes.data ?? []) {
          for (const sid of e.source_session_ids ?? []) {
            if (ids.includes(sid)) engramCount.set(sid, (engramCount.get(sid) ?? 0) + 1);
          }
        }

        const result = sessionList.map((s) => {
          const intent = s.intent_id ? intentMap.get(s.intent_id) ?? "" : "";
          return {
            id: s.id,
            created_at: s.created_at,
            closed_at: s.closed_at,
            closed_by: s.closed_by,
            resident_id: s.resident_id,
            intent_preview: intent.slice(0, 120),
            turn_count: turnCount.get(s.id) ?? 0,
            engram_count: engramCount.get(s.id) ?? 0,
          };
        });

        return Response.json({ ok: true, sessions: result, total: count ?? 0 });
      },
    },
  },
});
