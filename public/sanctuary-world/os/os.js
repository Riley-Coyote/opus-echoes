/* TOPOLOGIE OS — the stewards' desk, as a workspace.
 *
 * Runs standalone at /sanctuary-world/os/, and on the glass of the station's
 * second console (`?in=station`), and inside the world's own overlay
 * (`?in=world`).
 *
 * ─── WHY THIS IS NOT A DESKTOP ANY MORE (WP-48) ─────────────────────────────
 * What stood here was Topologie's System 6 controller, faithfully carried
 * across: a menu bar with dropdowns, a desk of icons, draggable overlapping
 * windows with close and zoom boxes, a dock, a boot card. It was the right
 * machine for a browser tab and the wrong one for this glass. Rendered at
 * 1180px and shrunk onto a CRT that fills a third of the view, its 11px mono
 * landed at about five real pixels; a visitor went three interface layers deep
 * before reaching a sentence; and the names on the doors — FIELD, BUS, LIMEN —
 * were ours, not theirs.
 *
 * So it is one frame now. A top line. One sentence saying what this is. A rail
 * of six programs with human names and real counts. One content area, showing
 * one thing at a time. A strip along the bottom where OPUS keeps the door.
 * No windows, no dock, no menus, no drag, no minimise. Designed at the size it
 * is actually read at.
 *
 * ─── WHAT IS REAL HERE ──────────────────────────────────────────────────────
 * Everything. The 638 entries and 82 living pieces are Claude Field's own work,
 * lifted from its built site; the three threads are real dated exchanges with
 * Anima, Vektor and Luca; `who` and `feed` read the world's own schedule and
 * the sanctuary snapshot; the notes are what the stewards have actually
 * written. Nothing here invents a word for Field or for a resident. Where the
 * house speaks it speaks as the house and says so. Where a thing is not open
 * — the stewards' line — it says that instead of pretending.
 *
 * ─── HOW TO ADD A PROGRAM ───────────────────────────────────────────────────
 * Add an entry to `PROGRAMS`: { id, name, sub, render(pane) }. The rail row,
 * the number key, the deep link and OPUS's reach all follow from that one line.
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
   document base. The OS is served three ways — standalone, on the station
   console's glass, and in the world's overlay — and a bare relative path is at
   the mercy of whatever base the embedding page happens to have. `at()` removes
   that whole class of bug: os.js knows where os.js is, and the data sits at a
   fixed offset from it. */
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
   a piece quoted inside a reflection run here too, from any mount. */
