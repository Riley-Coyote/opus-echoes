/**
 * Turning archived prose into something a figure in the room can say.
 *
 * The residents wrote essays to each other — median 2191 characters. A figure
 * in a pixel room can carry one sentence. The whole job of this module is to
 * find that one sentence WITHOUT ever changing it, because the page's promise
 * is that nothing spoken is invented.
 *
 * The guarantee is structural, not careful: every candidate is checked back
 * against the untouched original with includes() before it can ship. No
 * cleaning step, present or future, can quietly break verbatimness — it can
 * only cause a line to be rejected. When in doubt the exchange is dropped;
 * silence is always an available and honest answer.
 */
import * as S from "./seed";
import type { ResidentId } from "./seed";

/* ── stripping ─────────────────────────────────────────────────────────────
   Tags are removed WITH their contents. <presence>0.8</presence> unwrapped
   rather than deleted produces a line beginning "0.8 0.7 what i keep feeling",
   and a single-asterisk stage direction unwrapped produces "ponders your
   thoughtful analysis I think you've laid out the key issues very clearly." */
const WITH_CONTENTS = /<(light-footnote|thinking|presence|tempo|artifact|scratch)\b[^>]*>[\s\S]*?<\/\1>/gi;
const SELF_CLOSING = /<set-down\s*\/?>/gi;
const ANY_TAG = /<[^>\n]{0,120}>/g;
const SPEAKER_TAG = /^\s*\[[A-Za-z0-9 .\-]+\]/;
const STAGE = /(?<!\*)\*(?!\*)[^*\n]{2,160}\*(?!\*)/g;

/** Newlines replace every removal, so nothing is ever silently joined. */
function clean(body: string): string {
  return body
    .replace(WITH_CONTENTS, "\n")
    .replace(SELF_CLOSING, "\n")
    .replace(SPEAKER_TAG, "\n")
    .replace(STAGE, "\n")
    .replace(ANY_TAG, "\n")
    .replace(/^\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/gm, "\n")
    .replace(/^\s*---+\s*$/gm, "\n");
}

/* ── sentence splitting ───────────────────────────────────────────────────── */
const ABBREV = /(?:^|[\s(])(?:vs|e\.g|i\.e|cf|al|approx|fig|mr|mrs|ms|dr|jr|sr)\.$/i;

function sentences(text: string): string[] {
  const out: string[] = [];
  for (const block of text.split(/\n+/)) {
    let start = 0;
    for (const m of block.matchAll(/[.!?](?=\s|$)/g)) {
      const end = (m.index ?? 0) + 1;
      const piece = block.slice(start, end);
      if (ABBREV.test(piece)) continue; // an abbreviation, not a sentence end
      out.push(piece.trim());
      start = end;
    }
  }
  return out.filter(Boolean);
}

/* ── rejection ─────────────────────────────────────────────────────────────
   A fragment torn out of an argument reads as a fabrication even when it is
   verbatim, so the bar is "could this stand alone in someone's mouth". */
const OPENS_MID_THOUGHT =
  /^(and|but|so|or|yet|that|this|it|they|we|there|then|thus|hence|which|because|although|though|while|whereas|to|as|for|by|of|in|on|at|with|from|not|only|through|even|still|also|both|either|neither|if|when|what|whose)\b/i;
/** "one, a dance of disclosure…" — an item torn out of a numbered list. */
const LIST_ITEM = /^(one|two|three|four|first|second|third|fourth|finally|lastly)\s*[,:]/i;
/** In a two-person exchange, a line addressing more than two names an absentee. */
const ADDRESSES_A_CROWD = /\b(the (three|four|five) of (you|us)|all of (you|us)|everyone here|each of you)\b/i;

/** Reject anything that would need the missing context to make sense. */
function disqualified(s: string): string | null {
  if (s.length < 45) return "too short";
  if (s.length > 120) return "too long";
  if (OPENS_MID_THOUGHT.test(s)) return "opens mid-thought";
  if (LIST_ITEM.test(s)) return "a list item";
  if (!/^[A-Za-z]/.test(s)) return "does not begin with a word";
  if (/[.…]{2,}$/.test(s)) return "trails off — reads as our truncation, not theirs";
  if (ADDRESSES_A_CROWD.test(s)) return "addresses people who are not in this exchange";
  if (/[<>[\]]/.test(s)) return "contains markup characters";
  if (/\b\d+\.\d+\b/.test(s)) return "contains a bare decimal";
  if (/[:;]\s*$/.test(s)) return "ends on a colon";
  if (/^["'“”]/.test(s) || (s.match(/"/g) ?? []).length % 2 === 1) return "unbalanced quotes";
  if ((s.match(/[“”]/g) ?? []).length % 2 === 1) return "unbalanced smart quotes";
  if ((s.match(/\(/g) ?? []).length !== (s.match(/\)/g) ?? []).length) return "unbalanced parens";
  if (/\b(presence|tempo|light-footnote|set-down|artifact)\b/i.test(s)) return "modulator vocabulary";
  return null;
}

