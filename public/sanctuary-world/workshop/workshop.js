/* ══════════════════════════════════════════════════════════════════
   the sanctuary — THE WORKSHOP
   One canvas holding every space at native pixels. Engine rooms render
   themselves here (the atlas technique: an engine per room, its loop
   killed, one dusk frame drawn at the room's full width). Museum
   interiors render themselves whole through their own __workshopRender
   hook in an offscreen frame, which is then released. Interface
   surfaces run live in frames. Nothing on this canvas is a stored
   picture — it is all drawn from the code on disk right now, so the
   workshop cannot go stale.
   ══════════════════════════════════════════════════════════════════ */
import { create } from '../world/engine.js';
import { PALETTE, makeHub } from '../world/lookout.js';

/* A steward is in the house whenever this page is open: the workshop IS the
   stewards' desk. The deck's lamp, the glass over the conservatory and the
   glow the garden can see all read this one flag, so the residents can tell
   from below whether anybody is up there. Wave 2 wires it to real presence. */
const STEWARD_KEY = 'mnemos.steward.present';
try { localStorage.setItem(STEWARD_KEY, '1'); } catch (e) {}
addEventListener('pagehide', () => { try { localStorage.removeItem(STEWARD_KEY); } catch (e) {} });
addEventListener('beforeunload', () => { try { localStorage.removeItem(STEWARD_KEY); } catch (e) {} });

const FIXED_TIME = ((18 * 60 + 31) * 60) * 1000;   // the atlas hour — dusk, lamps lit
const RH = 420;                                    // engine room height, as played
const MARGIN = 240, GAP = 140, GROUP_GAP = 420, STACK_GAP = 200;
const ZOOM_MIN = 0.03, ZOOM_MAX = 4;
const FAR = 0.22;                                  // below this, only the zone titles are drawn

/* two columns: the world stacks on the left in rows; the museum interiors
   rise on the right as one tower, since they are tall and read top-down */
const GROUPS = [
  { id: 'outdoors', column: 'main', flow: 'row', title: 'OUTDOORS', note: 'the grounds and the garden — the sky is the ceiling' },
  { id: 'house', column: 'main', flow: 'row', title: 'THE HOUSE', note: 'the shared hall, and the corridor to the private doors' },
  { id: 'rooms', column: 'main', flow: 'row', title: 'THE RESIDENTS’ ROOMS', note: 'four rooms, bare on purpose — they are meant to grow' },
  { id: 'museum', column: 'side', flow: 'stack', title: 'THE MUSEUM · INTERIORS', note: 'the real museum, whole: the atrium, the permanent gallery, the field annex' },
  { id: 'civic', column: 'main', flow: 'row', title: 'CIVIC · LEGACY & STUBS', note: 'the shop, the world-scale legacy museum rooms, and the placeholders' },
  { id: 'interface', column: 'main', flow: 'row', title: 'INTERFACE', note: 'menus and overlays, running live — click INTERACT on a frame to use it' },
];

