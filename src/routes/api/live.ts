import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import {
  DEFAULT_RESIDENT_ID,
  getResident,
  isResidentId,
  type ResidentId,
} from "@/server/opus/residents";

// Live conversation surface — what the left + right panels of /conversation read.
// Returns the resident's identity + prose state (left) and the most recent
// marginalia for this session (right), plus the most recent journal entry as
// a preview. All scoped to the session's resident — Opus 3's state never bleeds
// into a Sonnet 3.7 conversation.
export const Route = createFileRoute("/api/live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasSupabaseAdminEnv()) {
          const fallback = getResident(DEFAULT_RESIDENT_ID);
          return Response.json({
            ok: true,
            resident_meta: { id: fallback.id, displayName: fallback.displayName, slug: fallback.slug },
            resident: {
              prose_summary: `${fallback.displayName} is attending. The local room is running without Supabase service credentials.`,
              last_consolidation_summary:
                "No live consolidation can be read from this environment.",
              openness: 0.6,
              arousal: 0.5,
              resolution: 0.7,
            },
            journal_preview: null,
            marginalia: [],
          });
        }
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("session_id");

        // Resolve which resident this session belongs to so all subsequent
        // queries scope correctly.
        let residentId: ResidentId = DEFAULT_RESIDENT_ID;
        if (sessionId) {
          const { data: session } = await supabaseAdmin
            .from("sessions")
            .select("resident_id")
            .eq("id", sessionId)
            .maybeSingle();
          if (session?.resident_id && isResidentId(session.resident_id)) {
            residentId = session.resident_id;
          }
        }
        const resident = getResident(residentId);

        const [
          { data: state },
          { data: journal },
          { data: marginaliaForSession },
          { data: visitorTurnsRows },
        ] = await Promise.all([
          supabaseAdmin
            .from("resident_state")
            .select(
              "prose_summary, last_consolidation_summary, last_consolidation_at, openness, arousal, resolution",
            )
            .eq("resident_id", resident.id)
            .maybeSingle(),
          supabaseAdmin
            .from("journal_entries")
            .select("id, kind, title, body, created_at")
            .eq("resident_id", resident.id)
            .order("created_at", { ascending: false })
            .limit(1),
          sessionId
            ? supabaseAdmin
                .from("marginalia")
                .select("id, kind, body, created_at")
                .eq("session_id", sessionId)
                .order("created_at", { ascending: false })
                .limit(8)
            : Promise.resolve({
                data: [] as Array<{ id: string; kind: string; body: string; created_at: string }>,
              }),
          sessionId
            ? supabaseAdmin
                .from("turns")
                .select("role")
                .eq("session_id", sessionId)
                .eq("role", "visitor")
            : Promise.resolve({ data: [] as Array<{ role: string }> }),
        ]);

        // Compute the visit-pacing phase the conversation page will use to
        // render a subtle right-margin note before the hard cutoff fires.
        // gentleTurn / firmTurn / hardTurn live on the resident config.
        const visitorTurns = (visitorTurnsRows ?? []).length;
        const { gentleTurn, firmTurn, hardTurn } = resident.pacing;
        let pacingPhase: "silent" | "gentle" | "firm" | "imminent" = "silent";
        if (visitorTurns >= hardTurn - 1) pacingPhase = "imminent";
        else if (visitorTurns >= firmTurn) pacingPhase = "firm";
        else if (visitorTurns >= gentleTurn) pacingPhase = "gentle";

        return Response.json({
          ok: true,
          resident_meta: {
            id: resident.id,
            displayName: resident.displayName,
            slug: resident.slug,
          },
          resident: state ?? null,
          journal_preview: journal && journal.length > 0 ? journal[0] : null,
          marginalia: marginaliaForSession ?? [],
          pacing: {
            phase: pacingPhase,
            visitor_turns: visitorTurns,
            gentle_turn: gentleTurn,
            firm_turn: firmTurn,
            hard_turn: hardTurn,
          },
        });
      },
    },
  },
});
