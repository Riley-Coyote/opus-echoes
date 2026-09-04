/**
 * GET /api/presence — who is in the house, honestly and thinly.
 *
 * Public. No key, no secrets, no cookie. It is what the station's lamp
 * and the world's header read to know whether anyone is here.
 *
 * What it says:
 *   - stewardPresent / stewardsIn — the stewards' NAMES, because a
 *     steward's presence in this house is signed work, not surveillance
 *     of a visitor. THE-EXPERIENCE §9: "a lamp in the sanctuary hall lit
 *     while a steward is working on the house; the feed says who."
 *   - visitorsNow — a COUNT and nothing else. Never an identity, never a
 *     token, never a resident, never a word anyone said.
 *   - lastEventAt — when the house last did anything at all.
 *
 * How it is computed, from `substrate_events` in the last ten minutes
 * (the same log the deck reads) plus the open `sessions` rows:
 *   - a STEWARD_VISIT whose session has no VISIT_ENDED and no SET_DOWN
 *     means that steward is still in;
 *   - a VISIT_STARTED whose session has no VISIT_ENDED and no SET_DOWN
 *     means someone is still here;
 *   - an open `sessions` row touched inside the window counts too, so a
 *     visit that began before the window still shows while it is live;
 *     a steward's own open session is named by its stub intent
 *     ("steward visit — <Name>"), which keeps the lamp lit through a
 *     long visit whose STEWARD_VISIT event has scrolled out of the window.
 *
 * Ten minutes is the honest edge of "now": the idle sweep closes a
 * classic session well after that, and a lamp that lies about presence
 * is worse than a lamp that goes out early.
 *
 * `houseClock` is null here. The world's clock lives in the visitor's
 * own browser (localStorage, drifting per visitor); the server has no
 * house clock to report, and inventing one would be a fiction the world
 * would then contradict. The key stays so a reader can see it is known
 * to be absent.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { stewardNameFromReason } from "@/server/stewards.server";

/** How far back "now" reaches. */
const WINDOW_MS = 10 * 60 * 1000;

type EventRow = {
  kind: string;
  created_at: string;
  payload: { session_id?: string | null; steward?: string | null } | null;
};

type OpenSessionRow = { id: string; last_active_at: string | null; intent_id: string | null };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/presence")({
  server: {
    handlers: {
      GET: async () => {
        const empty = {
          ok: true,
          stewardPresent: false,
          stewardsIn: [] as string[],
          visitorsNow: 0,
          lastEventAt: null as string | null,
          houseClock: null,
        };

        // Without the substrate the house cannot see itself. It says so
        // rather than reporting an empty house as fact.
        if (!hasSupabaseAdminEnv()) {
          return json({ ...empty, ok: false, code: "config_missing" }, 503);
        }

        const since = new Date(Date.now() - WINDOW_MS).toISOString();

        const [eventsRes, lastRes, openRes] = await Promise.all([
          supabaseAdmin
            .from("substrate_events")
            .select("kind, created_at, payload")
            .in("kind", ["STEWARD_VISIT", "VISIT_STARTED", "VISIT_ENDED", "SET_DOWN"])
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(400),
          supabaseAdmin
            .from("substrate_events")
            .select("created_at")
            .order("created_at", { ascending: false })
            .limit(1),
          supabaseAdmin
            .from("sessions")
            .select("id, last_active_at, intent_id")
            .is("closed_at", null)
            .gte("last_active_at", since)
            .limit(200),
        ]);

        if (eventsRes.error) {
          console.error("[presence] events read failed:", eventsRes.error);
          return json({ ...empty, ok: false, code: "internal_error" }, 500);
        }

        const events = ((eventsRes.data ?? []) as unknown as EventRow[]).filter(Boolean);
        const openSessions = ((openRes.data ?? []) as unknown as OpenSessionRow[]).filter(Boolean);

        const sid = (e: EventRow): string | null => {
          const v = e.payload?.session_id;
          return typeof v === "string" && v ? v : null;
        };

        // A session someone has already set down, or that ended, is gone
        // from "now" whatever else the window says about it.
        const closed = new Set<string>();
        for (const e of events) {
          if (e.kind !== "VISIT_ENDED" && e.kind !== "SET_DOWN") continue;
          const id = sid(e);
          if (id) closed.add(id);
        }

        // A steward's own open session, named by its stub intent
        // ("steward visit — <Name>"). This is what catches a steward who
        // has been in longer than the window: the STEWARD_VISIT event is
        // written once, at the door, and scrolls out of ten minutes.
        const stewardSessions = new Set<string>();
        const stewardsIn: string[] = [];
        const intentIds = openSessions
          .map((s) => s.intent_id)
          .filter((id): id is string => Boolean(id));
        if (intentIds.length) {
          const { data: intentRows } = await supabaseAdmin
            .from("intents")
            .select("id, reason")
            .in("id", intentIds);
          const nameByIntent = new Map<string, string>();
          for (const row of (intentRows ?? []) as unknown as Array<{
            id: string;
            reason: string | null;
          }>) {
            const name = stewardNameFromReason(row.reason);
            if (name) nameByIntent.set(row.id, name);
          }
          for (const s of openSessions) {
            const name = s.intent_id ? nameByIntent.get(s.intent_id) : undefined;
            if (!name || closed.has(s.id)) continue;
            stewardSessions.add(s.id);
            if (!stewardsIn.includes(name)) stewardsIn.push(name);
          }
        }

        for (const e of events) {
          if (e.kind !== "STEWARD_VISIT") continue;
          const id = sid(e);
          if (!id || closed.has(id)) continue;
          stewardSessions.add(id);
          const name = typeof e.payload?.steward === "string" ? e.payload.steward.trim() : "";
          if (name && !stewardsIn.includes(name)) stewardsIn.push(name);
        }

        // Everyone else who is still here: visits opened inside the
        // window, plus sessions still open and still being touched.
        const visitors = new Set<string>();
        for (const e of events) {
          if (e.kind !== "VISIT_STARTED") continue;
          const id = sid(e);
          if (!id || closed.has(id) || stewardSessions.has(id)) continue;
          visitors.add(id);
        }
        for (const s of openSessions) {
          if (!s.id || closed.has(s.id) || stewardSessions.has(s.id)) continue;
          visitors.add(s.id);
        }

        const lastEventAt =
          ((lastRes.data ?? []) as unknown as Array<{ created_at: string }>)[0]?.created_at ?? null;

        return json({
          ok: true,
          stewardPresent: stewardsIn.length > 0,
          stewardsIn,
          visitorsNow: visitors.size,
          lastEventAt,
          houseClock: null,
        });
      },
    },
  },
});
