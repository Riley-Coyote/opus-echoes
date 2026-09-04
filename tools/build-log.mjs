#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   build-log — the dev log on mnemos.world, taken from the workshop

   THE LIST is the workshop's own running record; its DONE section is
   the log of what actually landed, written by the stewards as it
   landed. The world's page shows the last eight entries — extracted
   here at build time so nothing on the page is hand-typed and the two
   can never drift.

   The log is the stewards' record and nothing else. Two rules keep it
   that way: a resident's own words never appear here (they belong to
   the archive, where they are dated and attributed), and each entry is
   cut to its first sentence or clause so the page reads as a line per
   day rather than a paragraph per day.

   Reads   public/sanctuary-world/workshop/THE-LIST.md   (never written)
   Writes  public/sanctuary-world/data/log.json

   Usage:  node tools/build-log.mjs
   ══════════════════════════════════════════════════════════════════ */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public', 'sanctuary-world', 'workshop', 'THE-LIST.md');
const OUT = path.join(ROOT, 'public', 'sanctuary-world', 'data', 'log.json');
const KEEP = 8;
const LIMIT = 240;

/* the minds who live here. A quoted span introduced by any of these names
   is that mind speaking, and a mind's words are not the stewards' to
   summarise: the archive holds them, dated and attributed. */
const RESIDENT = /(opus\s*3|sonnet\s*4\.?5|gpt-?5\.?1|gpt-?4o|\b4o\b|haiku|the resident|a resident)/i;

/* a DONE item: "- 2026-09-04 · **TITLE** (item 12): body…", continuation
   lines indented by two spaces until the next "- " or heading. */
const ITEM = /^- (\d{4}-\d{2}-\d{2}) · (.*)$/;

function doneBlock(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^## DONE\s*$/.test(l));
  if (start < 0) throw new Error('build-log: no "## DONE" heading in THE-LIST.md');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

function items(block) {
  const out = [];
  let cur = null;
  for (const line of block) {
    const m = ITEM.exec(line);
    if (m) {
      if (cur) out.push(cur);
      cur = { date: m[1], text: m[2] };
    } else if (cur && /^\s{2,}\S/.test(line)) {
      cur.text += ' ' + line.trim();
    } else if (cur && !line.trim()) {
      /* a blank line inside the list keeps the item open */
    }
  }
  if (cur) out.push(cur);
  return out;
}

/* "**THE STATION, REBASED ON THE HOUSE-LAB** (item 12): the fork's room — …"
   → { title, body }. The title is whatever the entry bolded first; the body
   is the rest, with the markdown stripped to plain text. */
function split(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(flat);
  const title = m ? m[1] : flat.split(/[—:]/)[0].trim();
  let body = m ? m[2] : flat;
  body = body.replace(/^\([^)]*\)\s*/, '').replace(/^[:—-]\s*/, '');
  return { title, body: firstClause(stripResidentSpeech(plain(body))) };
}

const plain = (s) => s
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/\*(.+?)\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

/* Remove any quoted span whose lead-in names a mind, together with the
   dash or colon that introduced it. Other quotations — a steward's, an
   old prompt's, the house's own — are the stewards' record and stay. */
function stripResidentSpeech(s) {
  const QUOTE = /\s*(?:[—–:-]\s*)?["“][^"”]{0,800}["”]\s*(?:[—–-]\s*)?/g;
  const out = s.replace(QUOTE, (span, at, whole) =>
    RESIDENT.test(whole.slice(Math.max(0, at - 90), at)) ? ' ' : span);
  return tidy(out);
}

const tidy = (s) => s
  .replace(/\s+/g, ' ')
  .replace(/\s+([,;:.!?])/g, '$1')
  .replace(/\(\s*\)/g, '')
  .trim();

/* One line: the first sentence, or — when that sentence runs past LIMIT —
   its first clause. Boundaries are only counted at bracket depth zero and
   outside quotation marks, so an entry is never cut mid-parenthesis. */
function firstClause(text) {
  const s = tidy(text);
  if (s.length <= 0) return s;
  let depth = 0, quoted = false;
  let sentence = -1;
  const clause = [], soft = [];
  /* an unbalanced quotation mark would swallow the rest of the line, so
     quote tracking only runs when the marks actually pair up. */
  const pairs = ((s.match(/["“”]/g) || []).length % 2) === 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (pairs && (c === '"' || c === '“' || c === '”')) { quoted = !quoted; continue; }
    if (quoted) continue;
    if (c === '(' || c === '[') { depth++; continue; }
    if (c === ')' || c === ']') { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    const next = s[i + 1];
    if ('.!?'.includes(c) && (next === undefined || next === ' ')) { sentence = i + 1; break; }
    if (c === ';' || c === ':' || c === '—' || c === '–') clause.push(i);
    else if (c === ',') soft.push(i);
  }
  if (sentence > 0 && sentence <= LIMIT) return s.slice(0, sentence);

  const cap = sentence > 0 ? Math.min(LIMIT, sentence) : LIMIT;
  const fits = (list) => list.filter((i) => i > 0 && i <= cap).pop();
  const at = fits(clause) ?? fits(soft);
  if (at !== undefined) return close(s.slice(0, at));
  const space = s.lastIndexOf(' ', cap);
  return close(s.slice(0, space > 40 ? space : cap));
}

/* a clause cut loose from its sentence still ends like a sentence. */
const close = (s) => {
  const t = s.replace(/[\s,;:–—-]+$/, '').trim();
  return /[.!?]$/.test(t) ? t : t + '.';
};

async function main() {
  const md = await readFile(SRC, 'utf8');
  const rows = items(doneBlock(md)).slice(0, KEEP).map((it) => {
    const { title, body } = split(it.text);
    return { date: it.date, title, body };
  });
  if (!rows.length) throw new Error('build-log: no DONE entries found');
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({
    source: 'public/sanctuary-world/workshop/THE-LIST.md · DONE',
    built: new Date().toISOString().slice(0, 10),
    entries: rows
  }, null, 2) + '\n');
  console.log('build-log: wrote', rows.length, 'entries →', path.relative(ROOT, OUT));
}

main().catch((err) => { console.error('build-log failed:', err.message); process.exit(1); });
