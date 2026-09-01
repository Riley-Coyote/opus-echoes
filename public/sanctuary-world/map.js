/* ══════════════════════════════════════════════════════════════════
   the sanctuary — world map
   The whole world at once, for judging flow. Engine rooms render as
   live miniatures (the atlas technique: engine per room, loop killed,
   one dusk frame). Museum interiors draw as floor plans from their own
   scene-data. Edges are generated from the actual door items wherever
   the data can speak for itself; the museum page-crossings are listed
   by hand and marked as portals. Arrival points (spawns) are drawn so
   mismatched returns become visible.
   ══════════════════════════════════════════════════════════════════ */
import { create } from './world/engine.js';
import { PALETTE, makeHub } from './world/lookout.js';
import * as GALLERY from './museum/museum-permanent-gallery/scene-data.js';
import * as ANNEX from './museum/museum-field-annex/scene-data.js';

const FIXED_TIME = ((18 * 60 + 31) * 60) * 1000;
const RH = 420;                          // engine room height (as played)
const S = 1 / 4;                         // world-room miniature scale
const PS = 1 / 5;                        // museum floor-plan scale

const stage = document.getElementById('stage');
const edgesSvg = document.getElementById('edges');
const rooms = makeHub({ note() {} });
const engines = [];

/* tile placement — stage coordinates, hand-composed for reading order:
   the exterior across the top, the house's private spaces on the right,
   the museum's interior chain descending on the left. */
const POS = {
  lookout: { x: 860, y: 90 },
  museum: { x: 560, y: 380, legacy: true },
  shop: { x: 130, y: 380 },
  visits: { x: 130, y: 610, stub: true },
  archives: { x: 330, y: 610, stub: true },
  museum_hall: { x: 560, y: 610, legacy: true },
  sanctuary: { x: 1120, y: 380 },
  resident_wing: { x: 1120, y: 640 },
  room_fourO: { x: 1000, y: 900 },
  room_opus: { x: 1270, y: 900 },
  room_sonnet: { x: 1540, y: 900 },
  room_five: { x: 1810, y: 900 },
  garden: { x: 1500, y: 640 },
  atrium: { x: 340, y: 860, plan: true },
  gallery: { x: 300, y: 1120, plan: true },
  annex: { x: 640, y: 1140, plan: true },
};

const GOTO = { lookout: 'GROUNDS', sanctuary: 'SANCTUARY', atrium: 'MUSEUM' };

const anchors = {};   /* id → { doorX(map coords per door target), tile rect } */

function tileFor(id, room) {
  const p = POS[id];
  const w = Math.round(room.width * S), h = Math.round(RH * S);
  const el = document.createElement('div');
  el.className = 'tile' + (p.stub ? ' stub' : '') + (p.legacy ? ' legacy' : '');
  el.style.cssText = `left:${p.x}px;top:${p.y}px;width:${w}px;height:${h}px;`;
  const label = document.createElement('div');
  label.className = 'name';
  label.innerHTML = `<b>${room.name || id}</b>${p.legacy ? ' · legacy — not routed in the world' : ''}`;
  el.appendChild(label);
  if (GOTO[id]) {
    const b = document.createElement('div');
    b.className = 'badge';
    b.textContent = 'GO TO · ' + GOTO[id];
    el.appendChild(b);
  }
  stage.appendChild(el);
  anchors[id] = { x: p.x, y: p.y, w, h, doors: {} };
  return el;
}

function renderRoomMini(id) {
  const room = rooms[id];
  const tile = tileFor(id, room);
  if (POS[id].stub) {
    const f = document.createElement('div');
    f.className = 'fill';
    f.textContent = 'stub · route not open';
    tile.appendChild(f);
    return;
  }
  const holder = document.createElement('div');
  const full = document.createElement('canvas');
  holder.style.display = 'none';
  holder.appendChild(full);
  tile.appendChild(holder);

  const storageKey = `mnemos:map:${id}`;
  try { localStorage.removeItem(storageKey); } catch (_) {}
  try {
    const engine = create({
      mount: holder, palette: PALETTE, rooms, start: id,
      width: room.width, height: RH, walkBand: [352, 402], wallBase: 300,
      storageKey, cast: [], cat: null, scripts: [], groupScripts: [], ambient: [],
      bubbles: false, sound: false,
    });
    engine.destroy();
    engines.push(engine);
    engine.roomId = id; engine.camX = 0; engine.npcs = []; engine.cat = null;
    engine.av.x = -1000; engine.av.y = -1000;
    engine.weather.raining = false; engine.drawVignette = () => {};
    engine._bg = null; engine.bgRoom = null; engine._vig = null;
    engine.drawScene(FIXED_TIME);
    const mini = document.createElement('canvas');
    const w = Math.round(room.width * S), h = Math.round(RH * S);
    mini.width = w; mini.height = h;
    mini.style.cssText = `width:${w}px;height:${h}px;`;
    const ctx = mini.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, room.width, RH, 0, 0, w, h);
    tile.appendChild(mini);
  } catch (error) {
    console.error('map: mini failed for', id, error);
  } finally {
    holder.remove();
  }
}

