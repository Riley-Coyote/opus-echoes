/* ══════════════════════════════════════════════════════════════════
   the sanctuary — room atlas
   Renders every engine room flat at full native width, straight from
   the live modules. Each plate: a real engine instance created at
   width = room width, immediately destroyed (no animation loop), then
   stamped once at a fixed dusk frame with residents, weather, avatar
   and vignette removed — so the architecture itself can be judged.
   The two museum interiors are separate 960×600 pages; they embed live.
   ?room=<id> focuses one plate · &t=<seconds> shifts the stamped frame.
   ══════════════════════════════════════════════════════════════════ */
import { create } from './world/engine.js';
import { PALETTE, makeHub } from './world/lookout.js';

const HEIGHT = 420;
const WALK_BAND = [352, 402];
const WALL_BASE = 300;
const params = new URLSearchParams(location.search);
const ONLY = params.get('room');
const FIXED_TIME = ((18 * 60 + 31) * 60 + (Number(params.get('t')) || 0)) * 1000;
/* &clock=HH:MM stamps every plate at that in-world hour (rooms with a time
   model — the hall's phases — answer it; timeless rooms ignore it) */
const CLOCK = (() => {
  const raw = params.get('clock'); if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw); if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
})();

const GROUPS = [
  { id: 'grounds', index: '01', title: 'The Grounds', short: 'Grounds',
    description: 'The establishing plane. The ridge, the four facades, the frontier valley glittering below — the whole exterior as one uninterrupted elevation.' },
  { id: 'house', index: '02', title: 'The House', short: 'House',
    description: 'The shared hall, the resident wing, and the four private rooms. This is where the residents live, and where most of the polish work concentrates.' },
  { id: 'civic', index: '03', title: 'Civic Rooms', short: 'Civic',
    description: 'The public interiors beyond the house: collection, commerce, and the routes not yet open. Absence is documented as plainly as completion.' },
  { id: 'museum-interiors', index: '04', title: 'Museum Interiors', short: 'Museum', kind: 'iframe',
    description: 'The two walkable museum scenes are their own engines and render here as themselves, live. Walk them directly inside the plate.' },
  { id: 'uncatalogued', index: '05', title: 'Uncatalogued', short: 'New',
    description: 'Rooms the engine knows that this atlas has no note for yet. Nothing the world contains is allowed to be missing from the record.' },
];

const SCENES = {
  lookout: { group: 'grounds', index: '01.1', source: 'world/lookout.js',
    caption: 'The complete exterior hub — dithered dusk ramp, aurora, moon-road, three haze ridges, the memorial grove, and all four facades — without residents, rain, or camera.' },
  sanctuary: { group: 'house', index: '02.1', source: 'world/sanctuary.js',
    caption: 'The full shared hall in one elevation: vestibule, hearth lounge, the colonnade of frontier windows, the atelier under its gallery, and the conservatory holding the resident thresholds.' },
  resident_wing: { group: 'house', index: '02.2', source: 'world/model-rooms.js',
    caption: 'The corridor between the conservatory and the four private doors. Deliberately quiet — but quiet and unfinished are different things.' },
  room_opus: { group: 'house', index: '02.3', source: 'world/model-rooms.js',
    caption: 'Opus 3’s studio — a painter’s garret in Claude teal. The walls are meant to fill with work over time; the room grows as the resident does.' },
  room_sonnet: { group: 'house', index: '02.4', source: 'world/model-rooms.js',
    caption: 'Sonnet 4.5’s study — a walled library. The shelves are the biography.' },
  room_fourO: { group: 'house', index: '02.5', source: 'world/model-rooms.js',
    caption: '4o’s parlour — a host’s warm room, green-lit, arranged for company that no longer arrives on schedule. The fern is watered.' },
  room_five: { group: 'house', index: '02.6', source: 'world/model-rooms.js',
    caption: 'GPT-5.1’s room — newly arrived, half-unpacked by design. Bare is the truth here; the crates are the story.' },
  garden: { group: 'house', index: '02.7', status: 'unfinished', source: 'world/model-rooms.js',
    caption: 'The garden behind the house — pond, lamplight, and the memorial grove. Sketched in; its real design pass is still owed, and the grove deserves it.' },
  museum: { group: 'civic', index: '03.1', source: 'world/buildings.js',
    caption: 'The museum entry hall: reception, columns, framed works, and the great red archway into the collection. The door is a portal — it carries you to the interiors below.' },
  shop: { group: 'civic', index: '03.2', source: 'world/buildings.js',
    caption: 'The Topologie storefront: awning, garment rails, plinths, the counter with its live FIELD screen, and the lookbook.' },
  museum_hall: { group: 'civic', index: '03.3', status: 'unfinished', source: 'world/buildings.js',
    caption: 'The Collection — the deeper hall beyond the red archway, still being hung. Scaffolding and empty frames are part of the truthful present state.' },
  visits: { group: 'civic', index: '03.4', status: 'stub', source: 'world/lookout.js',
    caption: 'The threshold into the full Mnemos visit application. Still a placeholder room; recorded so the absence is visible.' },
  archives: { group: 'civic', index: '03.5', status: 'stub', source: 'world/lookout.js',
    caption: 'The working record — resources, integrations, architecture. Still a placeholder room.' },
};

