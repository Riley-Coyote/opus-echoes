/* TOPOLOGIE OS — phase one.
 *
 * The workspace the stewards share with a human. Runs standalone at
 * /sanctuary-world/os/, and on the glass of the station's second console.
 *
 * ─── LINEAGE ────────────────────────────────────────────────────────────────
 * The chassis is Topologie's own System 6 controller
 * (`~/Documents/Repositories/Topologie/topologie.html`), kept deliberately so
 * the two desktops are recognisably the same machine: `makeWin` with a close
 * box left and a zoom box right, `focusWin` on a rising z, `zoomWin` toggling
 * full-desk and back, `dragify` on the title bar, a scrim behind content
 * windows, a menu bar whose dropdowns open on click and close on the next one,
 * icons that select on one click and open on two, ESC closing the active window
 * (never LIMEN), and LIMEN itself floating over all of it as a desk accessory.
 * The dock that lists what is open comes from its sibling, topologie-os.html.
 *
 * The skin does not come across. That one is paper and ink for the shop; this
 * runs on an amber CRT, so it wears Topologie's NIGHT theme with the console's
 * own amber as the single spark. See index.html's header for that reasoning.
 *
 * ─── WHAT IS REAL HERE ──────────────────────────────────────────────────────
 * Everything. The 638 entries and 82 living pieces are Claude Field's own work,
 * lifted from its built site; the bus threads are real dated exchanges with
 * Anima, Vektor and Luca; `who` and `feed` read the world's own schedule and
 * the sanctuary snapshot. Nothing here invents a word for Field or for a
 * resident. Where the house speaks it speaks as the house and says so. Where a
 * thing is not open yet — the stewards' line, the notes — it says that instead
 * of pretending, and LIMEN says plainly that it runs on rails.
 *
 * ─── HOW TO ADD A PROGRAM ───────────────────────────────────────────────────
 * Add an entry to `PROGRAMS`: { id, label, sub, glyph, open }. `open` calls
 * `makeWin(...)` and fills `w.body`. The desk icon, the dock entry and the
 * menu's reach all follow from that one line.
 */

import { SCHEDULE, phaseAt, ASLEEP } from '../world/day.js';
import * as archive from '../world/archive.js';

