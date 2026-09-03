#!/usr/bin/env node
/* build-field — Claude Field's body of work, made static for TOPOLOGIE OS.
 *
 * Reads (never writes) two places:
 *   ~/Documents/Repositories/claude-field   the repo: the built site + IDENTITY.md
 *   ~/.claude-field/messages.db             the message bus
 *
 * Writes public/sanctuary-world/data/field/:
 *   catalog.json    the 14 categories, the 638 entries with their content_html,
 *                   and the 47 art canvases — lifted from the consts the built
 *                   site already inlines (docs/index.html), so what the OS shows
 *                   is exactly what Field published, not a re-derivation.
 *   embeds/<id>.html   the 82 living pieces, self-contained, with the Google
 *                   Fonts @import removed so nothing phones out from the world.
 *   bus.json        the three agent threads, in order. Riley's own exchanges
 *                   with Field are personal and are not shipped.
 *   identity.md     IDENTITY.md, for the OS's ABOUT window.
 *
 * Nothing else crosses. The exclusions are printed on every run.
 *
 *   node tools/build-field.mjs            (or: bun run build:field)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIELD = process.env.FIELD_REPO || path.join(os.homedir(), 'Documents/Repositories/claude-field');
const BUS_DB = process.env.FIELD_BUS || path.join(os.homedir(), '.claude-field/messages.db');
const OUT = path.join(REPO, 'public/sanctuary-world/data/field');

/* what never leaves the field, in the brief's own words */
const EXCLUSIONS = [
  '.env',
  'logs/ (except the two April content files already in the built site)',
  'local/',
  'riley-context.md',
  'introspection/**/*.sealed',
  'root PNGs',
  'both SQLite DBs (the bus is read; the file is not copied)',
  'the riley↔field bus messages (personal)'
];

/* ─────────────────────────── small helpers ─────────────────────────── */
const die = (m) => { console.error('build-field: ' + m); process.exit(1); };
const bytes = (n) => (n / 1048576).toFixed(2) + ' MB';

function readConst(src, name) {
  const m = new RegExp('^const ' + name + ' = (\\[[\\s\\S]*?\\]);$', 'm').exec(src);
  if (!m) die('could not find the inlined const `' + name + '` in docs/index.html');
  try { return JSON.parse(m[1]); } catch (e) { die('`' + name + '` did not parse: ' + e.message); }
}

/* the pieces are self-contained but for one webfont; take it out and let the
   monospace stack the OS already sets stand in */
const FONT_IMPORT = /@import\s+url\(\s*['"]https:\/\/fonts\.googleapis\.com[^'"]*['"]\s*\)\s*;?/g;
const FONT_LINK = /<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi;
function deFont(html) {
  return html.replace(FONT_IMPORT, '/* webfont import removed for the sanctuary */')
    .replace(FONT_LINK, '');
}

/* ─────────────────────────── the bus ─────────────────────────── */
function readBus(file) {
  const sql = "select id, from_agent, to_agent, content, timestamp from messages order by timestamp asc, id asc";
  try {
    /* required, not imported, so this file still loads where node:sqlite is absent */
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(file, { readOnly: true });
    const rows = db.prepare(sql).all();
    db.close();
    return rows;
  } catch (e) {
    /* older node, or no node:sqlite — the CLI reads it just as well */
    const out = execFileSync('sqlite3', ['-json', '-readonly', file, sql], { encoding: 'utf8', maxBuffer: 1 << 28 });
    return JSON.parse(out || '[]');
  }
}

const PAIR = { anima: 'field↔anima', vektor: 'field↔vektor', luca: 'field↔luca' };