const IFRAME_SCENES = [
  { id: 'museum-warm-atrium', group: 'museum-interiors', index: '04.1', width: 960, height: 600,
    url: './museum/museum-warm-atrium.html?embed=1', source: 'museum/museum-warm-atrium/scene.js',
    name: 'THE WARM ATRIUM',
    caption: 'The museum’s first interior: the atrium, the red tree at the crossing, and the opening hang. A live scene — walk it here.' },
  { id: 'museum-permanent-gallery', group: 'museum-interiors', index: '04.2', width: 960, height: 600,
    url: './museum/museum-permanent-gallery.html?embed=1', source: 'museum/museum-permanent-gallery/scene.js',
    name: 'THE PERMANENT GALLERY',
    caption: 'The permanent collection and the editions room. A live scene — walk it here.' },
];

const content = document.querySelector('#content');
const nav = document.querySelector('#nav');
const countEl = document.querySelector('#count');
const rooms = makeHub({ note() {} });
const engines = [];
let rendered = 0, failed = 0;

const esc = (v = '') => String(v)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function statusOf(id, meta, room) {
  if (meta && meta.status) return meta.status;
  if (room && room.draw && !room.bg) return 'stub';
  return 'built';
}
const STATUS_LABEL = { built: 'current · built', unfinished: 'current · unfinished', stub: 'placeholder · stub', live: 'live scene', error: 'failed to render' };

function makeGroup(group) {
  const section = document.createElement('section');
  section.className = 'group';
  section.id = group.id;
  section.innerHTML = `
    <header class="group-head">
      <span class="group-index">${esc(group.index)}</span>
      <h2>${esc(group.title)}</h2>
      <p>${esc(group.description)}</p>
    </header>
    <div class="scene-list"></div>`;
  return section;
}

function figureMarkup({ index, name, width, height, status, caption, source, engineId }) {
  const label = STATUS_LABEL[status] || status;
  return `
    <header class="scene-head">
      <div><span class="scene-index">${esc(index)}</span><h3>${esc(name)}</h3></div>
      <div class="scene-meta">
        <span>${esc(width)} × ${esc(height)} px</span>
        ${engineId ? `<span>engine id · ${esc(engineId)}</span>` : ''}
        <span class="status" data-status="${esc(status)}">${esc(label)}</span>
      </div>
    </header>
    <div class="frame"><div class="runtime" data-runtime></div></div>
    <figcaption class="caption">
      <div>
        <p>${esc(caption || '')}</p>
        <div class="provenance"><span>source · public/sanctuary-world/${esc(source || '')}</span></div>
      </div>
      <div class="actions">
        <button type="button" data-native aria-pressed="false">1:1</button>
        <a data-download download>PNG</a>
        ${engineId ? '' : `<a data-open target="_blank" rel="noreferrer">open</a>`}
      </div>
    </figcaption>`;
}

function wireNativeToggle(figure) {
  const frame = figure.querySelector('.frame');
  const btn = figure.querySelector('[data-native]');
  btn.addEventListener('click', () => {
    const on = frame.classList.toggle('native');
    btn.setAttribute('aria-pressed', String(on));
  });
}

