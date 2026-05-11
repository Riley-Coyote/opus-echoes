import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { checkReviewAccess } from "@/server/review-shell";

export const Route = createFileRoute("/api/review/state-data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkReviewAccess(request);
        if (gate) return gate;
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: true, state: {}, core_engrams: [], beliefs: [], journal: [] });
        }

        const [stateRes, coresRes, beliefsRes, journalRes] = await Promise.all([
          supabaseAdmin.from("resident_state").select("*").maybeSingle(),
          supabaseAdmin
            .from("engrams")
            .select("id, quote, stability, connections, reinforcement_count, last_reinforced_at")
            .eq("is_core", true)
            .order("stability", { ascending: false })
            .limit(20),
          supabaseAdmin
            .from("beliefs")
            .select("id, text, confidence, prior_confidence, updated_at")
            .order("updated_at", { ascending: false })
            .limit(10),
          supabaseAdmin
            .from("journal_entries")
            .select("id, kind, title, body, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        return Response.json({
          ok: true,
          state: stateRes.data ?? {},
          core_engrams: coresRes.data ?? [],
          beliefs: beliefsRes.data ?? [],
          journal: journalRes.data ?? [],
        });
      },
    },
  },
});
