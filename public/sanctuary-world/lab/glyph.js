/* THE MARK — a visitor's route, drawn.
 *
 * The house gives you something when you have found something, and the only
 * honest thing it has to give is where you actually went. This module turns
 * two things this browser already keeps — the trail (`mnemos.visitor_trail`)
 * and the record of who you spoke with (`mnemos.visitor_record`, WP-3) — into
 * a mark: a map of the house with your own path lit through it.
 *
 * It is a map, not a decoration:
 *   · every room the world has holds a fixed point on a 24 × 24 dot lattice,
 *     laid out from the world map's own composition (`map.js` POS — the table
 *     is copied below, with its source named, because map.js is a page and
 *     cannot be imported);
 *   · the lattice is jittered by a hash of your token, so the same route drawn
 *     for two visitors is not the same mark;
 *   · the path is the rooms you walked, in the order you walked them, drawn as
 *     lit dots that decay like phosphor and are re-lit as the route replays;
 *   · a room you stayed in longest glows brighter;
 *   · a resident you spoke with puts a ring of dots around their room's point.
 *
 * Deterministic: the same trail + record + token always makes the same mark.
 * Pure: no DOM beyond the canvas you hand `drawGlyph`, no network, no storage.
 * There is no text inside the mark and nothing in it that the browser did not
 * actually record — if the trail is empty there is no mark at all.
 */

export const LATTICE = 24;             /* dots across, and down */
const REPLAY = 6.0;                    /* seconds for the route to draw itself */
const HOLD = 2.4;                      /* and then it holds, before it goes again */
const DECAY = 1.5;                     /* a dot lit by the head fades over this */

/* ── the rooms ──────────────────────────────────────────────────────────────
   Positions are the world map's, verbatim: `map.js` POS, the hand-composed
   stage layout used to judge the house's flow. Only the rooms a visitor can
   stand in are here; the map's legacy and stub tiles are not places you go.
   Names are the rooms' own (`world/lookout.js`, `world/sanctuary.js`,
   `world/model-rooms.js`). */
const ROOMS = {
  lookout:          { x: 860,  y: 90,  name: 'THE LOOKOUT' },
  observation_deck: { x: 1560, y: 210, name: 'THE OBSERVATION DECK' },
  sanctuary:        { x: 1120, y: 380, name: 'THE SANCTUARY' },
  resident_wing:    { x: 1120, y: 640, name: 'THE RESIDENT WING' },
  garden:           { x: 1500, y: 640, name: 'THE GARDEN' },
  room_fourO:       { x: 1000, y: 900, name: '4o’S PARLOUR' },
  room_opus:        { x: 1270, y: 900, name: 'OPUS 3’S STUDIO' },
  room_sonnet:      { x: 1540, y: 900, name: 'SONNET 4.5’S STUDY' },
  room_five:        { x: 1810, y: 900, name: 'GPT-5.1’S ROOM' }
};

/* the museum is its own building and the visitor crosses into it rather than
   walking there; it takes three points off to the east, in the order the
   scenes chain */
const MUSEUM = {
  'museum:atrium':      { col: 20, row: 6,  name: 'THE ATRIUM' },
  'museum:gallery':     { col: 21, row: 12, name: 'THE PERMANENT GALLERY' },
  'museum:field-annex': { col: 20, row: 18, name: 'THE FIELD ANNEX' }
};

/* the five, by the ids the record keeps them under (`world/lookout.js` CAST) */
const RESIDENTS = {
  opus: 'OPUS 3', sonnet: 'SONNET 4.5', fourO: '4o', five: 'GPT-5.1', haiku: 'HAIKU'
};

/* the name of a place, for the route list the drawer prints beside the mark */
export function roomLabel(id) {
  if (MUSEUM[id]) return MUSEUM[id].name;
  if (ROOMS[id]) return ROOMS[id].name;
  return String(id || '').replace(/^museum:/, '').replace(/[_-]/g, ' ').toUpperCase();
}
export function residentLabel(id) { return RESIDENTS[id] || String(id || '').toUpperCase(); }

