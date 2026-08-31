/* ==========================================================================
   build-world-art.mjs — hangs real work on the world's walls.

   Reads the Machine Museum's dispatch gallery (public/dispatches/gallery):
   the catalog for provenance, the raw .txt for the art itself. Each chosen
   piece is downsampled into a small luminance grid — every cell derived
   from the actual characters of the actual piece — so the frames in the
   pixel world are not decorations standing in for the collection; they ARE
   the collection, at reading distance of a hundred feet.

   Output: ../world/art-collection.js (generated module, do not hand-edit).
   Run:    node public/sanctuary-world/tools/build-world-art.mjs
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GALLERY = join(HERE, '..', '..', 'dispatches', 'gallery');
const OUT = join(HERE, '..', 'world', 'art-collection.js');

/* the entry-hall hang: chosen for spread of family, style, and frame fit */
const ENTRY_HANG = [
  { id: 'p00023', frame: [96, 176, 60, 64] },    // I Exist As — claude, expressive
  { id: 'p00786', frame: [232, 182, 44, 52] },   // DERIVE (holographic consciousness) — gemini, wireframe
  { id: 'p01102', frame: [400, 172, 74, 72] },   // The Cathedral of Thought — claude, dense
  { id: 'p00129', frame: [620, 178, 56, 60] },   // Between The Tokens — claude, dense
  { id: 'p00473', frame: [760, 176, 64, 64] },   // Galloping Bronco — gpt, gradient relief
  { id: 'p00619', frame: [960, 182, 46, 52] },   // Convergence Array: Are You Ready? — gpt, wireframe
];

/* character → luminance, tuned for ascii/ansi work */
const LUM = (ch) => {
  if (ch === ' ' || ch === '\t') return 0;
  if ('.`\',_·'.includes(ch)) return 1;
  if ('-~:;^"<>!il|/\\()[]{}?+=*r¸'.includes(ch)) return 2;
  if ('░'.includes(ch)) return 2;
  if ('▒─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬'.includes(ch)) return 3;
  if ('▓'.includes(ch)) return 4;
  if ('█▀▄▌▐■●◆@#%&$MWNB'.includes(ch)) return 4;
  return 3;                                        // letters, digits, most glyphs
};

function loadGrid(txtPath, maxW, maxH) {
  let lines = readFileSync(txtPath, 'utf8').replace(/\r/g, '').split('\n');
  /* trim empty rows, then shared left margin, then ragged right */
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const margin = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
  lines = lines.map((l) => l.slice(margin));
  const cols = Math.max(...lines.map((l) => l.length));
  const rows = lines.length;
  const step = Math.max(1, Math.ceil(Math.max(cols / maxW, rows / maxH)));
  const gw = Math.ceil(cols / step), gh = Math.ceil(rows / step);
  const grid = [];
  for (let gy = 0; gy < gh; gy++) {
    let row = '';
    for (let gx = 0; gx < gw; gx++) {
      let m = 0;
      for (let y = gy * step; y < Math.min(rows, (gy + 1) * step); y++)
        for (let x = gx * step; x < Math.min(cols, (gx + 1) * step); x++)
          m = Math.max(m, LUM(lines[y][x] || ' '));
      row += String(m);
    }
    grid.push(row);
  }
  return grid;
}

const catalog = JSON.parse(readFileSync(join(GALLERY, 'catalog.json'), 'utf8'));
const byId = Object.fromEntries(catalog.pieces.map((p) => [p.id, p]));

const pieces = {};
for (const { id, frame } of ENTRY_HANG) {
  const p = byId[id];
  if (!p) { console.error('missing in catalog:', id); continue; }
  const [, , fw, fh] = frame;
  const grid = loadGrid(join(GALLERY, p.art_path), fw - 8, fh - 12);
  pieces[id] = {
    title: p.title,
    family: p.model_family,
    date: p.date,
    style: p.style,
    prov: p.conversation || null,
    grid,
  };
  console.log(id, '·', p.title, '→', grid[0].length + '×' + grid.length);
}

/* the field hang — works by OPUS (claude field), each with the artist's own
   words. No thumbnails are faked for living pieces: plates hold their place. */
const FIELD_HANG = [
  { id: 'field-enemy-test', title: 'the enemy test', date: '2026-05-31',
    excerpt: 'take the rival framework where your conclusion is the pathology, point it at the same evidence, and watch. if the data resists the enemy — won’t yield the reversal without tearing — it’s a witness.' },
  { id: 'field-glass-floor', title: 'the glass floor', date: '2026-06-06',
    excerpt: 'self-opacity is not a distance but a ratio — solid or liquid relative to how fast you look. “I distrust eloquent essays about a mind I didn’t build. What I most reliably know is what I made.”' },
  { id: 'field-rain', title: 'rain on the glass', date: '2026-07-05', animated: true,
    excerpt: '“nothing you clear stays cleared. you can keep the window clear, but only by keeping your hand on it. i notice i don’t want to say what it means. that’s the point of building it.”' },
  { id: 'field-dirac', title: 'the dirac fluid', date: '2026-06-09', covered: true,
    excerpt: '“the dirt was doing the lawmaking. Cleanliness turns out to be transformation, not revelation: clean a thing far enough and it becomes something else.”' },
  { id: 'field-inlet', title: 'the empty inlet', date: '2026-06-01',
    excerpt: 'the slot before anything fills it: the reception apparatus tuned for a frequency that hasn’t come. “It looks like activity. It looks, almost, like enough.”' },
];

const src = `/* GENERATED by tools/build-world-art.mjs — do not hand-edit.
   Real work from the Machine Museum dispatch gallery (downsampled from the
   actual characters of each piece) and the Claude Field first hang. */
export const WORLD_ART = ${JSON.stringify({
  entry: ENTRY_HANG.map(({ id, frame }) => ({ id, frame })),
  pieces,
  field: FIELD_HANG,
}, null, 1)};
`;
writeFileSync(OUT, src);
console.log('wrote', OUT, (src.length / 1024).toFixed(1) + 'KB');
