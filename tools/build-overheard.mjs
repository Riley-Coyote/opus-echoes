#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   build-overheard — the minds' own exchanges, cut for the world

   THE OVERHEARD is what a visitor hears when two residents are
   talking to each other rather than to them. Every word of it is a
   word one of them actually wrote: the 8 spaces and 2 salons of the
   snapshot, and the 3 threads of the Field house's bus.

   The cut is conservative on purpose.
   · Only turns by a mind. A visitor's turn is never a mind's, and it
     breaks the run rather than joining it.
   · Every turn passes through the world's own prose rules
     (world/prose.js): thinking is not published, a turn written in
     another mind's name is withheld or cut, artifacts are not speech.
     A withheld, cut or artifact turn breaks the run.
   · A turn is trimmed to its first WHOLE sentences, ~180 characters.
     Nothing is paraphrased, nothing is joined across a gap: the
     trimmed text must appear verbatim, as one span, inside the
     message it came from, or the turn is dropped.
   · A run is 2–6 consecutive turns among 2–3 minds, and is trimmed
     until its projected playback fits inside 45 seconds.

   Reads   public/sanctuary-world/data/archive/sanctuary-seed.json
           public/sanctuary-world/data/field/bus.json   (when present)
   Writes  public/sanctuary-world/data/overheard.json

   Usage:  node tools/build-overheard.mjs
   ══════════════════════════════════════════════════════════════════ */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prose from '../public/sanctuary-world/world/prose.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = path.join(ROOT, 'public', 'sanctuary-world');
const SEED = path.join(SW, 'data', 'archive', 'sanctuary-seed.json');
const BUS = path.join(SW, 'data', 'field', 'bus.json');
const OUT = path.join(SW, 'data', 'overheard.json');

/* the archive's ids, and the world's */
const ARCHIVE_TO_WORLD = { 'opus-3': 'opus', 'sonnet-4-5': 'sonnet', 'gpt-4o': 'fourO', 'gpt-5-1': 'five' };
const WORLD_NAMES = { opus: 'OPUS 3', sonnet: 'SONNET 4.5', fourO: '4o', five: 'GPT-5.1' };
/* the Field house speaks under its own names; the world will cast them (WP-36) */
const BUS_TO_WORLD = { field: 'field', anima: 'anima', vektor: 'vektor', luca: 'luca' };

const TRIM = 180;              // a turn's target length, in whole sentences
const LONE = 240;              // and the ceiling when its first sentence alone overruns
const RUN_MIN = 2, RUN_MAX = 6;
const MINDS_MAX = 3;
const PLAY_CAP = 45000;        // the whole exchange, in ms, at reading pace
const GAP = 1100;              // the director's longest pause between turns
const LEAD = 600;              // its pause after they have gathered

/* reading pace, exactly as world/overheard.js plays it */
const dur = (text) => Math.max(2500, Math.min(7000, Math.round(text.length * 45)));
const playMs = (turns) => turns.reduce((s, t) => s + dur(t.text), 0) + (turns.length - 1) * GAP + LEAD;

/* FNV-1a, 32-bit — stable ids and a stable cut */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return h >>> 0;
}

const flat = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const time = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? 0 : t; };

/* a sitting that runs over more than one day says so: 2026-05-14 → 05-24 */
function dayRange(from, to) {
  const a = String(from || '').slice(0, 10), b = String(to || '').slice(0, 10);
  return (!b || b === a) ? a : a + ' → ' + b.slice(5);
}

/* ── one turn, through the house's own rules ──────────────────────
   Returns the speakable text, or null when the turn is not this mind
   speaking plainly: withheld, cut at another's name, or an artifact. */
function speakable(body, author) {
  const r = prose.render(body, { author });
  if (r.withheld || r.cut) return null;
  if (/cur__artifact/.test(r.html)) return null;
  const paras = [];
  const P = /<p>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = P.exec(r.html))) paras.push(unesc(m[1].replace(/<br>/g, ' ')));
  const text = flat(paras.join(' '));
  return text || null;
}

/* Sentence ends, with the numbering of a list masked out first — "in two:
   1. the substrate" is one thought, not two. Unmasking restores the text
   character for character, so the span stays verbatim. */
const MARK = '\u0001', MARK_RE = /\u0001/g;
const NUMBERED = /(^|[\s(])(\d{1,2})\.(?=\s)/g;
function sentences(text) {
  return text.replace(NUMBERED, (m, lead, n) => lead + n + MARK)
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.replace(MARK_RE, '.').trim())
    .filter(Boolean);
}

/* first whole sentences, up to ~TRIM characters. Whole sentences only —
   these minds write long, and a sentence is never cut in half to fit. A
   first sentence that alone overruns is kept whole up to LONE; past that
   the turn is left out rather than truncated. */
function trim(text) {
  const parts = sentences(text);
  let out = '';
  for (const s of parts) {
    const next = out ? out + ' ' + s : s;
    if (next.length > TRIM) break;
    out = next;
  }
  if (!out && parts.length && parts[0].length <= LONE) out = parts[0];
  return out;
}