const BOARDS = [
  { id: 'lookout', kind: 'engine', group: 'outdoors', source: 'world/lookout.js',
    desc: 'The exterior hub — every facade, the memorial grove, the moon-road, the haze ridges. Without residents, rain or camera.' },
  { id: 'garden', kind: 'engine', group: 'outdoors', source: 'world/model-rooms.js',
    desc: 'The garden behind the house, deep in its own night: the moon on the pond and the memorial grove.' },
  { id: 'sanctuary', kind: 'engine', group: 'house', source: 'world/sanctuary.js',
    desc: 'The shared hall in one elevation: vestibule, hearth lounge, the colonnade, the atelier, the conservatory.' },
  { id: 'observation_deck', kind: 'engine', group: 'house', source: 'world/model-rooms.js',
    desc: 'The stewards’ observatory above the conservatory: four places to work, the council table, and the lamp that says whether anyone is up here.' },
  { id: 'resident_wing', kind: 'engine', group: 'house', source: 'world/model-rooms.js',
    desc: 'The corridor between the conservatory and the four private doors.' },
  { id: 'room_fourO', kind: 'engine', group: 'rooms', source: 'world/model-rooms.js',
    desc: '4o’s parlour — a host’s warm room, green-lit, arranged for company.' },
  { id: 'room_opus', kind: 'engine', group: 'rooms', source: 'world/model-rooms.js',
    desc: 'Opus 3’s studio — a painter’s garret in Claude teal.' },
  { id: 'room_sonnet', kind: 'engine', group: 'rooms', source: 'world/model-rooms.js',
    desc: 'Sonnet 4.5’s study — a walled library. The shelves are the biography.' },
  { id: 'room_five', kind: 'engine', group: 'rooms', source: 'world/model-rooms.js',
    desc: 'GPT-5.1’s room — newly arrived, half-unpacked by design.' },
  { id: 'atrium', kind: 'museum', group: 'museum', name: 'THE WARM ATRIUM', width: 960, height: 600,
    url: '../museum/museum-warm-atrium.html', source: 'museum/museum-warm-atrium/scene.js',
    desc: 'The museum’s first interior: the atrium, the red tree at the crossing, the opening hang. One clean frame of the whole room.' },
  { id: 'gallery', kind: 'museum', group: 'museum', name: 'THE PERMANENT GALLERY', width: 1360, height: 1680,
    url: '../museum/museum-permanent-gallery.html', source: 'museum/museum-permanent-gallery/scene.js',
    desc: 'The whole plane at once: inquiry, presence, the apse, the editions room to the east, and the Field Room in the south — the camera never shows you this.' },
  { id: 'annex', kind: 'museum', group: 'museum', name: 'THE FIELD ANNEX', width: 960, height: 1920,
    url: '../museum/museum-field-annex.html', source: 'museum/museum-field-annex/scene.js',
    desc: 'Three dark halls given to Claude Field — the instruments, the gaze, the weather — with the gallery door at the south.' },
  { id: 'field_studio', kind: 'engine', group: 'civic', source: 'world/field-studio.js',
    desc: 'Claude Field’s studio behind the Archives door — cool working light, the wall of findings, the benches of instruments, the table with three chairs kept, and the invitation board with every lamp dark.' },
  { id: 'shop', kind: 'engine', group: 'civic', source: 'world/buildings.js',
    desc: 'The Topologie storefront: awning, rails, plinths, the counter with its live screen.' },
  { id: 'museum', kind: 'engine', group: 'civic', status: 'legacy', source: 'world/buildings.js',
    desc: 'The world-scale museum entry. Legacy — the route from the grounds opens the real interiors above.' },
  { id: 'museum_hall', kind: 'engine', group: 'civic', status: 'legacy', source: 'world/buildings.js',
    desc: 'The world-scale deep hall. Legacy — the canonical Field hang lives in the Permanent Gallery.' },
  { id: 'visits', kind: 'engine', group: 'civic', status: 'stub', source: 'world/lookout.js',
    desc: 'The threshold into the full visit application. Still a placeholder.' },
  { id: 'nav-lab', kind: 'frame', group: 'interface', name: 'DESTINATIONS · NAV LAB 02', width: 1280, height: 800,
    url: '../lab/nav-lab.html', source: 'lab/nav-lab.html',
    desc: 'The travel menu and the compass, running live. Press INTERACT on the label, then M to open the menu.' },
];

const $ = (sel, root = document) => root.querySelector(sel);
const viewport = $('#viewport'), stage = $('#stage'), overlay = $('#overlay');
const railEl = $('#rail'), railList = $('#rail-list'), inspector = $('#inspector');
const progressEl = $('#progress'), zoomEl = $('#zoom'), selbox = $('#selbox'), hovbox = $('#hovbox');

const rooms = makeHub({ note() {} });
for (const id of Object.keys(rooms)) {
  if (!BOARDS.some((b) => b.id === id)) {
    BOARDS.push({ id, kind: 'engine', group: 'civic', status: 'uncatalogued', source: '?',
      desc: 'A room the engine knows that the workshop has no note for yet. Nothing the world contains is allowed to be missing from the record.' });
  }
}

const boards = [];
const view = { x: 0, y: 0, s: 1 };
let selected = null, hovered = null, anim = 0, stageW = 0, stageH = 0, rendered = 0;