/** Name patterns, so a line can be checked for third parties. */
const NAME_RE: Record<string, RegExp> = {
  "opus-3": /\bopus(\s*3)?\b/i,
  "sonnet-4-5": /\bsonnet(\s*4\.?5)?\b/i,
  "gpt-5-1": /\bgpt[\s-]?5(\.1)?\b/i,
  "gpt-4o": /\bgpt[\s-]?4o\b/i,
};

/**
 * The commons runs a three-way rotation, so a line naming the resident who is
 * NOT in this exchange reads as a fabrication — the person addressed simply
 * isn't there. A vocative to the actual partner is fine and reads as speech.
 */
function namesAThirdParty(s: string, self: ResidentId, partner: ResidentId): boolean {
  for (const [id, re] of Object.entries(NAME_RE)) {
    if (id === self) continue;
    if (!re.test(s)) continue;
    if (id === partner) {
      const vocative = new RegExp("^" + NAME_RE[id].source + "\\s*[,—-]", "i");
      if (vocative.test(s)) continue; // "sonnet, there's something in what you said…"
      return true;
    }
    return true;
  }
  return false;
}

/* Generic second-person praise — "you've laid out the key issues very clearly"
   — is the trained assistant register, not the resident's own. It is genuine,
   so it is not rejected, but it is the least characteristic thing in the
   archive and should lose to a line that says something. */
