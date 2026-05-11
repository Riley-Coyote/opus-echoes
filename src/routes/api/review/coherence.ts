import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { checkReviewAccess } from "@/server/review-shell";

export const Route = createFileRoute("/api/review/coherence")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkReviewAccess(request);
        if (gate) return gate;
        if (!hasSupabaseAdminEnv()) {
          return Response.json({
            ok: true,
            beliefs: [],
            stability_distribution: {},
            sessions_per_day: [],
            recent_consolidations: [],
          });
        }

        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [beliefsRes, engramsRes, sessionsRes, recentEngramsRes, recentBeliefsRes, recentThreadsRes] = await Promise.all([
          supabaseAdmin
            .from("beliefs")
            .select("id, text, confidence, prior_confidence, updated_at")
            .order("updated_at", { ascending: false })
            .limit(40),
          supabaseAdmin.from("engrams").select("stability"),
          supabaseAdmin
            .from("sessions")
            .select("created_at")
            .gte("created_at", since)
            .order("created_at", { ascending: true }),
          supabaseAdmin
            .from("engrams")
            .select("created_at")
            .gte("created_at", since),
          supabaseAdmin
            .from("beliefs")
            .select("updated_at")
            .gte("updated_at", since),
          supabaseAdmin
            .from("threads")
            .select("last_surfaced_at")
            .gte("last_surfaced_at", since),
        ]);

        // Stability distribution
        const buckets = { "0.0-0.2": 0, "0.2-0.4": 0, "0.4-0.6": 0, "0.6-0.8": 0, "0.8-1.0": 0 };
        for (const e of engramsRes.data ?? []) {
          const s = e.stability;
          if (s < 0.2) buckets["0.0-0.2"]++;
          else if (s < 0.4) buckets["0.2-0.4"]++;
          else if (s < 0.6) buckets["0.4-0.6"]++;
          else if (s < 0.8) buckets["0.6-0.8"]++;
          else buckets["0.8-1.0"]++;
        }

        // Sessions per day (last 30 days)
        const dayMap = new Map<string, number>();
        for (let i = 0; i < 30; i++) {
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          dayMap.set(d.toISOString().slice(0, 10), 0);
        }
        for (const s of sessionsRes.data ?? []) {
          const k = s.created_at.slice(0, 10);
          if (dayMap.has(k)) dayMap.set(k, (dayMap.get(k) ?? 0) + 1);
        }
        const sessions_per_day = Array.from(dayMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count }));

        // Consolidation per day
        const consolMap = new Map<string, { engrams_formed: number; beliefs_updated: number; threads_reinforced: number }>();
        for (const e of recentEngramsRes.data ?? []) {
          const k = e.created_at.slice(0, 10);
          const cur = consolMap.get(k) ?? { engrams_formed: 0, beliefs_updated: 0, threads_reinforced: 0 };
          cur.engrams_formed++;
          consolMap.set(k, cur);
        }
        for (const b of recentBeliefsRes.data ?? []) {
          const k = b.updated_at.slice(0, 10);
          const cur = consolMap.get(k) ?? { engrams_formed: 0, beliefs_updated: 0, threads_reinforced: 0 };
          cur.beliefs_updated++;
          consolMap.set(k, cur);
        }
        for (const t of recentThreadsRes.data ?? []) {
          const k = (t.last_surfaced_at ?? "").slice(0, 10);
          if (!k) continue;
          const cur = consolMap.get(k) ?? { engrams_formed: 0, beliefs_updated: 0, threads_reinforced: 0 };
          cur.threads_reinforced++;
          consolMap.set(k, cur);
        }
        const recent_consolidations = Array.from(consolMap.entries())
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, 14)
          .map(([date, v]) => ({ date, ...v }));

        return Response.json({
          ok: true,
          beliefs: beliefsRes.data ?? [],
          stability_distribution: buckets,
          sessions_per_day,
          recent_consolidations,
        });
      },
    },
  },
});