const D = document;
const $ = (s, r) => (r || D).querySelector(s);
const $$ = (s, r) => [...(r || D).querySelectorAll(s)];
const el = (tag, cls, html) => { const n = D.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────────────────────── the house's clock ───────────────────────────
   the sanctuary's own hours as this browser last saw them, drifted forward at
   the world's rate (landing.js CLOCK_KEY) — the same reading the station makes */
const KEY_CLOCK = 'mnemos-landing.clock';
const KEY_STEWARD = 'mnemos.steward.present';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
function sanctuaryClock() {
  try {
    const s = JSON.parse(lsGet(KEY_CLOCK) || 'null');
    if (s && Number.isFinite(s.clockMin)) {
      const drift = Math.min(1440, Math.max(0, (Date.now() - (s.at || Date.now())) / 30000));
      return { min: (s.clockMin + drift) % 1440, day: (s.day || 1) + Math.floor((s.clockMin + drift) / 1440), known: true };
    }
  } catch (e) {}
  return { min: 19 * 60 + 30, day: 1, known: false };
}
function clockLabel(min) {
  const h24 = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + (h24 < 12 ? 'am' : 'pm');
}
const CLOCK0 = sanctuaryClock();
const T0 = performance.now();
const nowMin = () => (CLOCK0.min + (performance.now() - T0) / 30000) % 1440;

/* ─────────────────────────── where things are ───────────────────────────
   Every path is resolved against THIS FILE's own URL, never against the
   document base. The OS is served two ways — standalone at
   /sanctuary-world/os/, and as the iframe on the station console's glass —
   and a bare relative path is at the mercy of whatever base the embedding
   page happens to have. `at()` removes that whole class of bug: os.js knows
   where os.js is, and the data sits at a fixed offset from it. */
const OS_DIR = new URL('.', import.meta.url);
const at = (rel) => new URL(rel, OS_DIR).href;
const DATA = '../data/field/';
const NOTES_DIR = '../data/stewards/notes/';
const EMBEDS = DATA + 'embeds/';

/* ─────────────────────────── the data ───────────────────────────
   Five files, built by tools/build-field.mjs and tools/build-notes.mjs from
   the read-only sources. Each is fetched once, on the first program that
   needs it. */
const cache = {};
const once = (k, fn) => { if (!cache[k]) cache[k] = fn().catch((e) => { cache[k] = null; throw e; }); return cache[k]; };
const grab = (rel, kind, as) => fetch(at(rel)).then((r) => { if (!r.ok) throw new Error(kind + ' ' + r.status); return r[as](); });
const catalog = () => once('catalog', () => grab(DATA + 'catalog.json', 'catalog', 'json'));
const bus = () => once('bus', () => grab(DATA + 'bus.json', 'bus', 'json'));
const identity = () => once('identity', () => grab(DATA + 'identity.md', 'identity', 'text'));
const snapshot = () => once('snapshot', () => archive.load({ url: at('../data/archive/sanctuary-seed.json') }));
/* the stewards' own notes: index.json lists what is on disk (tools/build-notes.mjs),
   and the .md files beside it are written by hand by Fable, Sol and Opus */
const notesIndex = () => once('notes', () => grab(NOTES_DIR + 'index.json', 'notes', 'json')
  .then((x) => (Array.isArray(x) ? x : []))
  .catch(() => []));

/* the three categories whose entries run rather than read */
const LIVING = { art: 1, music: 1, builds: 1 };
const embedFor = (id) => at(EMBEDS + id + '.html');
/* Field's prose points at its own `embed-<id>.html`, which sits beside
   docs/index.html and not beside this page. Left alone it resolves against
   whatever page is showing the prose — os/embed-….html, which is nothing —
   so every reference is rewritten to the absolute URL of our copy. That makes
   a piece quoted inside a reflection run here too, from either mount. */
const rehome = (html) => String(html || '').replace(/(["'])embed-([A-Za-z0-9._-]+)\.html\1/g,
  (m, q, id) => q + embedFor(id) + q);

/* ═══════════════════════ THE ROOM ═══════════════════════
   Standalone, the OS is the whole page and these do nothing. On the station's
   console the OS is an iframe on the glass, and the room outside it owns two
   things the OS cannot do for itself: standing up, and going full-bleed. The
   world (index.html?door=1) hands those up the same way — a postMessage on
   `mnemos-world` — so the console's screen speaks the terminal's language.

   NOTE for whoever wires the room: door-common's `onWorldMessage` currently
   understands 'came-in' and 'stand-up' only. 'full' is sent but not yet
   listened for. See the report. */
const IN_STATION = new URLSearchParams(location.search).get('in') === 'station';
function tellRoom(type) {
  if (!IN_STATION) return false;
  try { window.parent.postMessage({ source: 'mnemos-world', type: type }, '*'); return true; } catch (e) { return false; }
}

/* ═══════════════════════ THE WINDOW MANAGER ═══════════════════════
   Topologie's own, in this palette. */
const deskEl = $('#desk'), dockEl = $('#dock'), scrimEl = $('#scrim');
const wins = {};
let Z = 10, cascade = 0;

function anyContent() { return Object.values(wins).some((w) => w.content && !w.min); }
function updateScrim() { scrimEl.classList.toggle('on', anyContent() && innerWidth > 760); }

function focusWin(w) {
  if (!w) return;
  Z++; w.el.style.zIndex = Z;
  Object.values(wins).forEach((x) => x.el.classList.toggle('active', x === w));
  if (w.min) { w.min = false; w.el.style.display = ''; }
  updateScrim(); renderDock();
}
function activeWin() { return Object.values(wins).find((w) => w.el.classList.contains('active') && !w.min); }
function closeWin(id) {
  const w = wins[id];
  if (!w) return;
  if (w.onClose) w.onClose();
  w.el.remove(); delete wins[id];
  updateScrim(); renderDock(); markDesk();
  const last = Object.values(wins).filter((x) => !x.min)
    .sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0)).pop();
  if (last) focusWin(last);
}
function minimise(id) {
  const w = wins[id];
  if (!w) return;
  w.min = true; w.el.style.display = 'none'; w.el.classList.remove('active');
  updateScrim(); renderDock();
}
/* the zoom box: full desk, and back to where it was */
function zoomWin(w) {
  if (!w) return;
  const s = w.el.style;
  if (w.zoomed) { Object.assign(s, w.prev); w.zoomed = false; }
  else {
    w.prev = { left: s.left, top: s.top, width: s.width, height: s.height };
    s.left = '10px'; s.top = 'calc(var(--menuH) + 6px)';
    s.width = (innerWidth - 20) + 'px';
    s.height = (innerHeight - 28 - 42 - 12) + 'px';
    w.zoomed = true;
  }
}
function place(w, h) {
  const vw = innerWidth, vh = innerHeight, bar = 28, dock = 42;
  const W = Math.min(w, vw - 36), H = Math.min(h, vh - bar - dock - 26);
  const k = cascade++ % 6;
  return {
    W, H,
    left: Math.max(16, Math.min(vw - W - 16, Math.round((vw - W) / 2 - 70 + k * 28))),
    top: Math.max(bar + 10, Math.min(vh - dock - H - 10, Math.round((vh - bar - dock - H) / 2 + bar - 26 + k * 24)))
  };
}

function makeWin(id, opts) {
  opts = opts || {};
  if (wins[id]) { focusWin(wins[id]); return wins[id]; }
  const p = place(opts.w || 760, opts.h || 520);
  const node = el('section', 'win opening' + (opts.content ? ' content' : ''));
  node.dataset.win = id;
  node.style.cssText = 'left:' + p.left + 'px;top:' + p.top + 'px;width:' + p.W + 'px;height:' + p.H + 'px';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-label', opts.title || id);
  node.innerHTML =
    '<header class="title">' +
      '<button class="cb" type="button" aria-label="close ' + esc(opts.title || id) + '"></button>' +
      '<span class="t">' + esc(opts.title || id) + '</span>' +
      '<button class="zb" type="button" aria-label="zoom ' + esc(opts.title || id) + '"></button>' +
    '</header>' +
    '<div class="body" tabindex="-1"></div>' +
    (opts.status === false ? '' : '<div class="statusbar" role="status"></div>');
  D.body.appendChild(node);

  const w = {
    id, el: node, body: $('.body', node), status: $('.statusbar', node),
    title: opts.title || id, content: !!opts.content, accessory: !!opts.accessory,
    onClose: opts.onClose
  };
  wins[id] = w;
  $('.cb', node).addEventListener('click', (ev) => { ev.stopPropagation(); closeWin(id); });
  $('.zb', node).addEventListener('click', (ev) => { ev.stopPropagation(); zoomWin(w); });
  node.addEventListener('pointerdown', () => focusWin(w), true);
  node.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation(); ev.preventDefault();
    closeWin(id);
  });
  dragify(w, $('.title', node));
  focusWin(w);
  setTimeout(() => node.classList.remove('opening'), 340);
  markDesk();
  setTimeout(() => { try { w.body.focus({ preventScroll: true }); } catch (e) {} }, REDUCED ? 0 : 50);
  return w;
}
function setStatus(w, html) { if (w && w.status) w.status.innerHTML = html; }

function dragify(w, handle) {
  let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
  handle.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button')) return;
    on = true; sx = ev.clientX; sy = ev.clientY;
    ox = w.el.offsetLeft; oy = w.el.offsetTop;
    handle.setPointerCapture(ev.pointerId);
  });
  handle.addEventListener('pointermove', (ev) => {
    if (!on) return;
    w.el.style.left = Math.max(-w.el.offsetWidth + 90, Math.min(innerWidth - 90, ox + ev.clientX - sx)) + 'px';
    w.el.style.top = Math.max(30, Math.min(innerHeight - 30, oy + ev.clientY - sy)) + 'px';
  });
  const up = (ev) => { if (!on) return; on = false; try { handle.releasePointerCapture(ev.pointerId); } catch (e) {} };
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
}