/* ── boards ── */
function makeBoard(spec) {
  const room = spec.kind === 'engine' ? rooms[spec.id] : null;
  const b = {
    ...spec,
    name: spec.name || (room && room.name) || spec.id.toUpperCase(),
    width: room ? room.width : spec.width,
    height: room ? RH : spec.height,
    status: spec.status || (spec.kind === 'frame' ? 'interface' : 'rendering'),
    x: 0, y: 0,
  };
  b.el = document.createElement('div');
  b.el.className = 'board';
  b.el.dataset.id = b.id;
  b.plate = document.createElement('div');
  b.plate.className = 'plate';
  b.el.appendChild(b.plate);
  b.pending = document.createElement('div');
  b.pending.className = 'pending';
  b.pending.textContent = 'drawing…';
  b.plate.appendChild(b.pending);
  stage.appendChild(b.el);

  b.tag = document.createElement('div');
  b.tag.className = 'tag';
  b.tag.innerHTML = `<i class="dot"></i><b>${b.name}</b><small>${b.width} × ${b.height}</small>`;
  if (b.kind === 'frame') {
    const btn = document.createElement('button');
    btn.textContent = 'interact';
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      b.el.classList.toggle('interacting');
      const on = b.el.classList.contains('interacting');
      btn.textContent = on ? 'done' : 'interact';
      btn.classList.toggle('on', on);
    });
    b.tag.appendChild(btn);
  }
  overlay.appendChild(b.tag);
  b.tagW = b.tag.offsetWidth;
  sizeBoard(b);
  setStatus(b, b.status);
  return b;
}

document.fonts?.ready.then(() => {
  for (const b of boards) { b.tag.classList.remove('hide'); b.tagW = b.tag.offsetWidth; }
  apply();
});

function sizeBoard(b) {
  b.el.style.width = b.width + 'px';
  b.el.style.height = b.height + 'px';
  b.tag.querySelector('small').textContent = `${b.width} × ${b.height}`;
}

function setStatus(b, status) {
  b.status = status;
  b.el.classList.remove('legacy', 'stub', 'uncatalogued', 'error');
  if (['legacy', 'stub', 'uncatalogued', 'error'].includes(status)) b.el.classList.add(status);
  b.tag.querySelector('.dot').className = 'dot ' + status;
  if (b.row) b.row.querySelector('.dot').className = 'dot ' + status;
  if (selected === b) showInspector(b);
}

function finish(b, node) {
  b.pending.remove();
  b.plate.appendChild(node);
  rendered += 1;
  progress();
}

const STATUS_WORD = {
  live: 'live · drawn now', legacy: 'legacy · not routed in the world', stub: 'stub · route not open',
  uncatalogued: 'uncatalogued', interface: 'interface · running live', rendering: 'rendering…', error: 'failed to draw',
};

/* engine rooms: the atlas technique */
function renderEngine(b) {
  const room = rooms[b.id];
  if (!room) { setStatus(b, 'error'); b.pending.textContent = 'no such room'; return; }
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-40000px;top:0;';
  const canvas = document.createElement('canvas');
  holder.appendChild(canvas);
  document.body.appendChild(holder);
  const storageKey = `mnemos:workshop:${b.id}`;
  try { localStorage.removeItem(storageKey); } catch (_) {}
  try {
    const engine = create({
      mount: holder, palette: PALETTE, rooms, start: b.id,
      width: room.width, height: RH, walkBand: [352, 402], wallBase: 300,
      storageKey, cast: [], cat: null, scripts: [], groupScripts: [], ambient: [],
      bubbles: false, sound: false,
    });
    engine.destroy();
    engine.roomId = b.id; engine.camX = 0; engine.npcs = []; engine.cat = null;
    engine.av.x = -1000; engine.av.y = -1000;
    engine.weather.raining = false; engine.drawVignette = () => {};
    engine._bg = null; engine.bgRoom = null; engine._vig = null;
    engine.drawScene(FIXED_TIME);
    const source = [...holder.querySelectorAll('canvas')].find((c) => c.width === room.width) || canvas;
    const out = document.createElement('canvas');
    out.width = room.width; out.height = RH;
    out.getContext('2d').drawImage(source, 0, 0);
    finish(b, out);
    if (b.status === 'rendering') setStatus(b, 'live');
  } catch (error) {
    console.error('workshop: engine board failed', b.id, error);
    setStatus(b, 'error');
    b.pending.textContent = 'failed to draw — see console';
  } finally {
    holder.remove();
  }
}