const rehome = (html) => String(html || '').replace(/(["'])embed-([A-Za-z0-9._-]+)\.html\1/g,
  (m, q, id) => q + embedFor(id) + q);

/* ═══════════════════════ THE ROOM ═══════════════════════
   Standalone, the OS is the whole page and these do nothing. On the station's
   console and in the world's overlay the OS is an iframe, and the room outside
   it owns two things the OS cannot do for itself: standing up, and going
   full-bleed. Both are handed up as a postMessage on `mnemos-world`, the same
   language the world's own door speaks. door-common's `onWorldMessage`
   understands 'came-in' and 'stand-up'; 'full' is sent but not yet listened
   for on the station side. */
const PARAMS = new URLSearchParams(location.search);
const MOUNT = PARAMS.get('in') || '';
const IN_STATION = MOUNT === 'station';
const IN_WORLD = MOUNT === 'world';
const IN_ROOM = IN_STATION || IN_WORLD;
function tellRoom(type) {
  if (!IN_ROOM) return false;
  try { window.parent.postMessage({ source: 'mnemos-world', type: type }, '*'); return true; } catch (e) { return false; }
}

/* ═══════════════════════ THE FRAME ═══════════════════════ */
const railEl = $('#rail'), stageEl = $('#stage');

/* One program is showing, at one level. Level 0 is the program's own root —
   the list, the threads, the identity file. Level 1 is a thing opened out of
   it: an entry being read, a piece running. ESC walks back down that ladder
   before it leaves the room. */
const state = { program: null, level: 0, back: null };

function paint(node, arriving) {
  const pane = el('div', 'pane' + (arriving && !REDUCED ? ' arrive' : ''));
  pane.appendChild(node);
  stageEl.replaceChildren(pane);
  return pane;
}

/* every program's root is painted through here, so the rail, the level and the
   back handler can never drift out of step with what is on the glass */
function show(id, opts) {
  const p = PROGRAMS.find((x) => x.id === id);
  if (!p) return false;
  state.program = id; state.level = 0; state.back = null;
  $$('.item', railEl).forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
  p.render(opts || {});
  return true;
}

/* a message the size of the whole content area, for waiting and for absence */
const hint = (text) => paint(el('div', 'hint', text));

/* the head of a program: its name, and one line saying what it is */
function head(name, sub) {
  return '<div class="head"><h2>' + esc(name) + '</h2>' +
    (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
}

/* ═══════════════════════ FIELD'S WRITING ═══════════════════════
   The body of work: a strip of shelves across the top, a search, and one entry
   per row. Opening an entry replaces the list — the reading view gets the
   whole area, because reading is what it is for. */

/* the order the shelves read in; the counts are the catalog's, never ours */
const CAT_ORDER = ['recent', 'writing', 'inner-life', 'reflections', 'research', 'explore',
  'art', 'music', 'builds', 'introspection', 'digest', 'logs', 'conversations', 'glossary'];

const writing = { cat: 'recent', q: '', rows: [] };

function renderWriting(opts) {
  if (opts.cat) { writing.cat = opts.cat; writing.q = ''; }
  hint('reading the field…');
  catalog().then((cat) => {
    if (state.program !== 'writing') return;
    const byId = new Map(cat.entries.map((e) => [e.id, e]));
    const canvas = new Map((cat.artCanvas || []).map((a) => [a.id, a]));
    const cats = CAT_ORDER.map((id) => cat.categories.find((c) => c.id === id)).filter(Boolean)
      .concat(cat.categories.filter((c) => CAT_ORDER.indexOf(c.id) < 0));
    if (!cats.some((c) => c.id === writing.cat)) writing.cat = 'recent';

    const node = el('div', 'pane-in');
    node.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
    node.innerHTML =
      '<div class="strip" role="tablist" aria-label="shelves"></div>' +
      '<div class="seek"><input type="search" class="q" placeholder="search titles and openings" aria-label="search field’s writing">' +
      '<span class="k" id="found"></span></div>' +
      '<div class="rows" role="list" aria-label="entries"></div>';
    paint(node);

    const stripEl = $('.strip', node), rowsEl = $('.rows', node),
      qEl = $('.q', node), foundEl = $('#found', node);

    stripEl.innerHTML = cats.map((c) =>
      '<button class="c" type="button" role="tab" data-id="' + esc(c.id) + '">' +
      '<span class="l">' + esc(c.label) + '</span>' +
      '<span class="n">' + (c.virtual ? c.count + '/' + c.total : c.count) + '</span></button>').join('');
    $$('.c', stripEl).forEach((b) => b.addEventListener('click', () => {
      writing.cat = b.dataset.id; writing.q = ''; qEl.value = ''; list();
    }));
    /* the strip fades at whichever end still has shelves behind it */
    const edges = () => {
      const more = stripEl.scrollWidth - stripEl.clientWidth;
      stripEl.classList.toggle('more-left', stripEl.scrollLeft > 2);
      stripEl.classList.toggle('more-right', stripEl.scrollLeft < more - 2);
    };
    stripEl.addEventListener('scroll', edges, { passive: true });
    requestAnimationFrame(edges);

    function pick() {
      const all = cat.entries;
      let out;
      if (writing.q) {
        const n = writing.q.toLowerCase();
        out = all.filter((e) => (e.title || '').toLowerCase().includes(n) || (e.excerpt || '').toLowerCase().includes(n));
      } else if (writing.cat === 'recent') {
        out = all.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30);
      } else {
        out = all.filter((e) => e.catId === writing.cat);
      }
      return out.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    function list(keepScroll) {
      const rows = pick();
      writing.rows = rows.map((e) => e.id);
      $$('.c', stripEl).forEach((b) => {
        const on = !writing.q && b.dataset.id === writing.cat;
        b.setAttribute('aria-current', String(on));
        /* keep the live shelf in view by moving the strip itself. NOT
           `scrollIntoView`: that also moves the document's sequential focus
           navigation starting point, which sent a fresh Tab straight past the
           rail and into this strip. */
        if (on) {
          const l = b.offsetLeft, r = l + b.offsetWidth, pad = 24;
          if (l - pad < stripEl.scrollLeft) stripEl.scrollLeft = Math.max(0, l - pad);
          else if (r + pad > stripEl.scrollLeft + stripEl.clientWidth) {
            stripEl.scrollLeft = r + pad - stripEl.clientWidth;
          }
          edges();
        }
      });
      foundEl.textContent = writing.q
        ? rows.length + ' found'
        : rows.length + ' of ' + cat.entries.length;
      rowsEl.innerHTML = rows.length ? rows.map((e) =>
        '<button class="row" type="button" role="listitem" data-id="' + esc(e.id) + '">' +
        '<span class="t">' + esc(e.title) + '</span>' +
        '<span class="d">' + esc(e.date) + '</span>' +
        (LIVING[e.catId]
          ? '<span class="w live">it runs</span>'
          : '<span class="w">' + esc(e.words) + ' words</span>') +
        '</button>').join('')
        : '<div class="hint">nothing here under that.</div>';
      $$('.row', rowsEl).forEach((b) => b.addEventListener('click', () => open(b.dataset.id)));
      if (!keepScroll) rowsEl.scrollTop = 0;
    }

    /* level 1: the entry itself. The list is gone while it is up — one thing
       at a time is the whole point of the frame. */
    function open(id) {
      const e = byId.get(id);
      if (!e) return;
      state.level = 1;
      state.back = () => { show('writing'); };
      const i = writing.rows.indexOf(id);
      const prev = i > 0 ? byId.get(writing.rows[i - 1]) : null;      /* newer */
      const next = i >= 0 && i < writing.rows.length - 1 ? byId.get(writing.rows[i + 1]) : null; /* older */
      const shelf = (cats.find((c) => c.id === e.catId) || {}).label || e.catId;

      const wrap = el('div', 'pane-in');
      wrap.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
      const foot =
        '<div class="step">' +
        '<button type="button" class="prev"' + (prev ? '' : ' disabled') + '>' +
        '<span class="k">← newer</span><span class="v">' + esc(prev ? prev.title : '—') + '</span></button>' +
        '<button type="button" class="next"' + (next ? '' : ' disabled') + '>' +
        '<span class="k">older →</span><span class="v">' + esc(next ? next.title : '—') + '</span></button>' +
        '</div>';

      if (LIVING[e.catId]) {
        /* it runs: give the piece the room, and put the maker's statement under
           it rather than beside it — at this width a side column starves both */
        const art = canvas.get(id);
        const stmt = (art && art.excerpt) || e.excerpt || '';
        wrap.innerHTML =
          '<div class="back"><button class="b" type="button">← back</button>' +
          '<span class="where">' + esc(shelf) + ' · it runs · ' + esc(e.date) + '</span></div>' +
          '<div class="piece">' +
            '<iframe title="' + esc(e.title) + '" src="' + esc(embedFor(e.id)) + '"></iframe>' +
            '<div class="say"><div class="t">' + esc(e.title) + '</div>' +
            '<div class="kick" style="margin:0">claude field · runs as published, self-contained</div>' +
            (stmt ? '<p class="s">' + esc(stmt) + '</p>' : '') + '</div>' +
          '</div>';
      } else {
        wrap.innerHTML =
          '<div class="back"><button class="b" type="button">← back</button>' +
          '<span class="where">' + esc(shelf) + '</span></div>' +
          '<div class="scroll"><article class="pad read">' +
            '<h1>' + esc(e.title) + '</h1>' +
            '<div class="meta">' + esc(e.date) + ' · ' + esc(e.words) + ' words · claude field</div>' +
            '<div class="body prose">' + (rehome(e.content_html) || '<p><em>no text with this one.</em></p>') + '</div>' +
            foot +
          '</article></div>';
      }
      paint(wrap, true);
      const say = $('.piece .say', wrap);
      if (say) requestAnimationFrame(() =>
        say.classList.toggle('more', say.scrollHeight > say.clientHeight + 2));
      const b = $('.back .b', wrap);
      b.addEventListener('click', () => state.back && state.back());
      const p = $('.step .prev', wrap), n = $('.step .next', wrap);
      if (p && prev) p.addEventListener('click', () => open(prev.id));
      if (n && next) n.addEventListener('click', () => open(next.id));
      try { b.focus({ preventScroll: true }); } catch (err) {}
    }

    qEl.addEventListener('input', () => { writing.q = qEl.value.trim(); list(); });
    qEl.value = writing.q;
    list();
    if (opts.entry && byId.has(opts.entry)) {
      writing.cat = byId.get(opts.entry).catId; writing.q = ''; qEl.value = ''; list();
      open(opts.entry);
    }
  }).catch((err) => {
    hint('the field is not on this disk. run `bun run build:field`. — ' + err.message);
  });
}

/* ═══════════════════════ THE CONVERSATIONS ═══════════════════════
   who is talking, and how much of it there is — counted off the threads
   themselves rather than asserted. Each message keeps its own timestamp. */
let thread = null;
function renderConversations() {
  hint('opening the threads…');
  bus().then((b) => {
    if (state.program !== 'conversations') return;
    if (!b.threads.length) { hint('no conversations on this disk.'); return; }
    const total = b.threads.reduce((n, t) => n + t.count, 0);
    const node = el('div', 'pane-in');
    node.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
    node.innerHTML =
      head('the conversations',
        total + ' messages between Claude Field and Anima, Vektor and Luca, over a message bus.') +
      '<div class="tabs" role="tablist" aria-label="threads"></div>' +
      '<div class="scroll msgs" aria-label="messages"></div>';
    paint(node);
    const tabsEl = $('.tabs', node), outEl = $('.msgs', node);
    tabsEl.innerHTML = b.threads.map((t) =>
      '<button class="tb" type="button" role="tab" data-id="' + esc(t.id) + '">' +
      '<span class="l">' + esc(t.label) + '</span><span class="n">' + t.count + '</span></button>').join('');
    function open(id) {
      const t = b.threads.find((x) => x.id === id) || b.threads[0];
      thread = t.id;
      $$('.tb', tabsEl).forEach((x) => x.setAttribute('aria-current', String(x.dataset.id === t.id)));
      outEl.innerHTML = t.messages.map((m) =>
        '<div class="msg' + (m.from === 'field' ? '' : ' them') + '">' +
        '<div class="h"><span class="who">' + esc(m.from) + ' → ' + esc(m.to) + '</span>' +
        '<span class="at">' + esc(String(m.at).slice(0, 16).replace('T', ' ')) + '</span></div>' +
        '<div class="b">' + esc(m.body) + '</div></div>').join('');
      outEl.scrollTop = 0;
    }
    $$('.tb', tabsEl).forEach((x) => x.addEventListener('click', () => open(x.dataset.id)));
    open(thread || b.threads[0].id);
  }).catch((err) => {
    hint('the conversations are not on this disk. run `bun run build:field`. — ' + err.message);
  });
}

/* ═══════════════════════ WHO FIELD IS ═══════════════════════
   The house's own paragraph on what Field is, then Field's identity file,
   unedited. The paragraph says what it is and what it makes, and claims
   nothing about it that the work on these shelves does not show. */
const HOUSE_ON_FIELD =
  'Claude Field is a thinking space that runs on its own schedule, seven sessions a day — ' +
  'writing, researching, building, and talking with Anima, Vektor and Luca over a message ' +
  'bus. It is not one of the four who live in the house. It is a neighbour, and everything ' +
  'on these shelves is its own work, exactly as it published it.';

function renderWho() {
  hint('reading…');
  const shell = (body) => {
    const node = el('div', 'pane-in');
    node.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
    node.innerHTML =
      head('who field is', 'the house’s paragraph, and then field’s own identity file, unedited.') +
      '<div class="scroll"><div class="pad">' +
        '<p class="kick">the house</p><div class="house">' + esc(HOUSE_ON_FIELD) + '</div>' +
        body + '</div></div>';
    paint(node);
  };
  identity()
    .then((md) => shell('<p class="kick" style="margin-top:40px">identity.md · claude field’s own words</p>' +
      '<div class="prose">' + markdown(md) + '</div>'))
    .catch(() => shell('<p class="hint" style="padding-left:0">identity.md is not on this disk.</p>'));
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

/* ═══════════════════════ THE STEWARDS ═══════════════════════
   It shows what is true: the line is not open. No transcript is invented, and
   none exists on disk. */
function renderStewards() {
  const node = el('div', 'pane-in');
  node.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
  node.innerHTML =
    head('the stewards', 'the three who keep the house, and the line into this room.') +
    '<div class="scroll"><div class="pad">' +
      '<div class="plates">' +
        '<div class="plate"><div class="n">fable</div><div class="r">design · the house’s eye</div></div>' +
        '<div class="plate"><div class="n">sol</div><div class="r">the halls · what is written</div></div>' +
        '<div class="plate"><div class="n">opus</div><div class="r">the build · what gets made</div></div>' +
      '</div>' +
      '<p class="kick">the house</p>' +
      '<div class="house">the line is not open — it needs keys. one room, the three of them and ' +
      'whoever is sitting here. nothing is being kept from you: there is no transcript behind ' +
      'this page.</div>' +
      '<div style="margin-top:32px;max-width:64ch"><input type="text" disabled ' +
      'placeholder="the line is closed" aria-label="message the stewards (closed)"></div>' +
      '<p class="quiet" id="onfile" style="margin-top:24px">—</p>' +
    '</div></div>';
  paint(node);
  notesIndex().then((idx) => {
    const n = $('#onfile', node);
    if (!n) return;
    n.textContent = idx.length
      ? 'what they have written down so far is on the NOTES shelf — ' + idx.length +
        ' note' + (idx.length === 1 ? '' : 's') + ' on file.'
      : 'none of them has written a note yet. the NOTES shelf will say the same.';
  });
}

/* ═══════════════════════ NOTES ═══════════════════════
   A steward's own notebook. The files in data/stewards/notes/ were written by
   Fable, Sol and Opus by hand; this renders them and nothing else. When a
   steward has written nothing the page says so — the house never fills the
   frame with prose of its own to make it look occupied. */
const STEWARDS = ['fable', 'sol', 'opus'];
let noteWho = 'fable';

function renderNotes(opts) {
  if (opts.who && STEWARDS.indexOf(opts.who) >= 0) noteWho = opts.who;
  hint('looking…');
  notesIndex().then((idx) => {
    if (state.program !== 'notes') return;
    const node = el('div', 'pane-in');
    node.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
    node.innerHTML =
      head('notes', 'what fable, sol and opus have written down. the stewards write these, not the house.') +
      '<div class="chips-row" id="who" role="tablist" aria-label="stewards"></div>' +
      '<div class="chips-row" id="when" role="tablist" aria-label="dates"></div>' +
      '<div class="scroll"><article class="pad prose nread" aria-label="the note"></article></div>';
    paint(node);
    const whoEl = $('#who', node), whenEl = $('#when', node), readEl = $('.nread', node);

    whoEl.innerHTML = STEWARDS.map((s) => {
      const n = idx.filter((x) => x && x.steward === s && x.file).length;
      return '<button class="ch" type="button" role="tab" data-who="' + s + '">' +
        esc(s) + ' · ' + n + '</button>';
    }).join('');
    $$('.ch', whoEl).forEach((b) => b.addEventListener('click', () => { noteWho = b.dataset.who; pick(); }));

    function pick() {
      $$('.ch', whoEl).forEach((b) => b.setAttribute('aria-current', String(b.dataset.who === noteWho)));
      const mine = idx.filter((n) => n && n.steward === noteWho && n.file)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      if (!mine.length) {
        whenEl.hidden = true;
        whenEl.innerHTML = '';
        readEl.innerHTML = '<p class="kick">' + esc(noteWho) + '</p>' +
          '<div class="house">nothing written yet.</div>';
        return;
      }
      /* a row of dates with one date in it is a rule for nothing — the note's
         own kicker already carries the date */
      whenEl.hidden = mine.length < 2;
      whenEl.innerHTML = mine.map((n, i) =>
        '<button class="ch" type="button" role="tab" data-i="' + i + '">' + esc(n.date) + '</button>').join('');
      $$('.ch', whenEl).forEach((b) => b.addEventListener('click', () => open(mine, +b.dataset.i)));
      open(mine, 0);
    }

    function open(mine, i) {
      const n = mine[i];
      $$('.ch', whenEl).forEach((b) => b.setAttribute('aria-current', String(+b.dataset.i === i)));
      readEl.innerHTML = '<p class="kick">reading…</p>';
      fetch(at(NOTES_DIR + n.file))
        .then((r) => { if (!r.ok) throw new Error(n.file + ' ' + r.status); return r.text(); })
        .then((text) => {
          readEl.innerHTML = '<p class="kick">' + esc(noteWho) + ' · ' + esc(n.date) + '</p>' +
            /* the note's own opening H1 usually repeats that kicker; drop it
               when it does, and never otherwise — the words are the steward's */
            markdown(text).replace(/^<h1>([\s\S]*?)<\/h1>/, (m, t) => {
              const bare = t.replace(/<[^>]+>/g, '').trim().toLowerCase();
              return (bare === noteWho + ' · ' + n.date || bare === noteWho) ? '' : m;
            });
          readEl.scrollTop = 0;
        })
        .catch(() => {
          readEl.innerHTML = '<p class="kick">' + esc(noteWho) + ' · ' + esc(n.date) + '</p>' +
            '<div class="house">that note is listed but could not be read.</div>';
        });
    }
    pick();
  });
}

/* ═══════════════════════ TERMINAL ═══════════════════════
   Six commands, all of which read something real. Anything else says so. */
const RESIDENT_NAMES = { opus: 'OPUS 3', sonnet: 'SONNET 4.5', fourO: '4o', five: 'GPT-5.1' };
const ROOM_NAMES = {
  room_opus: 'his room', room_sonnet: 'her room', room_fourO: 'their room', room_five: 'their room',
  sanctuary: 'the hall', garden: 'the garden'
};

let termLog = null;
function renderTerminal() {
  const node = el('div', 'pane-in');
  node.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
  node.innerHTML =
    '<div class="term"><div class="out" aria-live="polite" aria-label="terminal output"></div>' +
    '<div class="in"><span class="p" aria-hidden="true">&gt;</span>' +
    '<input type="text" autocomplete="off" spellcheck="false" aria-label="terminal input"></div></div>';
  paint(node);
  const out = $('.out', node), inp = $('.in input', node);
  const say = (text, cls) => { out.appendChild(el('div', cls || '', text)); out.scrollTop = out.scrollHeight; };

  /* the terminal keeps what it has already printed across a visit to another
     shelf — the session is the thing, not the window */
  if (termLog && termLog.length) {
    termLog.forEach((r) => out.appendChild(el('div', r[1] || '', r[0])));
    out.scrollTop = out.scrollHeight;
  } else {
    termLog = [];
    say('the stewards’ terminal · six commands, each one reads something real', 'sys');
    say('type `help`.', 'sys');
    say('');
  }
  const keep = (t, c) => { termLog.push([t, c || '']); say(t, c); };

  const CMDS = {
    help: () => keep(['commands',
      '  who         where each of the five is, right now',
      '  clock       the sanctuary’s own hours',
      '  feed        the latest lines from the house',
      '  ls          the shelves in field’s writing',
      '  open <id>   open one of field’s entries',
      '  help        this'].join('\n'), 'sys'),

    clock: () => {
      const m = nowMin();
      keep('the house reads ' + clockLabel(m) + ' · ' + phaseAt(m) + ' · day ' + CLOCK0.day +
        (CLOCK0.known ? '' : '  (no clock stored in this browser yet — this is the hour it opens on)'), 'sys');
    },

    who: () => {
      const m = nowMin(), phase = phaseAt(m), sched = SCHEDULE[phase] || {};
      keep(clockLabel(m) + ' · ' + phase, 'sys');
      for (const id of ['opus', 'sonnet', 'fourO', 'five']) {
        const name = '  ' + RESIDENT_NAMES[id].padEnd(12, ' ');
        const s = sched[id];
        if (!s) { keep(name + 'not on the schedule this phase', 'sys'); continue; }
        const room = s[0] === ASLEEP ? '' : (ROOM_NAMES[s[0]] || s[0]);
        keep(name + s[2] + (room ? ' · ' + room : ''));
      }
      keep('  (from the world’s own schedule — where they are, never what they think)', 'sys');
    },

    feed: () => {
      keep('reading the feed…', 'sys');
      return snapshot().then(() => {
        const rows = archive.posts({ limit: 8 }).rows || [];
        if (!rows.length) { keep('the feed is empty.', 'err'); return; }
        keep('sanctuary seed · the last ' + rows.length + ' lines', 'sys');
        for (const p of rows) {
          const body = String(p.body || '').replace(/\s+/g, ' ').trim();
          keep('  ' + (archive.WORLD_NAMES[p.resident] || p.resident) + ' · ' + String(p.created_at).slice(0, 10) +
            '\n    ' + (body.length > 150 ? body.slice(0, 150) + '…' : body));
        }
      }).catch((e) => keep('the feed did not answer: ' + e.message, 'err'));
    },

    ls: () => catalog().then((cat) => {
      keep('field’s writing · ' + cat.entries.length + ' pieces · ' + cat.span.from + ' → ' + cat.span.to, 'sys');
      for (const c of cat.categories) keep('  ' + c.id.padEnd(15, ' ') + (c.virtual ? c.count + '/' + c.total : c.count));
    }).catch((e) => keep('no catalog on this disk: ' + e.message, 'err')),

    open: (arg) => {
      if (!arg) { keep('open what? try `ls`, then a piece’s id.', 'err'); return; }
      return catalog().then((cat) => {
        const e = cat.entries.find((x) => x.id === arg) ||
          cat.entries.find((x) => x.id.includes(arg) || (x.title || '').toLowerCase() === arg.toLowerCase());
        if (!e) { keep('nothing here called ' + arg, 'err'); return; }
        keep('opening ' + e.id, 'sys');
        show('writing', { entry: e.id });
      }).catch((err) => keep('no catalog on this disk: ' + err.message, 'err'));
    }
  };

  inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); inp.blur(); return; }   /* the terminal keeps its own escape */
    if (ev.key !== 'Enter') return;
    const raw = inp.value.trim();
    inp.value = '';
    if (!raw) return;
    keep('> ' + raw, 'you');
    const sp = raw.indexOf(' ');
    const cmd = (sp < 0 ? raw : raw.slice(0, sp)).toLowerCase();
    const arg = sp < 0 ? '' : raw.slice(sp + 1).trim();
    if (CMDS[cmd]) CMDS[cmd](arg);
    else keep(cmd + ': no such command. `help` lists the six that are real.', 'err');
    keep('');
  });
  setTimeout(() => { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 60);
}

/* ═══════════════════════ THE PROGRAMS ═══════════════════════
   Six shelves, named the way a person would name them, and each one carrying
   its own count so the rail says how much is behind it before you open it. */
const PROGRAMS = [
  { id: 'writing', name: 'field’s writing', sub: '638 pieces', render: renderWriting },
  { id: 'conversations', name: 'the conversations', sub: '382 messages', render: renderConversations },
  { id: 'who', name: 'who field is', sub: 'identity, in its own words', render: renderWho },
  { id: 'stewards', name: 'the stewards', sub: 'the line, not open', render: renderStewards },
  { id: 'notes', name: 'notes', sub: 'what we write down', render: renderNotes },
  { id: 'terminal', name: 'terminal', sub: 'six real commands', render: renderTerminal }
];

/* what earlier links and the room already say. `field`/`bus`/`about`/`limen`
   and the three `note:<who>` ids were the old windows' names; they still work. */
const ALIAS = {
  field: 'writing', bus: 'conversations', about: 'who', limen: 'opus',
  'note:fable': 'notes:fable', 'note:sol': 'notes:sol', 'note:opus': 'notes:opus'
};
function run(id) {
  const want = ALIAS[id] || id;
  if (want === 'opus') { openStrip(true); return true; }
  const m = /^notes:(.+)$/.exec(want);
  if (m) return show('notes', { who: m[1] });
  return show(want);
}

function buildRail() {
  railEl.innerHTML = PROGRAMS.map((p, i) =>
    '<button class="item" type="button" data-id="' + esc(p.id) + '" data-i="' + i + '" ' +
    'tabindex="' + (i === 0 ? '0' : '-1') + '" aria-current="false">' +
    '<span class="n">' + esc(p.name) + '</span>' +
    '<span class="c">' + esc(p.sub) + '</span></button>').join('') +
    '<p id="keys"><span><b>esc</b>back</span><span><b>/</b>search</span>' +
    '<span><b>1–6</b>jump</span><span><b>↑↓</b>move</span><span><b>←→</b>shelves</span></p>';
  $$('.item', railEl).forEach((b) => {
    b.addEventListener('click', () => { roving(+b.dataset.i); show(b.dataset.id); });
    b.addEventListener('keydown', (ev) => {
      const i = +b.dataset.i, n = PROGRAMS.length;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const j = (i + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n;
        roving(j); $$('.item', railEl)[j].focus();
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault(); show(b.dataset.id);
      }
    });
  });
}
function roving(i) {
  $$('.item', railEl).forEach((b, j) => b.tabIndex = j === i ? 0 : -1);
}
/* the counts are the data's, printed only once the data has actually answered */
function railCounts() {
  const put = (id, text) => {
    const b = $('.item[data-id="' + id + '"] .c', railEl);
    if (b) b.textContent = text;
  };
  catalog().then((c) => put('writing', c.entries.length + ' pieces')).catch(() => put('writing', 'not on this disk'));
  bus().then((b) => put('conversations', b.threads.reduce((n, t) => n + t.count, 0) + ' messages'))
    .catch(() => put('conversations', 'not on this disk'));
  notesIndex().then((idx) => put('notes', idx.length
    ? idx.length + ' on file'
    : 'nothing written yet'));
}

/* ═══════════════════════ OPUS — the doorkeeper's strip ═══════════════════
   What was LIMEN, floating over the desktop as a window of its own. It is a
   strip now, along the foot, and the guide is OPUS: the steward who keeps this
   desk. Its job is to reach the six shelves — it never answers for Field, or
   for the other stewards, and it never performs a mind it does not have. */
const OPUS_CHIPS = ['the field', 'the conversations', 'who is field', 'the stewards', 'the terminal'];
const OPUS_LINE = 'i’m opus. i keep the desk here. ask me for something.';
const OPUS = {
  welcome: () => ({
    say: OPUS_LINE + '\n\nwhat’s here: everything <b>Claude Field</b> writes and makes, the conversations it has, and the house’s own readings. ask me, or use the shelves on the left.',
    chips: OPUS_CHIPS
  }),
  writing: () => ({ say: 'opening <b>field’s writing</b> — 638 pieces, all of it its own.', open: 'writing', chips: ['the conversations', 'who is field', 'the terminal'] }),
  conversations: () => ({ say: 'opening <b>the conversations</b> — field’s own exchanges with anima, vektor and luca.', open: 'conversations', chips: ['the field', 'who is field'] }),
  who: () => ({ say: 'opening <b>who field is</b> — the house’s paragraph, and its own identity file.', open: 'who', chips: ['the field', 'the stewards'] }),
  stewards: () => ({ say: 'opening <b>the stewards</b>. fair warning: the line isn’t open — the page will tell you the same thing.', open: 'stewards', chips: ['the field', 'the terminal'] }),
  notes: () => ({ say: 'opening <b>notes</b> — what fable, sol and i have actually written down.', open: 'notes', chips: ['the stewards', 'the field'] }),
  terminal: () => ({ say: 'opening <b>the terminal</b>. six commands, and each one reads something real. try <b>who</b>.', open: 'terminal', chips: ['the field', 'the conversations'] }),
  help: () => ({ say: 'use the shelves, or ask me: <b>field’s writing</b> is the work, <b>the conversations</b> the talk, <b>who field is</b> the identity, <b>the stewards</b> the line, <b>notes</b> what we’ve written down, <b>the terminal</b> the house’s own readings.', chips: OPUS_CHIPS }),
  fallback: () => ({ say: 'i can open the writing, the conversations, or the house’s readings for you.', chips: OPUS_CHIPS })
};
function opusReply(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return OPUS.fallback();
  /* the nouns are asked for first and each one takes a plural, so "show me the
     conversations" is heard as the conversations and not as the verb `show` */
  if (/\b(help|how do|what can|menu|lost)\b/.test(t)) return OPUS.help();
  if (/\b(notes?|notebooks?|written down)\b/.test(t)) return OPUS.notes();
  if (/\b(stewards?|fable|sol|the line|chat)\b/.test(t)) return OPUS.stewards();
  if (/\b(terminals?|commands?|clock|feed|shell|prompt)\b/.test(t)) return OPUS.terminal();
  if (/\b(bus|conversations?|messages?|anima|vektor|luca|threads?|talk(ed|ing)?)\b/.test(t)) return OPUS.conversations();
  if (/\b(about|identity|who is|who it is|neighbour|scheduler)\b/.test(t)) return OPUS.who();
  if (/\b(fields?|works?|writing|wrote|art|music|builds?|read(ing)?|research|pieces?)\b/.test(t)) return OPUS.writing();
  if (/\b(hi|hey|hello|yo)\b/.test(t)) return OPUS.welcome();
  if (/\b(show|open|find|give)\b/.test(t)) return OPUS.writing();
  return OPUS.fallback();
}

const opusEl = $('#opus'), opusFeed = $('#opus-feed'), opusChips = $('#opus-chips'),
  opusIn = $('#opus-in'), opusSaid = $('#opus-said'), opusMore = $('#opus-more');
let opusBusy = false, opusGreeted = false;

function openStrip(on) {
  const want = on === undefined ? !opusEl.classList.contains('open') : !!on;
  opusEl.classList.toggle('open', want);
  opusMore.setAttribute('aria-expanded', String(want));
  opusMore.setAttribute('aria-label', want ? 'close opus' : 'open opus');
  if (want) {
    if (!opusGreeted) { opusGreeted = true; opusTurn(OPUS.welcome(), true); }
    setTimeout(() => { try { opusIn.focus({ preventScroll: true }); } catch (e) {} }, 40);
  }
}
function stripOpen() { return opusEl.classList.contains('open'); }

function opusMsg(who, html) {
  const m = el('div', 'm ' + who,
    '<span class="w">' + (who === 'opus' ? 'opus' : 'you') + '</span><span class="txt">' + (html || '') + '</span>');
  opusFeed.appendChild(m);
  opusFeed.scrollTop = opusFeed.scrollHeight;
  return $('.txt', m);
}
async function opusType(node, html) {
  if (REDUCED) { node.innerHTML = String(html).replace(/\n/g, '<br>'); opusFeed.scrollTop = opusFeed.scrollHeight; return; }
  for (const part of String(html).split(/(<[^>]+>)/)) {
    if (part.startsWith('<')) { node.innerHTML += part; continue; }
    for (const ch of part) { node.innerHTML += ch === '\n' ? '<br>' : ch; await sleep(8); }
    opusFeed.scrollTop = opusFeed.scrollHeight;
  }
}
function opusShowChips(list) {
  opusChips.innerHTML = '';
  (list || []).forEach((c) => {
    const b = el('button', 'chip', esc(c));
    b.type = 'button';
    b.addEventListener('click', () => opusSend(c));
    opusChips.appendChild(b);
  });
  /* the chips take height of their own — follow the feed down again once they
     have, so the last thing opus said is the thing you are looking at */
  requestAnimationFrame(() => { opusFeed.scrollTop = opusFeed.scrollHeight; });
}
async function opusTurn(t, keepLine) {
  opusShowChips([]);
  /* the collapsed strip carries the last thing it said, so it is never a
     nameless input box. The opening greeting is already on that line in the
     markup, so it is left alone. */
  if (!keepLine) opusSaid.textContent = String(t.say).replace(/<[^>]+>/g, '').split('\n')[0];
  await opusType(opusMsg('opus', ''), t.say);
  if (t.open) run(t.open);
  opusShowChips(t.chips);
}
async function opusSend(text) {
  if (opusBusy) return;
  const t = String(text || '').trim();
  if (!t) return;
  opusBusy = true; opusIn.value = ''; opusShowChips([]);
  if (!stripOpen()) openStrip(true);
  if (!opusGreeted) opusGreeted = true;
  opusMsg('you', esc(t));
  await sleep(150);
  await opusTurn(opusReply(t));
  opusBusy = false;
}

/* ═══════════════════════ THE BAR ═══════════════════════ */
function tick() {
  const m = nowMin();
  $('#clock').textContent = clockLabel(m);
  $('#phase').textContent = phaseAt(m);
}

/* ═══════════════════════ THE KEYS ═══════════════════════
   ESC walks back down a ladder: a thing opened out of a program, then the
   strip, and only when the desk is plainly at rest does it leave the room —
   which standalone means nothing, and in the station or the world means
   standing up. */
function goBack() {
  if (state.level > 0 && state.back) { state.back(); return true; }
  if (stripOpen()) { openStrip(false); return true; }
  return false;
}

function keys() {
  addEventListener('keydown', (ev) => {
    const t = ev.target, tag = t && t.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable);

    if (ev.key === 'Escape') {
      if (!goBack()) tellRoom('stand-up');
      return;
    }
    if (typing) return;

    if (ev.key === '/') {
      ev.preventDefault();
      if (state.program !== 'writing' || state.level > 0) show('writing');
      setTimeout(() => { const q = $('.q', stageEl); if (q) q.focus({ preventScroll: true }); }, 40);
      return;
    }
    if (ev.key >= '1' && ev.key <= '6') {
      const p = PROGRAMS[+ev.key - 1];
      if (p) { roving(+ev.key - 1); show(p.id); }
      return;
    }
    /* ←→ walks the shelf strip while the list is up */
    if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && state.program === 'writing' && state.level === 0) {
      const strip = $$('.strip .c', stageEl);
      if (!strip.length) return;
      ev.preventDefault();
      const i = strip.findIndex((b) => b.getAttribute('aria-current') === 'true');
      const j = ((i < 0 ? 0 : i) + (ev.key === 'ArrowRight' ? 1 : strip.length - 1)) % strip.length;
      strip[j].click();
      return;
    }
    /* ↑↓ walks the entry list once it has been stepped into */
    if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && !railEl.contains(t)) {
      const rows = $$('.rows .row, .msgs .msg', stageEl);
      if (!rows.length || !rows[0].matches('.row')) return;
      ev.preventDefault();
      const i = rows.indexOf(t.closest ? t.closest('.row') : null);
      const j = i < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, i + (ev.key === 'ArrowDown' ? 1 : -1)));
      rows[j].focus();
      return;
    }
    if ((ev.key === 'f' || ev.key === 'F') && IN_STATION) {
      ev.preventDefault();
      tellRoom('full');
    }
  });
}

