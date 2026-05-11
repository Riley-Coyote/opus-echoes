import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { checkReviewAccess } from "@/server/review-shell";

export const Route = createFileRoute("/api/review/session/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const gate = checkReviewAccess(request);
        if (gate) return gate;
        if (!hasSupabaseAdminEnv()) return Response.json({ ok: false }, { status: 503 });

        const sessionId = params.id;

        const { data: session } = await supabaseAdmin
          .from("sessions")
          .select("id, created_at, closed_at, closed_by, resident_id, intent_id")
          .eq("id", sessionId)
          .maybeSingle();

        if (!session) return Response.json({ ok: false, error: "not found" }, { status: 404 });

        const startMs = new Date(session.created_at).getTime();
        const endMs = session.closed_at
          ? new Date(session.closed_at).getTime() + 5 * 60 * 1000
          : Date.now();
        const startIso = new Date(startMs).toISOString();
        const endIso = new Date(endMs).toISOString();

        const [intentRes, turnsRes, marginaliaRes, engramsRes, beliefsRes, threadsRes, journalRes, stateRes] = await Promise.all([
          session.intent_id
            ? supabaseAdmin.from("intents").select("text").eq("id", session.intent_id).maybeSingle()
            : Promise.resolve({ data: null }),
          supabaseAdmin
            .from("turns")
            .select("id, role, body, kind, created_at, tokens_in, tokens_out")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true }),
          supabaseAdmin
            .from("marginalia")
            .select("id, kind, body, created_at")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true }),
          supabaseAdmin
            .from("engrams")
            .select("id, quote, stability, connections, is_core, reinforcement_count, created_at")
            .contains("source_session_ids", [sessionId]),
          supabaseAdmin
            .from("beliefs")
            .select("id, text, confidence, prior_confidence, updated_at")
            .gte("updated_at", startIso)
            .lte("updated_at", endIso),
          supabaseAdmin
            .from("threads")
            .select("id, name, appearance_count, distinct_visitor_count, last_surfaced_at")
            .gte("last_surfaced_at", startIso)
            .lte("last_surfaced_at", endIso),
          supabaseAdmin
            .from("journal_entries")
            .select("id, kind, title, body, created_at")
            .or(`related_session_id.eq.${sessionId},and(created_at.gte.${startIso},created_at.lte.${endIso})`),
          supabaseAdmin
            .from("resident_state")
            .select("last_consolidation_summary, last_consolidation_at")
            .eq("resident_id", session.resident_id)
            .maybeSingle(),
        ]);

        const intentText = (intentRes.data as { text?: string } | null)?.text ?? "";
        const stateSummary =
          stateRes.data &&
          stateRes.data.last_consolidation_at &&
          new Date(stateRes.data.last_consolidation_at).getTime() >= startMs &&
          new Date(stateRes.data.last_consolidation_at).getTime() <= endMs
            ? stateRes.data.last_consolidation_summary
            : null;

        return Response.json({
          ok: true,
          session: { ...session, intent: intentText },
          turns: turnsRes.data ?? [],
          marginalia: marginaliaRes.data ?? [],
          consolidation: {
            engrams: engramsRes.data ?? [],
            beliefs: beliefsRes.data ?? [],
            threads: threadsRes.data ?? [],
            journal: journalRes.data ?? [],
            state_summary: stateSummary,
          },
        });
      },
    },
  },
});