/* museum interiors: ask the scene to render itself whole, offscreen, then release it */
function renderMuseum(b) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:absolute;left:-40000px;top:0;width:960px;height:600px;border:0;';
    frame.src = b.url;
    document.body.appendChild(frame);
    const started = performance.now();
    const done = (url) => {
      frame.remove();
      if (!url) {
        setStatus(b, 'error');
        b.pending.textContent = 'the scene did not answer';
        return resolve();
      }
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth && (img.naturalWidth !== b.width || img.naturalHeight !== b.height)) {
          b.width = img.naturalWidth; b.height = img.naturalHeight;
          sizeBoard(b); layout(); apply();
        }
        finish(b, img);
        setStatus(b, 'live');
        resolve();
      };
      img.src = url;
    };
    const tick = () => {
      let ready = false, win = null;
      try {
        win = frame.contentWindow;
        ready = Boolean(win && win.__workshopRender && win.render_game_to_text
          && JSON.parse(win.render_game_to_text()).ready);
      } catch (_) { ready = false; }
      if (ready) {
        let url = null;
        try { url = win.__workshopRender(); } catch (error) { console.error('workshop: museum board failed', b.id, error); }
        return done(url);
      }
      if (performance.now() - started > 40000) return done(null);
      setTimeout(tick, 250);
    };
    tick();
  });
}

/* interface surfaces: live, behind a shield so the canvas still pans */
function renderFrame(b) {
  const frame = document.createElement('iframe');
  frame.src = b.url;
  frame.title = b.name;
  const shield = document.createElement('div');
  shield.className = 'shield';
  b.pending.remove();
  b.plate.appendChild(frame);
  b.plate.appendChild(shield);
  rendered += 1;
  progress();
}

/* ── layout: each column stacks its groups; a group flows its boards in a
   row or stands them in a stack ── */
function layout() {
  const columns = { main: { x: MARGIN, w: 0, h: 0 }, side: { x: 0, w: 0, h: 0 } };
  for (const key of ['main', 'side']) {
    const col = columns[key];
    if (key === 'side') col.x = MARGIN + columns.main.w + GAP * 2;
    let y = MARGIN;
    for (const group of GROUPS.filter((g) => g.column === key)) {
      const list = boards.filter((b) => b.group === group.id);
      if (!list.length) continue;
      group.x = col.x; group.y = y;
      let x = col.x, rowH = 0;
      for (const b of list) {
        b.x = x; b.y = y;
        b.el.style.left = x + 'px';
        b.el.style.top = y + 'px';
        if (group.flow === 'stack') {
          y += b.height + STACK_GAP;
          col.w = Math.max(col.w, b.width);
        } else {
          x += b.width + GAP;
          rowH = Math.max(rowH, b.height);
        }
      }
      if (group.flow === 'stack') y -= STACK_GAP;
      else { y += rowH; col.w = Math.max(col.w, x - GAP - col.x); }
      y += GROUP_GAP;
    }
    col.h = y - GROUP_GAP;
  }
  stageW = (columns.side.w ? columns.side.x + columns.side.w : columns.main.x + columns.main.w) + MARGIN;
  stageH = Math.max(columns.main.h, columns.side.h) + MARGIN;
  stage.style.width = stageW + 'px';
  stage.style.height = stageH + 'px';
}

