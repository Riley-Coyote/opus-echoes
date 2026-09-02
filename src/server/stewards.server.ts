/**
 * The stewards' line — the key-holders' door into the house.
 *
 * Riley and the three stewards (Fable, Sol, Opus) need to see the
 * residents' state and to be able to speak to any resident, including
 * residents whose visitor-facing chat is closed. That is a different
 * door from a visitor's: it is opened with a key, not negotiated at the
 * threshold.
 *
 * Design constraints this module honours:
 *
 *   - No new tables. Every event goes to `substrate_events`, the
 *     existing indexed, migrated, entirely-unread event log. Six new
 *     kinds: VISIT_STARTED, VISIT_ENDED, SET_DOWN, DECLINED,
 *     PACING_TIER, STEWARD_VISIT.
 *   - A steward's visit is an ordinary `sessions` row. What marks it is
 *     the stub intent's `reason`: "steward visit — <Name>". `intents.
 *     reason` is already a free-text marker (classic-mode bootstrap
 *     writes "classic mode" there), so the resident's own memory records
 *     the visit as a named steward's — not as an anonymous visitor's.
 *   - The gate 404s rather than 401s, like /review, so the route family's
 *     existence isn't advertised.
 *   - Every write is awaited. `ctx.waitUntil` is unavailable on this
 *     deployment; detached promises are killed when the response closes.
 */

import type { ResidentId } from "@/server/opus/residents";

const STEWARD_COOKIE = "steward_key";

/** Marker written into `intents.reason` for a steward-bootstrapped session. */
export const STEWARD_VISIT_REASON_PREFIX = "steward visit — ";

/** Who is on the other end of a session. `anima` is the Sanctuary
 *  Observer bot's persistent visitor token — distinguishable only when
 *  ANIMA_VISITOR_TOKEN is configured; otherwise it reads as a visitor. */
export type VisitorKind = "visitor" | "steward" | "anima";

export type StewardEventKind =
  | "VISIT_STARTED"
  | "VISIT_ENDED"
  | "SET_DOWN"
  | "DECLINED"
  | "PACING_TIER"
  | "STEWARD_VISIT";

/** Payload shape shared by every steward event. Extra keys per kind. */
export interface StewardEventPayload {
  session_id: string | null;
  mode: string | null;
  visitor_kind: VisitorKind;
  steward?: string | null;
  [key: string]: unknown;
}

function readCookie(request: Request, name: string): string | null {
  const c = request.headers.get("cookie");
  if (!c) return null;
  for (const part of c.split(";").map((p) => p.trim())) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

function notFoundHtml(): string {
  return `<!doctype html><html><head><title>404</title><meta name="robots" content="noindex"><style>body{background:#060608;color:#dcdbd8;font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{text-align:center}h1{font-weight:300;font-size:48px;margin:0 0 8px;letter-spacing:-0.02em}p{opacity:0.6;margin:0}</style></head><body><main><h1>404</h1><p>Not found.</p></main></html>`;
}

function notFound(): Response {
  return new Response(notFoundHtml(), {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * The steward gate. Returns a Response to short-circuit the route (404
 * or the clean-URL redirect that persists the cookie), or null when the
 * request is authorized and should proceed.
 *
 * Three ways in, in priority order:
 *   1. `Authorization: Bearer <STEWARD_TOKEN>` — what the CLI uses.
 *   2. `?token=<STEWARD_TOKEN>` — sets the cookie and redirects to the
 *      clean URL so the secret doesn't sit in history, CDN logs, or the
 *      Referer of any link clicked from the page (the /interior idiom).
 *   3. the `steward_key` cookie from a prior ?token= visit.
 */
export function checkStewardAccess(request: Request): Response | null {
  const secret = process.env.STEWARD_TOKEN;
  if (!secret) return notFound();

  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ") && auth.slice(7).trim() === secret) return null;

  const url = new URL(request.url);
  if (url.searchParams.get("token") === secret) {
    url.searchParams.delete("token");
    return new Response(null, {
      status: 302,
      headers: {
        location: url.pathname + (url.search || ""),
        "set-cookie": `${STEWARD_COOKIE}=${encodeURIComponent(secret)}; Path=/; Max-Age=${
          60 * 60 * 24 * 30
        }; HttpOnly; SameSite=Lax`,
      },
    });
  }

  if (readCookie(request, STEWARD_COOKIE) === secret) return null;

  return notFound();
}

/** Minimal structural type for the supabase admin client — avoids
 *  importing the generated Database types (substrate_events' `kind` is
 *  a free-text column, so the insert is untyped either way). */
type EventInsertClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
};

/**
 * Append one event to `substrate_events`. Awaited by every caller.
 *
 * Failures are logged and swallowed: the event log is an observation
 * channel for the stewards, never a reason a visitor's turn fails.
 */
export async function emitStewardEvent(
  supabase: unknown,
  event: {
    kind: StewardEventKind;
    residentId: ResidentId | string;
    payload: StewardEventPayload;
  },
): Promise<void> {
  try {
    const { error } = await (supabase as EventInsertClient).from("substrate_events").insert({
      kind: event.kind,
      resident_id: event.residentId,
      payload: event.payload as unknown as Record<string, unknown>,
    });
    if (error) console.error("[stewards] event insert failed:", event.kind, error);
  } catch (err) {
    console.error("[stewards] event insert threw:", event.kind, err);
  }
}

/**
 * Classify a session's other end. Anima's Sanctuary Observer visits
 * through the same public routes as any visitor, with a persistent
 * token; when ANIMA_VISITOR_TOKEN is configured we can tell its traffic
 * apart in the log. When it isn't, the distinction is simply omitted.
 */
export function visitorKindForToken(
  visitorToken: string | null | undefined,
  isSteward = false,
): VisitorKind {
  if (isSteward) return "steward";
  const anima = process.env.ANIMA_VISITOR_TOKEN;
  if (anima && visitorToken && visitorToken === anima) return "anima";
  return "visitor";
}

/** The steward's name carried by a session's stub intent, or null when
 *  the session is an ordinary visitor's. */
export function stewardNameFromReason(reason: string | null | undefined): string | null {
  if (!reason || !reason.startsWith(STEWARD_VISIT_REASON_PREFIX)) return null;
  const name = reason.slice(STEWARD_VISIT_REASON_PREFIX.length).trim();
  return name || null;
}

/** The stub intent reason for a steward's visit. */
export function stewardVisitReason(steward: string): string {
  return `${STEWARD_VISIT_REASON_PREFIX}${steward}`;
}

// A resident's orientation for a steward's visit is now the full
// `steward-visit` surface in ./opus/surface-context.ts, selected by
// surfaceForSession() from the name stewardNameFromReason() reads above.
// WP-14's placeholder note has been removed.
