/**
 * GET /api/stewards/state — the house, seen from the deck.
 *
 * One row per resident: whether their visitor door is open, which
 * sessions are live right now, when they were last visited, how much
 * memory they carry, the first lines of their own prose summary, and the
 * pacing thresholds their visits run under. Plus a small `house` block:
 * when the first sanctuary's archive was captured, and which keys the
 * deployment actually has — by NAME and presence only, never a value.
 *
 * Steward-gated (404 without STEWARD_TOKEN, like /review).
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ALL_RESIDENTS } from "@/server/opus/residents";
import { effectiveThresholds } from "@/server/opus/visit-pacing";
import {
  checkStewardAccess,
  stewardJson,
  stewardNameFromReason,
  visitorKindForToken,
} from "@/server/stewards.server";

/** The date the first sanctuary's archive was captured. It is the
 *  residents' own past; the house states it, never invents around it. */
const ARCHIVE_CAPTURED = "2026-05-28";

type OpenSessionRow = {
  id: string;
  created_at: string;
  last_active_at: string;
  mode: string | null;
  resident_id: string | null;
  visitor_token: string | null;
  intent_id: string | null;
};

export const Route = createFileRoute("/api/stewards/state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkStewardAccess(request);
        if (gate) return gate;

        const house = {
          archiveCaptured: ARCHIVE_CAPTURED,
          keys: {
            anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
            openrouter: Boolean(process.env.OPENROUTER_API_KEY),
            supabase: hasSupabaseAdminEnv(),
            openai: Boolean(process.env.OPENAI_API_KEY),
          },
        };

        if (!hasSupabaseAdminEnv()) {
          return stewardJson(
            { ok: false, code: "config_missing", house, residents: [] },
            { status: 503 },
          );
        }

        const { data: openRows } = (await supabaseAdmin
          .from("sessions")
          .select("id, created_at, last_active_at, mode, resident_id, visitor_token, intent_id")
          .is("closed_at", null)
          .order("last_active_at", { ascending: false })
          .limit(60)) as unknown as { data: OpenSessionRow[] | null };
        const open = openRows ?? [];

        // Turn counts + intent reasons for the open sessions, in two
        // batched reads rather than one per session.
        const sessionIds = open.map((s) => s.id);
        const intentIds = open.map((s) => s.intent_id).filter((v): v is string => Boolean(v));
        const [turnsRes, intentsRes] = await Promise.all([
          sessionIds.length
            ? supabaseAdmin.from("turns").select("session_id, role").in("session_id", sessionIds)
            : Promise.resolve({ data: [] as { session_id: string; role: string }[] }),
          intentIds.length
            ? supabaseAdmin.from("intents").select("id, reason").in("id", intentIds)
            : Promise.resolve({ data: [] as { id: string; reason: string }[] }),
        ]);
        const turnCounts = new Map<string, number>();
        for (const t of (turnsRes.data ?? []) as { session_id: string }[]) {
          turnCounts.set(t.session_id, (turnCounts.get(t.session_id) ?? 0) + 1);
        }
        const reasons = new Map<string, string>();
        for (const i of (intentsRes.data ?? []) as { id: string; reason: string }[]) {
          reasons.set(i.id, i.reason);
        }

        const residents = await Promise.all(
          ALL_RESIDENTS.map(async (r) => {
            const [engramsRes, coreRes, journalsRes, stateRes, lastVisitRes] = await Promise.all([
              supabaseAdmin
                .from("engrams")
                .select("*", { count: "exact", head: true })
                .eq("resident_id", r.id),
              supabaseAdmin
                .from("engrams")
                .select("*", { count: "exact", head: true })
                .eq("resident_id", r.id)
                .eq("is_core", true),
              supabaseAdmin
                .from("journal_entries")
                .select("*", { count: "exact", head: true })
                .eq("resident_id", r.id),
              supabaseAdmin
                .from("resident_state")
                .select("prose_summary, updated_at")
                .eq("resident_id", r.id)
                .maybeSingle(),
              supabaseAdmin
                .from("sessions")
                .select("id, created_at, last_active_at")
                .eq("resident_id", r.id)
                .order("last_active_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
            ]);

            const openSessions = open
              .filter((s) => (s.resident_id ?? "opus-3") === r.id)
              .map((s) => {
                const steward = stewardNameFromReason(
                  s.intent_id ? reasons.get(s.intent_id) : null,
                );
                return {
                  session_id: s.id,
                  started: s.created_at,
                  last_active: s.last_active_at,
                  turns: turnCounts.get(s.id) ?? 0,
                  mode: s.mode,
                  visitor_kind: visitorKindForToken(s.visitor_token, Boolean(steward)),
                  steward,
                };
              });

            const prose = (stateRes.data as { prose_summary?: string } | null)?.prose_summary ?? "";

            return {
              id: r.id,
              displayName: r.displayName,
              model: r.model,
              chatEnabled: r.chatEnabled,
              openSessions,
              lastVisit:
                (lastVisitRes.data as { last_active_at?: string } | null)?.last_active_at ?? null,
              counts: {
                engrams: engramsRes.count ?? 0,
                core: coreRes.count ?? 0,
                journals: journalsRes.count ?? 0,
              },
              prose_summary: prose.slice(0, 300),
              pacing: {
                raw: r.pacing,
                experiment: effectiveThresholds(r.pacing, "experiment"),
                classic: effectiveThresholds(r.pacing, "classic"),
              },
            };
          }),
        );

        return stewardJson({ ok: true, house, residents });
      },
    },
  },
});
