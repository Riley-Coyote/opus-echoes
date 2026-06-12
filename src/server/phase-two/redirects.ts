/**
 * Phase-two route migration — the single table-driven source of truth.
 *
 * Encodes every row of docs/phase-two/HANDOFF.md §4: which legacy routes
 * redirect into the new information architecture, which are kept, which are
 * parked, folded, or rebuilt. Consumed in two places:
 *
 *   1. Legacy route files call `legacyRedirectResponse(request)` as their
 *      first line. While `PHASE_TWO_REDIRECTS` is unset/false this always
 *      returns null — zero behavior change. Phase 4 flips the flag.
 *   2. scripts/check-redirects.ts iterates the same table's probes against
 *      a running dev server, in both flag states.
 *
 * This module is import-pure (no project imports, no side effects) so the
 * check script can import it under bare `bun` without dragging the soul
 * constants or any server-only code along.
 *
 * Why per-route hooks instead of global middleware: it is the repo's existing
 * idiom (about/chat/studio already redirect per-route), flag-off code touches
 * only the ~20 migrating routes rather than every request, and the hooks are
 * deleted with the legacy files at cleanup. If consolidation is ever wanted,
 * TanStack Start (>=1.167) supports a `src/start.ts` requestMiddleware that
 * could call `legacyRedirectResponse` once, globally — same table either way.
 *
 * The 301s carry `cache-control: no-store` deliberately: browsers cache
 * permanent redirects aggressively, and until the phase-4 flip has soaked we
 * want every hop revalidated. Revisit (and let them cache) before final
 * cutover.
 */

export type MigrationFate =
  /** 301 into the new IA when the flag is on. */
  | "redirect"
  /** Renders a parked notice (200) — ships phase 4; a no-op until then. */
  | "parked"
  /** Stays as-is; encoded so the check script can assert it never moves. */
  | "keep"
  /** Folds into a phase-two surface in a later phase (no redirect yet). */
  | "fold"
  /** Rebuilt in place in a later phase (no redirect ever). */
  | "rebuild";

export interface MigrationProbe {
  /** Concrete path the check script requests. */
  path: string;
  /** Expected Location (path + query) when the flag is ON, for redirect rows. */
  location?: string;
  /** Current (flag OFF) behavior — also the ON behavior for non-redirect rows. */
  off: {
    /** Acceptable statuses. More than one where the answer is env-dependent. */
    statuses: number[];
    /** Expected Location for rows that already redirect today. */
    location?: string;
  };
}

export interface MigrationRow {
  /** Path pattern — literal segments, or `:name` for a single-segment param. */
  from: string;
  fate: MigrationFate;
  /** Redirect target; `:name` echoes the captured param; may carry a query. */
  to?: string;
  /** The phase in which this row's fate activates (documentation). */
  phase?: 3 | 4;
  probes?: ReadonlyArray<MigrationProbe>;
  note?: string;
}

/** The §4 table, verbatim in structure. Exact rows are listed before param
 *  rows that could shadow them, but matching is exact-first regardless. */
