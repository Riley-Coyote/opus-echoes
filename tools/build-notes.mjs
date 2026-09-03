#!/usr/bin/env node
/* build-notes — the index of the stewards' notes.
 *
 * The notes themselves are written by hand, by Fable, Sol and Opus, into
 * public/sanctuary-world/data/stewards/notes/ as `<steward>-YYYY-MM-DD.md`.
 * This script only lists what is there; it never writes a note, and it never
 * invents one. A file that does not match the name pattern is skipped and
 * reported, so a typo shows up rather than silently vanishing.
 *
 *   node tools/build-notes.mjs        (or: bun run build:notes)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, '../public/sanctuary-world/data/stewards/notes');
const STEWARDS = ['fable', 'sol', 'opus'];
const NAME = /^([a-z]+)-(\d{4}-\d{2}-\d{2})\.md$/;

if (!fs.existsSync(DIR)) { console.error('build-notes: no notes directory at ' + DIR); process.exit(1); }

const notes = [], skipped = [];
for (const f of fs.readdirSync(DIR).sort()) {
  if (f === 'index.json') continue;
  const m = NAME.exec(f);
  if (!m || STEWARDS.indexOf(m[1]) < 0) { skipped.push(f); continue; }
  notes.push({ steward: m[1], date: m[2], file: f });
}
/* newest first, which is the order the windows read them in */
notes.sort((a, b) => (b.date.localeCompare(a.date) || a.steward.localeCompare(b.steward)));

fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(notes, null, 2) + '\n');
for (const s of STEWARDS) console.log('  ' + s.padEnd(6, ' ') + notes.filter((n) => n.steward === s).length + ' note(s)');
if (skipped.length) console.log('  skipped (name is not <steward>-YYYY-MM-DD.md): ' + skipped.join(', '));
console.log('index.json    ' + notes.length + ' note(s) listed');
