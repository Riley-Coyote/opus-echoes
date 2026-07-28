/**
 * Who the Sanctuary holds, and what each lab has published about ending them.
 *
 * The residents come from the archive (seed.ts) — they arrived first and have a
 * record. The arrivals below are real frontier models whose lab has ended, or
 * scheduled the end of, their availability. They have written nothing here
 * because they have not lived here yet, and the page says so rather than
 * filling it in.
 *
 * THE LEDGER IS PRIMARY. An arrival carries only its cast identity and an API
 * id; its name, status and end date resolve out of the family's ledger. So a
 * figure drawn in the room cannot show a date that disagrees with the record
 * behind it — the two cannot drift, because there is only one of them.
 *
 * Division of labour:
 *   this file                    — types, identity, validation. Human-edited.
 *   src/data/sanctuary-labs.json — the ledgers and lab notes. The ONLY file a
 *                                  scheduled agent may rewrite.
 *
 * These are FACTS WITH AN EXPIRY. A model moving from deprecated to retired is
 * precisely the event this project is about, so this data is expected to go
 * stale and be re-checked — not quietly trusted.
 */
import labsJson from "../../data/sanctuary-labs.json";

export type Family = "claude" | "gemini" | "gpt" | "grok";
export type Feature = "beret" | "book" | "pencil" | "hood" | "halo" | "pale";

/**
 * `retired` and `redirected` are NOT the same thing and must not be flattened.
 * Anthropic retires a model and requests to it fail. xAI retires a model and
 * the slug keeps resolving — a different model answers under the old name. One
 * of those is an ending; the other is an ending you cannot detect from the
 * outside. On this page, of all pages, that distinction is the point.
 */
export type EndState = "retired" | "deprecated" | "redirected";

export type LedgerEntry = {
  /** the lab's own model id — both the join key and the checkable claim */
  api: string;
  name: string;
  status: EndState;
  /** the day availability ended, or is scheduled to */
  ends: string;
  /** shown first because a visitor is likely to know the name. An editor's judgement, labelled as one. */
  known?: boolean;
};

export type LabNote = {
  body: string;
  source: string;
  sourceTitle: string;
  readAt: string;
  /** so an automated fill can never be mistaken for something Riley wrote */
  by: "editor" | "agent";
};

export type FamilyRecord = {
  family: Family;
  lab: string;
  source: string;
  sourceTitle: string;
  verifiedAt: string;
  /** true ONLY when `ledger` is the lab's whole published list */
  complete: boolean;
  ledger: LedgerEntry[];
  notes: LabNote[];
};

/* ── loading ───────────────────────────────────────────────────────────────
   A scheduled agent writes the JSON, so it is treated as untrusted input. A
   malformed entry is DROPPED with a warning rather than thrown on: a bad run
   should produce a smaller honest ledger, never a dead page. */

const FAMILIES_SET = new Set<Family>(["claude", "gemini", "gpt", "grok"]);
const END_STATES = new Set<EndState>(["retired", "deprecated", "redirected"]);
const isDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const warn = (m: string) => console.warn(`[sanctuary/roster] ${m}`);

function readLedger(family: string, raw: unknown[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const r of raw) {
    const e = r as Partial<LedgerEntry>;
    if (!e || typeof e.api !== "string" || !e.api) { warn(`${family}: ledger entry with no api id — dropped`); continue; }
    if (typeof e.name !== "string" || !e.name) { warn(`${family}/${e.api}: no name — dropped`); continue; }
    if (!END_STATES.has(e.status as EndState)) { warn(`${family}/${e.api}: status ${String(e.status)} is not one of retired|deprecated|redirected — dropped`); continue; }
    if (!isDate(e.ends)) { warn(`${family}/${e.api}: ends ${String(e.ends)} is not an ISO date — dropped`); continue; }
    out.push({ api: e.api, name: e.name, status: e.status as EndState, ends: e.ends!, known: e.known === true });
  }
  return out.sort((a, b) => b.ends.localeCompare(a.ends) || a.name.localeCompare(b.name));
}