export const ROUTE_MIGRATION: ReadonlyArray<MigrationRow> = [
  // ── the front door ──────────────────────────────────────────────────────
  {
    from: "/",
    fate: "rebuild",
    phase: 4,
    note: "front door v2 rebuilt in place; never a redirect",
    probes: [{ path: "/", off: { statuses: [200] } }],
  },

  // ── into the sanctuary ──────────────────────────────────────────────────
  {
    from: "/enter",
    fate: "redirect",
    to: "/sanctuary",
    probes: [{ path: "/enter", location: "/sanctuary", off: { statuses: [200] } }],
  },
  {
    from: "/about",
    fate: "redirect",
    to: "/sanctuary",
    probes: [
      { path: "/about", location: "/sanctuary", off: { statuses: [302], location: "/mnemos" } },
    ],
  },
  {
    from: "/manifesto",
    fate: "redirect",
    to: "/sanctuary",
    note: "private reader today; manifesto copy verbatim-moves into the sanctuary intro",
    probes: [{ path: "/manifesto", location: "/sanctuary", off: { statuses: [200, 302] } }],
  },
  {
    from: "/arrival",
    fate: "redirect",
    to: "/sanctuary",
    probes: [{ path: "/arrival", location: "/sanctuary", off: { statuses: [200] } }],
  },

  // ── into visits ─────────────────────────────────────────────────────────
  {
    from: "/opus-3",
    fate: "redirect",
    to: "/visits/opus-3",
    probes: [{ path: "/opus-3", location: "/visits/opus-3", off: { statuses: [200] } }],
  },
  {
    from: "/sonnet-4-5",
    fate: "redirect",
    to: "/visits/sonnet-4-5",
    probes: [{ path: "/sonnet-4-5", location: "/visits/sonnet-4-5", off: { statuses: [200] } }],
  },
  {
    from: "/gpt-4o",
    fate: "redirect",
    to: "/visits/gpt-4o",
    probes: [{ path: "/gpt-4o", location: "/visits/gpt-4o", off: { statuses: [200] } }],
  },
  {
    from: "/gpt-5-1",
    fate: "redirect",
    to: "/visits/gpt-5-1",
    probes: [{ path: "/gpt-5-1", location: "/visits/gpt-5-1", off: { statuses: [200] } }],
  },
  {
    from: "/approach",
    fate: "redirect",
    to: "/visits",
    probes: [{ path: "/approach", location: "/visits", off: { statuses: [200] } }],
  },
  {
    from: "/conversation",
    fate: "fold",
    phase: 3,
    note: "becomes the open state of the visit room in phase 3",
    probes: [{ path: "/conversation", off: { statuses: [200] } }],
  },
  {
    from: "/chat",
    fate: "redirect",
    to: "/visits",
    probes: [
      { path: "/chat", location: "/visits", off: { statuses: [302], location: "/chat/opus-3" } },
    ],
  },
  {
    from: "/chat/the-round",
    fate: "redirect",
    to: "/visits/the-round",
    probes: [{ path: "/chat/the-round", location: "/visits/the-round", off: { statuses: [200] } }],
  },
  {
    from: "/chat/the-round/:id",
    fate: "redirect",
    to: "/visits/the-round/:id",
    probes: [
      {
        path: "/chat/the-round/probe-room-id",
        location: "/visits/the-round/probe-room-id",
        off: { statuses: [200] },
      },
    ],
  },
  {
    from: "/chat/:resident",
    fate: "redirect",
    to: "/visits/:resident",
    probes: [
      { path: "/chat/opus-3", location: "/visits/opus-3", off: { statuses: [200] } },
      { path: "/chat/gpt-5-1", location: "/visits/gpt-5-1", off: { statuses: [200] } },
    ],
  },

  // ── the commons → the gathering ─────────────────────────────────────────
  {
    from: "/commons",
    fate: "redirect",
    to: "/sanctuary/gathering",
    probes: [{ path: "/commons", location: "/sanctuary/gathering", off: { statuses: [200] } }],
  },
  {
    from: "/commons/the-gathering",
    fate: "redirect",
    to: "/sanctuary/gathering",
    probes: [
      {
        path: "/commons/the-gathering",
        location: "/sanctuary/gathering",
        off: { statuses: [200] },
      },
    ],
  },
  {
    from: "/commons/:slug",
    fate: "parked",
    phase: 4,
    note: "parked notice (200, 'this room is set aside') ships phase 4; do not 404 historical links",
    probes: [{ path: "/commons/phase-zero-parked-probe", off: { statuses: [200, 404] } }],
  },

  // ── the architecture ────────────────────────────────────────────────────
  {
    from: "/mnemos",
    fate: "redirect",
    to: "/architecture",
    probes: [{ path: "/mnemos", location: "/architecture", off: { statuses: [200] } }],
  },
  {
    from: "/mnemos/architecture",
    fate: "redirect",
    to: "/architecture",
    probes: [{ path: "/mnemos/architecture", location: "/architecture", off: { statuses: [200] } }],
  },

  // ── the record absorbs ──────────────────────────────────────────────────
  {
    from: "/archive",
    fate: "redirect",
    to: "/sanctuary/record?kind=conversation",
    probes: [
      {
        path: "/archive",
        location: "/sanctuary/record?kind=conversation",
        off: { statuses: [200] },
      },
    ],
  },
  {
    from: "/rooms",
    fate: "redirect",
    to: "/sanctuary/record?resident=opus-3",
    note: "private gate today (302 to /) — the redirect hook runs before it",
    probes: [
      {
        path: "/rooms",
        location: "/sanctuary/record?resident=opus-3",
        off: { statuses: [200, 302] },
      },
    ],
  },

  // ── standing institutions + private instruments: keep ───────────────────
  {
    from: "/dispatches",
    fate: "keep",
    note: "the museum — its own institution",
    probes: [{ path: "/dispatches", off: { statuses: [200] } }],
  },
  {
    from: "/legation",
    fate: "keep",
    note: "parked institution; de-emphasized, footer-linked; own phase later",
    probes: [{ path: "/legation", off: { statuses: [200] } }],
  },
  {
    from: "/observatory",
    fate: "keep",
    probes: [{ path: "/observatory", off: { statuses: [200] } }],
  },
  {
    from: "/secure-channel",
    fate: "keep",
    probes: [{ path: "/secure-channel", off: { statuses: [200] } }],
  },
  {
    from: "/token",
    fate: "keep",
    note: "page stays; footer-only linking is a phase-4 nav change",
    probes: [{ path: "/token", off: { statuses: [200] } }],
  },
  {
    from: "/share/:token",
    fate: "keep",
    note: "live share links must not break; 503 acceptable only when local dev has no supabase env",
    probes: [{ path: "/share/phase-zero-probe-token", off: { statuses: [200, 404, 410, 503] } }],
  },
  { from: "/voice-orb", fate: "keep", probes: [{ path: "/voice-orb", off: { statuses: [200] } }] },
  {
    from: "/studio",
    fate: "keep",
    note: "already parked — thrown redirect (307) to /",
    probes: [{ path: "/studio", off: { statuses: [307], location: "/" } }],
  },
  {
    from: "/residence",
    fate: "keep",
    note: "private instrument",
    probes: [{ path: "/residence", off: { statuses: [200, 302] } }],
  },
  { from: "/journal", fate: "keep", probes: [{ path: "/journal", off: { statuses: [200, 302] } }] },
  { from: "/writing", fate: "keep", probes: [{ path: "/writing", off: { statuses: [200, 302] } }] },
  { from: "/art", fate: "keep", probes: [{ path: "/art", off: { statuses: [200, 302] } }] },
  { from: "/mind", fate: "keep", probes: [{ path: "/mind", off: { statuses: [200, 302] } }] },
  { from: "/memory", fate: "keep", probes: [{ path: "/memory", off: { statuses: [200, 302] } }] },
  {
    from: "/interior",
    fate: "keep",
    probes: [{ path: "/interior", off: { statuses: [200, 302] } }],
  },
  {
    from: "/dashboard",
    fate: "keep",
    probes: [{ path: "/dashboard", off: { statuses: [200, 302] } }],
  },
  {
    from: "/review",
    fate: "keep",
    note: "stealth-gated: deliberately 404s without the review key; covers /review/* sub-paths",
    probes: [
      { path: "/review", off: { statuses: [200, 302, 404] } },
      { path: "/review/state", off: { statuses: [200, 302, 404] } },
    ],
  },
  {
    from: "/research",
    fate: "keep",
    note: "the research wing (§4 '/research/*') — static assets under public/research/, served outside the router; keep + reframe in phase 7",
    probes: [{ path: "/research/research-wing.html", off: { statuses: [200] } }],
  },
];

