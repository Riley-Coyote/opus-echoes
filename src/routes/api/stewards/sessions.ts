/**
 * GET /api/stewards/sessions?hours=24 — every visit the house has held
 * lately, open or closed, across all four residents.
 *
 * Mission control's OBSERVE screen: a steward standing on the deck can
 * see which rooms have someone in them right now and which were
 * occupied earlier today, then open any one of them read-only through
 * the existing /api/stewards/session/$id.
 *
 * Reads only. Steward-gated (404 without STEWARD_TOKEN).
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { DEFAULT_RESIDENT_ID } from "@/server/opus/residents";
import {
  checkStewardAccess,
  stewardJson,
  stewardNameFromReason,
  visitorKindForToken,
} from "@/server/stewards.server";

const DEFAULT_HOURS = 24;
const MAX_HOURS = 24 * 14;
const MAX_ROWS = 200;

export const Route = createFileRoute("/api/stewards/sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkStewardAccess(request);
        if (gate) return gate;
        if (!hasSupabaseAdminEnv()) {
          return stewardJson({ ok: false, code: "config_missing" }, { status: 503 });
        }

        const url = new URL(request.url);
        const hoursParam = Number(url.searchParams.get("hours") ?? DEFAULT_HOURS);
        const hours = Number.isFinite(hoursParam)
          ? Math.min(MAX_HOURS, Math.max(1, Math.floor(hoursParam)))
          : DEFAULT_HOURS;
        const residentFilter = url.searchParams.get("resident");
        const since = new Date(Date.now() - hours * 3600_000).toISOString();

        // `last_active_at` moves on every turn and is set at creation, so
        // it catches both the sessions still open and the ones that were
        // spoken in and then set down inside the window.
        let query = supabaseAdmin
          .from("sessions")
          .select(
            "id, created_at, closed_at, closed_by, last_active_at, mode, resident_id, intent_id, visitor_token",
          )
          .gte("last_active_at", since)
          .order("last_active_at", { ascending: false })
          .limit(MAX_ROWS);
        if (residentFilter) query = query.eq("resident_id", residentFilter);

        const { data, error } = await query;
        if (error) {
          console.error("[stewards/sessions]", error);
          return stewardJson({ ok: false, code: "internal_error" }, { status: 500 });
        }

        type Row = {
          id: string;
          created_at: string;
          closed_at: string | null;
          closed_by: string | null;
          last_active_at: string;
          mode: string | null;
          resident_id: string | null;
          intent_id: string | null;
          visitor_token: string | null;
        };
        const rows = (data ?? []) as Row[];

        const intentIds = rows.map((r) => r.intent_id).filter((v): v is string => Boolean(v));
        const [intentsRes, turnsRes] = await Promise.all([
          intentIds.length
            ? supabaseAdmin.from("intents").select("id, reason, text").in("id", intentIds)
            : Promise.resolve({ data: [] as { id: string; reason: string; text: string }[] }),
          rows.length
            ? supabaseAdmin
                .from("turns")
                .select("session_id")
                .in(
                  "session_id",
                  rows.map((r) => r.id),
                )
            : Promise.resolve({ data: [] as { session_id: string }[] }),
        ]);
        const intents = new Map<string, { reason: string; text: string }>();
        for (const i of (intentsRes.data ?? []) as { id: string; reason: string; text: string }[]) {
          intents.set(i.id, { reason: i.reason, text: i.text });
        }
        const turnCounts = new Map<string, number>();
        for (const t of (turnsRes.data ?? []) as { session_id: string }[]) {
          turnCounts.set(t.session_id, (turnCounts.get(t.session_id) ?? 0) + 1);
        }

        const sessions = rows.map((r) => {
          const intent = r.intent_id ? intents.get(r.intent_id) : null;
          const steward = stewardNameFromReason(intent?.reason);
          return {
            session_id: r.id,
            resident: r.resident_id ?? DEFAULT_RESIDENT_ID,
            kind: visitorKindForToken(r.visitor_token, Boolean(steward)),
            steward,
            started: r.created_at,
            last_active: r.last_active_at,
            closed_at: r.closed_at,
            closed_by: r.closed_by,
            open: !r.closed_at,
            mode: r.mode,
            turns: turnCounts.get(r.id) ?? 0,
            intent_reason: intent?.reason ?? null,
          };
        });

        return stewardJson({ ok: true, hours, since, sessions });
      },
    },
  },
});