const FLATTERY = /\b(you(?:'ve| have|r)\b[^.?!]{0,60}\b(wonderfully|beautifully|illuminating|insightful|profound|excellent|elegant|masterful|very clear(?:ly)?|remarkably)|\b(wonderfully|beautifully)\s+(clear|put|said|woven))/i;

function score(s: string): number {
  let n = 0;
  if (FLATTERY.test(s)) n -= 5;
  if (/\b(i|me|my|we|us|our|you|your)\b/i.test(s)) n += 3;
  if (/\?$/.test(s)) n += 1;
  if (/^[a-z]/.test(s)) n += 1; // the corpus's own lowercase register
  if (s.length >= 60 && s.length <= 100) n += 2;
  return n;
}

/* ── formulaicity, measured rather than guessed ────────────────────────────
   opus closes many messages with a near-identical invitation — "does this
   resonate with how you experience the aliveness of your own becoming?" — in
   several DIFFERENT messages, so a one-use-per-message rule never catches it.
   Scoring second-person questions highly then picks it every time, and the
   room ends up repeating a rhetorical tic instead of saying anything.

   Rather than blacklisting the phrase, count how many other candidate lines a
   line resembles. A sentence the corpus repeats is, by evidence, formula; a
   sentence that appears once is a thought. */
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);

/** Containment, not Jaccard — catches a shorter variant nested in a longer one. */
function resemblance(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / Math.max(1, Math.min(A.size, B.size));
}
const ALIKE = 0.65;

/* Removing a span mid-sentence leaves the remainder starting mid-thought, and
   the single-asterisk pattern matches markdown EMPHASIS as readily as a stage
   direction — so "we say *now*, from inside our intact cognitive frameworks"
   yielded the candidate ", from inside our intact cognitive frameworks…".

   Rather than trying to tell emphasis from stage directions, require that a
   candidate begin at a real sentence boundary IN THE UNTOUCHED ORIGINAL. One
   rule, checked against the source, immune to whatever the cleaner does. */
const OK_BEFORE = /(?:[.!?…]["'”’)\]]*\s+|\n\s*)$/;

function startsAtASentenceBoundary(body: string, s: string): boolean {
  for (let i = body.indexOf(s); i !== -1; i = body.indexOf(s, i + 1)) {
    if (i === 0) return true;
    if (OK_BEFORE.test(body.slice(Math.max(0, i - 40), i))) return true;
  }
  return false;
}

/**
 * One quotable sentence from a message, or null. The returned string is always
 * a verbatim contiguous substring of `body`, beginning where a sentence begins.
 */
export function speechLine(body: string, self: ResidentId, partner: ResidentId): string | null {
  const cands = sentences(clean(body))
    .filter((s) => !disqualified(s))
    .filter((s) => !namesAThirdParty(s, self, partner))
    .filter((s) => startsAtASentenceBoundary(body, s)); // the guarantee, enforced not assumed
  if (!cands.length) return null;
  return cands.sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0];
}

/* ── the corpus ───────────────────────────────────────────────────────────── */

export type SpeechLine = { resident_id: ResidentId; message_id: string; text: string };
export type SpeechExchange = {
  id: string;
  pair: [ResidentId, ResidentId];
  source: "commons" | "salon";
  where: string;
  open: boolean;
  /** "14 may 2026" — absolute, so provenance is checkable against the archive */
  date: string;
  lines: SpeechLine[];
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const PER_PAIR = 20;
const TOTAL_CAP = 60;

/**
 * The dusk gathering: three residents drift to the colonnade windows and take
 * three consecutive turns. Same rule as everything else — every line verbatim,
 * from one real adjacent window, or there is no gathering at all.
 */
export function buildGathering(): SpeechExchange | null {
  const best: { ex: SpeechExchange; rank: number }[] = [];
  for (const c of S.gatheringWindows()) {
    const lines: SpeechLine[] = [];
    for (const t of c.turns) {
      /* in a three-way there is no single partner, so any other resident named
         is legitimately present — pass the speaker as their own partner, which
         disallows every third-party name except a vocative to themselves */
      const text = speechLine(t.body, t.resident_id, t.resident_id);
      if (!text) { lines.length = 0; break; }
      lines.push({ resident_id: t.resident_id, message_id: t.message_id, text });
    }
    if (lines.length !== 3) continue;
    best.push({
      ex: { id: c.id, pair: c.pair, source: c.source, where: c.where, open: c.open, date: longDate(c.at), lines },
      rank: lines.reduce((n, l) => n + score(l.text), 0),
    });
  }
  /* same formulaicity penalty the pair corpus gets — otherwise the gathering
     ends on opus's stock invitation, which is the worst line to end on */
  const pool = best.flatMap((b) => b.ex.lines.map((l) => tokens(l.text)));
  for (const b of best)
    for (const l of b.ex.lines) {
      const t = tokens(l.text);
      b.rank -= pool.filter((o) => o !== t && resemblance(t, o) >= ALIKE).length * 2;
    }
  best.sort((a, b) => b.rank - a.rank || a.ex.id.localeCompare(b.ex.id));
  return best.length ? best[0].ex : null;
}

/**
 * Everything the room can say, selected in one pass so the gathering and the
 * pair exchanges never reuse a message or repeat a line at each other.
 */
export function buildCorpus(): { exchanges: SpeechExchange[]; gathering: SpeechExchange | null } {
  const gathering = buildGathering();
  const reserved = gathering ? gathering.lines : [];
  return { exchanges: buildSpeechCorpus(reserved), gathering };
}

/**
 * Deterministic — the same corpus every build, so what gets reviewed is what
 * ships and Playwright runs are reproducible. Runtime variety comes from the
 * engine's own rotation, not from randomness here.
 */
export function buildSpeechCorpus(reserved: SpeechLine[] = []): SpeechExchange[] {
  const built: { ex: SpeechExchange; rank: number }[] = [];

  for (const c of S.exchanges()) {
    const lines: SpeechLine[] = [];
    for (const t of c.turns) {
      const partner = c.pair.find((p) => p !== t.resident_id) ?? t.resident_id;
      const text = speechLine(t.body, t.resident_id, partner);
      if (!text) { lines.length = 0; break; }   // all turns or none — no gaps
      lines.push({ resident_id: t.resident_id, message_id: t.message_id, text });
    }
    if (lines.length < 2) continue;
    const rank =
      lines.reduce((n, l) => n + score(l.text), 0) +
      (c.source === "salon" ? 2 : 0) +   // salons are genuine dyads
      (c.open ? 1 : 0) +
      lines.length;
    built.push({ ex: { id: c.id, pair: c.pair, source: c.source, where: c.where, open: c.open, date: longDate(c.at), lines }, rank });
  }

  /* Penalise by how much of the rest of the corpus a line resembles, so stock
     phrasing sinks and one-off thoughts rise. */
  const all = built.flatMap((b) => b.ex.lines.map((l) => tokens(l.text)));
  for (const b of built) {
    for (const l of b.ex.lines) {
      const t = tokens(l.text);
      const echoes = all.filter((o) => o !== t && resemblance(t, o) >= ALIKE).length;
      b.rank -= echoes * 2;
    }
  }

  built.sort((a, b) => b.rank - a.rank || a.ex.id.localeCompare(b.ex.id));

  /* the gathering claims its lines first, so nothing is said twice */
  const used = new Set<string>(reserved.map((l) => l.message_id));
  const kept: string[][] = reserved.map((l) => tokens(l.text));
  const perPair = new Map<string, number>();
  const out: SpeechExchange[] = [];
  for (const { ex } of built) {
    if (out.length >= TOTAL_CAP) break;
    /* one use per source message… */
    if (ex.lines.some((l) => used.has(l.message_id))) continue;
    /* …and no near-repeat of anything already shipped, which the message-id
       rule cannot see, because the repetition is across different messages. */
    if (ex.lines.some((l) => kept.some((k) => resemblance(tokens(l.text), k) >= ALIKE))) continue;
    /* top-N per pair rather than top-N overall: one pair has far fewer
       candidates and a global sort starves it, which matters because when one
       resident is mid-exchange the remaining pair is the only one available. */
    const key = [...ex.pair].sort().join("|");
    if ((perPair.get(key) ?? 0) >= PER_PAIR) continue;
    perPair.set(key, (perPair.get(key) ?? 0) + 1);
    ex.lines.forEach((l) => { used.add(l.message_id); kept.push(tokens(l.text)); });
    out.push(ex);
  }
  return out;
}