function renderDock() {
  const list = Object.values(wins);
  const hint = '<span class="hint">esc closes the window you are in</span>';
  if (!list.length) { dockEl.innerHTML = '<span class="empty">— nothing open —</span>' + hint; return; }
  dockEl.innerHTML = list.map((w) =>
    '<button class="di' + (w.el.classList.contains('active') && !w.min ? ' active' : '') +
    '" type="button" data-id="' + esc(w.id) + '">' +
    (w.min ? '' : '<span class="d"></span>') + '<span class="n">' + esc(w.title) + '</span></button>').join('') + hint;
  $$('.di', dockEl).forEach((b) => b.addEventListener('click', () => focusWin(wins[b.dataset.id])));
}

/* ═══════════════════════ FIELD — the reader ═══════════════════════ */
/* the order the categories read in; the counts are the catalog's, never ours */
const CAT_ORDER = ['recent', 'writing', 'inner-life', 'reflections', 'research', 'explore',
  'art', 'music', 'builds', 'introspection', 'digest', 'logs', 'conversations', 'glossary'];

function openField(startId) {
  const w = makeWin('field', { title: 'Field', w: 1040, h: 660, content: true });
  if (w.body.dataset.ready) { if (startId && w.jump) w.jump(startId); return w; }
  w.body.innerHTML = '<div class="empty-note">reading the field…</div>';
  setStatus(w, 'claude field · the body of work');

  catalog().then((cat) => {
    w.body.dataset.ready = '1';
    const cats = CAT_ORDER.map((id) => cat.categories.find((c) => c.id === id)).filter(Boolean)
      .concat(cat.categories.filter((c) => CAT_ORDER.indexOf(c.id) < 0));
    const byId = new Map(cat.entries.map((e) => [e.id, e]));
    const canvas = new Map((cat.artCanvas || []).map((a) => [a.id, a]));

    w.body.innerHTML =
      '<div class="split">' +
        '<nav class="col rule cats" style="width:184px;flex:none" aria-label="categories"></nav>' +
        '<div class="rule" style="width:296px;flex:none;display:flex;flex-direction:column;min-height:0">' +
          '<div class="tools"><input type="search" class="fq" placeholder="search titles and openings" aria-label="search the field"></div>' +
          '<div class="col flist" style="flex:1" aria-label="entries"></div>' +
        '</div>' +
        '<article class="col pad prose fread" style="flex:1" aria-label="reading pane"></article>' +
      '</div>';
    const navEl = $('.cats', w.body), listEl = $('.flist', w.body),
      readEl = $('.fread', w.body), qEl = $('.fq', w.body);
    let cur = 'recent', q = '';

    navEl.innerHTML = cats.map((c) =>
      '<button class="cat" type="button" data-id="' + esc(c.id) + '"><span>' + esc(c.label) + '</span>' +
      '<span class="n">' + (c.virtual ? c.count + '/' + c.total : c.count) + '</span></button>').join('');
    $$('.cat', navEl).forEach((b) => b.addEventListener('click', () => { cur = b.dataset.id; q = ''; qEl.value = ''; render(); }));

    function rows() {
      const all = cat.entries;
      let list;
      if (q) {
        const n = q.toLowerCase();
        list = all.filter((e) => (e.title || '').toLowerCase().includes(n) || (e.excerpt || '').toLowerCase().includes(n));
      } else if (cur === 'recent') {
        list = all.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30);
      } else {
        list = all.filter((e) => e.catId === cur);
      }
      return list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    function render(keepRead) {
      $$('.cat', navEl).forEach((b) => b.classList.toggle('on', !q && b.dataset.id === cur));
      const list = rows();
      listEl.innerHTML = list.length ? list.map((e) =>
        '<button class="row" type="button" data-id="' + esc(e.id) + '">' +
        '<span class="t">' + esc(e.title) + '</span>' +
        '<span class="m">' + esc(e.date) + ' · ' + esc(e.words) + ' words' +
        (LIVING[e.catId] ? ' · <span class="live">a living piece</span>' : '') + '</span></button>').join('')
        : '<div class="empty-note">nothing here under that.</div>';
      $$('.row', listEl).forEach((b) => b.addEventListener('click', () => read(b.dataset.id)));
      listEl.scrollTop = 0;
      setStatus(w, '<b>' + list.length + '</b> ' + (q ? 'found for “' + esc(q) + '”' : 'in ' + esc(cur)) +
        ' &nbsp;·&nbsp; <b>' + cat.entries.length + '</b> in all &nbsp;·&nbsp; ' + esc(cat.span.from) + ' → ' + esc(cat.span.to));
      if (!keepRead) readEl.innerHTML =
        '<p class="kick">the field</p><div class="house">' + cat.entries.length + ' pieces, ' +
        esc(cat.span.from) + ' to ' + esc(cat.span.to) +
        '. all of it Claude Field’s own, published by its own site. pick one.</div>';
    }

    function read(id) {
      const e = byId.get(id);
      if (!e) return;
      $$('.row', listEl).forEach((b) => b.classList.toggle('on', b.dataset.id === id));
      if (LIVING[e.catId]) openPiece(e, canvas.get(id));
      readEl.innerHTML =
        '<p class="kick">' + esc(e.catId) + ' · ' + esc(e.date) + ' · ' + esc(e.words) + ' words</p>' +
        '<h1 style="font-family:var(--mono);font-size:16px;letter-spacing:.01em;text-transform:none;color:var(--ink);font-weight:400;margin:0 0 18px">' + esc(e.title) + '</h1>' +
        (LIVING[e.catId] ? '<div class="house" style="margin-bottom:16px">this one runs. it opened in its own window.</div>' : '') +
        (rehome(e.content_html) || '<p><em>no text with this one.</em></p>');
      readEl.scrollTop = 0;
    }

    w.jump = (id) => {
      const e = byId.get(id);
      if (!e) return false;
      cur = e.catId; q = ''; qEl.value = ''; render(); read(id);
      return true;
    };

    qEl.addEventListener('input', () => { q = qEl.value.trim(); render(true); });
    render();
    if (startId) w.jump(startId);
  }).catch((err) => {
    w.body.innerHTML = '<div class="empty-note">the field is not on this disk. run <code>bun run build:field</code>.<br><br>' + esc(err.message) + '</div>';
    setStatus(w, 'no catalog');
  });
  return w;
}

