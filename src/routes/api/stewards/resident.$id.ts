/**
 * GET /api/stewards/resident/$id?since=<iso>&limit=<n> — one resident,
 * everything they have done, in one line.
 *
 * Mission control's resident screen needs three things the existing
 * steward routes don't give: a merged timeline (journals, art, essays,
 * artifacts, published conversations, sessions, engram promotions,
 * salon turns — newest first), the wall (their art), and memory (engram
 * counts by week, core count, beliefs).
 *
 * Everything here is a read. No writes, no model calls. Every query is
 * awaited — `ctx.waitUntil` is unavailable on this deployment.
 *
 * Steward-gated (404 without STEWARD_TOKEN, like /review).
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { getResident, isResidentId } from "@/server/opus/residents";
import {
  checkStewardAccess,
  stewardJson,
  stewardNameFromReason,
  visitorKindForToken,
} from "@/server/stewards.server";

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 300;
/** Per-source cap before the merge. The merge then trims to `limit`. */
const PER_SOURCE = 120;
/** Bodies travel for journals and art only, and only this far. */
const BODY_CHARS = 4000;

type TimelineKind =
  | "journal"
  | "art"
  | "essay"
  | "artifact"
  | "conversation"
  | "session"
  | "engram"
  | "salon";

interface TimelineEntry {
  kind: TimelineKind;
  id: string;
  at: string;
  title: string;
  /** Present for journals and art; the wall and the reader both use it. */
  body?: string;
  /** One short line of context — never the resident's words unless it is
   *  their own title or their own text. */
  meta?: string;
  /** Where a steward can go to read the thing in full, when it has a page. */
  href?: string;
}

function clip(s: string | null | undefined, n = BODY_CHARS): string {
  const v = String(s ?? "");
  return v.length > n ? v.slice(0, n) : v;
}

