/**
 * GET /api/stewards/events?since=<iso>&limit=<n> — the house's event log.
 *
 * Newest-first rows from `substrate_events`. The log is shared with the
 * substrate's own kinds (ENGRAM_PROMOTED, CONNECTION_DISCOVERED, …) —
 * `?kinds=` narrows it when a steward only wants the visit line.
 *
 * `since` is an ISO timestamp (what the page and the CLI's --follow pass
 * back from the newest row they've already seen).
 *
 * Steward-gated (404 without STEWARD_TOKEN).
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { checkStewardAccess, stewardJson } from "@/server/stewards.server";

const MAX_LIMIT = 200;

export const Route = createFileRoute("/api/stewards/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkStewardAccess(request);
        if (gate) return gate;
        if (!hasSupabaseAdminEnv()) {
          return stewardJson({ ok: false, code: "config_missing" }, { status: 503 });
        }

        const url = new URL(request.url);
        const since = url.searchParams.get("since");
        const resident = url.searchParams.get("resident");
        const kinds = (url.searchParams.get("kinds") ?? "")
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
        const limitParam = Number(url.searchParams.get("limit") ?? 50);
        const limit = Number.isFinite(limitParam)
          ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitParam)))
          : 50;

        let query = supabaseAdmin
          .from("substrate_events")
          .select("id, kind, resident_id, payload, created_at, handled_at")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (since) {
          const t = new Date(since);
          if (Number.isNaN(t.getTime())) {
            return stewardJson({ ok: false, code: "bad_since" }, { status: 400 });
          }
          query = query.gt("created_at", t.toISOString());
        }
        if (resident) query = query.eq("resident_id", resident);
        if (kinds.length) query = query.in("kind", kinds);

        const { data, error } = await query;
        if (error) {
          console.error("[stewards/events]", error);
          return stewardJson({ ok: false, code: "internal_error" }, { status: 500 });
        }

        const events = data ?? [];
        return stewardJson({
          ok: true,
          events,
          newest: events.length ? events[0].created_at : (since ?? null),
        });
      },
    },
  },
});