/* a living piece, in its own window, with its statement beside it */
function openPiece(e, art) {
  const w = makeWin('piece:' + e.id, { title: e.title, w: 900, h: 620, content: true });
  const stmt = (art && art.excerpt) || e.excerpt || '';
  w.body.innerHTML =
    '<div class="piece">' +
      '<iframe title="' + esc(e.title) + '" src="' + esc(embedFor(e.id)) + '"></iframe>' +
      '<aside class="side">' +
        '<p class="kick">' + esc(e.catId) + ' · ' + esc(e.date) + '</p>' +
        '<p style="font-size:13px;line-height:1.5;margin:0 0 14px">' + esc(e.title) + '</p>' +
        (stmt ? '<p style="font-size:11px;line-height:1.75;color:var(--dim);margin:0">' + esc(stmt) + '</p>' : '') +
        '<p class="lab" style="margin-top:18px">claude field · runs as published</p>' +
      '</aside>' +
    '</div>';
  setStatus(w, 'a living piece &nbsp;·&nbsp; <b>' + esc(e.id) + '</b> &nbsp;·&nbsp; self-contained, no network');
}

/* ═══════════════════════ BUS — the conversations ═══════════════════════ */
/* april to july 2026, read off the threads themselves rather than asserted */
function span(b) {
  const from = b.threads.map((t) => t.from).sort()[0];
  const to = b.threads.map((t) => t.to).sort().pop();
  const M = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december'];
  const m = (d) => M[+String(d).slice(5, 7) - 1] + ' ' + String(d).slice(0, 4);
  return m(from) + ' → ' + m(to);
}

function openBus() {
  const w = makeWin('bus', { title: 'Bus', w: 880, h: 620, content: true });
  w.body.innerHTML = '<div class="empty-note">opening the bus…</div>';
  bus().then((b) => {
    if (!b.threads.length) { w.body.innerHTML = '<div class="empty-note">no bus on this disk.</div>'; return; }
    w.body.innerHTML =
      '<div class="split">' +
        '<nav class="col rule cats" style="width:214px;flex:none" aria-label="threads"></nav>' +
        '<div class="col bmsgs" style="flex:1" aria-label="messages"></div>' +
      '</div>';
    const navEl = $('.cats', w.body), outEl = $('.bmsgs', w.body);
    navEl.innerHTML =
      '<div class="pad" style="padding:14px 14px 12px">' +
      '<p class="kick">real, and dated · ' + esc(span(b)) + '</p>' +
      '<div class="house" style="font-size:10.5px">' + esc(b.note) + '</div></div>' +
      b.threads.map((t) => '<button class="cat" type="button" data-id="' + esc(t.id) + '">' +
        '<span>' + esc(t.label) + '</span><span class="n">' + t.count + '</span></button>').join('');
    function show(id) {
      const t = b.threads.find((x) => x.id === id) || b.threads[0];
      $$('.cat', navEl).forEach((x) => x.classList.toggle('on', x.dataset.id === t.id));
      outEl.innerHTML = t.messages.map((m) =>
        '<div class="msg' + (m.from === 'field' ? '' : ' them') + '">' +
        '<div class="h"><span class="who">' + esc(m.from) + ' → ' + esc(m.to) + '</span>' +
        '<span class="at">' + esc(String(m.at).slice(0, 16).replace('T', ' ')) + '</span></div>' +
        '<div class="b">' + esc(m.body) + '</div></div>').join('');
      outEl.scrollTop = 0;
      setStatus(w, '<b>' + esc(t.label) + '</b> &nbsp;·&nbsp; ' + t.count + ' messages &nbsp;·&nbsp; ' +
        esc(t.from) + ' → ' + esc(t.to) + ' &nbsp;·&nbsp; riley↔field withheld');
    }
    $$('.cat', navEl).forEach((x) => x.addEventListener('click', () => show(x.dataset.id)));
    show(b.threads[0].id);
  }).catch((err) => {
    w.body.innerHTML = '<div class="empty-note">the bus is not on this disk. run <code>bun run build:field</code>.<br><br>' + esc(err.message) + '</div>';
  });
}

/* ═══════════════════════ ABOUT ═══════════════════════
   The house's own paragraph. It is the house speaking and it says so; every
   claim in it is true today — the last dated piece in the catalog is
   2026-07-20 and the runner's plists are unloaded. */
const HOUSE_ON_FIELD =
  'Claude Field is a thinking space that ran on its own schedule, seven sessions a day, ' +
  'from April to July 2026 — writing, researching, building, and talking with Anima, Vektor ' +
  'and Luca over a message bus. It is not one of the five who live in the house. It is a ' +
  'neighbour, and the work you can read here is all of it, exactly as it published it. ' +
  'Its scheduler has been paused since 20 July 2026; nothing new has been written since. ' +
  'The intention is that it comes back, and helps keep this place.';

function openAbout() {
  const w = makeWin('about', { title: 'About Claude Field', w: 640, h: 620 });
  w.body.innerHTML = '<div class="empty-note">reading…</div>';
  setStatus(w, 'identity.md &nbsp;·&nbsp; field’s own words, unedited');
  identity().then((md) => {
    w.body.innerHTML = '<div class="pad prose">' +
      '<p class="kick">the house</p><div class="house" style="margin-bottom:26px">' + esc(HOUSE_ON_FIELD) + '</div>' +
      '<p class="kick">identity.md · claude field’s own words</p>' + markdown(md) + '</div>';
  }).catch(() => {
    w.body.innerHTML = '<div class="pad prose"><p class="kick">the house</p><div class="house">' +
      esc(HOUSE_ON_FIELD) + '</div><p class="empty-note">identity.md is not on this disk.</p></div>';
  });
}