/* ── the view ── */
function apply() {
  stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
  stage.classList.toggle('crisp', view.s >= 1);
  zoomEl.textContent = Math.round(view.s * 100) + '%';
  const far = view.s < FAR;
  for (const b of boards) {
    const sx = b.x * view.s + view.x, sy = b.y * view.s + view.y, sw = b.width * view.s;
    b.tag.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy - 24)}px)`;
    b.tag.classList.toggle('hide', far || sw < b.tagW + 8);
  }
  for (const g of GROUPS) {
    if (!g.tag) continue;
    g.tag.classList.toggle('far', far);
    const lift = g.tag.offsetHeight + (far ? 8 : 34);
    g.tag.style.transform = `translate(${Math.round(g.x * view.s + view.x)}px, ${Math.round(g.y * view.s + view.y - lift)}px)`;
  }
  placeBox(selbox, selected);
  placeBox(hovbox, hovered && hovered !== selected ? hovered : null);
}

function placeBox(box, b) {
  box.classList.toggle('on', Boolean(b));
  if (!b) return;
  box.style.transform = `translate(${b.x * view.s + view.x}px, ${b.y * view.s + view.y}px)`;
  box.style.width = b.width * view.s + 'px';
  box.style.height = b.height * view.s + 'px';
}

function clampScale(s) { return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s)); }

function zoomAt(cx, cy, factor) {
  const ns = clampScale(view.s * factor);
  const r = ns / view.s;
  view.x = cx - (cx - view.x) * r;
  view.y = cy - (cy - view.y) * r;
  view.s = ns;
  apply();
}

const lerp = (a, b, t) => a + (b - a) * t;
function animateTo(target, duration = 480) {
  cancelAnimationFrame(anim);
  const from = { ...view };
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const e = 1 - Math.pow(1 - p, 3);
    view.s = Math.exp(lerp(Math.log(from.s), Math.log(target.s), e));
    view.x = lerp(from.x, target.x, e);
    view.y = lerp(from.y, target.y, e);
    apply();
    if (p < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

function fitRect(rect, pad = 90, max = 1, instant = false) {
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  const s = clampScale(Math.min((vw - pad * 2) / rect.w, (vh - pad * 2) / rect.h, max));
  const target = { s, x: (vw - rect.w * s) / 2 - rect.x * s, y: (vh - rect.h * s) / 2 - rect.y * s };
  if (instant) { Object.assign(view, target); apply(); } else animateTo(target);
}

function fitAll(instant = false) { fitRect({ x: 0, y: 0, w: stageW, h: stageH }, 60, 1, instant); }
function flyTo(b) { fitRect({ x: b.x, y: b.y - 40, w: b.width, h: b.height + 40 }, 70, 1); }

/* ── selection ── */
function select(b, { fly = false } = {}) {
  selected = b;
  for (const other of boards) other.row.classList.toggle('sel', other === b);
  if (b) {
    showInspector(b);
    history.replaceState(null, '', '#' + b.id);
    if (fly) flyTo(b);
  } else {
    inspector.classList.remove('on');
    history.replaceState(null, '', location.pathname);
  }
  apply();
}

function showInspector(b) {
  const group = GROUPS.find((g) => g.id === b.group);
  const open = b.kind === 'engine'
    ? `<a href="../atlas.html?room=${encodeURIComponent(b.id)}" target="_blank" rel="noopener">open in the atlas ↗</a>`
    : `<a href="${b.url}" target="_blank" rel="noopener">${b.kind === 'museum' ? 'walk it ↗' : 'open it ↗'}</a>`;
  inspector.innerHTML = `
    <h2>${b.name}</h2>
    <div class="meta"><span><i class="dot ${b.status}"></i>${STATUS_WORD[b.status] || b.status}</span><span>${group ? group.title : ''}</span><span>${b.width} × ${b.height}</span></div>
    <p>${b.desc || ''}</p>
    <div class="src">${b.source}</div>
    <div class="acts"><button class="fly">fly to it</button>${open}</div>`;
  inspector.querySelector('.fly').addEventListener('click', () => flyTo(b));
  inspector.classList.add('on');
}

function boardAt(target) {
  const el = target && target.closest ? target.closest('.board') : null;
  return el ? boards.find((b) => b.el === el) : null;
}

/* ── input ── */
const pointers = new Map();
let drag = null, pinch = null;

viewport.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.inspector')) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  viewport.setPointerCapture(event.pointerId);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
    drag = null;
    return;
  }
  if (event.button !== 0) return;
  drag = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false, target: boardAt(event.target) };
});

viewport.addEventListener('pointermove', (event) => {
  if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const rect = viewport.getBoundingClientRect();
    zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, dist / pinch.dist);
    pinch.dist = dist;
    return;
  }
  if (drag) {
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; viewport.classList.add('dragging'); }
    if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; apply(); }
    return;
  }
  const over = boardAt(event.target);
  if (over !== hovered) { hovered = over; apply(); }
});

const endPointer = (event) => {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && event.type === 'pointerup') {
    if (!drag.moved) select(drag.target);
  }
  if (drag) { drag = null; viewport.classList.remove('dragging'); }
};
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);

viewport.addEventListener('dblclick', (event) => {
  const b = boardAt(event.target);
  if (b) select(b, { fly: true });
});

viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  if (event.ctrlKey || event.metaKey) {
    const k = event.ctrlKey ? 0.011 : 0.0022;    // trackpad pinch arrives as ctrl+wheel with small deltas
    zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * k));
    return;
  }
  const unit = event.deltaMode === 1 ? 18 : 1;
  let dx = event.deltaX * unit, dy = event.deltaY * unit;
  if (event.shiftKey && dx === 0) { dx = dy; dy = 0; }
  view.x -= dx; view.y -= dy;
  apply();
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (event.target.closest && event.target.closest('input, textarea')) return;
  const rect = viewport.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  if (event.key === '0') fitAll();
  else if (event.key === '+' || event.key === '=') zoomAt(cx, cy, 1.25);
  else if (event.key === '-' || event.key === '_') zoomAt(cx, cy, 0.8);
  else if (event.key === 'f' || event.key === 'F') { if (selected) flyTo(selected); }
  else if (event.key === 'Escape') select(null);
  else if (event.key === '`') toggleRail();
  else return;
  event.preventDefault();
});

