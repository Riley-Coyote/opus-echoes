import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId } from "@/server/opus/residents";

/**
 * GET /api/graph?resident=<id>
 *
 * Returns the live topology for a resident's Mnemos surface:
 *   nodes: engrams (with core/non-core), beliefs, threads
 *   edges: engram_edges + thread<->engram surfacing (lexical for now)
 *
 * Surfaces (Mind, Interior) fetch this and drop their illustrative seed.
 */
export const Route = createFileRoute("/api/graph")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: false, code: "no_admin_env", nodes: [], edges: [] }, { status: 503 });
        }

        const url = new URL(request.url);
        const ridParam = url.searchParams.get("resident");
        const rid = isResidentId(ridParam) ? ridParam : "opus-3";

        // The Mind/Interior/Memory rooms that consume this endpoint are
        // already admin-gated (servePrivateDashboardPage). The substrate's
        // "private" scope just means "not surfaced on public pages" — for the
        // resident's own interior, we want the full topology.
        const [engramsRes, beliefsRes, threadsRes, edgesRes] = await Promise.all([
          supabaseAdmin
            .from("engrams")
            .select(
              "id, quote, prose, redacted_text, is_core, scope, stability, prior_stability, accessibility, strength, connections, reinforcement_count, last_reinforced_at, created_at",
            )
            .eq("resident_id", rid)
            .eq("state", "active")
            .order("stability", { ascending: false })
            .limit(500),
          supabaseAdmin
            .from("beliefs")
            .select("id, text, confidence, prior_confidence, cited_engram_ids, updated_at")
            .eq("resident_id", rid)
            .limit(200),
          supabaseAdmin
            .from("threads")
            .select("id, name, description, appearance_count, distinct_visitor_count, last_surfaced_at")
            .eq("resident_id", rid)
            .limit(200),
          supabaseAdmin.from("engram_edges").select("from_id, to_id, weight, type").limit(2000),
        ]);

        if (engramsRes.error || beliefsRes.error || threadsRes.error || edgesRes.error) {
          return Response.json(
            {
              ok: false,
              code: "query_failed",
              error:
                engramsRes.error?.message ||
                beliefsRes.error?.message ||
                threadsRes.error?.message ||
                edgesRes.error?.message,
            },
            { status: 500 },
          );
        }

        const engrams = engramsRes.data ?? [];
        const beliefs = beliefsRes.data ?? [];
        const threads = threadsRes.data ?? [];
        const allEdges = edgesRes.data ?? [];

        const engramIds = new Set(engrams.map((e) => e.id));

        const nodes = [
          ...engrams.map((e) => ({
            id: e.id,
            type: e.is_core ? "core" : "engram",
            label: (e.quote || e.redacted_text || e.prose || "").slice(0, 80),
            text: e.redacted_text || e.prose || e.quote || "",
            stability: e.stability,
            prior_stability: e.prior_stability,
            accessibility: e.accessibility,
            strength: e.strength,
            connections: e.connections,
            reinforcement_count: e.reinforcement_count,
            last_reinforced_at: e.last_reinforced_at,
            created_at: e.created_at,
          })),
          ...beliefs.map((b) => ({
            id: b.id,
            type: "belief" as const,
            label: (b.text || "").slice(0, 80),
            text: b.text,
            confidence: b.confidence,
            prior_confidence: b.prior_confidence,
            cited_engram_ids: b.cited_engram_ids,
            updated_at: b.updated_at,
          })),
          ...threads.map((t) => ({
            id: t.id,
            type: "thread" as const,
            label: t.name,
            text: t.description,
            appearance_count: t.appearance_count,
            distinct_visitor_count: t.distinct_visitor_count,
            last_surfaced_at: t.last_surfaced_at,
          })),
        ];

        // engram<->engram edges (filtered to those whose endpoints are in scope)
        const edges = allEdges
          .filter((e) => engramIds.has(e.from_id) && engramIds.has(e.to_id))
          .map((e) => ({
            from: e.from_id,
            to: e.to_id,
            weight: e.weight,
            type: e.type || "entangled_with",
          }));

        // belief -> cited engram edges (supported_by)
        for (const b of beliefs) {
          for (const eid of b.cited_engram_ids || []) {
            if (engramIds.has(eid)) {
              edges.push({ from: b.id, to: eid, weight: b.confidence ?? 0.5, type: "supported_by" });
            }
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            resident: rid,
            nodes,
            edges,
            counts: {
              engrams: engrams.length,
              beliefs: beliefs.length,
              threads: threads.length,
              edges: edges.length,
            },
          }),
          {
            headers: {
              "content-type": "application/json",
              "cache-control": "public, max-age=30, stale-while-revalidate=60",
            },
          },
        );
      },
    },
  },
});