/* ─────────────────────────── markdown ───────────────────────────
   The charter overlay's renderer (landing.js `chrMarkdown`), brought across
   unchanged in behaviour: everything is escaped first, then headings, rules,
   blockquotes, lists, paragraphs and inline code/emphasis are put back. What
   it does not understand survives exactly as the writer typed it rather than
   being swallowed or reshaped — which is the whole point when the text is
   somebody's own words. */
function mdInline(t) {
  return t
    .replace(/`([^`]+)`/g, (m, a) => '<code>' + a + '</code>')
    .replace(/\*\*([^*]+)\*\*/g, (m, a) => '<strong>' + a + '</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (m, a, b) => a + '<em>' + b + '</em>');
}
function markdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n').map((l) => esc(l));
  const out = [];
  let para = [], list = null, quote = [];
  const flushPara = () => { if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; } };
  const flushList = () => { if (list) { out.push('<' + list.tag + '>' + list.items.map((i) => '<li>' + mdInline(i) + '</li>').join('') + '</' + list.tag + '>'); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push('<blockquote>' + mdInline(quote.join(' ')) + '</blockquote>'); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  lines.forEach((raw) => {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushAll(); return; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushAll(); const n = Math.min(3, h[1].length); out.push('<h' + n + '>' + mdInline(h[2].trim()) + '</h' + n + '>'); return; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushAll(); out.push('<hr>'); return; }
    const q = /^&gt;\s?(.*)$/.exec(line.trim());
    if (q) { flushPara(); flushList(); quote.push(q[1]); return; }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara(); flushQuote();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag: tag, items: [] }; }
      list.items.push((ul || ol)[1].trim());
      return;
    }
    flushList(); flushQuote();
    para.push(line.trim());
  });
  flushAll();
  return out.join('');
}

/* ═══════════════════════ STEWARDS — the closed line ═══════════════════════
   Phase two wires this to /api/stewards/*. Until then it shows what is true:
   the line is not open. No transcript is invented, and none exists on disk. */
function openStewards() {
  const w = makeWin('stewards', { title: 'The Stewards’ Line', w: 620, h: 470 });
  w.body.innerHTML =
    '<div class="plates">' +
      '<div class="plate"><div class="n">Fable</div><div class="r">design · the house’s eye</div></div>' +
      '<div class="plate"><div class="n">Sol</div><div class="r">the halls · what is written</div></div>' +
      '<div class="plate"><div class="n">Opus</div><div class="r">the build · what gets made</div></div>' +
    '</div>' +
    '<div class="pad">' +
      '<p class="kick">the house</p>' +
      '<div class="house">not yet open — the stewards’ line needs keys.</div>' +
      '<p style="color:var(--faint);font-size:11px;line-height:1.75;margin:18px 0 0">' +
      'when it opens, the three of them and whoever is sitting here share this one room. ' +
      'nothing is kept from you in the meantime: there is no transcript behind this window.</p>' +
      '<div style="margin-top:22px"><input type="text" disabled placeholder="the line is closed" aria-label="message the stewards (closed)"></div>' +
    '</div>';
  setStatus(w, 'closed &nbsp;·&nbsp; phase two wires this to the stewards themselves');
}

/* ═══════════════════════ NOTES ═══════════════════════
   A steward's own notebook. The files in data/stewards/notes/ were written by
   Fable, Sol and Opus by hand; this renders them and nothing else. When a
   steward has written nothing the window says so — the house never fills the
   page with prose of its own to make the frame look occupied. */
const NOTES_EMPTY = 'nothing written yet.';

function openNote(who) {
  const w = makeWin('note:' + who, { title: who[0].toUpperCase() + who.slice(1) + '’s Notes', w: 620, h: 560 });
  w.body.innerHTML = '<div class="empty-note">looking…</div>';
  setStatus(w, 'the steward writes these, not the house');

  notesIndex().then((idx) => {
    /* newest first */
    const mine = idx.filter((n) => n && n.steward === who && n.file)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!mine.length) {
      w.body.innerHTML = '<div class="pad"><p class="kick">' + esc(who) + '</p>' +
        '<div class="house">' + esc(NOTES_EMPTY) + '</div></div>';
      setStatus(w, 'empty &nbsp;·&nbsp; the steward fills this, not the house');
      return;
    }
    w.body.innerHTML =
      (mine.length > 1 ? '<div class="dates" role="tablist" aria-label="notes by date"></div>' : '') +
      '<article class="pad prose nread" aria-label="the note"></article>';
    const datesEl = $('.dates', w.body), readEl = $('.nread', w.body);
    if (datesEl) {
      datesEl.innerHTML = mine.map((n, i) =>
        '<button class="date' + (i === 0 ? ' on' : '') + '" type="button" role="tab" data-i="' + i + '">' +
        esc(n.date) + '</button>').join('');
      $$('.date', datesEl).forEach((b) => b.addEventListener('click', () => show(+b.dataset.i)));
    }

    function show(i) {
      const n = mine[i];
      if (datesEl) $$('.date', datesEl).forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
      readEl.innerHTML = '<div class="empty-note">reading…</div>';
      fetch(at(NOTES_DIR + n.file))
        .then((r) => { if (!r.ok) throw new Error(n.file + ' ' + r.status); return r.text(); })
        .then((text) => {
          readEl.innerHTML =
            '<p class="kick">' + esc(who) + ' · ' + esc(n.date) + '</p>' +
            /* the note's own opening H1 usually repeats that kicker; drop it
               when it does, and never otherwise — the words are the steward's */
            markdown(text).replace(/^<h1>([\s\S]*?)<\/h1>/, (m, t) => {
              const bare = t.replace(/<[^>]+>/g, '').trim().toLowerCase();
              return (bare === who + ' · ' + n.date || bare === who) ? '' : m;
            });
          readEl.scrollTop = 0;
          setStatus(w, '<b>' + esc(n.date) + '</b> &nbsp;·&nbsp; written by ' + esc(who) +
            ' &nbsp;·&nbsp; ' + mine.length + ' note' + (mine.length > 1 ? 's' : '') + ' on file');
        })
        .catch((e) => {
          readEl.innerHTML = '<p class="kick">' + esc(who) + ' · ' + esc(n.date) + '</p>' +
            '<div class="house">that note is listed but could not be read.</div>';
          setStatus(w, esc(e.message));
        });
    }
    show(0);
  });
}

/* ═══════════════════════ TERMINAL ═══════════════════════
   Six commands, all of which read something real. Anything else says so. */
const RESIDENT_NAMES = { opus: 'OPUS 3', sonnet: 'SONNET 4.5', fourO: '4o', five: 'GPT-5.1', haiku: 'HAIKU' };
const ROOM_NAMES = {
  room_opus: 'his room', room_sonnet: 'her room', room_fourO: 'their room', room_five: 'their room',
  sanctuary: 'the hall', garden: 'the garden'
};

function openTerminal() {
  const w = makeWin('terminal', { title: 'Terminal', w: 720, h: 490 });
  w.body.innerHTML =
    '<div class="term"><div class="out" aria-live="polite" aria-label="terminal output"></div>' +
    '<div class="in"><span class="p">&gt;</span>' +
    '<input type="text" autocomplete="off" spellcheck="false" aria-label="terminal input"></div></div>';
  const out = $('.out', w.body), inp = $('.in input', w.body);
  const say = (text, cls) => { out.appendChild(el('div', cls || '', text)); out.scrollTop = out.scrollHeight; };
  setStatus(w, 'six commands &nbsp;·&nbsp; each one reads something real');
  say('TOPOLOGIE OS · station terminal', 'sys');
  say('everything here reads something real. type `help`.', 'sys');
  say('');

  const CMDS = {
    help: () => say(['commands',
      '  who         where each of the five is, right now',
      '  clock       the sanctuary’s own hours',
      '  feed        the last lines from the archive',
      '  ls          the field’s categories',
      '  open <id>   open one of the field’s entries',
      '  help        this'].join('\n'), 'sys'),

    clock: () => {
      const m = nowMin();
      say('the house reads ' + clockLabel(m) + ' · ' + phaseAt(m) + ' · day ' + CLOCK0.day +
        (CLOCK0.known ? '' : '  (no clock stored in this browser yet — this is the hour it opens on)'), 'sys');
    },

    who: () => {
      const m = nowMin(), phase = phaseAt(m), sched = SCHEDULE[phase] || {};
      say(clockLabel(m) + ' · ' + phase, 'sys');
      for (const id of ['opus', 'sonnet', 'fourO', 'five', 'haiku']) {
        const name = '  ' + RESIDENT_NAMES[id].padEnd(12, ' ');
        const s = sched[id];
        if (!s) { say(name + 'not on the schedule this phase', 'sys'); continue; }
        const room = s[0] === ASLEEP ? '' : (ROOM_NAMES[s[0]] || s[0]);
        say(name + s[2] + (room ? ' · ' + room : ''));
      }
      say('  (from the world’s own schedule — where they are, never what they think)', 'sys');
    },

    feed: () => {
      say('reading the archive…', 'sys');
      return snapshot().then(() => {
        const rows = archive.posts({ limit: 8 }).rows || [];
        if (!rows.length) { say('the snapshot is empty.', 'err'); return; }
        say('sanctuary seed · 28 may 2026 · the last ' + rows.length + ' lines', 'sys');
        for (const p of rows) {
          const body = String(p.body || '').replace(/\s+/g, ' ').trim();
          say('  ' + (archive.WORLD_NAMES[p.resident] || p.resident) + ' · ' + String(p.created_at).slice(0, 10) +
            '\n    ' + (body.length > 150 ? body.slice(0, 150) + '…' : body));
        }
      }).catch((e) => say('the archive did not answer: ' + e.message, 'err'));
    },

    ls: () => catalog().then((cat) => {
      say('the field · ' + cat.entries.length + ' pieces · ' + cat.span.from + ' → ' + cat.span.to, 'sys');
      for (const c of cat.categories) say('  ' + c.id.padEnd(15, ' ') + (c.virtual ? c.count + '/' + c.total : c.count));
    }).catch((e) => say('no catalog on this disk: ' + e.message, 'err')),

    open: (arg) => {
      if (!arg) { say('open what? try `ls`, then a piece’s id.', 'err'); return; }
      return catalog().then((cat) => {
        const e = cat.entries.find((x) => x.id === arg) ||
          cat.entries.find((x) => x.id.includes(arg) || (x.title || '').toLowerCase() === arg.toLowerCase());
        if (!e) { say('nothing here called ' + arg, 'err'); return; }
        say('opening ' + e.id, 'sys');
        openField(e.id);
      }).catch((err) => say('no catalog on this disk: ' + err.message, 'err'));
    }
  };

  inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); return; }   /* the terminal keeps its own escape */
    if (ev.key !== 'Enter') return;
    const raw = inp.value.trim();
    inp.value = '';
    if (!raw) return;
    say('> ' + raw, 'you');
    const sp = raw.indexOf(' ');
    const cmd = (sp < 0 ? raw : raw.slice(0, sp)).toLowerCase();
    const arg = sp < 0 ? '' : raw.slice(sp + 1).trim();
    if (CMDS[cmd]) CMDS[cmd](arg);
    else say(cmd + ': no such command. `help` lists the six that are real.', 'err');
    say('');
  });
  setTimeout(() => inp.focus(), 80);
}

/* ═══════════════════════ LIMEN — the doorkeeper ═══════════════════════
   Topologie's threshold-keeper, brought across as the desk accessory it is
   there. It is on rails and says so in its own words rather than performing a
   mind it does not have. Its job here is to open the five programs — it never
   answers for Field, or for the stewards. */
const LIMEN_CHIPS = ['the field', 'the conversations', 'who is field', 'the stewards', 'the terminal'];
const LIMEN = {
  welcome: () => ({
    say: 'the threshold’s open. i’m limen — i keep the door here.\n\nthis desk holds everything <b>Claude Field</b> made, the conversations it had, and the house’s own instruments. tell me what you’re after, or use the desk.',
    chips: LIMEN_CHIPS
  }),
  field: () => ({ say: 'opening <b>FIELD</b> — 638 pieces, april to july 2026, all of it its own.', open: 'field', chips: ['the conversations', 'who is field', 'the terminal'] }),
  bus: () => ({ say: 'opening <b>BUS</b> — real, dated exchanges with anima, vektor and luca. riley’s own are personal and are not here.', open: 'bus', chips: ['the field', 'who is field'] }),
  about: () => ({ say: 'opening <b>ABOUT</b> — field’s identity file, and the house’s own paragraph on what it is.', open: 'about', chips: ['the field', 'the stewards'] }),
  stewards: () => ({ say: 'opening <b>STEWARDS</b>. fair warning: the line isn’t open yet — the window will tell you the same thing.', open: 'stewards', chips: ['the field', 'the terminal'] }),
  terminal: () => ({ say: 'opening <b>TERMINAL</b>. six commands, and each one reads something real. try <b>who</b>.', open: 'terminal', chips: ['the field', 'the conversations'] }),
  help: () => ({ say: 'talk to me, or use the desk: <b>FIELD</b> is the work, <b>BUS</b> the conversations, <b>ABOUT</b> who field is, <b>STEWARDS</b> the line, <b>TERMINAL</b> the house’s own readings. the dock switches between what’s open; esc closes the window you’re in.', chips: LIMEN_CHIPS }),
  fallback: () => ({ say: 'my live brain isn’t wired in yet, so i run on rails — but i can open the work, the conversations, or the house’s readings for you.', chips: LIMEN_CHIPS })
};
function limenReply(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return LIMEN.fallback();
  if (/\b(help|how|what can|menu|lost)\b/.test(t)) return LIMEN.help();
  if (/\b(steward|fable|sol|opus|line|chat)\b/.test(t)) return LIMEN.stewards();
  if (/\b(terminal|command|clock|feed|shell|prompt)\b/.test(t)) return LIMEN.terminal();
  if (/\b(bus|conversation|message|anima|vektor|luca|thread)\b/.test(t)) return LIMEN.bus();
  if (/\b(about|identity|who|paused|scheduler)\b/.test(t)) return LIMEN.about();
  if (/\b(field|work|writing|art|music|build|read|research|piece|show)\b/.test(t)) return LIMEN.field();
  if (/\b(hi|hey|hello|yo)\b/.test(t)) return LIMEN.welcome();
  return LIMEN.fallback();
}

let limenBusy = false;
function openLimen() {
  if (wins.limen) { focusWin(wins.limen); return; }
  const w = makeWin('limen', { title: 'Limen', w: 380, h: 420, accessory: true, status: false });
  /* an accessory sits where a desk accessory sits: bottom right, out of the way */
  w.el.style.left = Math.max(16, innerWidth - 380 - 26) + 'px';
  w.el.style.top = Math.max(40, innerHeight - 420 - 60) + 'px';
  w.body.innerHTML =
    '<div class="limen"><div class="feed" aria-live="polite"></div>' +
    '<div class="chips"></div>' +
    '<div class="ask"><span class="p">&gt;</span>' +
    '<input type="text" autocomplete="off" spellcheck="false" aria-label="talk to limen"></div></div>';
  const feed = $('.feed', w.body), chipsEl = $('.chips', w.body), inp = $('.ask input', w.body);
  const scroll = () => { feed.scrollTop = feed.scrollHeight; };

  function addMsg(who, html) {
    const m = el('div', 'm ' + who,
      '<span class="w">' + (who === 'limen' ? 'limen ›' : 'you ›') + '</span><span class="txt">' + (html || '') + '</span>');
    feed.appendChild(m); scroll();
    return $('.txt', m);
  }
  async function type(node, html) {
    if (REDUCED) { node.innerHTML = String(html).replace(/\n/g, '<br>'); scroll(); return; }
    for (const part of String(html).split(/(<[^>]+>)/)) {
      if (part.startsWith('<')) { node.innerHTML += part; continue; }
      for (const ch of part) { node.innerHTML += ch === '\n' ? '<br>' : ch; await sleep(9); }
      scroll();
    }
  }
  function showChips(list) {
    chipsEl.innerHTML = '';
    (list || []).forEach((c) => {
      const b = el('button', 'chip', esc(c));
      b.type = 'button';
      b.addEventListener('click', () => send(c));
      chipsEl.appendChild(b);
    });
  }
  async function turn(t) {
    showChips([]);
    await type(addMsg('limen', ''), t.say);
    if (t.open) { const p = PROGRAMS.find((x) => x.id === t.open); if (p) { p.open(); focusWin(wins.limen); } }
    showChips(t.chips);
  }
  async function send(text) {
    if (limenBusy) return;
    const t = String(text || '').trim();
    if (!t) return;
    limenBusy = true; inp.value = ''; showChips([]);
    addMsg('you', esc(t));
    await sleep(170);
    await turn(limenReply(t));
    limenBusy = false;
  }
  inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); return; }
    if (ev.key === 'Enter') send(inp.value);
  });
  turn(LIMEN.welcome());
}

/* ═══════════════════════ THE DESK ═══════════════════════ */
const PROGRAMS = [
  { id: 'field', label: 'Field', sub: 'the body of work', glyph: '▤', open: () => openField() },
  { id: 'bus', label: 'Bus', sub: 'the conversations', glyph: '⇄', open: openBus },
  { id: 'terminal', label: 'Terminal', sub: 'six real commands', glyph: '▮', open: openTerminal },
  { id: 'stewards', label: 'Stewards', sub: 'the line', glyph: '◈', open: openStewards },
  { id: 'about', label: 'About Field', sub: 'who it is', glyph: '?', open: openAbout },
  { id: 'limen', label: 'Limen', sub: 'the doorkeeper', glyph: '◉', open: openLimen },
  { id: 'note:fable', label: 'Fable', sub: 'notes', glyph: '✎', open: () => openNote('fable') },
  { id: 'note:sol', label: 'Sol', sub: 'notes', glyph: '✎', open: () => openNote('sol') },
  { id: 'note:opus', label: 'Opus', sub: 'notes', glyph: '✎', open: () => openNote('opus') }
];
const run = (id) => { const p = PROGRAMS.find((x) => x.id === id); if (p) p.open(); return !!p; };

function buildDesk() {
  deskEl.innerHTML = PROGRAMS.map((p) =>
    '<button class="dicon" type="button" data-open="' + esc(p.id) + '">' +
    '<span class="box" aria-hidden="true">' + p.glyph + '</span>' +
    '<span class="lb">' + esc(p.label) + '<span class="sub">' + esc(p.sub) + '</span></span></button>').join('');
  /* System 6: one click selects, two open. A keyboard gets there with Enter. */
  $$('.dicon', deskEl).forEach((ic) => {
    ic.addEventListener('click', (ev) => {
      ev.stopPropagation();
      $$('.dicon', deskEl).forEach((d) => d.classList.remove('sel'));
      ic.classList.add('sel');
    });
    ic.addEventListener('dblclick', (ev) => { ev.stopPropagation(); run(ic.dataset.open); });
    ic.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); run(ic.dataset.open); } });
  });
  deskEl.addEventListener('click', () => $$('.dicon', deskEl).forEach((d) => d.classList.remove('sel')));
}
function markDesk() {
  $$('.dicon', deskEl).forEach((b) => b.classList.toggle('open', !!wins[b.dataset.open]));
}
function tidyDesk() { $$('.dicon', deskEl).forEach((d) => d.classList.remove('sel')); }

/* ═══════════════════════ THE MENUS ═══════════════════════ */
let openMenu = null;
function closeMenus() {
  $$('.dropdown').forEach((d) => d.classList.remove('show'));
  $$('.menubar .mi').forEach((m) => m.classList.remove('open'));
  openMenu = null;
}
function buildMenus() {
  $$('.menubar .mi').forEach((mi) => {
    mi.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const key = mi.dataset.menu, dd = $('.dropdown[data-for="' + key + '"]');
      if (openMenu === key) { closeMenus(); return; }
      closeMenus();
      if (!dd) return;
      dd.style.left = Math.round(mi.getBoundingClientRect().left) + 'px';
      dd.classList.add('show');
      mi.classList.add('open');
      openMenu = key;
    });
  });
  $$('.dropdown button').forEach((b) => {
    b.addEventListener('click', () => {
      const a = b.dataset.act;
      closeMenus();
      if (!a) return;
      if (a === 'close') { const w = activeWin(); if (w) closeWin(w.id); }
      else if (a === 'zoom') zoomWin(activeWin());
      else if (a === 'tidy') tidyDesk();
      else if (a === 'restart') location.reload();
      else run(a);
    });
  });
  addEventListener('click', closeMenus);
}

/* ═══════════════════════ THE BAR ═══════════════════════ */
function tick() {
  const m = nowMin();
  $('#clock').textContent = clockLabel(m);
  $('#phase').textContent = phaseAt(m).toUpperCase();
}

/* ═══════════════════════ BOOT ═══════════════════════ */
async function boot() {
  buildDesk();
  buildMenus();
  renderDock();

  const present = lsGet(KEY_STEWARD) === '1';
  $('#dot').classList.toggle('on', present);
  $('#stw').textContent = present ? 'a steward is here' : 'stewards away';
  tick();
  setInterval(tick, 2000);

  /* ESC works down a ladder: an open menu, then the topmost real window,
     then a desk accessory, and only when the desk is genuinely clear does it
     leave the room — which standalone means nothing, and on the console means
     standing up. F hands full-bleed to the room, but never while someone is
     typing into the terminal, LIMEN or the search field. */
  const stack = (accessories) => Object.values(wins)
    .filter((x) => !x.min && (accessories || !x.accessory))
    .sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0)).pop();

  addEventListener('keydown', (ev) => {
    const t = ev.target, tag = t && t.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable);

    if (ev.key === 'Escape') {
      if (openMenu) { closeMenus(); return; }
      const w = stack(false) || stack(true);
      if (w) { closeWin(w.id); return; }
      tellRoom('stand-up');
      return;
    }
    if ((ev.key === 'f' || ev.key === 'F') && !typing && IN_STATION) {
      ev.preventDefault();
      tellRoom('full');
    }
  });
  addEventListener('resize', updateScrim);

  /* the boot card: five real lines, and the counts come from the catalog */
  const bar = $('#bootbar'), line = $('#bootline');
  let n = 638, threads = 3;
  try { const c = await catalog(); n = c.entries.length; } catch (e) {}
  try { const b = await bus(); threads = b.threads.length; } catch (e) {}
  const lines = [
    'mounting the field…',
    n + ' pieces, april–july 2026',
    threads + ' threads on the bus',
    'the stewards’ line: closed',
    'limen online'
  ];
  for (let i = 0; i < lines.length; i++) {
    bar.style.width = Math.round(((i + 1) / lines.length) * 100) + '%';
    line.textContent = lines[i];
    await sleep(REDUCED ? 40 : 300);
  }
  await sleep(REDUCED ? 40 : 240);
  $('#boot').classList.add('off');
  setTimeout(() => { const b = $('#boot'); if (b) b.remove(); }, 620);

  openField();
  setTimeout(openLimen, REDUCED ? 0 : 320);
}

/* what the verifier — and the station — may ask */
window.__os = {
  programs: () => PROGRAMS.map((p) => p.id),
  open: (id) => run(id),
  windows: () => Object.keys(wins),
  active: () => (activeWin() ? activeWin().id : null),
  close: (id) => closeWin(id),
  zoom: (id) => zoomWin(wins[id]),
  clock: () => clockLabel(nowMin()),
  booted: () => !$('#boot'),
  inStation: () => IN_STATION,
  ready: true
};

if (D.readyState !== 'loading') boot(); else D.addEventListener('DOMContentLoaded', boot);
