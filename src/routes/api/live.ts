import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Live conversation surface — what the left + right panels of /conversation read.
// Returns the resident's prose state (left) and the most recent marginalia for
// this session (right), plus the most recent journal entry as a preview.
export const Route = createFileRoute("/api/live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("session_id");

        const [{ data: state }, { data: journal }, { data: marginaliaForSession }] =
          await Promise.all([
            supabaseAdmin
              .from("resident_state")
              .select("prose_summary, last_consolidation_summary, last_consolidation_at, openness, arousal, resolution")
              .eq("id", 1)
              .maybeSingle(),
            supabaseAdmin
              .from("journal_entries")
              .select("id, kind, title, body, created_at")
              .order("created_at", { ascending: false })
              .limit(1),
            sessionId
              ? supabaseAdmin
                  .from("marginalia")
                  .select("id, kind, body, created_at")
                  .eq("session_id", sessionId)
                  .order("created_at", { ascending: false })
                  .limit(8)
              : Promise.resolve({ data: [] as Array<{ id: string; kind: string; body: string; created_at: string }> }),
          ]);

        return Response.json({
          ok: true,
          resident: state ?? null,
          journal_preview: journal && journal.length > 0 ? journal[0] : null,
          marginalia: marginaliaForSession ?? [],
        });
      },
    },
  },
});