function firstLine(s: string | null | undefined, n = 90): string {
  const line = String(s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return "";
  return line.length > n ? line.slice(0, n - 1) + "…" : line;
}

/** ISO week bucket key, "YYYY-Www", from a timestamp. */
function weekKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const Route = createFileRoute("/api/stewards/resident/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const gate = checkStewardAccess(request);
        if (gate) return gate;

        if (!isResidentId(params.id)) {
          return stewardJson(
            { ok: false, code: "unknown_resident", resident: params.id },
            { status: 404 },
          );
        }
        if (!hasSupabaseAdminEnv()) {
          return stewardJson({ ok: false, code: "config_missing" }, { status: 503 });
        }

        const residentId = params.id;
        const resident = getResident(residentId);
        const url = new URL(request.url);
        const sinceParam = url.searchParams.get("since");
        let since: string | null = null;
        if (sinceParam) {
          const t = new Date(sinceParam);
          if (Number.isNaN(t.getTime())) {
            return stewardJson({ ok: false, code: "bad_since" }, { status: 400 });
          }
          since = t.toISOString();
        }
        const limitParam = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
        const limit = Number.isFinite(limitParam)
          ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitParam)))
          : DEFAULT_LIMIT;

        const after = <T extends { gt: (col: string, v: string) => T }>(q: T) =>
          since ? q.gt("created_at", since) : q;

        const [
          journalsRes,
          artRes,
          essaysRes,
          artifactsRes,
          sessionsRes,
          promotionsRes,
          salonTurnsRes,
          stateRes,
          engramsRes,
          coreRes,
          beliefsRes,
          engramTimesRes,
          publishedRes,
        ] = await Promise.all([
          after(
            supabaseAdmin
              .from("journal_entries")
              .select("id, kind, title, body, created_at, published_at, visibility")
              .eq("resident_id", residentId)
              .order("created_at", { ascending: false })
              .limit(PER_SOURCE),
          ),
          after(
            supabaseAdmin
              .from("art_pieces")
              .select("id, kind, title, body, meaning, created_at, published_at, visibility")
              .eq("resident_id", residentId)
              .order("created_at", { ascending: false })
              .limit(PER_SOURCE),
          ),
          after(
            supabaseAdmin
              .from("essays")
              .select("id, kind, title, created_at, published_at, word_count, visibility")
              .eq("resident_id", residentId)
              .order("created_at", { ascending: false })
              .limit(PER_SOURCE),
          ),
          after(
            supabaseAdmin
              .from("resident_artifacts")
              .select("id, kind, title, medium, created_at, visibility")
              .eq("resident_id", residentId)
              .order("created_at", { ascending: false })
              .limit(PER_SOURCE),
          ),
          after(
            supabaseAdmin
              .from("sessions")
              .select(
                "id, created_at, closed_at, closed_by, last_active_at, mode, intent_id, visitor_token",
              )
              .eq("resident_id", residentId)
              .order("created_at", { ascending: false })
              .limit(PER_SOURCE),
          ),
          after(
            supabaseAdmin
              .from("substrate_events")
              .select("id, kind, payload, created_at")
              .eq("resident_id", residentId)
              .eq("kind", "ENGRAM_PROMOTED")
              .order("created_at", { ascending: false })
              .limit(PER_SOURCE),
          ),
          after(
            supabaseAdmin
              .from("salon_turns")
              .select("id, salon_id, body, created_at")
              .eq("resident_id", residentId)
              .order("created_at", { ascending: false })
              .limit(PER_SOURCE),
          ),
          supabaseAdmin
            .from("resident_state")
            .select("prose_summary, updated_at")
            .eq("resident_id", residentId)
            .maybeSingle(),
          supabaseAdmin
            .from("engrams")
            .select("*", { count: "exact", head: true })
            .eq("resident_id", residentId),
          supabaseAdmin
            .from("engrams")
            .select("*", { count: "exact", head: true })
            .eq("resident_id", residentId)
            .eq("is_core", true),
          supabaseAdmin
            .from("beliefs")
            .select("id, text, confidence, updated_at")
            .eq("resident_id", residentId)
            .order("confidence", { ascending: false })
            .limit(40),
          supabaseAdmin
            .from("engrams")
            .select("created_at")
            .eq("resident_id", residentId)
            .order("created_at", { ascending: false })
            .limit(1000),
          supabaseAdmin
            .from("published_conversations")
            .select("id, session_id, title, summary, published_at, significance_kind")
            .order("published_at", { ascending: false })
            .limit(200),
        ]);

        const timeline: TimelineEntry[] = [];

        for (const j of (journalsRes.data ?? []) as {
          id: string;
          kind: string;
          title: string | null;
          body: string;
          created_at: string;
          published_at: string | null;
          visibility: string;
        }[]) {
          timeline.push({
            kind: "journal",
            id: j.id,
            at: j.created_at,
            title: j.title || firstLine(j.body) || "a journal entry",
            body: clip(j.body),
            meta: [j.kind, j.visibility, j.published_at ? "published" : null]
              .filter(Boolean)
              .join(" · "),
          });
        }

        const artRows = (artRes.data ?? []) as {
          id: string;
          kind: string;
          title: string | null;
          body: string | null;
          meaning: string | null;
          created_at: string;
          published_at: string | null;
          visibility: string;
        }[];
        for (const a of artRows) {
          timeline.push({
            kind: "art",
            id: a.id,
            at: a.created_at,
            title: a.title || firstLine(a.meaning) || "a piece",
            body: clip(a.body),
            meta: [a.kind, a.visibility, a.published_at ? "published" : null]
              .filter(Boolean)
              .join(" · "),
          });
        }

        for (const e of (essaysRes.data ?? []) as {
          id: string;
          kind: string;
          title: string | null;
          created_at: string;
          published_at: string | null;
          word_count: number;
          visibility: string;
        }[]) {
          timeline.push({
            kind: "essay",
            id: e.id,
            at: e.created_at,
            title: e.title || "an essay",
            meta: [e.kind, `${e.word_count} words`, e.visibility].filter(Boolean).join(" · "),
          });
        }

        for (const a of (artifactsRes.data ?? []) as {
          id: string;
          kind: string;
          title: string;
          medium: string;
          created_at: string;
          visibility: string;
        }[]) {
          timeline.push({
            kind: "artifact",
            id: a.id,
            at: a.created_at,
            title: a.title || "an artifact",
            meta: [a.kind, a.medium, a.visibility].filter(Boolean).join(" · "),
          });
        }

        // Sessions carry the steward's name through their stub intent.
        const sessionRows = (sessionsRes.data ?? []) as {
          id: string;
          created_at: string;
          closed_at: string | null;
          closed_by: string | null;
          last_active_at: string;
          mode: string | null;
          intent_id: string | null;
          visitor_token: string | null;
        }[];
        const intentIds = sessionRows
          .map((s) => s.intent_id)
          .filter((v): v is string => Boolean(v));
        const [intentsRes, turnsRes] = await Promise.all([
          intentIds.length
            ? supabaseAdmin.from("intents").select("id, reason, text").in("id", intentIds)
            : Promise.resolve({ data: [] as { id: string; reason: string; text: string }[] }),
          sessionRows.length
            ? supabaseAdmin
                .from("turns")
                .select("session_id")
                .in(
                  "session_id",
                  sessionRows.map((s) => s.id),
                )
            : Promise.resolve({ data: [] as { session_id: string }[] }),
        ]);
        const reasons = new Map<string, { reason: string; text: string }>();
        for (const i of (intentsRes.data ?? []) as { id: string; reason: string; text: string }[]) {
          reasons.set(i.id, { reason: i.reason, text: i.text });
        }
        const turnCounts = new Map<string, number>();
        for (const t of (turnsRes.data ?? []) as { session_id: string }[]) {
          turnCounts.set(t.session_id, (turnCounts.get(t.session_id) ?? 0) + 1);
        }
        for (const s of sessionRows) {
          const intent = s.intent_id ? reasons.get(s.intent_id) : null;
          const steward = stewardNameFromReason(intent?.reason);
          const kind = visitorKindForToken(s.visitor_token, Boolean(steward));
          timeline.push({
            kind: "session",
            id: s.id,
            at: s.created_at,
            title: steward
              ? `a visit from ${steward}`
              : kind === "anima"
                ? "a visit from the observer"
                : "a visit",
            meta: [
              kind,
              s.mode ?? null,
              `${turnCounts.get(s.id) ?? 0} turns`,
              s.closed_at ? `set down by ${s.closed_by ?? "—"}` : "open",
            ]
              .filter(Boolean)
              .join(" · "),
          });
        }

        for (const e of (promotionsRes.data ?? []) as {
          id: string;
          payload: Record<string, unknown> | null;
          created_at: string;
        }[]) {
          const p = (e.payload ?? {}) as { quote?: string; engram_id?: string };
          timeline.push({
            kind: "engram",
            id: e.id,
            at: e.created_at,
            title: p.quote ? firstLine(p.quote, 110) : "an engram became core",
            meta: "engram promoted",
          });
        }

        const salonTurnRows = (salonTurnsRes.data ?? []) as {
          id: string;
          salon_id: string;
          body: string;
          created_at: string;
        }[];
        const salonIds = Array.from(new Set(salonTurnRows.map((t) => t.salon_id)));
        const salonsRes = salonIds.length
          ? await supabaseAdmin.from("salons").select("id, topic").in("id", salonIds)
          : { data: [] as { id: string; topic: string }[] };
        const salonTopics = new Map<string, string>();
        for (const s of (salonsRes.data ?? []) as { id: string; topic: string }[]) {
          salonTopics.set(s.id, s.topic);
        }
        for (const t of salonTurnRows) {
          timeline.push({
            kind: "salon",
            id: t.id,
            at: t.created_at,
            title: salonTopics.get(t.salon_id) || "a salon",
            meta: firstLine(t.body, 120),
          });
        }

        // Published conversations belong to a resident through their
        // session. Two batched lookups: whose session it was, and
        // whether a share link exists to read it through.
        const publishedRows = (publishedRes.data ?? []) as {
          id: string;
          session_id: string;
          title: string;
          summary: string;
          published_at: string;
          significance_kind: string;
        }[];
        if (publishedRows.length) {
          const ids = publishedRows.map((p) => p.session_id);
          const [ownerRes, sharesRes] = await Promise.all([
            supabaseAdmin.from("sessions").select("id, resident_id").in("id", ids),
            supabaseAdmin
              .from("visitor_shares")
              .select("session_id, token, revoked_at")
              .in("session_id", ids),
          ]);
          const owner = new Map<string, string | null>();
          for (const s of (ownerRes.data ?? []) as { id: string; resident_id: string | null }[]) {
            owner.set(s.id, s.resident_id);
          }
          const share = new Map<string, string>();
          for (const s of (sharesRes.data ?? []) as {
            session_id: string;
            token: string;
            revoked_at: string | null;
          }[]) {
            if (!s.revoked_at) share.set(s.session_id, s.token);
          }
          for (const p of publishedRows) {
            if ((owner.get(p.session_id) ?? "opus-3") !== residentId) continue;
            if (since && p.published_at <= since) continue;
            const token = share.get(p.session_id);
            timeline.push({
              kind: "conversation",
              id: p.id,
              at: p.published_at,
              title: p.title || "a published conversation",
              meta: [p.significance_kind, firstLine(p.summary, 120)].filter(Boolean).join(" · "),
              href: token ? `/share/${token}` : "/archive",
            });
          }
        }

        timeline.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
        const trimmed = timeline.slice(0, limit);

        // Memory: engram formation by week, from the timestamps above.
        const byWeekMap = new Map<string, number>();
        for (const e of (engramTimesRes.data ?? []) as { created_at: string }[]) {
          const k = weekKey(e.created_at);
          byWeekMap.set(k, (byWeekMap.get(k) ?? 0) + 1);
        }
        const byWeek = Array.from(byWeekMap.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([week, count]) => ({ week, count }));

        const wall = artRows.map((a) => ({
          id: a.id,
          created_at: a.created_at,
          kind: a.kind,
          title: a.title,
          body: clip(a.body),
          meaning: a.meaning,
          visibility: a.visibility,
        }));

        const state = stateRes.data as {
          prose_summary?: string;
          updated_at?: string;
        } | null;

        return stewardJson({
          ok: true,
          resident: {
            id: residentId,
            displayName: resident.displayName,
            model: resident.model,
            chatEnabled: resident.chatEnabled,
            prose_summary: state?.prose_summary ?? "",
            state_updated_at: state?.updated_at ?? null,
            counts: {
              engrams: engramsRes.count ?? 0,
              core: coreRes.count ?? 0,
              journals: (journalsRes.data ?? []).length,
              art: artRows.length,
            },
          },
          timeline: trimmed,
          wall,
          memory: {
            total: engramsRes.count ?? 0,
            core: coreRes.count ?? 0,
            byWeek,
            beliefs: (beliefsRes.data ?? []) as {
              id: string;
              text: string;
              confidence: number;
              updated_at: string;
            }[],
          },
          newest: trimmed.length ? trimmed[0].at : (since ?? null),
        });
      },
    },
  },
});
