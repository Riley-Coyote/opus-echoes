#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   capture-frames — the three museum stills for DESTINATIONS

   The engine rooms are NOT captured here: the destinations menu draws
   them live with the atlas technique (a throwaway engine, one frame at
   18:31, toDataURL). Only the museum scenes — which live in iframes and
   render themselves — need a still on disk.

   Writes public/sanctuary-world/data/frames/{atrium,gallery,field-annex}.webp
   (or .png when cwebp is not on PATH — update the `frame:` paths in
   landing.js to match if that happens).

   Usage:  node tools/capture-frames.mjs        # dev server on :8080
   ══════════════════════════════════════════════════════════════════ */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'sanctuary-world', 'data', 'frames');
const BASE = process.env.SANCTUARY_BASE || 'http://localhost:8080';

const SCENES = [
  { id: 'atrium', page: '/sanctuary-world/museum/museum-warm-atrium.html?embed=1' },
  { id: 'gallery', page: '/sanctuary-world/museum/museum-permanent-gallery.html?embed=1' },
  { id: 'field-annex', page: '/sanctuary-world/museum/museum-field-annex.html?embed=1' }
];

const MANUAL = `
capture-frames: no Playwright available in this checkout.

Capture the three stills by hand (Playwright MCP, or any browser):

  for each scene page on ${BASE}
    /sanctuary-world/museum/museum-warm-atrium.html?embed=1      -> atrium
    /sanctuary-world/museum/museum-permanent-gallery.html?embed=1 -> gallery
    /sanctuary-world/museum/museum-field-annex.html?embed=1       -> field-annex

  1. navigate to the page
  2. poll until JSON.parse(render_game_to_text()).ready === true
  3. evaluate __workshopRender() — it returns a PNG data URL of the whole scene
  4. strip the "data:image/png;base64," prefix and decode:
       python3 -c "import base64,sys;open(sys.argv[1],'wb').write(base64.b64decode(sys.stdin.read()))" \\
         public/sanctuary-world/data/frames/<id>.png < <the base64>
  5. convert if cwebp is on PATH:
       cwebp -q 82 <id>.png -o <id>.webp && rm <id>.png
     otherwise keep the .png and change the frame: paths in
     public/sanctuary-world/landing.js (PLACES, the three museum rows).
`;

async function loadPlaywright() {
  try { return await import('playwright-core'); } catch (_) { /* fall through */ }
  try { return await import('playwright'); } catch (_) { return null; }
}

async function haveCwebp() {
  try { await run('cwebp', ['-version']); return true; } catch (_) { return false; }
}

async function main() {
  const pw = await loadPlaywright();
  if (!pw) { console.error(MANUAL); process.exit(2); }

  await mkdir(OUT, { recursive: true });
  const webp = await haveCwebp();
  if (!webp) console.warn('capture-frames: cwebp not on PATH — writing .png (update the frame: paths in landing.js)');

  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    for (const scene of SCENES) {
      await page.goto(BASE + scene.page, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        try { return JSON.parse(window.render_game_to_text()).ready === true; } catch (_) { return false; }
      }, null, { timeout: 30000 });
      const url = await page.evaluate(() => window.__workshopRender());
      if (typeof url !== 'string' || !url.startsWith('data:image/png;base64,')) {
        throw new Error('scene ' + scene.id + ' did not return a PNG data URL');
      }
      const png = path.join(OUT, scene.id + '.png');
      await writeFile(png, Buffer.from(url.slice('data:image/png;base64,'.length), 'base64'));
      if (webp) {
        await run('cwebp', ['-q', '82', png, '-o', path.join(OUT, scene.id + '.webp')]);
        await rm(png);
        console.log('capture-frames: wrote', scene.id + '.webp');
      } else {
        console.log('capture-frames: wrote', scene.id + '.png');
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error('capture-frames failed:', err.message); process.exit(1); });
