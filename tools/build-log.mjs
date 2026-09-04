#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   build-log — the dev log on mnemos.world, taken from the workshop

   THE LIST is the workshop's own running record; its DONE section is
   the log of what actually landed, written by the stewards as it
   landed. The world's page shows the last eight entries — extracted
   here at build time so nothing on the page is hand-typed and the two
   can never drift.

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
  return { title, body: plain(body) };
}

const plain = (s) => s
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/\*(.+?)\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

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