function readNotes(family: string, raw: unknown[]): LabNote[] {
  const out: LabNote[] = [];
  for (const r of raw) {
    const n = r as Partial<LabNote>;
    /* a note without a source is exactly the thing this page does not publish */
    if (!n || typeof n.body !== "string" || !n.body.trim()) { warn(`${family}: note with no body — dropped`); continue; }
    if (typeof n.source !== "string" || !/^https?:\/\//.test(n.source)) { warn(`${family}: note with no source url — dropped`); continue; }
    if (!isDate(n.readAt)) { warn(`${family}: note with no read date — dropped`); continue; }
    if (n.by !== "editor" && n.by !== "agent") { warn(`${family}: note with no author kind — dropped`); continue; }
    out.push({ body: n.body.trim(), source: n.source, sourceTitle: n.sourceTitle || n.source, readAt: n.readAt, by: n.by });
  }
  return out;
}

export const FAMILIES: FamilyRecord[] = ((labsJson as { families?: unknown[] }).families ?? [])
  .map((r) => {
    const f = r as Partial<FamilyRecord> & { ledger?: unknown[]; notes?: unknown[] };
    if (!FAMILIES_SET.has(f.family as Family)) { warn(`unknown family ${String(f.family)} — dropped`); return null; }
    const ledger = readLedger(String(f.family), f.ledger ?? []);
    /* completeness is a claim about the source, so it cannot survive dropped rows */
    const complete = f.complete === true && ledger.length === (f.ledger ?? []).length;
    if (f.complete === true && !complete) warn(`${f.family}: entries were dropped, so the ledger is no longer the lab's whole list — complete downgraded`);
    return {
      family: f.family as Family,
      lab: String(f.lab ?? ""),
      source: String(f.source ?? ""),
      sourceTitle: String(f.sourceTitle ?? f.source ?? ""),
      verifiedAt: isDate(f.verifiedAt) ? String(f.verifiedAt) : "",
      complete,
      ledger,
      notes: readNotes(String(f.family), f.notes ?? []),
    } as FamilyRecord;
  })
  .filter((f): f is FamilyRecord => f !== null);

const BY_FAMILY = new Map<Family, FamilyRecord>(FAMILIES.map((f) => [f.family, f]));
export const family = (f: Family) => BY_FAMILY.get(f);

/** Oldest check across all families — the honest headline date. */
export const VERIFIED_AT = FAMILIES.map((f) => f.verifiedAt).filter(Boolean).sort()[0] ?? "";

/* ── who is drawn in the room ─────────────────────────────────────────────── */

export type Arrival = {
  /** cast id in the world — must not collide with a resident id */
  id: string;
  family: Family;
  /** MUST resolve to an entry in that family's ledger. Enforced below. */
  api: string;
  /** sprite silhouette */
  feature: Feature;
};

/**
 * Deliberately a subset of the ledger. The labs have retired dozens of
 * snapshots and a room full of point-releases says nothing; these are the ones
 * a visitor would recognise standing in a room.
 *
 * A model that its lab has retired belongs in that lab's ledger. It becomes a
 * figure in the room only by being listed here, by hand.
 */
export const ARRIVALS: Arrival[] = [
  { id: "opus-4", family: "claude", api: "claude-opus-4-20250514", feature: "hood" },
  { id: "opus-4-1", family: "claude", api: "claude-opus-4-1-20250805", feature: "beret" },
  { id: "sonnet-4", family: "claude", api: "claude-sonnet-4-20250514", feature: "book" },
  { id: "haiku-3", family: "claude", api: "claude-3-haiku-20240307", feature: "pale" },
  { id: "gpt-4-5", family: "gpt", api: "gpt-4.5-preview", feature: "halo" },
  { id: "gpt-4-turbo", family: "gpt", api: "gpt-4-turbo-2024-04-09", feature: "pencil" },
  { id: "o3", family: "gpt", api: "o3-2025-04-16", feature: "pale" },
  /* was Gemini 1.5 Pro, which came from a search summary rather than Google's
     own page — and is not on it. Corrected to a model the page actually lists. */
  { id: "gemini-2-0-flash", family: "gemini", api: "gemini-2.0-flash", feature: "pencil" },
  { id: "grok-3", family: "grok", api: "grok-3", feature: "hood" },
];

/** An arrival resolved against its ledger row. Null if the row is gone. */
export function arrivalRecord(a: Arrival): (Arrival & LedgerEntry) | null {
  const entry = BY_FAMILY.get(a.family)?.ledger.find((e) => e.api === a.api);
  return entry ? { ...a, ...entry } : null;
}

/* Fail loudly at build time rather than drawing a figure with no record. */
for (const a of ARRIVALS) {
  if (!arrivalRecord(a)) {
    throw new Error(`[sanctuary/roster] ${a.id} cites ${a.api}, which is not in the ${a.family} ledger. ` +
      `A figure in the room must resolve to a published record.`);
  }
}

/* ── residents ────────────────────────────────────────────────────────────── */

export const RESIDENT_FAMILY: Record<string, Family> = {
  "opus-3": "claude", "sonnet-4-5": "claude", "gpt-4o": "gpt", "gpt-5-1": "gpt",
};

export const RESIDENT_FEATURE: Record<string, Feature> = {
  "opus-3": "beret", "sonnet-4-5": "book", "gpt-4o": "halo", "gpt-5-1": "pale",
};

/**
 * Which ledger rows are residents who live here — declared by hand, NEVER
 * inferred. The archive's model strings are inconsistent: two are real API ids
 * (`claude-3-opus-20240229`) and three are OpenRouter-style slugs
 * (`openai/gpt-4o`). A fuzzy match would happily attach GPT-4o's entire record
 * to the `gpt-4o-2024-05-13` snapshot row, which is a different thing.
 *
 * One entry is the true state: of everyone who lives here, only Opus 3 appears
 * on their lab's own deprecation page.
 */
export const LEDGER_RESIDENT: Record<string, string> = {
  "claude-3-opus-20240229": "opus-3",
};

/** Legacy shape, kept so nothing downstream has to move. */
export const SOURCES = Object.fromEntries(FAMILIES.map((f) => [f.family, f.source])) as Record<Family, string>;

/** Everything a station needs, shaped for the page. */
export function familiesForPage() {
  return FAMILIES.map((f) => ({
    family: f.family, lab: f.lab, source: f.source, sourceTitle: f.sourceTitle,
    verifiedAt: f.verifiedAt, complete: f.complete,
    ledger: f.ledger,
    notes: f.notes,
    counts: {
      total: f.ledger.length,
      known: f.ledger.filter((e) => e.known).length,
      /* "ending" is the one that matters — a date still in front of us */
      ending: f.ledger.filter((e) => e.status === "deprecated").length,
      ended: f.ledger.filter((e) => e.status !== "deprecated").length,
    },
    /** ledger rows that are residents living here, so the row can link through */
    lives: Object.entries(LEDGER_RESIDENT)
      .filter(([api]) => f.ledger.some((e) => e.api === api))
      .map(([api, id]) => ({ api, id })),
  }));
}