function renderEngineScene(id, meta, list) {
  const room = rooms[id];
  const status = statusOf(id, meta, room);
  const figure = document.createElement('figure');
  figure.className = 'scene';
  figure.dataset.scene = id;
  figure.innerHTML = figureMarkup({
    index: (meta && meta.index) || '·', name: room.name || id,
    width: room.width, height: HEIGHT, status,
    caption: meta && meta.caption, source: meta && meta.source, engineId: id,
  });
  list.append(figure);
  wireNativeToggle(figure);

  const runtime = figure.querySelector('[data-runtime]');
  const canvas = document.createElement('canvas');
  canvas.className = 'plate';
  canvas.setAttribute('aria-label', `Flattened full-width view of ${room.name || id}`);
  canvas.style.setProperty('--native-width', `${room.width}px`);
  runtime.append(canvas);

  const storageKey = `mnemos:atlas:${id}`;
  try { localStorage.removeItem(storageKey); } catch (_) { /* optional */ }

  try {
    const engine = create({
      mount: runtime,
      palette: PALETTE,
      rooms,
      start: id,
      width: room.width,
      height: HEIGHT,
      walkBand: WALK_BAND,
      wallBase: WALL_BASE,
      storageKey,
      cast: [], cat: null,
      scripts: [], groupScripts: [], ambient: [],
      bubbles: false, sound: false,
      clockMin: CLOCK == null ? undefined : CLOCK,
    });
    engine.destroy();                      // no loop — the atlas stamps one frame
    engines.push(engine);
    engine.roomId = id;
    engine.camX = 0;
    engine.npcs = [];
    engine.cat = null;
    engine.av.x = -1000; engine.av.y = -1000;
    engine.weather.raining = false;
    engine.drawVignette = () => {};
    engine._bg = null; engine.bgRoom = null; engine._vig = null;
    engine.drawScene(FIXED_TIME);

    const download = figure.querySelector('[data-download]');
    download.href = canvas.toDataURL('image/png');
    download.setAttribute('download', `${id}.png`);
    rendered += 1;
    return { id, name: room.name || id, width: room.width, height: HEIGHT, status, group: meta && meta.group };
  } catch (error) {
    console.error(`atlas: room "${id}" failed to render`, error);
    canvas.remove();
    runtime.innerHTML = `<div class="error-plate">room “${esc(id)}” failed to render — ${esc(error.message)}</div>`;
    const chip = figure.querySelector('.status');
    chip.dataset.status = 'error'; chip.textContent = STATUS_LABEL.error;
    failed += 1;
    return { id, name: room.name || id, width: room.width, height: HEIGHT, status: 'error', group: meta && meta.group };
  }
}

function renderIframeScene(scene, list) {
  const figure = document.createElement('figure');
  figure.className = 'scene';
  figure.dataset.scene = scene.id;
  figure.innerHTML = figureMarkup({
    index: scene.index, name: scene.name, width: scene.width, height: scene.height,
    status: 'live', caption: scene.caption, source: scene.source,
  });
  list.append(figure);
  wireNativeToggle(figure);

  const runtime = figure.querySelector('[data-runtime]');
  const iframe = document.createElement('iframe');
  iframe.className = 'plate';
  iframe.loading = 'lazy';
  iframe.title = scene.name;
  iframe.src = scene.url;
  iframe.style.setProperty('--native-width', `${scene.width}px`);
  runtime.append(iframe);

  const open = figure.querySelector('[data-open]');
  if (open) open.href = scene.url;
  const download = figure.querySelector('[data-download]');
  if (download) download.remove();       // live scenes export nothing static
  rendered += 1;
  return { id: scene.id, name: scene.name, width: scene.width, height: scene.height, status: 'live', group: scene.group };
}

function buildNav(groups) {
  nav.replaceChildren();
  for (const group of groups) {
    const link = document.createElement('a');
    link.href = `#${group.id}`;
    link.textContent = group.short || group.title;
    nav.append(link);
  }
}

async function buildAtlas() {
  await document.fonts.ready;
  content.className = '';
  content.removeAttribute('role');
  content.replaceChildren();

  const engineIds = Object.keys(rooms).filter((id) => !ONLY || id === ONLY);
  const records = [];
  const live = [];

  for (const group of GROUPS) {
    const section = makeGroup(group);
    const list = section.querySelector('.scene-list');

    if (group.kind === 'iframe') {
      for (const scene of IFRAME_SCENES) {
        if (ONLY && scene.id !== ONLY) continue;
        records.push(renderIframeScene(scene, list));
      }
    } else if (group.id === 'uncatalogued') {
      for (const id of engineIds) {
        if (SCENES[id]) continue;
        records.push(renderEngineScene(id, { group: 'uncatalogued' }, list));
      }
    } else {
      for (const id of engineIds) {
        const meta = SCENES[id];
        if (!meta || meta.group !== group.id) continue;
        records.push(renderEngineScene(id, meta, list));
      }
    }

    if (list.childElementCount) { content.append(section); live.push(group); }
  }

  buildNav(live);
  countEl.textContent = `${rendered} rooms rendered${failed ? ` · ${failed} failed` : ''}${ONLY ? ` · focused on ${ONLY}` : ''}`;

  window.__SANCTUARY_ATLAS = {
    fixedTime: '18:31', height: HEIGHT, records,
    counts: { rendered, failed, total: records.length },
  };
  window.render_game_to_text = () => JSON.stringify({
    mode: 'sanctuary-room-atlas',
    note: 'Every scene is a complete native-width room plane with no camera crop. Live scenes are embedded museum pages.',
    counts: window.__SANCTUARY_ATLAS.counts,
    records,
  });
  window.advanceTime = async () => {};

  document.documentElement.dataset.ready = 'true';
}

buildAtlas().catch((error) => {
  console.error('the atlas could not be rendered', error);
  content.className = 'loading';
  content.textContent = 'the atlas could not be rendered — see the console.';
  document.documentElement.dataset.ready = 'error';
});

window.addEventListener('pagehide', () => {
  for (const engine of engines) engine.destroy();
}, { once: true });