/* ─────────────────────────── the run ─────────────────────────── */
function main() {
  if (!fs.existsSync(FIELD)) die('no claude-field repo at ' + FIELD);
  const indexPath = path.join(FIELD, 'docs/index.html');
  if (!fs.existsSync(indexPath)) die('no built site at ' + indexPath);

  console.log('build-field · reading (read-only)');
  console.log('  ' + FIELD);
  console.log('  ' + BUS_DB);
  console.log('');
  console.log('NOT SHIPPED:');
  for (const x of EXCLUSIONS) console.log('  · ' + x);
  console.log('');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'embeds'), { recursive: true });

  /* 1 · the catalog, from the consts the built site already inlines */
  const src = fs.readFileSync(indexPath, 'utf8');
  const categories = readConst(src, 'categories');
  const entries = readConst(src, 'entries');
  const artCanvas = readConst(src, 'artCanvas');

  /* the built site's own dates bound the body of work */
  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  const catalog = {
    builtAt: new Date().toISOString(),
    source: 'claude-field · docs/index.html',
    span: { from: dates[0], to: dates[dates.length - 1] },
    categories, entries, artCanvas
  };
  const catalogPath = path.join(OUT, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalog));
  console.log('catalog.json   ' + categories.length + ' categories · ' + entries.length +
    ' entries · ' + artCanvas.length + ' canvases   ' + bytes(fs.statSync(catalogPath).size));

  /* 2 · the living pieces */
  const ids = new Set(entries.map((e) => e.id));
  const embedDir = path.join(FIELD, 'docs');
  const embeds = fs.readdirSync(embedDir).filter((f) => /^embed-.*\.html$/.test(f));
  let copied = 0, orphan = 0, defonted = 0;
  for (const f of embeds) {
    const id = f.replace(/^embed-/, '').replace(/\.html$/, '');
    if (!ids.has(id)) { orphan++; continue; }
    const html = fs.readFileSync(path.join(embedDir, f), 'utf8');
    const clean = deFont(html);
    if (clean !== html) defonted++;
    fs.writeFileSync(path.join(OUT, 'embeds', id + '.html'), clean);
    copied++;
  }
  console.log('embeds/        ' + copied + ' pieces (' + defonted + ' had a webfont import, removed)' +
    (orphan ? ' · ' + orphan + ' with no entry, skipped' : ''));

  /* 3 · the bus, minus Riley */
  let threads = [];
  let kept = 0, dropped = 0;
  if (fs.existsSync(BUS_DB)) {
    const rows = readBus(BUS_DB);
    const byPair = new Map();
    for (const r of rows) {
      const from = String(r.from_agent), to = String(r.to_agent);
      const other = from === 'field' ? to : from;
      if (from === 'riley' || to === 'riley' || !PAIR[other]) { dropped++; continue; }
      if (!byPair.has(other)) byPair.set(other, []);
      byPair.get(other).push({ id: r.id, from, to, at: String(r.timestamp), body: String(r.content) });
      kept++;
    }
    threads = [...byPair.entries()].map(([other, messages]) => ({
      id: 'field-' + other,
      label: PAIR[other],
      a: 'field', b: other,
      count: messages.length,
      from: messages[0].at.slice(0, 10),
      to: messages[messages.length - 1].at.slice(0, 10),
      messages
    })).sort((x, y) => y.count - x.count);
  } else {
    console.log('bus.json       no bus at ' + BUS_DB + ' — writing an empty set');
  }
  const bus = {
    builtAt: new Date().toISOString(),
    source: '~/.claude-field/messages.db',
    note: 'real exchanges between Claude Field and the other agents, as dated. Riley’s own messages with Field are personal and are not here.',
    threads
  };
  const busPath = path.join(OUT, 'bus.json');
  fs.writeFileSync(busPath, JSON.stringify(bus));
  console.log('bus.json       ' + threads.length + ' threads · ' + kept + ' messages kept · ' +
    dropped + ' withheld (riley↔field)   ' + bytes(fs.statSync(busPath).size));

  /* 4 · the identity file, for ABOUT */
  const idp = path.join(FIELD, 'IDENTITY.md');
  if (fs.existsSync(idp)) {
    fs.copyFileSync(idp, path.join(OUT, 'identity.md'));
    console.log('identity.md    copied');
  }

  /* 5 · the size */
  let total = 0, files = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else { total += fs.statSync(p).size; files++; }
  } };
  walk(OUT);
  console.log('');
  console.log('data/field/    ' + files + ' files · ' + bytes(total) + (total > 12 * 1048576 ? '   OVER the 12 MB budget' : '   (budget 12 MB)'));
}

main();