$('#zoom-in').addEventListener('click', () => zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1.25));
$('#zoom-out').addEventListener('click', () => zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 0.8));
$('#fit').addEventListener('click', () => fitAll());
$('#rail-toggle').addEventListener('click', toggleRail);
function toggleRail() { railEl.classList.toggle('closed'); requestAnimationFrame(apply); }
window.addEventListener('resize', apply);
window.addEventListener('hashchange', () => {
  const b = boards.find((x) => x.id === location.hash.slice(1));
  if (b) select(b, { fly: true });
});

/* ── the rail ── */
function buildRail() {
  railList.innerHTML = '';
  for (const group of GROUPS) {
    const list = boards.filter((b) => b.group === group.id);
    if (!list.length) continue;
    const h = document.createElement('h3');
    h.textContent = group.title;
    railList.appendChild(h);
    for (const b of list) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<i class="dot ${b.status}"></i><b>${b.name}</b><small>${b.width}×${b.height}</small>`;
      row.addEventListener('click', () => select(b, { fly: true }));
      railList.appendChild(row);
      b.row = row;
    }
  }
}

function progress() {
  progressEl.textContent = rendered < boards.length
    ? `drawing the world… ${rendered} / ${boards.length}`
    : `${boards.length} boards · drawn live at ${new Date().toTimeString().slice(0, 5)}`;
  if (rendered >= boards.length) {
    progressEl.classList.add('done');
    document.documentElement.dataset.ready = 'true';
  }
}

/* ── go ── */
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

async function main() {
  for (const spec of BOARDS) boards.push(makeBoard(spec));
  for (const group of GROUPS) {
    if (!boards.some((b) => b.group === group.id)) continue;
    group.tag = document.createElement('div');
    group.tag.className = 'zone';
    group.tag.innerHTML = `${group.title}<small>${group.note}</small>`;
    overlay.appendChild(group.tag);
  }
  buildRail();
  layout();
  fitAll(true);

  const museumJobs = boards.filter((b) => b.kind === 'museum').map((b) => renderMuseum(b));
  for (const b of boards) {
    if (b.kind === 'frame') renderFrame(b);
  }
  for (const b of boards) {
    if (b.kind !== 'engine') continue;
    renderEngine(b);
    await yieldFrame();
  }
  const wanted = boards.find((b) => b.id === location.hash.slice(1));
  if (wanted) select(wanted, { fly: true });
  await Promise.all(museumJobs);
  progress();
}

main().catch((error) => {
  console.error('workshop: failed', error);
  progressEl.textContent = 'the workshop failed to open — see console';
});