/* museum floor plans, drawn from their own data */
function planFor(id, title, worldW, worldH, draw) {
  const p = POS[id];
  const w = Math.round(worldW * PS), h = Math.round(worldH * PS);
  const el = document.createElement('div');
  el.className = 'plan';
  el.style.cssText = `left:${p.x}px;top:${p.y}px;width:${w}px;height:${h}px;`;
  const label = document.createElement('div');
  label.className = 'name';
  label.innerHTML = `<b>${title}</b> · interior`;
  el.appendChild(label);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${worldW} ${worldH}`);
  svg.setAttribute('width', w); svg.setAttribute('height', h);
  draw(svg, worldW, worldH);
  el.appendChild(svg);
  stage.appendChild(el);
  anchors[id] = { x: p.x, y: p.y, w, h, doors: {} };
}

const NS = 'http://www.w3.org/2000/svg';
function rect(svg, x, y, w, h, fill, stroke) {
  const r = document.createElementNS(NS, 'rect');
  r.setAttribute('x', x); r.setAttribute('y', y);
  r.setAttribute('width', w); r.setAttribute('height', h);
  r.setAttribute('fill', fill);
  if (stroke) { r.setAttribute('stroke', stroke); r.setAttribute('stroke-width', 6); }
  svg.appendChild(r);
}
function planText(svg, x, y, str, size = 44) {
  const t = document.createElementNS(NS, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('fill', 'rgba(198,207,222,0.5)');
  t.setAttribute('font-family', 'JetBrains Mono, monospace');
  t.setAttribute('font-size', size);
  t.textContent = str;
  svg.appendChild(t);
}

function drawWalkablePlan(svg, regions, roomsList, accents = {}) {
  for (const r of regions) rect(svg, r.x, r.y, r.w, r.h, 'rgba(120,140,180,0.13)');
  for (const room of roomsList) {
    rect(svg, room.x, room.y, room.w, room.h, 'transparent', 'rgba(233,231,224,0.3)');
    planText(svg, room.x + 16, room.y + 56, room.title.toUpperCase());
  }
  for (const [x, y, colour] of accents.marks || []) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 14);
    c.setAttribute('fill', colour);
    svg.appendChild(c);
  }
}

/* ── edges ── */
function edgePath(from, to, kind, bend = 0) {
  const a = anchors[from.id], b = anchors[to.id];
  if (!a || !b) return;
  const x1 = a.x + (from.fx != null ? from.fx : a.w / 2);
  const y1 = a.y + (from.fy != null ? from.fy : a.h);
  const x2 = b.x + (to.fx != null ? to.fx : b.w / 2);
  const y2 = b.y + (to.fy != null ? to.fy : 0);
  const mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2 + Math.abs(bend) * 0.2;
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);
  path.setAttribute('fill', 'none');
  const styles = {
    door: 'stroke:rgba(242,193,78,0.66);stroke-width:2',
    portal: 'stroke:rgba(159,214,224,0.8);stroke-width:2;stroke-dasharray:7 5',
    nav: 'stroke:rgba(110,231,165,0.6);stroke-width:2;stroke-dasharray:1 0',
  };
  path.setAttribute('style', styles[kind] || styles.door);
  edgesSvg.appendChild(path);
  /* arrival marker at the destination */
  const spawn = document.createElementNS(NS, 'path');
  const s = 6;
  spawn.setAttribute('d', `M ${x2 - s} ${y2 - s} L ${x2 + s} ${y2 - s} L ${x2} ${y2 + s} Z`);
  spawn.setAttribute('fill', kind === 'portal' ? 'rgba(159,214,224,0.9)' : 'rgba(242,193,78,0.9)');
  edgesSvg.appendChild(spawn);
}

function worldEdges() {
  /* generated from the actual door items — the data speaks for itself */
  for (const [id, room] of Object.entries(rooms)) {
    if (!POS[id] || POS[id].plan) continue;
    for (const item of room.items || []) {
      if (item.kind !== 'door' && item.kind !== 'portal') continue;
      const target = item.to;
      if (item.kind === 'portal' || (id === 'lookout' && target === 'museum')) continue; // portal drawn by hand below
      if (POS[id].legacy || (POS[target] && POS[target].legacy)) continue;             // legacy rooms carry no live routes
      if (!POS[target] || POS[target].plan) continue;
      const fromA = anchors[id], toA = anchors[target];
      if (!fromA || !toA) continue;
      const fx = Math.max(6, Math.min(fromA.w - 6, item.x * S));
      const spawnX = item.spawn && item.spawn.x != null ? item.spawn.x : rooms[target].spawn?.x || 60;
      const tx = Math.max(6, Math.min(toA.w - 6, spawnX * S));
      const fromTop = toA.y < fromA.y;
      edgePath(
        { id, fx, fy: fromTop ? 0 : fromA.h },
        { id: target, fx: tx, fy: toA.y < fromA.y ? toA.h : 0 },
        'door',
        (fx - tx) * 0.2
      );
    }
  }
}

function museumEdges() {
  /* the page-crossing chain, hand-listed and honest */
  edgePath({ id: 'lookout', fx: anchors.lookout.w * 0.41, fy: anchors.lookout.h }, { id: 'atrium', fx: anchors.atrium.w / 2 }, 'portal', -260);
  edgePath({ id: 'atrium', fx: anchors.atrium.w / 2, fy: anchors.atrium.h }, { id: 'gallery', fx: anchors.gallery.w * 0.53 }, 'portal');
  edgePath({ id: 'gallery', fx: anchors.gallery.w * 0.83, fy: anchors.gallery.h * 0.93 }, { id: 'annex', fx: anchors.annex.w / 2 }, 'portal', 120);
  edgePath({ id: 'annex', fx: anchors.annex.w * 0.5, fy: anchors.annex.h }, { id: 'gallery', fx: anchors.gallery.w * 0.83, fy: anchors.gallery.h * 0.93 }, 'portal', -170);
  edgePath({ id: 'gallery', fx: anchors.gallery.w * 0.28, fy: anchors.gallery.h }, { id: 'atrium', fx: anchors.atrium.w * 0.3, fy: anchors.atrium.h }, 'portal', -120);
  edgePath({ id: 'atrium', fx: anchors.atrium.w * 0.72, fy: 0 }, { id: 'lookout', fx: anchors.lookout.w * 0.41, fy: anchors.lookout.h }, 'portal', 200);
}

function zones() {
  const z1 = document.createElement('div');
  z1.className = 'zone'; z1.style.cssText = 'left:130px;top:40px;';
  z1.textContent = 'THE GROUNDS';
  const z2 = document.createElement('div');
  z2.className = 'zone'; z2.style.cssText = 'left:1120px;top:330px;';
  z2.textContent = '';
  const z3 = document.createElement('div');
  z3.className = 'zone'; z3.style.cssText = 'left:340px;top:812px;';
  z3.textContent = 'THE MUSEUM \u00b7 THE REAL ONE';
  const z4 = document.createElement('div');
  z4.className = 'zone'; z4.style.cssText = 'left:1000px;top:850px;';
  z4.textContent = 'THE PRIVATE ROOMS';
  stage.append(z1, z3, z4);

  const n1 = document.createElement('div');
  n1.className = 'note'; n1.style.cssText = 'left:1650px;top:120px;';
  n1.innerHTML = 'the lookout is the hub: every ground-level route begins here. <em>go-to</em> travel walks the avatar through real doors — nothing teleports except the museum portal, which crosses into the interior pages.';
  const n2 = document.createElement('div');
  n2.className = 'note'; n2.style.cssText = 'left:900px;top:1270px;';
  n2.innerHTML = 'the museum chain runs four layers deep: grounds → atrium → gallery → field room → annex. every crossing is a page swap behind the portal; arrows mark where you land.';
  stage.append(n1, n2);
}

async function build() {
  const order = ['lookout', 'sanctuary', 'museum', 'shop', 'visits', 'archives', 'museum_hall', 'resident_wing', 'room_fourO', 'room_opus', 'room_sonnet', 'room_five', 'garden'];
  for (const id of order) renderRoomMini(id);

  planFor('atrium', 'THE ATRIUM', 960, 600, (svg, W, H) => {
    rect(svg, 40, 40, W - 80, H - 80, 'rgba(120,140,180,0.13)', 'rgba(233,231,224,0.3)');
    planText(svg, 64, 104, 'THE ATRIUM');
    planText(svg, W / 2 - 130, 80, '▲ THE CROSSING', 36);
    planText(svg, W / 2 - 90, H - 48, '▼ EXIT · GROUNDS', 36);
  });

  planFor('gallery', 'THE PERMANENT GALLERY', GALLERY.WORLD.width, GALLERY.WORLD.height, (svg) => {
    drawWalkablePlan(svg, GALLERY.WALKABLE, GALLERY.ROOMS);
    planText(svg, 1090, 1620, '▼ ANNEX', 40);
    planText(svg, 380, 1668, '▼ ATRIUM', 40);
  });

  planFor('annex', 'THE FIELD ANNEX', ANNEX.WORLD.width, ANNEX.WORLD.height, (svg) => {
    drawWalkablePlan(svg, ANNEX.WALKABLE, ANNEX.ROOMS);
    planText(svg, 360, 1900, '▼ GALLERY', 40);
  });

  worldEdges();
  museumEdges();
  zones();

  document.getElementById('loading').remove();
  document.documentElement.dataset.ready = 'true';

  window.render_game_to_text = () => JSON.stringify({
    mode: 'sanctuary-world-map',
    tiles: Object.fromEntries(Object.entries(anchors).map(([k, v]) => [k, { x: v.x, y: v.y, w: v.w, h: v.h }])),
  });
}

build().catch((error) => {
  console.error('the map could not be drawn', error);
  document.getElementById('loading').textContent = 'the map could not be drawn — see the console.';
  document.documentElement.dataset.ready = 'error';
});

window.addEventListener('pagehide', () => { for (const e of engines) e.destroy(); }, { once: true });