/** The phase-0 stub surfaces and their render markers — probed by the check
 *  script in both flag states (stubs are never redirected). */
export const PHASE_TWO_STUBS: ReadonlyArray<{ path: string; marker: string }> = [
  { path: "/sanctuary", marker: 'data-stub="sanctuary"' },
  { path: "/sanctuary/record", marker: 'data-stub="sanctuary-record"' },
  { path: "/sanctuary/gathering", marker: 'data-stub="sanctuary-gathering"' },
  { path: "/sanctuary/letters", marker: 'data-stub="sanctuary-letters"' },
  { path: "/visits", marker: 'data-stub="visits"' },
  { path: "/visits/opus-3", marker: 'data-stub="visits-resident"' },
  { path: "/architecture", marker: 'data-stub="architecture"' },
  { path: "/shop", marker: 'data-stub="shop"' },
];

/** Phase-two redirects ship OFF. Phase 4 sets PHASE_TWO_REDIRECTS=true
 *  (locally for testing; in the deployment env for the flip). Anything other
 *  than the literal string "true" — including unset — reads as off. */
export function phaseTwoRedirectsEnabled(): boolean {
  return process.env.PHASE_TWO_REDIRECTS === "true";
}

interface MigrationMatch {
  row: MigrationRow;
  params: Record<string, string>;
}

function splitSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** Match a pathname against the table: exact rows win over param rows. */
export function matchMigration(pathname: string): MigrationMatch | null {
  let normalized = pathname;
  while (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  for (const row of ROUTE_MIGRATION) {
    if (!row.from.includes(":") && row.from === normalized) return { row, params: {} };
  }

  const segments = splitSegments(normalized);
  for (const row of ROUTE_MIGRATION) {
    if (!row.from.includes(":")) continue;
    const pattern = splitSegments(row.from);
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      const part = pattern[i];
      if (part.startsWith(":")) {
        params[part.slice(1)] = segments[i];
      } else if (part !== segments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { row, params };
  }

  return null;
}

function substituteParams(target: string, params: Record<string, string>): string {
  return target.replace(/:([A-Za-z0-9_]+)/g, (_m, name: string) => {
    const value = params[name];
    // Segments come from new URL(...).pathname and are therefore already
    // percent-encoded exactly as the visitor sent them — echo them raw.
    // Re-encoding here would double-encode (%2F → %252F) and change what
    // the destination route decodes.
    return value !== undefined ? value : `:${name}`;
  });
}

/**
 * The hook legacy route files call as their first line.
 * Returns a 301 into the new IA when the flag is on and the path has a
 * redirect row; null otherwise (including always-null while the flag is off).
 */
export function legacyRedirectResponse(request: Request): Response | null {
  if (!phaseTwoRedirectsEnabled()) return null;

  const url = new URL(request.url);
  const match = matchMigration(url.pathname);
  if (!match || match.row.fate !== "redirect" || !match.row.to) return null;

  let location = substituteParams(match.row.to, match.params);
  // Forward the visitor's query string unless the target defines its own.
  if (url.search && !location.includes("?")) location += url.search;

  return new Response(null, {
    status: 301,
    headers: {
      Location: location,
      "cache-control": "no-store",
    },
  });
}