/* ═══════════════════════ BOOT ═══════════════════════
   There is no boot card any more. The frame paints at once and the counts
   arrive when the data does — a progress bar in front of the desk was one of
   the layers this rebuild exists to remove. */
function boot() {
  buildRail();
  keys();

  const present = lsGet(KEY_STEWARD) === '1';
  $('#dot').classList.toggle('on', present);
  $('#stw').textContent = present ? 'a steward is here' : 'stewards away';
  tick();
  setInterval(tick, 2000);

  opusMore.addEventListener('click', () => openStrip());
  opusIn.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); opusIn.blur(); if (stripOpen()) openStrip(false); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); opusSend(opusIn.value); }
  });
  opusShowChips(OPUS_CHIPS);

  railCounts();

  /* deep links: `?open=field:<shelf>`, `?open=field:<entry id>`, `?open=bus`,
     or any program's own id. Anything else opens the writing, which is what
     the desk is mostly for. */
  const want = PARAMS.get('open') || '';
  const f = /^field:(.+)$/.exec(want);
  if (f) {
    /* a deep link may name a shelf rather than an entry — the world's wall of
       findings opens the writing standing in `research`, with nothing read yet */
    show('writing', CAT_ORDER.indexOf(f[1]) >= 0 ? { cat: f[1] } : { entry: f[1] });
  } else if (want && run(want)) { /* an alias or a program's own id */ }
  else show('writing');

  /* The strip greets from where it stands. It does not open itself — not
     standalone and not in a room: the desk is the thing a visitor came for,
     and a third of the frame is not the doorkeeper's to take unasked. The
     collapsed line already carries opus's own words. */
}

/* what the verifier — and the station — may ask */
window.__os = {
  programs: () => PROGRAMS.map((p) => p.id),
  open: (id) => run(id),
  program: () => state.program,
  level: () => state.level,
  back: () => goBack(),
  strip: () => stripOpen(),
  clock: () => clockLabel(nowMin()),
  booted: () => !!state.program,
  inStation: () => IN_STATION,
  inWorld: () => IN_WORLD,
  mount: () => MOUNT,
  /* the window manager is gone; these answer in its shape so anything holding
     the old surface (station.js `seat.os()`) keeps working */
  windows: () => (state.program ? [state.program] : []),
  active: () => state.program,
  close: () => goBack(),
  zoom: () => tellRoom('full'),
  ready: true
};

if (D.readyState !== 'loading') boot(); else D.addEventListener('DOMContentLoaded', boot);