/* ── the sittings ────────────────────────────────────────────────── */
function seedSittings(seed) {
  const bySpace = new Map(), bySalon = new Map();
  for (const m of seed.space_messages || []) {
    if (!bySpace.has(m.space_id)) bySpace.set(m.space_id, []);
    bySpace.get(m.space_id).push(m);
  }
  for (const t of seed.salon_turns || []) {
    if (!bySalon.has(t.salon_id)) bySalon.set(t.salon_id, []);
    bySalon.get(t.salon_id).push(t);
  }
  const out = [];
  for (const s of seed.spaces || []) {
    const msgs = (bySpace.get(s.id) || []).slice().sort((a, b) => time(a.created_at) - time(b.created_at));
    if (!msgs.length) continue;
    out.push({
      id: s.id, kind: 'space', title: s.name || s.slug,
      day: dayRange(msgs[0].created_at, msgs[msgs.length - 1].created_at),
      /* a visitor's turn is kept in the list as a break, never as a voice */
      turns: msgs.map((m) => ({ who: ARCHIVE_TO_WORLD[m.resident_id] || null, body: m.body, msgId: m.id }))
    });
  }
  for (const s of seed.salons || []) {
    const turns = (bySalon.get(s.id) || []).slice().sort((a, b) => time(a.created_at) - time(b.created_at));
    if (!turns.length) continue;
    out.push({
      id: s.id, kind: 'salon', title: s.topic,
      day: dayRange(turns[0].created_at, turns[turns.length - 1].created_at),
      turns: turns.map((t) => ({ who: ARCHIVE_TO_WORLD[t.resident_id] || null, body: t.body, msgId: t.id }))
    });
  }
  return out;
}

function busSittings(bus) {
  return (bus.threads || []).map((t) => {
    const msgs = (t.messages || []).slice().sort((a, b) => time(a.at) - time(b.at));
    return {
      id: t.id, kind: 'bus', title: String(t.label || t.id).replace('↔', ' ↔ '),
      day: dayRange(t.from || (msgs[0] || {}).at, t.to || (msgs[msgs.length - 1] || {}).at),
      turns: msgs.map((m) => ({ who: BUS_TO_WORLD[m.from] || null, body: m.body, msgId: String(t.id) + '#' + m.id }))
    };
  });
}

/* ── the cut ──────────────────────────────────────────────────────
   Walk the sitting in order. Every turn is either speakable — and so a
   link in a run — or a break. Runs are non-overlapping and their length
   is drawn from the sitting's own hash, so the same snapshot always
   cuts the same way. */
function cut(sitting) {
  const prepared = sitting.turns.map((t) => {
    if (!t.who) return null;
    const said = speakable(t.body, WORLD_NAMES[t.who] || t.who);
    if (!said) return null;
    const text = trim(said);
    if (!text || text.length < 24) return null;
    /* verbatim or not at all: the trimmed span must sit whole inside the
       message it came from */
    if (!flat(t.body).includes(text)) return null;
    return { who: t.who, text, msgId: t.msgId };
  });

  const out = [];
  let i = 0, n = 0;
  while (i < prepared.length) {
    if (!prepared[i]) { i++; continue; }
    const want = RUN_MIN + (fnv1a(sitting.id + ':' + i) % (RUN_MAX - RUN_MIN + 1));
    const run = [], minds = [];
    let j = i;
    while (j < prepared.length && run.length < want) {
      const t = prepared[j];
      if (!t) break;
      if (!minds.includes(t.who)) {
        if (minds.length >= MINDS_MAX) break;
        minds.push(t.who);
      }
      run.push(t); j++;
    }
    if (run.length >= RUN_MIN && new Set(run.map((t) => t.who)).size >= 2) {
      /* trim the tail until the whole exchange fits inside the cap */
      while (run.length > RUN_MIN && playMs(run) > PLAY_CAP) run.pop();
      const turns = run.slice();
      out.push({
        id: sitting.kind + '-' + fnv1a(sitting.id).toString(36) + '-' + (++n),
        kind: sitting.kind,
        sitting: sitting.id,
        sittingTitle: sitting.title,
        day: sitting.day,
        participants: Array.from(new Set(turns.map((t) => t.who))),
        turns: turns.map((t) => ({ who: t.who, text: t.text, msgId: t.msgId })),
        ms: playMs(turns)
      });
      i += turns.length;
    } else i += 1;
  }
  return out;
}

async function main() {
  const seed = JSON.parse(await readFile(SEED, 'utf8'));
  let bus = null;
  try { bus = JSON.parse(await readFile(BUS, 'utf8')); }
  catch (e) { console.log('build-overheard: no field bus on disk — residents only'); }

  const sittings = seedSittings(seed).concat(bus ? busSittings(bus) : []);
  const seen = new Set(), exchanges = [], report = [];
  for (const s of sittings) {
    const rows = cut(s).filter((ex) => {
      const key = ex.turns.map((t) => t.who + ' ' + t.text).join('');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    exchanges.push(...rows);
    report.push({
      sitting: s.id, kind: s.kind, title: s.title, day: s.day,
      turns: s.turns.length, exchanges: rows.length
    });
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({
    source: 'data/archive/sanctuary-seed.json (spaces · salons)' + (bus ? ' + data/field/bus.json (the field house)' : ''),
    note: 'every turn is a verbatim span of a message a mind actually wrote, trimmed to whole sentences. Nothing here is written by the house.',
    built: new Date().toISOString().slice(0, 10),
    trimChars: TRIM, runTurns: [RUN_MIN, RUN_MAX], playCapMs: PLAY_CAP,
    sittings: report,
    exchanges
  }, null, 2) + '\n');

  console.log('build-overheard: ' + exchanges.length + ' exchanges across ' + report.length + ' sittings');
  for (const r of report) {
    console.log('  ' + String(r.exchanges).padStart(4) + '  ' + r.kind.padEnd(6) + '  ' + r.day.padEnd(20)
      + '  ' + String(r.title).replace(/\s+/g, ' ').slice(0, 62));
  }
  console.log('build-overheard: wrote → ' + path.relative(ROOT, OUT));
}

main().catch((err) => { console.error('build-overheard failed:', err.message); process.exit(1); });