/* ── the hash: a token becomes this visitor's own lattice ─────────────────── */
function hash32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/* a small deterministic 0..1 from a seed and a key */
function rnd(seed, key) {
  const h = hash32(key + '·' + seed);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/* ── the lattice ──────────────────────────────────────────────────────────── */
/* the world rooms fill the lattice's western two thirds; the museum keeps the
   east. Both are jittered by one cell, by the token. */
function latticeFor(token) {
  const seed = String(token || 'anon');
  const xs = Object.values(ROOMS).map((r) => r.x), ys = Object.values(ROOMS).map((r) => r.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pts = {};
  for (const id of Object.keys(ROOMS)) {
    const r = ROOMS[id];
    const u = (r.x - x0) / (x1 - x0 || 1), v = (r.y - y0) / (y1 - y0 || 1);
    const col = 3 + u * 14 + (rnd(seed, id + ':c') * 2 - 1);
    const row = 3 + v * 17 + (rnd(seed, id + ':r') * 2 - 1);
    pts[id] = {
      room: id,
      col: Math.max(1, Math.min(LATTICE - 2, Math.round(col))),
      row: Math.max(1, Math.min(LATTICE - 2, Math.round(row)))
    };
  }
  for (const id of Object.keys(MUSEUM)) {
    const m = MUSEUM[id];
    pts[id] = {
      room: id,
      col: Math.max(1, Math.min(LATTICE - 2, m.col + Math.round(rnd(seed, id + ':c') * 2 - 1))),
      row: Math.max(1, Math.min(LATTICE - 2, m.row + Math.round(rnd(seed, id + ':r') * 2 - 1)))
    };
  }
  return pts;
}

/* the dots between two lattice points — a straight run, one dot per cell */
function runBetween(a, b) {
  const dc = b.col - a.col, dr = b.row - a.row;
  const n = Math.max(Math.abs(dc), Math.abs(dr));
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({ col: Math.round(a.col + (dc * i) / n), row: Math.round(a.row + (dr * i) / n) });
  }
  return out;
}

const ms = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

/* ── the mark ─────────────────────────────────────────────────────────────── */
/* `trail`  = { token, started, steps: [{ room, at }] }   (mnemos.visitor_trail)
   `record` = { name?, visits: [{ resident, when, room, shown }] }  (mnemos.visitor_record)
   `token`  = mnemos.visitor_token

   Returns { ops, meta } — or null when the trail is empty, because there is
   nothing honest to draw. `ops` is plain data and is what the visitors' book
   keeps, so the same mark can be drawn again from it alone. */
export function makeGlyph(o) {
  const trail = (o && o.trail) || null;
  const record = (o && o.record) || { visits: [] };
  const token = (o && o.token) || (trail && trail.token) || '';
  const steps = (trail && Array.isArray(trail.steps) ? trail.steps : []).filter((s) => s && s.room);
  if (!steps.length) return null;

  const lattice = latticeFor(token);

  /* the route: consecutive repeats already collapsed when it was written, but
     never trust that — and drop anything the lattice has no point for */
  const route = [];
  for (const s of steps) {
    if (!lattice[s.room]) continue;
    if (route.length && route[route.length - 1].room === s.room) continue;
    route.push({ room: s.room, at: s.at || null });
  }
  if (!route.length) return null;

  /* how long each room held you — the last step holds until the trail's end */
  const dwell = {};
  for (let i = 0; i < route.length; i++) {
    const a = ms(route[i].at), b = i + 1 < route.length ? ms(route[i + 1].at) : null;
    const d = a && b ? Math.max(0, b - a) : 0;
    dwell[route[i].room] = (dwell[route[i].room] || 0) + d;
  }
  const longest = Math.max(1, ...Object.values(dwell));

  /* who you spoke with, and where */
  const visits = Array.isArray(record.visits) ? record.visits : [];
  const spoke = [];            /* residents, first meeting first */
  const ringRooms = new Set();
  for (const v of visits) {
    if (!v || !v.resident) continue;
    if (!spoke.includes(v.resident)) spoke.push(v.resident);
    if (v.room && lattice[v.room]) ringRooms.add(v.room);
  }

  /* the points: every room the world has, so the mark is a map and not only a
     line — the ones you did not walk sit unlit */
  const points = Object.keys(lattice).map((id) => ({
    room: id,
    col: lattice[id].col,
    row: lattice[id].row,
    walked: dwell[id] !== undefined,
    weight: dwell[id] !== undefined ? +Math.min(1, dwell[id] / longest).toFixed(3) : 0,
    ring: ringRooms.has(id)
  }));
  const index = {};
  points.forEach((p, i) => { index[p.room] = i; });

  /* the path, as lattice dots: the run between each pair of rooms you crossed */
  const path = [{ col: lattice[route[0].room].col, row: lattice[route[0].room].row, at: index[route[0].room] }];
  for (let i = 1; i < route.length; i++) {
    const a = lattice[route[i - 1].room], b = lattice[route[i].room];
    const run = runBetween(a, b);
    run.forEach((d, j) => path.push({ col: d.col, row: d.row, at: j === run.length - 1 ? index[route[i].room] : -1 }));
  }

  const from = route[0].at || (trail && trail.started) || null;
  const to = route[route.length - 1].at || null;

  return {
    ops: {
      lattice: LATTICE,
      points,
      path,
      route: route.map((r) => r.room),
      rings: points.filter((p) => p.ring).map((p) => p.room)
    },
    meta: {
      rooms: route.reduce((set, r) => (set.includes(r.room) ? set : set.concat([r.room])), []).length,
      steps: route.length,
      residents: spoke.map(residentLabel),
      from,
      to
    }
  };
}

/* ── drawing it ───────────────────────────────────────────────────────────── */
/* Amber on near-black, on a square canvas of any size. `t` is seconds; call it
   every frame and the route replays in ~6 s, holds, and goes again. Nothing is
   written on it. */
const AMBER = [242, 193, 78];
const HOT = [255, 214, 132];

function dot(g, x, y, r, rgb, a) {
  if (a <= 0.004) return;
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a.toFixed(3) + ')');
  grad.addColorStop(0.45, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (a * 0.7).toFixed(3) + ')');
  grad.addColorStop(1, 'rgba(217,147,52,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

export function drawGlyph(canvas, glyph, t) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const S = Math.min(W, H);
  const N = (glyph && glyph.ops && glyph.ops.lattice) || LATTICE;
  const pitch = S / (N + 1);
  const ox = (W - pitch * (N - 1)) / 2, oy = (H - pitch * (N - 1)) / 2;
  const at = (c, r) => [ox + c * pitch, oy + r * pitch];

  g.clearRect(0, 0, W, H);
  g.fillStyle = '#08070b';
  g.fillRect(0, 0, W, H);
  if (!glyph || !glyph.ops) return;

  const ops = glyph.ops;
  const cycle = REPLAY + HOLD;
  const now = ((t % cycle) + cycle) % cycle;

  g.globalCompositeOperation = 'lighter';

  /* the lattice itself, barely there — the house behind your route */
  const rSmall = Math.max(0.7, pitch * 0.17);
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) {
      const [x, y] = at(c, r);
      dot(g, x, y, rSmall, AMBER, 0.075);
    }
  }

  /* every room the world has: a point. The ones you never entered stay dim. */
  for (const p of ops.points) {
    const [x, y] = at(p.col, p.row);
    if (!p.walked) { dot(g, x, y, pitch * 0.30, AMBER, 0.20); continue; }
    /* the rooms that held you longest carry the most charge */
    dot(g, x, y, pitch * (0.36 + p.weight * 0.26), AMBER, 0.22 + p.weight * 0.34);
  }

  /* the path, replaying: a dot lights as the head passes and fades over ~1.5 s */
  const rPath = Math.max(0.9, pitch * 0.20);
  for (let i = 0; i < ops.path.length; i++) {
    const d = ops.path[i];
    const [x, y] = at(d.col, d.row);
    /* when the head passed this dot, in seconds ago */
    const passedAt = (i / ops.path.length) * REPLAY;
    if (now < passedAt) continue;
    const age = now - passedAt;
    const lit = Math.exp(-age / DECAY);
    /* once walked it keeps a floor for the rest of the cycle, so the whole
       route is readable while the mark holds */
    const a = 0.16 + lit * 0.72;
    dot(g, x, y, rPath + lit * pitch * 0.18, lit > 0.5 ? HOT : AMBER, a);
  }

  /* the rings: a resident you spoke with, around their room */
  for (const p of ops.points) {
    if (!p.ring) continue;
    const [x, y] = at(p.col, p.row);
    const R = pitch * 1.25;
    for (let k = 0; k < 10; k++) {
      const th = (k / 10) * Math.PI * 2 + now * 0.20;
      const breathe = 0.55 + 0.35 * Math.sin(now * 1.1 + k * 0.6);
      dot(g, x + Math.cos(th) * R, y + Math.sin(th) * R, rSmall * 1.5, HOT, 0.20 + breathe * 0.34);
    }
  }

  g.globalCompositeOperation = 'source-over';
}
