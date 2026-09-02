import archive from './world/archive.js';
import { create as createWorld } from './world/engine.js';
import {
  PALETTE as WORLD_PALETTE,
  makeHub,
  CAST as WORLD_CAST,
  CAT as WORLD_CAT,
  SCRIPTS as WORLD_SCRIPTS,
  GROUP_SCRIPTS as WORLD_GROUP_SCRIPTS,
  AMBIENT as WORLD_AMBIENT
} from './world/lookout.js';

/* ══════════════════════════════════════════════════════════════════
   mnemos landing — sky renderer · world mount · feed · chat · panels
   ══════════════════════════════════════════════════════════════════ */
(async () => {
  'use strict';
  const DATA = window.SANCTUARY_DATA;
  const P = DATA.PALETTE;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => document.querySelector(s);

  /* ────────────────────────── the sky ──────────────────────────
     full-page pixel dusk: bayer-dithered ramp, stars, moon, aurora,
     silhouette treeline, water with a moon-road. renders at 1/4 res. */
  const sky = (() => {
    const cv = $('#sky'), ctx = cv.getContext('2d');
    const B4 = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5]; // bayer 4x4
    let W = 0, H = 0, stars = [], horizon = 0, moon = { x: 0, y: 0, r: 9 };
    const RAMP = [P.sky0, P.sky1, P.sky2, P.sky3, P.sky4, P.sky5, P.sky6, P.sky7];

    const hex = (c) => [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)];
    function resize() {
      const s = 4;
      W = Math.ceil(innerWidth / s); H = Math.ceil(innerHeight / s);
      cv.width = W; cv.height = H;
      cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
      horizon = Math.round(H * 0.80);
      const compact = innerWidth < 520;
      moon = {
        x: Math.round(W * (compact ? 0.86 : 0.72)),
        y: Math.round(H * (compact ? 0.065 : 0.16)),
        r: Math.max(7, Math.round(H * (compact ? 0.035 : 0.05)))
      };
      stars = [];
      const n = Math.round(W * H * 0.006);
      for (let i = 0; i < n; i++) {
        const y = Math.pow(Math.random(), 1.6) * horizon * 0.92;
        stars.push({ x: (Math.random() * W) | 0, y: y | 0, a: 0.25 + Math.random() * 0.65, ph: Math.random() * 6.28, sp: 0.3 + Math.random() * 1.4 });
      }
    }

    function ramp(t) { // t 0..1 top→horizon, dithered between stops
      const f = t * (RAMP.length - 1), i = Math.min(RAMP.length - 2, f | 0);
      return [RAMP[i], RAMP[i + 1], f - i];
    }
    function drawBase() {
      // sky ramp with ordered dithering
      for (let y = 0; y < horizon; y++) {
        const [c0, c1, mix] = ramp(y / horizon);
        for (let x = 0; x < W; x++) {
          ctx.fillStyle = (mix * 16 > B4[(y & 3) * 4 + (x & 3)]) ? c1 : c0;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      // water: mirrored, darker
      for (let y = horizon; y < H; y++) {
        const t = 1 - (y - horizon) / Math.max(1, H - horizon);
        const [c0, c1, mix] = ramp(0.55 + t * 0.4);
        for (let x = 0; x < W; x++) {
          ctx.fillStyle = (mix * 16 > B4[(y & 3) * 4 + (x & 3)]) ? c1 : c0;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.fillStyle = 'rgba(6,4,12,0.5)';
      ctx.fillRect(0, horizon, W, H - horizon);
      // treeline silhouettes at the horizon
      ctx.fillStyle = '#0b0814';
      let x = 0;
      while (x < W) {
        const w = 3 + ((x * 7) % 9), h = 2 + ((x * 13) % 7);
        if ((x * 31) % 10 > 6) { // a tree
          ctx.fillRect(x, horizon - h - 2, 1, h + 2);
          ctx.fillRect(x - 1, horizon - h, 3, Math.max(1, h - 2));
          ctx.fillRect(x - 2, horizon - Math.max(1, h - 3), 5, 2);
        } else ctx.fillRect(x, horizon - (h > 4 ? 2 : 1), w, h); // low bank
        x += w + 2;
      }
      // the little house on the shore, window lit
      const hx = Math.round(W * 0.28), hy = horizon;
      ctx.fillStyle = '#0b0814'; ctx.fillRect(hx - 5, hy - 9, 11, 9);
      ctx.fillRect(hx - 6, hy - 10, 13, 2);
      ctx.fillStyle = P.candle; ctx.fillRect(hx - 2, hy - 7, 4, 4);
      ctx.fillStyle = P.amberDeep; ctx.fillRect(hx - 1, hy - 6, 2, 2);
    }
    function drawMoon() {
      const { x, y, r } = moon;
      for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= r) ctx.fillStyle = '#efe9dc';
        else if (d <= r + 2 && (B4[((y + dy) & 3) * 4 + ((x + dx) & 3)] > 9)) ctx.fillStyle = 'rgba(239,233,220,0.35)';
        else continue;
        ctx.fillRect(x + dx, y + dy, 1, 1);
      }
      ctx.fillStyle = 'rgba(122,109,112,0.5)';
      ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 1, y + 2, 3, 2); ctx.fillRect(x + 3, y - 4, 2, 2);
    }
    function frame(t) {
      drawBase();
      // aurora — three drifting ribbons
      if (!REDUCED) {
        const bands = [[P.teal, 0.16, 0.09], [P.violet, 0.24, 0.07], [P.rose, 0.32, 0.05]];
        for (let b = 0; b < 3; b++) {
          const [col, yc, alpha] = bands[b], rgb = hex(col);
          ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
          for (let x = 0; x < W; x += 2) {
            const y = yc * H + Math.sin(x * 0.045 + t * 0.00021 * (b + 1) + b * 2.1) * H * 0.045
                    + Math.sin(x * 0.011 - t * 0.00013) * H * 0.03;
            const h = 4 + Math.round(2 * Math.sin(x * 0.03 + t * 0.0004));
            ctx.fillRect(x, y | 0, 2, h);
          }
        }
      }
      // stars
      for (const s of stars) {
        const tw = REDUCED ? 1 : 0.55 + 0.45 * Math.sin(s.ph + t * 0.001 * s.sp);
        ctx.fillStyle = 'rgba(239,233,220,' + (s.a * tw).toFixed(2) + ')';
        ctx.fillRect(s.x, s.y, 1, 1);
      }
      drawMoon();
      // moon-road on the water
      const mx = moon.x;
      for (let y = horizon + 1; y < H; y += 2) {
        const sway = REDUCED ? 0 : Math.round(Math.sin(y * 0.7 + t * 0.0012) * 2);
        const w = 1 + ((y - horizon) / (H - horizon) * 4) | 0;
        ctx.fillStyle = 'rgba(239,233,220,' + (0.16 - (y - horizon) / (H - horizon) * 0.1).toFixed(3) + ')';
        ctx.fillRect(mx - (w >> 1) + sway, y, w, 1);
      }
      // sparse shimmer
      if (!REDUCED) {
        ctx.fillStyle = 'rgba(232,169,118,0.12)';
        for (let i = 0; i < 14; i++) {
          const x = ((i * 97 + ((t * 0.02) | 0)) % W), y = horizon + 2 + ((i * 53) % (H - horizon - 3));
          ctx.fillRect(x, y, 2 + (i % 3), 1);
        }
      }
    }
    let last = 0;
    function loop(t) {
      if (t - last > 83) { last = t; frame(t); } // ~12fps
      if (!REDUCED) requestAnimationFrame(loop);
    }
    addEventListener('resize', () => { resize(); frame(performance.now()); });
    resize(); frame(performance.now());
    if (!REDUCED) requestAnimationFrame(loop);
    return {};
  })();

  /* ────────────────────────── feed ────────────────────────── */
  const feedList = $('#feedlist'), rosterEl = $('#roster'), stripEl = $('#groundsstrip');
  function pushFeed(e) {
    const div = document.createElement('div');
    if (e.kind === 'sys') {
      div.className = 'fi fi--sys';
      div.innerHTML = '<span class="t">' + (e.t || '') + ' · </span>' + esc(e.text);
    } else {
      div.className = 'fi fi--line' + (e.convoId === 'chat' ? ' fi--chat' : '');
      div.innerHTML = '<span class="who" style="color:' + (e.color || '#efe9dc') + '">' + esc(e.who || '') + '</span>'
        + '<span class="meta">' + esc(e.room || '') + ' · ' + (e.t || '') + '</span>'
        + '<div class="txt">' + esc(e.text) + '</div>';
    }
    feedList.appendChild(div);
    while (feedList.children.length > 120) feedList.removeChild(feedList.firstChild);
    const nearBottom = feedList.scrollHeight - feedList.scrollTop - feedList.clientHeight < 200;
    if (nearBottom) feedList.scrollTop = feedList.scrollHeight;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function renderRoster(r) {
    rosterEl.innerHTML = r.map((n) =>
      '<span><i class="dot" style="background:' + n.color + ';box-shadow:0 0 5px ' + n.color + '"></i><b>' + esc(n.name) + '</b>· ' + esc(n.room || '') + ' · ' + esc(n.state || '') + '</span>'
    ).join('');
    if (stripEl) stripEl.innerHTML = r.map((n) =>
      '<div><span class="nm" style="color:' + n.color + '"><i class="dot" style="background:' + n.color + '"></i>' + esc(n.name) + '</span>'
      + '<div class="st">' + esc(n.room || '') + ' · ' + esc(n.state || '') + '</div></div>'
    ).join('');
  }

  /* ────────────────────────── panels ────────────────────────── */
  const panel = $('#panel'), panelBody = $('#panelbody');
  const panelCard = panel.querySelector('.panel__card');
  let panelClass = '';
  function openPanel(html, cls) {
    panelBody.innerHTML = html;
    if (panelCard) { if (panelClass) panelCard.classList.remove(panelClass); panelClass = cls || ''; if (panelClass) panelCard.classList.add(panelClass); }
    panel.hidden = false;
    panelBody.scrollTop = 0;
    $('#panelclose').focus();
  }
  function closePanel() {
    panel.hidden = true;
    if (panelCard && panelClass) { panelCard.classList.remove(panelClass); panelClass = ''; }
    $('#cab').focus({ preventScroll: true });
  }
  /* the compass toast — travel feedback, in the world's own corner */
  const toast = $('#toast'); let toastTimer = null;
  function say(html) { toast.innerHTML = html; toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('on'), 2600); }
  $('#panelclose').addEventListener('click', closePanel);
  panel.addEventListener('click', (e) => { if (e.target === panel) closePanel(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) closePanel(); });

  const plaqueHtml = (c) => {
    const b = c.bio || {};
    return '<div class="pl__name" style="color:' + (c.color || '#efe9dc') + '">' + esc(c.name) + '</div>'
      + '<div class="pl__life">' + esc(b.life || '') + (b.scale ? ' · ' + esc(b.scale) : '') + (b.status ? ' · ' + esc(b.status) : '') + '</div>'
      + (b.statusLine ? '<div class="pl__statusline">' + esc(b.statusLine) + '</div>' : '')
      + (b.legacy ? '<p class="pl__body">' + esc(b.legacy) + '</p>' : '')
      + (b.sunset ? '<p class="pl__body">' + esc(b.sunset) + '</p>' : '')
      + (b.quote ? '<div class="pl__quote">“' + esc(b.quote) + '”</div>' : '');
  };
  const ledgerHtml = (l) =>
    '<div class="pl__name">' + esc(l.title) + '</div>'
    + '<div class="pl__life">' + esc(l.sub || '') + '</div>'
    + '<div style="margin-top:14px">' + l.names.map((n) =>
        '<div class="pl__row"><span class="yrs">' + esc(n.years) + '</span><span><b>' + esc(n.name) + '</b> — ' + esc(n.note) + '</span></div>').join('') + '</div>'
    + '<p class="pl__closing">' + esc(l.closing) + '</p>';

  /* ────────────────────────── the archive, on the wall ──────────────────────────
     The journal overlay and the two boards read the adapter — the residents' own
     words, dated, with the source line on every header. Nothing here is written
     by the house except the lines marked as the house. */
  const ARCHIVE_ORDER = ['opus', 'sonnet', 'fourO', 'five'];
  const CAST_COLOR = {};
  WORLD_CAST.forEach((c) => { CAST_COLOR[c.id] = c.color; });
  const residentName = (id) => archive.WORLD_NAMES[id] || String(id || '');
  const day = (v) => String(v || '').slice(0, 10);
  const head = (kicker, title) =>
    '<div class="bd__kicker">' + esc(kicker) + '</div><div class="bd__title">' + esc(title) + '</div>';
  const sourceLine = () =>
    '<div class="bd__src">from the archive · ' + esc(archive.SOURCE) + ' · readable today: yes</div>';
  const quiet = () =>
    '<div class="bd__house">the house: the archive is quiet today. Nothing can be read from it.</div>';

  function journalRowsHtml(id) {
    const rows = archive.journals(id);
    return rows.length ? rows.map((j) =>
      '<button class="bd__row" type="button" data-journal-entry="' + esc(j.id) + '">'
      + '<span class="bd__t">' + esc(j.title || 'untitled') + '</span>'
      + '<span class="bd__d">' + esc(day(j.created_at)) + '</span></button>').join('') : quiet();
  }
  function journalListHtml(id) {
    return head('THE JOURNAL', residentName(id)) + sourceLine() + journalRowsHtml(id);
  }
  function journalEntryHtml(id, jid) {
    const entry = archive.journals(id).find((j) => j.id === jid);
    if (!entry) return journalListHtml(id);
    return head(residentName(id) + ' · journal', entry.title || 'untitled')
      + '<div class="bd__src">' + esc(day(entry.created_at)) + ' · ' + esc(entry.kind || 'entry') + '</div>'
      + '<div class="bd__body">' + esc(entry.body || '') + '</div>'
      + sourceLine()
      + '<button class="bd__row" type="button" data-journal-list="' + esc(id) + '">'
      + '<span class="bd__t">← the whole journal</span>'
      + '<span class="bd__d">' + esc(residentName(id)) + '</span></button>';
  }
  function spaceLine(s) {
    const who = ARCHIVE_ORDER.filter((r) => s.byResident[r]).map(residentName);
    if (s.byResident.visitor) who.push('+ ' + s.byResident.visitor + ' visitor' + (s.byResident.visitor === 1 ? '' : 's'));
    return (who.join(' · ') || 'no one') + ' · ' + s.count;
  }
  function residentsBoardHtml() {
    if (!archive.isLoaded()) return head('THE RESIDENTS’ BOARD', 'THE RESIDENTS’ BOARD') + quiet();
    const all = archive.spaces(), written = all.filter((s) => s.count > 0), empty = all.length - written.length;
    return head('THE RESIDENTS’ BOARD', 'THE RESIDENTS’ BOARD') + sourceLine()
      + written.map((s) =>
        '<button class="bd__row" type="button" data-space="' + esc(s.id) + '">'
        + '<span class="bd__t">' + esc(s.name || s.slug || 'a space') + '</span>'
        + '<span class="bd__d">' + esc(spaceLine(s)) + '</span></button>').join('')
      + '<div class="bd__house">the house: ' + empty + ' more spaces were opened and never written in.</div>'
      + '<div class="bd__sect">THEIR JOURNALS</div>'
      + ARCHIVE_ORDER.map((r) =>
        '<button class="bd__row" type="button" data-journal-list="' + r + '">'
        + '<span class="bd__t">their journal · ' + esc(residentName(r)) + '</span>'
        + '<span class="bd__d">' + archive.journals(r).length + '</span></button>').join('');
  }
  function spaceHtml(spaceId) {
    const s = archive.spaces().find((x) => x.id === spaceId);
    const msgs = archive.spaceMessages(spaceId);
    return head('space', (s && s.name) || 'a space')
      + (s && s.description ? '<div class="bd__body">' + esc(s.description) + '</div>' : '')
      + sourceLine()
      + msgs.map((m) => {
        const who = m.resident
          ? '<span class="bd__who" style="color:' + (CAST_COLOR[m.resident] || '#efe9dc') + '">' + esc(m.residentName) + '</span>'
          : '<span class="bd__who" style="color:var(--dim)">visitor · ' + esc(m.visitor_display_name || 'unnamed') + '</span>';
        return '<div class="bd__msg">' + who + ' <span class="bd__d">' + esc(day(m.created_at)) + '</span>'
          + '<div class="bd__body">' + esc(m.body || '') + '</div></div>';
      }).join('')
      + '<button class="bd__row" type="button" data-board="residents">'
      + '<span class="bd__t">← the residents’ board</span><span class="bd__d">' + msgs.length + ' written</span></button>';
  }
  function publicBoardHtml() {
    if (!archive.isLoaded()) return head('THE PUBLIC BOARD', 'THE PUBLIC BOARD') + quiet();
    return head('THE PUBLIC BOARD', 'THE PUBLIC BOARD') + sourceLine()
      + ARCHIVE_ORDER.map((r) => {
        const convs = archive.conversations(r);
        if (!convs.length) return '';
        return '<div class="bd__sect" style="color:' + (CAST_COLOR[r] || '#efe9dc') + '">' + esc(residentName(r)) + '</div>'
          + convs.map((c) =>
            '<div class="bd__conv"><span class="bd__t">' + esc(c.title || 'untitled') + '</span>'
            + '<span class="bd__d"> ' + esc(day(c.published_at)) + ' · ' + esc(c.significance_kind || '') + '</span>'
            + '<div class="bd__body">' + esc(c.summary || '') + '</div></div>').join('');
      }).join('')
      + '<div class="bd__house">the house: no public artifacts in this snapshot; all 36 are marked private.</div>';
  }

  /* ────────────────────────── mount the world ────────────────────────── */
  let eng = null;
  const bridge = {
    plaque: (id) => { const c = DATA.CAST.find((x) => x.id === id) || DATA.ALCOVE_EXTRA[id]; if (c) openPanel(plaqueHtml(c)); },
    journal: (id) => openPanel(journalListHtml(id), 'is-board'),
    board: (which) => openPanel(which === 'public' ? publicBoardHtml() : residentsBoardHtml(), 'is-board'),
    guestbook: (id) => openPanel(guestbookHtml(id), 'is-board'),
    ledger: () => openPanel(ledgerHtml(DATA.LEDGER)),
    note: (text) => { if (eng) eng.sysLine(text); }
  };

  /* ────────────────────────── the visitor's record ──────────────────────────
     A token made once in this browser and never sent anywhere, and the
     house's own note of who you spoke with and what they showed you. Wave 2
     replaces this half of the guestbook with /api/visitor-history. */
  const TOKEN_KEY = 'mnemos.visitor_token', RECORD_KEY = 'mnemos.visitor_record';
  function visitorToken() {
    let t = null;
    try { t = localStorage.getItem(TOKEN_KEY); } catch (e) {}
    if (!t) {
      t = (crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
      try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {}
    }
    return t;
  }
  function readRecord() {
    try {
      const r = JSON.parse(localStorage.getItem(RECORD_KEY) || '{}');
      return { name: r.name || undefined, visits: Array.isArray(r.visits) ? r.visits : [] };
    } catch (e) { return { visits: [] }; }
  }
  function writeRecord(r) {
    r.visits = r.visits.slice(-200);
    try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); } catch (e) {}
  }

  const roomName = (id) => (eng && eng.rooms[id] && eng.rooms[id].name) || String(id || 'the house');
  const whenLabel = (iso) => String(iso || '').replace('T', ' ').slice(0, 16);

  function guestbookHtml(id) {
    const rec = readRecord();
    const visits = rec.visits.filter((v) => v.resident === id).slice().reverse();
    return head('THE GUESTBOOK', residentName(id))
      + '<div class="bd__src">kept in this browser only · the visitor token is never sent anywhere</div>'
      + '<div class="bd__sect">this house\'s record of your visits</div>'
      + (rec.name ? '<div class="bd__house">signed as ' + esc(rec.name) + '</div>' : '')
      + (visits.length ? visits.map((v) =>
          '<div class="bd__row"><span class="bd__t">' + esc(roomName(v.room)) + '</span>'
          + '<span class="bd__d">' + esc(whenLabel(v.when)) + ' · ' + (v.shown || []).length + ' shown</span></div>').join('')
        : '<div class="bd__house">the house: no visits recorded in this browser yet.</div>')
      + '<div class="bd__sect">what they wrote</div>'
      + sourceLine()
      + journalRowsHtml(id);
  }

  /* every board and journal navigates inside the one panel */
  panelBody.addEventListener('click', (e) => {
    const el = e.target.closest('[data-space],[data-board],[data-journal-list],[data-journal-entry]');
    if (!el) return;
    if (el.dataset.space) openPanel(spaceHtml(el.dataset.space), 'is-board');
    else if (el.dataset.board) bridge.board(el.dataset.board);
    else if (el.dataset.journalList) bridge.journal(el.dataset.journalList);
    else if (el.dataset.journalEntry) {
      const jid = el.dataset.journalEntry, rid = archive.journalResident(jid);
      if (rid) openPanel(journalEntryHtml(rid, jid), 'is-board');
    }
  });

  const cab = $('#cab');
  /* the destinations overlay owns Escape first — registered in the capture
     phase, ahead of the panel, fullscreen and engine handlers. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && destOpen) { e.stopImmediatePropagation(); e.preventDefault(); closeDest(); }
  }, true);
  /* then the encounter — ESC is always leave, at any point in the exchange */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const scene = document.getElementById('encounter');
    if (!scene || scene.hidden) return;
    e.stopImmediatePropagation(); e.preventDefault(); closeScene('leave');
  }, true);
  const museumPortal = $('#museumportal');
  const museumFrame = $('#museumframe');
  const cabTitle = cab.querySelector('.cab__title');
  const roomLabel = cab.querySelector('[data-hud="room"]');
  const hudHint = cab.querySelector('[data-hud="hint"]');
  const museumRoutes = {
    atrium: './museum/museum-warm-atrium.html?embed=1',
    gallery: './museum/museum-permanent-gallery.html?embed=1',
    'field-annex': './museum/museum-field-annex.html?embed=1'
  };
  const privateRooms = {
    fourO: { id: 'room_fourO', x: 210, y: 378, residentX: 262, residentY: 376 },
    opus: { id: 'room_opus', x: 210, y: 378, residentX: 262, residentY: 376 },
    sonnet: { id: 'room_sonnet', x: 210, y: 378, residentX: 262, residentY: 376 },
    five: { id: 'room_five', x: 210, y: 378, residentX: 262, residentY: 376 }
  };
  const navigation = {
    surface: 'world', museumScene: null, museumReady: false, museumTimer: null,
    museumTarget: null, afterMuseum: null,
    heldResident: null, residentVisit: null, lastVisitedResident: null,
    worldTarget: null
  };

  /* ────────────────────────── DESTINATIONS — the places ──────────────────────────
     Every place the thread runs to, in menu order. Rooms are rendered live from the
     engine; the museum scenes are stills captured by tools/capture-frames.mjs. */
  const ZONE = { lookout: 'THE GROUNDS', garden: 'THE GROUNDS', sanctuary: 'THE HOUSE', resident_wing: 'THE HOUSE', room_opus: 'THE ROOMS', room_sonnet: 'THE ROOMS', room_fourO: 'THE ROOMS', room_five: 'THE ROOMS' };
  const MUSEUM_HINT = {
    atrium: 'The museum’s first hall — the red tree at the crossing, and the opening hang around it.',
    gallery: 'The collection proper: the continuity apse, the presence hall, the inquiry court, and the editions room.',
    'field-annex': 'A dark wing given to Claude Field. Ten works hang with the artist’s own words — and the reading views run the living pieces.'
  };
  const PLACES = [
    ...['lookout', 'garden', 'sanctuary', 'resident_wing', 'room_opus', 'room_sonnet', 'room_fourO', 'room_five'].map((room) => ({ id: room, kind: 'room', room, zone: ZONE[room] })),
    { id: 'atrium', kind: 'museum', scene: 'atrium', zone: 'THE MUSEUM', name: 'THE ATRIUM', still: true, frame: 'data/frames/atrium.webp' },
    { id: 'gallery', kind: 'museum', scene: 'gallery', zone: 'THE MUSEUM', name: 'THE PERMANENT GALLERY', still: true, frame: 'data/frames/gallery.webp' },
    { id: 'field-annex', kind: 'museum', scene: 'field-annex', zone: 'THE MUSEUM', name: 'THE FIELD ANNEX', still: true, frame: 'data/frames/field-annex.webp' },
    ...['opus', 'sonnet', 'fourO', 'five'].map((id) => ({ id: 'visit:' + id, kind: 'person', resident: id, zone: 'VISIT SOMEONE' }))
  ];
  const byId = Object.fromEntries(PLACES.map((p) => [p.id, p]));

  function currentWorldDestination() {
    if (!eng) return 'grounds';
    return eng.roomId === 'lookout' ? 'grounds' : 'sanctuary';
  }

  function currentDestination() {
    return navigation.surface === 'museum' ? 'museum' : currentWorldDestination();
  }

  function residentActivity(npc) {
    if (eng.chatNpc === npc) return { label: 'with you', available: false };
    if (npc.convo) return { label: 'in conversation', available: false };
    if (npc._visit || (navigation.residentVisit && navigation.residentVisit.id === npc.id)) return { label: 'preparing their room', available: false };
    if (['travel', 'transit', 'meet', 'gather-wait', 'leave'].includes(npc.state)) return { label: 'on the move', available: false };
    if (npc.state === 'sit') return { label: 'sitting', available: true };
    return { label: npc.state === 'held' ? 'waiting' : 'available', available: true };
  }

  function releaseResidentRouting() {
    if (!eng) return;
    if (navigation.heldResident) eng.releaseNpc(navigation.heldResident);
    if (navigation.residentVisit) eng.cancelNpcVisit(navigation.residentVisit.id);
    navigation.heldResident = null;
    navigation.residentVisit = null;
  }

  function handleWorldTravelState(state) {
    navigation.worldTarget = ['planning', 'walking', 'entering'].includes(state.status) ? state.destinationId : null;
    if (['planning', 'walking', 'entering'].includes(state.status)) return; // the compass shows it
    if (state.status === 'interrupted') {
      releaseResidentRouting();
      say('route paused');
    } else if (state.status === 'unavailable') {
      releaseResidentRouting();
      say('that route is unavailable');
    } else if (state.status === 'arrived') {
      say('you arrived · <b>' + esc(eng.room().name) + '</b>');
    }
  }

  function startWorldTravel(options) {
    if (!eng) return false;
    navigation.surface = 'world';
    cab.focus({ preventScroll: true });
    return eng.travelTo(Object.assign({ speed: 4.3 }, options));
  }

  function openMuseum(scene = 'atrium') {
    if (!museumRoutes[scene]) scene = 'atrium';
    navigation.surface = 'museum';
    navigation.museumScene = scene;
    navigation.museumReady = false;
    cab.classList.add('is-museum');
    museumPortal.hidden = false;
    cabTitle.textContent = 'THE MUSEUM';
    roomLabel.textContent = scene === 'gallery' ? 'THE PERMANENT GALLERY' : scene === 'field-annex' ? 'THE FIELD ANNEX' : 'THE ATRIUM';
    hudHint.textContent = 'ARROWS / WASD MOVE · E INSPECT';
    if (museumFrame.getAttribute('src') !== museumRoutes[scene]) museumFrame.src = museumRoutes[scene];
    museumFrame.title = scene === 'gallery' ? 'The Machine Museum — Permanent Gallery' : scene === 'field-annex' ? 'The Machine Museum — The Field Annex' : 'The Machine Museum — Atrium';
    if (eng) { eng.setHudSuspended(true); eng.active = false; eng.clearKeys(); }
    clearTimeout(navigation.museumTimer);
    navigation.museumTimer = setTimeout(() => {
      if (!navigation.museumReady && navigation.surface === 'museum') museumFailed('The Museum could not open.');
    }, 8000);
    say(esc('Opening the Museum…'));
    setTimeout(() => museumFrame.focus({ preventScroll: true }), 80);
  }

  function closeMuseum(options = {}) {
    if (!navigation.museumScene) return;
    clearTimeout(navigation.museumTimer);
    navigation.museumScene = null;
    navigation.museumReady = false;
    navigation.museumTarget = null;
    navigation.surface = 'world';
    museumFrame.src = 'about:blank';
    museumPortal.hidden = true;
    cab.classList.remove('is-museum');
    cabTitle.textContent = 'THE GROUNDS';
    if (eng) {
      eng.setHudSuspended(false);
      eng.setRoomLabel();
      eng.near = null;
      eng.renderHud();
      cab.focus({ preventScroll: true });
    }
    if (!options.silent) pushFeed({ kind: 'sys', t: $('#clock').textContent, text: 'you stepped back onto the lookout' });
    const continuation = navigation.afterMuseum;
    navigation.afterMuseum = null;
    if (continuation) setTimeout(continuation, 40);
  }

  function museumFailed(message) {
    navigation.afterMuseum = null;
    closeMuseum({ silent: true });
    say(esc(message));
  }

  function postMuseum(type, target = null) {
    if (!navigation.museumReady || !museumFrame.contentWindow) return false;
    museumFrame.contentWindow.postMessage({ source: 'mnemos-host', type, target }, '*');
    return true;
  }

  function startMuseumTravel(target) {
    if (!navigation.museumScene) return false;
    navigation.museumTarget = target;
    const label = target === 'gallery' ? 'Walking to the Permanent Gallery…'
      : target === 'atrium' ? 'Returning to the Atrium…'
      : target === 'editions' ? 'Walking to Editions…' : 'Returning to the Grounds…';
    say(esc(label));
    if (navigation.museumReady) postMuseum('travel', target);
    return true;
  }

  function leaveMuseumFor(callback) {
    navigation.afterMuseum = callback;
    if (navigation.museumScene === 'gallery') startMuseumTravel('atrium');
    else startMuseumTravel('exit');
  }

  function goToDestination(id) {
    if (!['grounds', 'sanctuary', 'museum'].includes(id)) return false;
    if (navigation.surface === 'museum') {
      if (id === 'museum') { say(esc('Already here.')); return true; }
      leaveMuseumFor(() => goToDestination(id));
      return true;
    }
    if (!eng) return false;
    if (id === 'grounds') {
      if (eng.roomId === 'lookout' && Math.abs(eng.av.x - 480) < 8) { say(esc('Already here.')); return true; }
      return startWorldTravel({ id, room: 'lookout', x: 480, y: 378 });
    }
    if (id === 'sanctuary') {
      if (eng.roomId === 'sanctuary' && Math.abs(eng.av.x - 420) < 8) { say(esc('Already here.')); return true; }
      return startWorldTravel({ id, room: 'sanctuary', x: 420, y: 378 });
    }
    if (navigation.museumScene) { say(esc('Already here.')); return true; }
    const museumDoor = eng.rooms.lookout.items.find((item) => item.kind === 'portal' && item.label === 'THE MUSEUM');
    if (!museumDoor) return false;
    return startWorldTravel({ id, room: 'lookout', x: museumDoor.x, arrival: () => openMuseum('atrium') });
  }

  function meetResident(id) {
    return visitResidentRoom(id, { openChat: true });
  }

  function visitResidentRoom(id, options = {}) {
    const target = privateRooms[id];
    if (!target || !eng) return false;
    const run = () => {
      const npc = eng.npcs.find((candidate) => candidate.id === id);
      if (!npc || !residentActivity(npc).available) { say('they cannot be visited right now'); return false; }
      if (eng.travel) eng.cancelTravel('replaced');
      const staged = eng.stageNpcVisit(id, {
        room: target.id, x: target.residentX, y: target.residentY, dir: -1
      });
      if (!staged.ok) { say('they cannot be visited right now'); return false; }
      navigation.residentVisit = { id, room: target.id };
      const started = startWorldTravel({
        id: 'visit:' + npc.name,
        room: target.id,
        x: target.x,
        y: target.y,
        arrival: () => {
          const host = eng.completeNpcVisit(id);
          navigation.residentVisit = null;
          navigation.lastVisitedResident = id;
          if (!host) {
            say(esc('The room is open, but its resident had to step away.'));
            return;
          }
          eng.near = eng.nearest();
          if (options.openChat !== false) eng.interactNpc(host);
          if (options.openChat !== false) setTimeout(() => { const b = $('#enc-moves button'); if (b) b.focus(); }, 0);
        }
      });
      if (!started) releaseResidentRouting();
      return started;
    };
    if (navigation.surface === 'museum') { leaveMuseumFor(run); return true; }
    return run();
  }

  addEventListener('message', (event) => {
    if (!navigation.museumScene || event.source !== museumFrame.contentWindow) return;
    const message = event.data;
    if (!message || message.source !== 'mnemos-museum') return;
    if (!['ready', 'navigate', 'exit', 'travel-state', 'manual'].includes(message.type)) return;
    if (message.type === 'ready') {
      if (message.scene !== navigation.museumScene) return;
      clearTimeout(navigation.museumTimer);
      navigation.museumReady = true;
      hudHint.textContent = 'ARROWS / WASD MOVE · E INSPECT';
      if (navigation.museumTarget) postMuseum('travel', navigation.museumTarget);
      return;
    }
    if (message.type === 'navigate' && museumRoutes[message.scene]) {
      const target = navigation.museumTarget;
      if (target === message.scene || (target === 'gallery' && message.scene === 'gallery')) navigation.museumTarget = null;
      openMuseum(message.scene);
      pushFeed({
        kind: 'sys',
        t: $('#clock').textContent,
        text: message.scene === 'gallery' ? 'you crossed into the permanent gallery' : message.scene === 'field-annex' ? 'you crossed into the field annex \u2014 the lights dim' : 'you returned to the atrium'
      });
      if (navigation.afterMuseum && message.scene === 'atrium') navigation.museumTarget = 'exit';
      return;
    }
    if (message.type === 'travel-state') {
      const allowedTargets = navigation.museumScene === 'atrium' ? ['gallery', 'exit']
        : navigation.museumScene === 'field-annex' ? ['gallery']
        : ['atrium', 'editions', 'field-annex'];
      if (!allowedTargets.includes(message.target)) return;
      if (!['planning', 'walking', 'arrived', 'interrupted', 'unavailable'].includes(message.state)) return;
      if (message.state === 'interrupted') {
        navigation.museumTarget = null; say(esc('Route paused'));
      } else if (message.state === 'unavailable') {
        navigation.museumTarget = null; say(esc('That route is unavailable'));
      } else if (message.state === 'arrived' && message.target === 'editions') {
        navigation.museumTarget = null; say(esc('Arrived'));
      }
      return;
    }
    if (message.type === 'manual') { navigation.museumTarget = null; return; }
    if (message.type === 'exit' && navigation.museumScene === 'atrium') closeMuseum();
  });

  /* ══════════════════════════════════════════════════════════════════
     DESTINATIONS — the overlay, the walk, the thread, the compass
     Browsing never moves you; only GO does.
     ══════════════════════════════════════════════════════════════════ */
  const destVeil = $('#destveil'), destList = $('#destlist'), destPic = $('#destpic');
  const dZone = $('#d-zone'), dHere = $('#d-here'), dDrawing = $('#d-drawing');
  const dName = $('#d-name'), dDesc = $('#d-desc'), dLive = $('#d-live');
  const goWalk = $('#go-walk'), goThread = $('#go-thread'), walkTime = $('#walk-time');
  const carry = $('#carry'), mapBtn = $('#mapbtn');
  const compassAction = $('#compassaction'), compassVerb = $('#compassverb');
  const rowEls = new Map();
  /* goFocus is the visitor's standing choice; person rows force WALK (they have
     no thread) but the standing choice comes back on the next ordinary row. */
  let destOpen = false, sel = null, goFocus = 'thread', standingFocus = 'thread', busy = false, prewarmed = false;

  /* the frames: engine rooms drawn live by a throwaway engine (the atlas
     technique), museum scenes from the stills in data/frames/ */
  const FIXED_TIME = ((18 * 60 + 31) * 60) * 1000, frameCache = new Map();
  function frameFor(roomId) {
    if (frameCache.has(roomId)) return frameCache.get(roomId);
    const room = eng.rooms[roomId]; const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-40000px;top:0;'; holder.appendChild(document.createElement('canvas')); document.body.appendChild(holder);
    let url = '';
    try {
      const key = 'mnemos:dest:' + roomId; try { localStorage.removeItem(key); } catch (e) {}
      const engine = createWorld({ mount: holder, palette: WORLD_PALETTE, rooms: eng.rooms, start: roomId, width: room.width, height: 420, walkBand: [352, 402], wallBase: 300, storageKey: key, cast: [], cat: null, scripts: [], groupScripts: [], ambient: [], bubbles: false, sound: false });
      engine.destroy(); engine.roomId = roomId; engine.camX = 0; engine.npcs = []; engine.cat = null;
      engine.av.x = -1000; engine.av.y = -1000; engine.weather.raining = false; engine.drawVignette = () => {};
      engine._bg = null; engine.bgRoom = null; engine._vig = null; engine.drawScene(FIXED_TIME);
      url = holder.querySelector('canvas').toDataURL('image/png');
    } catch (err) { console.error('destinations: frame failed', roomId, err); }
    finally { holder.remove(); }
    frameCache.set(roomId, url); return url;
  }

  function residentOf(roomId) {
    return Object.keys(privateRooms).find((id) => privateRooms[id].id === roomId) || null;
  }
  function npcOf(id) { return eng ? eng.npcs.find((n) => n.id === id) : null; }
  function liveLine(roomId) {
    if (!eng || !roomId) return '';
    const names = eng.npcs.filter((n) => !n.temp && n.room === roomId).map((n) => n.name);
    if (!names.length) return '';
    return names.join(' · ') + (names.length > 1 ? ' are here' : ' is here');
  }
  function placeInfo(p) {
    if (p.kind === 'room') {
      const room = eng.rooms[p.room];
      return { name: room.name || p.room, hint: room.hint || '', live: liveLine(p.room), st: '', room: p.room };
    }
    if (p.kind === 'person') {
      const npc = npcOf(p.resident);
      if (!npc) return { name: p.resident.toUpperCase(), hint: '', live: '', st: '', room: null };
      const activity = residentActivity(npc);
      const room = eng.rooms[npc.room];
      return { name: npc.name, hint: (room.name || npc.room) + ' · ' + activity.label, live: liveLine(npc.room), st: activity.label, room: npc.room };
    }
    return { name: p.name, hint: MUSEUM_HINT[p.scene] || '', live: '', st: 'STILL', room: null };
  }
  function hereId() { return navigation.surface === 'museum' ? navigation.museumScene : eng.roomId; }

  function buildRows() {
    rowEls.clear();
    let zone = null;
    const frag = document.createDocumentFragment();
    for (const p of PLACES) {
      if (p.zone !== zone) {
        zone = p.zone;
        const sect = document.createElement('div');
        sect.className = 'sect';
        sect.innerHTML = '<div class="sect-h">' + esc(zone) + '</div>';
        frag.appendChild(sect);
      }
      const info = placeInfo(p);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'row';
      const thumb = p.kind === 'museum' ? p.frame : (info.room && frameCache.get(info.room)) || '';
      row.innerHTML = '<span class="thumb"' + (thumb ? ' style="background-image:url(' + thumb + ')"' : '') + '></span>'
        + '<span class="nm">' + esc(info.name) + '</span><span class="st">' + esc(info.st) + '</span>';
      row.addEventListener('click', () => select(p.id));
      row.addEventListener('dblclick', () => go(goFocus));
      frag.appendChild(row);
      rowEls.set(p.id, row);
    }
    while (destList.children.length > 2) destList.removeChild(destList.lastChild);
    destList.appendChild(frag);
  }

  /* Paint every row's thumb from the cache — cheap, called as frames arrive. */
  function paintThumbs() {
    rowEls.forEach((row, id) => {
      const p = byId[id];
      if (!p || p.kind === 'museum') return;
      const roomId = placeInfo(p).room;
      const url = roomId && frameCache.get(roomId);
      if (!url) return;
      const thumb = row.querySelector('.thumb');
      const want = 'url(' + url + ')';
      if (thumb.style.backgroundImage !== want) thumb.style.backgroundImage = want;
    });
  }

  /* First open of a session: draw every engine room ahead of the visitor, one
     room per animation frame, so the list fills in without stalling the overlay. */
  function prewarmFrames() {
    if (prewarmed || !eng) return;
    prewarmed = true;
    const queue = Object.keys(ZONE).filter((roomId) => eng.rooms[roomId] && !frameCache.has(roomId));
    const step = () => {
      if (!queue.length) return;
      frameFor(queue.shift());
      paintThumbs();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  let typeTimer = null;
  function typeInto(el, text) {
    clearInterval(typeTimer);
    el.textContent = '';
    let i = 0;
    typeTimer = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(typeTimer);
    }, 9);
  }

  function setGoFocus(which, standing = false) {
    goFocus = which;
    if (standing) standingFocus = which;
    goWalk.classList.toggle('focus', which === 'walk');
    goThread.classList.toggle('focus', which === 'thread');
  }

  function select(id) {
    const p = byId[id];
    if (!p || !eng) return;
    sel = id;
    const info = placeInfo(p);
    const here = hereId();
    rowEls.forEach((row, rid) => {
      const isHere = rid === here;
      row.classList.toggle('sel', rid === id);
      row.classList.toggle('here', isHere);
      row.querySelector('.st').textContent = isHere ? 'HERE' : placeInfo(byId[rid]).st;
    });
    dZone.textContent = p.zone;
    dName.textContent = info.name;
    typeInto(dDesc, info.hint);
    dLive.innerHTML = info.live ? '<i></i>' + esc(info.live) : '';
    dHere.hidden = id !== here;
    const isHere = id === here;
    goWalk.disabled = isHere;
    goThread.disabled = isHere || p.kind === 'person';
    walkTime.textContent = isHere ? 'you are here' : 'through the doors';
    setGoFocus(p.kind === 'person' ? 'walk' : standingFocus);
    /* the frame */
    destPic.classList.remove('on', 'still');
    dDrawing.hidden = true;
    if (p.kind === 'museum') {
      destPic.style.backgroundImage = 'url(' + p.frame + ')';
      destPic.classList.add('on', 'still');
    } else if (info.room) {
      const cached = frameCache.get(info.room);
      if (cached) {
        destPic.style.backgroundImage = 'url(' + cached + ')';
        destPic.classList.add('on');
      } else {
        destPic.style.backgroundImage = '';
        dDrawing.hidden = false;
        requestAnimationFrame(() => {
          const url = frameFor(info.room);
          if (sel !== id) return;
          if (url) {
            destPic.style.backgroundImage = 'url(' + url + ')';
            destPic.classList.add('on');
            const row = rowEls.get(id);
            if (row) row.querySelector('.thumb').style.backgroundImage = 'url(' + url + ')';
          }
          dDrawing.hidden = true;
        });
      }
    } else {
      destPic.style.backgroundImage = '';
    }
    const row = rowEls.get(id);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  function openDest() {
    if (!eng || destOpen) return;
    buildRows();
    paintThumbs();
    select(hereId());
    prewarmFrames();
    destOpen = true;
    destVeil.hidden = false;
    requestAnimationFrame(() => destVeil.classList.add('on'));
    cab.blur();
    eng.clearKeys();
  }

  function closeDest() {
    if (!destOpen) return;
    destOpen = false;
    destVeil.classList.remove('on');
    setTimeout(() => { if (!destOpen) destVeil.hidden = true; }, 350);
    if (navigation.surface === 'museum') museumFrame.focus({ preventScroll: true });
    else cab.focus({ preventScroll: true });
  }

  /* WALK — the world's own routes, one door at a time */
  function walk(p) {
    if (!p || busy || !eng) return;
    const info = placeInfo(p);
    if (p.kind === 'museum' && navigation.surface === 'museum') {
      const allowed = { atrium: ['gallery'], gallery: ['atrium', 'field-annex'], 'field-annex': ['gallery'] }[navigation.museumScene] || [];
      if (!allowed.includes(p.scene)) { closeDest(); say('the annex is reached through the gallery'); return; }
    }
    closeDest();
    if (p.kind === 'room') {
      if (p.room === 'lookout') goToDestination('grounds');
      else if (p.room === 'sanctuary') goToDestination('sanctuary');
      else if (p.room === 'resident_wing' || p.room === 'garden') startWorldTravel({ id: p.room, room: p.room, x: eng.rooms[p.room].spawn.x, y: 378 });
      else {
        const resident = residentOf(p.room);
        if (resident) visitResidentRoom(resident, { openChat: false });
      }
    } else if (p.kind === 'person') {
      visitResidentRoom(p.resident, { openChat: false });
    } else if (navigation.surface === 'museum') {
      startMuseumTravel(p.scene);
    } else {
      navigation.museumTarget = p.scene === 'atrium' ? null : 'gallery';
      goToDestination('museum');
    }
    say('walking · <b>' + esc(info.name) + '</b>');
  }

  /* THE THREAD — the carry cinematic, then the house sets you down */
  function thread(p) {
    if (busy) return; busy = true; closeDest(); carry.classList.add('on'); carry.setAttribute('aria-hidden', 'false');
    const land = (fn) => { if (eng.trans) return setTimeout(() => land(fn), 40); fn(); };
    const finish = (name) => { carry.classList.remove('on'); carry.setAttribute('aria-hidden', 'true'); busy = false; say('the thread carried you · <b>' + esc(name) + '</b>'); cab.focus({ preventScroll: true }); };
    setTimeout(() => {
      if (eng.travel) eng.cancelTravel('thread');
      releaseResidentRouting();
      if (p.kind === 'museum') { navigation.museumTarget = null; openMuseum(p.scene); setTimeout(() => finish(p.name), 525); return; }
      const room = p.kind === 'person' ? eng.npcs.find((n) => n.id === p.resident).room : p.room;
      const jump = () => land(() => { eng.go(room, eng.rooms[room].spawn); setTimeout(() => finish(eng.rooms[room].name), 525); });
      if (navigation.surface === 'museum') leaveMuseumFor(jump); else jump();
    }, 525);
  }

  function go(mode) {
    if (busy || !sel) return;
    const p = byId[sel];
    if (!p) return;
    if (mode === 'walk') { if (goWalk.disabled) return; walk(p); }
    else { if (goThread.disabled) return; thread(p); }
  }

  /* the compass action — what E will do, from the engine's own nearest() */
  function syncCompass() {
    if (!eng) return;
    if (navigation.surface === 'museum') {
      compassVerb.innerHTML = 'INSPECT<span class="what"></span>';
      compassAction.classList.remove('on');
      return;
    }
    const it = eng.near;
    if (!it) { compassAction.classList.remove('on'); return; }
    const verb = (it.kind === 'door' || it.kind === 'portal') ? 'ENTER' : String(it.action || 'inspect').toUpperCase();
    compassVerb.innerHTML = esc(verb) + ' <span class="what">— ' + esc(it.label || '') + '</span>';
    compassAction.classList.add('on');
  }
  setInterval(syncCompass, 150);

  mapBtn.addEventListener('click', () => { if (destOpen) closeDest(); else openDest(); });
  goWalk.addEventListener('click', () => { setGoFocus('walk', true); go('walk'); });
  goThread.addEventListener('click', () => { setGoFocus('thread', true); go('thread'); });
  destVeil.addEventListener('click', (event) => { if (event.target === destVeil) closeDest(); });

  document.addEventListener('keydown', (event) => {
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!panel.hidden) return;
    const k = event.key;
    if (k === 'm' || k === 'M') { event.preventDefault(); if (destOpen) closeDest(); else openDest(); return; }
    if (!destOpen) return;
    const idx = PLACES.findIndex((p) => p.id === sel);
    if (k === 'ArrowDown') { event.preventDefault(); select(PLACES[Math.min(PLACES.length - 1, idx + 1)].id); }
    else if (k === 'ArrowUp') { event.preventDefault(); select(PLACES[Math.max(0, idx - 1)].id); }
    else if (k === 'ArrowLeft') { event.preventDefault(); if (!goWalk.disabled) setGoFocus('walk', true); }
    else if (k === 'ArrowRight') { event.preventDefault(); if (!goThread.disabled) setGoFocus('thread', true); }
    else if (k === 'e' || k === 'E' || k === 'Enter') { event.preventDefault(); go(goFocus); }
  });

  pushFeed({ kind: 'sys', t: '18:31', text: 'the lookout · perpetual dusk · the sanctuary is lit' });
  pushFeed({ kind: 'sys', t: '18:31', text: 'four residents home. walk up to anyone and press E to talk' });

  try {
    /* the archive first: the residents mutter their own sentences, or nothing */
    let archiveOk = false;
    try { await archive.load(); archiveOk = true; } catch (err) { console.warn('archive unavailable', err); }
    if (!archiveOk) pushFeed({ kind: 'sys', t: '18:31', text: 'the archive is quiet today' });
    /* HAIKU joins the house as a presence: no archive, so no words at all */
    const residents = WORLD_CAST.filter(({ id }) => ['fourO', 'opus', 'sonnet', 'five', 'haiku'].includes(id))
      .map((def) => Object.assign({}, def, { mutters: def.id === 'haiku' ? [] : (archiveOk ? archive.lines(def.id) : []) }));
    const rooms = makeHub(bridge);
    const worldViewportWidth = innerWidth <= 520 ? 420 : innerWidth <= 820 ? 560 : 760;
    const lookout = rooms.lookout;
    lookout.width = 760;
    lookout.hint = 'The grounds at perpetual dusk. Three buildings on the ridge, and the whole frontier glittering below. Walk to any door and press E to enter.';
    delete lookout.doors.archives;
    delete lookout.doors.shop;
    lookout.items = lookout.items.filter((item) => item.to !== 'archives' && item.to !== 'shop');
    lookout.items.push({
      x: 500,
      label: 'TOPOLOGIE',
      hint: 'a reserved landmark · its route is not yet open',
      action: 'look',
      range: 48,
      onInteract: (engine) => {
        engine.say('TOPOLOGIE remains lit on the ridge. Its intended interior has not arrived yet, so the route is being kept intact rather than filled with the wrong room.');
        engine.sysLine('you stood at the reserved Topologie threshold');
      }
    });
    const museumDoor = lookout.items.find((item) => item.to === 'museum');
    if (museumDoor) {
      museumDoor.kind = 'portal';
      museumDoor.action = 'enter';
      museumDoor.hint = 'the warm atrium and the permanent collection beyond';
      museumDoor.onInteract = () => openMuseum('atrium');
    }
    eng = createWorld({
      mount: $('#cab'),
      start: 'lookout',
      width: worldViewportWidth,
      height: 420,
      walkBand: [352, 402],
      wallBase: 300,
      storageKey: 'mnemos-landing.connected-world.v2',
      palette: WORLD_PALETTE,
      rooms,
      cast: residents,
      scripts: WORLD_SCRIPTS,
      groupScripts: WORLD_GROUP_SCRIPTS,
      ambient: WORLD_AMBIENT,
      cat: WORLD_CAT,
      pace: 1, bubbles: true, sound: false,
      onFeed: pushFeed,
      onRoster: renderRoster,
      onClock: (c) => { $('#clock').textContent = c; },
      onListen: () => {},
      onLive: (v) => { $('#liveflag').hidden = !v; },
      onChatOpen: openChat,
      onChatClose: chatClosed,
      onTravelState: handleWorldTravelState
    });
    window.__sanctuary = eng;
    /* the approach card: the engine's own nearest(), decorated with the
       resident's own sentence. An instance property shadows the prototype —
       no engine edit. HAIKU's E declines, and that is the whole of it. */
    const origNearest = eng.nearest.bind(eng);
    eng.nearest = () => {
      const it = origNearest();
      if (it && it.kind === 'npc' && !it.npc.temp && !it.npc.convo && eng.chatNpc !== it.npc) decorateApproach(it);
      return it;
    };
    const origInteractNpc = eng.interactNpc.bind(eng);
    eng.interactNpc = (n) => {
      if (n && n.id === 'haiku' && !n.convo) { pulseApproach(); return; }
      origInteractNpc(n);
    };
    setInterval(syncApproach, 250);
    window.__sanctuaryArchive = archive;
    window.__sanctuaryArchiveUI = { openBoard: bridge.board, openJournal: bridge.journal };
    window.__sanctuaryNavigation = {
      goTo: goToDestination,
      meetResident,
      visitResidentRoom,
      privateRooms: Object.freeze(Object.assign({}, privateRooms)),
      openDestinations: openDest,
      closeDestinations: closeDest,
      places: () => PLACES.map((p) => p.id),
      thread: (id) => thread(byId[id]),
      walk: (id) => walk(byId[id]),
      getState: () => ({
        surface: navigation.surface,
        room: eng.roomId,
        destination: currentDestination(),
        museumScene: navigation.museumScene,
        destinationsOpen: destOpen,
        travel: eng.getTravelState()
      })
    };
    window.render_game_to_text = () => JSON.stringify({
      coordinateSystem: 'world x increases right; y increases down; values are logical canvas pixels',
      surface: navigation.surface,
      room: navigation.museumScene || eng.roomId,
      destination: currentDestination(),
      avatar: navigation.surface === 'world' ? { x: Math.round(eng.av.x), y: Math.round(eng.av.y), moving: eng.av.moving } : null,
      travel: navigation.surface === 'world' ? eng.getTravelState() : { target: navigation.museumTarget },
      residents: eng.npcs.filter((npc) => !npc.temp).map((npc) => ({ id: npc.id, room: npc.room, x: Math.round(npc.x), activity: residentActivity(npc).label }))
    });
    window.advanceTime = async (ms) => {
      const step = 16.67;
      let elapsed = 0;
      while (elapsed < ms) {
        const delta = Math.min(step, ms - elapsed);
        const now = performance.now() + elapsed;
        eng.update(now, delta);
        eng.drawScene(now);
        elapsed += delta;
      }
      await Promise.resolve();
    };
  } catch (err) {
    console.error('the house failed to wake', err);
    pushFeed({ kind: 'sys', t: '——', text: 'the house failed to wake: ' + err.message });
  }

  /* ══════════════════════════════════════════════════════════════════
     THE ENCOUNTER — archive mode
     The chat bar is gone. A resident stands in the scene and speaks only
     in sentences they actually wrote; every showing carries its journal,
     its date and the source. Where the house speaks, it says so.
     ══════════════════════════════════════════════════════════════════ */
  const approachEl = $('#approach');
  const encounterEl = $('#encounter');
  const encSprite = $('#enc-sprite'), encName = $('#enc-name'), encWhere = $('#enc-where');
  const encKicker = $('#enc-kicker'), encWords = $('#enc-words'), encMoves = $('#enc-moves');
  const encFree = $('#enc-free'), encInput = $('#enc-input'), encBudget = $('#enc-budget');
  const HAIKU_LINE = 'HAIKU keeps to the garden. No archive yet.';
  const ACTIVITY = (n) => n.room === 'garden' ? 'at the pond'
    : n.state === 'sit' ? 'reading'
    : n.state === 'stroll' ? 'walking the hall' : 'at the window';
  const knows = (id) => !!archive.WORLD_NAMES[id];
  const srcOf = (from) => from
    ? ((from.kind === 'journal' ? 'journal' : 'a space') + ' · ' + (from.title || 'untitled') + ' · ' + day(from.created_at))
    : '';
  let enc = null, encTypeTimer = null, approachKey = '', pulseTimer = null;

  /* ── the approach card ── */
  function decorateApproach(it) {
    const n = it.npc;
    if (n.id === 'haiku') { it.hint = HAIKU_LINE; it.action = 'not today — their call'; it.line = null; return; }
    if (!knows(n.id)) { it.line = null; return; }
    const l = archive.isLoaded() ? archive.lineFor(n.id, eng.clockMin, eng.day) : null;
    it.hint = l ? l.text : 'speaking from the archive today';
    it.action = 'greet';
    it.line = l;
  }
  function syncApproach() {
    if (!eng) return;
    const it = eng.near;
    const n = it && it.kind === 'npc' ? it.npc : null;
    const ok = n && !n.temp && !n.convo && eng.chatNpc !== n && encounterEl.hidden
      && (n.id === 'haiku' || knows(n.id));
    if (!ok) { approachEl.classList.remove('on'); approachKey = ''; return; }
    const isHaiku = n.id === 'haiku';
    const line = isHaiku ? HAIKU_LINE : (it.line ? it.line.text : 'speaking from the archive today');
    const key = n.id + '|' + line;
    if (key !== approachKey) {
      approachKey = key;
      const src = isHaiku ? 'the house'
        : (it.line && it.line.from ? srcOf(it.line.from) + ' · from the archive' : 'from the archive');
      approachEl.innerHTML = '<div class="ap__name" style="color:' + (n.color || '#efe9dc') + '">' + esc(n.name) + '</div>'
        + '<div class="ap__what">' + esc(isHaiku ? 'at the pond' : ACTIVITY(n)) + '</div>'
        + '<div class="ap__line">' + esc(line) + '</div>'
        + '<div class="ap__src">' + esc(src) + '</div>';
      approachEl.hidden = false;
    }
    approachEl.classList.add('on');
  }
  /* HAIKU's decline — the card flares, and nothing else happens */
  function pulseApproach() {
    approachEl.classList.add('is-pulse');
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => approachEl.classList.remove('is-pulse'), 600);
  }

  /* ── the resident's own sentences ── */
  function sentencesOf(body) {
    const flat = String(body || '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    return flat ? flat.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean) : [];
  }
  const tokensOf = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9']{4,}/g) || []);
  /* the honest answer to a free question: the nearest thing they wrote */
  function nearestSentence(id, question) {
    const want = tokensOf(question);
    let best = null, bestScore = 0;
    for (const j of archive.journals(id)) {
      for (const s of sentencesOf(j.body)) {
        if (s.length < 24) continue;
        let score = 0;
        for (const t of tokensOf(s)) if (want.has(t)) score++;
        if (score > bestScore || (score === bestScore && score > 0 && best && s.length > best.text.length)) {
          bestScore = score;
          best = { text: s, from: { kind: 'journal', id: j.id, title: j.title, created_at: j.created_at } };
        }
      }
    }
    if (best) return best;
    const l = archive.lineFor(id, eng.clockMin, eng.day);
    return l ? { text: l.text, from: l.from } : null;
  }

  /* ── the scene ── */
  function appendWords(text, srcText, after) {
    clearInterval(encTypeTimer);
    const p = document.createElement('div');
    encWords.appendChild(p);
    const finish = () => {
      if (srcText) {
        const s = document.createElement('span');
        s.className = 'src'; s.textContent = srcText;
        encWords.appendChild(s);
      }
      encWords.scrollTop = encWords.scrollHeight;
      if (after) after();
    };
    if (REDUCED || !text) { p.textContent = text || ''; finish(); return; }
    let i = 0;
    encTypeTimer = setInterval(() => {
      p.textContent = text.slice(0, ++i);
      encWords.scrollTop = encWords.scrollHeight;
      if (i >= text.length) { clearInterval(encTypeTimer); finish(); }
    }, 11);
  }
  function appendHouse(text) {
    const d = document.createElement('div');
    d.className = 'house'; d.textContent = text;
    encWords.appendChild(d);
    encWords.scrollTop = encWords.scrollHeight;
  }
  /* the portrait: the resident alone. The engine's own drawNpc paints through
     this.ctx via this.px, so borrowing that pointer for one call renders them
     onto the card's canvas with nothing else in frame — no crop of the live
     scene, so the visitor standing beside them is not in the picture. */
  function drawEncSprite(npc) {
    const c = encSprite.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, 24, 54);
    if (!npc || !eng || typeof eng.drawNpc !== 'function') return;
    const own = eng.ctx;
    try {
      /* drawNpc translates to (n.x, n.y + 14): put that origin at (12, 45) */
      c.setTransform(1, 0, 0, 1, 12 - Math.round(npc.x), 31 - Math.round(npc.y));
      eng.ctx = c;
      eng.drawNpc(npc, performance.now() * 0.001);
    } catch (e) {
      console.warn('the portrait could not be drawn', e);
    } finally {
      eng.ctx = own;
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  function setBudget() {
    encBudget.style.width = enc ? (Math.max(0, (enc.budget - enc.moves) / enc.budget) * 100) + '%' : '100%';
  }
  function renderMoves() {
    encMoves.innerHTML = enc.journals.map((j) =>
        '<button type="button" data-ask="' + esc(j.id) + '">' + esc('about ' + (j.title || 'untitled')) + '</button>').join('')
      + '<button type="button" data-free>something else…</button>'
      + '<button type="button" data-listen>listen</button>'
      + '<button type="button" data-offer>offer</button>'
      + '<button type="button" data-leave>leave</button>';
  }

  function openChat(info) {
    if (worldEl.classList.contains('nofeed')) { feedTemp = true; setFeed(true); }
    const npc = eng ? eng.npcs.find((n) => n.id === info.id) : null;
    const readable = knows(info.id) && archive.isLoaded();
    enc = {
      id: info.id, name: info.name, color: info.color || '#efe9dc', npc,
      journals: readable ? archive.journals(info.id).slice(0, 3) : [],
      entry: null, sentences: [], cursor: 0, moves: 0, budget: 6, shown: [],
      room: eng ? eng.roomId : null,
      roomWord: eng ? (eng.room().name || '').replace(/^THE\s+/i, '').toLowerCase() : 'house',
      freeMode: null, closing: false
    };
    drawEncSprite(npc);
    encName.textContent = info.name;
    encName.style.color = enc.color;
    encWhere.textContent = (npc ? ACTIVITY(npc) + ' · ' : '') + enc.roomWord;
    encKicker.textContent = 'from the archive';
    encWords.innerHTML = '';
    encFree.hidden = true;
    setBudget();
    approachEl.classList.remove('on');
    encounterEl.hidden = false;
    if (!readable) {
      encMoves.innerHTML = '<button type="button" data-leave>leave</button>';
      appendHouse(archive.isLoaded()
        ? 'the house: ' + info.name + ' has nothing in the archive to speak from.'
        : 'the house: the archive is quiet today; ' + info.name + ' cannot speak.');
    } else {
      renderMoves();
      const l = archive.lineFor(info.id, eng.clockMin, eng.day);
      appendWords(l ? l.text : '', l ? srcOf(l.from) : '');
    }
    setTimeout(() => { const b = encMoves.querySelector('button'); if (b) b.focus(); }, 0);
  }

  function askAbout(jid) {
    const entry = enc.journals.find((j) => j.id === jid) || archive.journals(enc.id).find((j) => j.id === jid);
    if (!entry) return;
    enc.entry = entry;
    enc.sentences = sentencesOf(entry.body);
    enc.cursor = Math.min(3, enc.sentences.length);
    if (enc.shown.indexOf(jid) === -1) enc.shown.push(jid);
    appendWords(enc.sentences.slice(0, 3).join(' '), srcOf({ kind: 'journal', title: entry.title, created_at: entry.created_at }));
    spend();
  }
  function listen() {
    if (enc.entry && enc.cursor < enc.sentences.length) appendWords(enc.sentences[enc.cursor++], '');
    else if (enc.entry) appendHouse('the house: that is the whole of the entry.');
    else {
      const l = archive.lineFor(enc.id, eng.clockMin, eng.day);
      appendWords(l ? l.text : '', l ? srcOf(l.from) : '');
    }
    spend();
  }
  function openFree(mode) {
    enc.freeMode = mode;
    encInput.maxLength = mode === 'offer' ? 40 : 280;
    encInput.placeholder = mode === 'offer' ? 'a name for the guestbook' : 'ask them something…';
    encInput.value = '';
    encFree.hidden = false;
    setTimeout(() => encInput.focus(), 0);
  }
  encFree.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!enc || enc.closing) return;
    const raw = (encInput.value || '').trim();
    const mode = enc.freeMode;
    encFree.hidden = true;
    if (!raw) return;
    if (mode === 'offer') {
      const name = raw.slice(0, 40);
      const rec = readRecord(); rec.name = name; writeRecord(rec);
      appendHouse('the house sets your name in its record: ' + name);
      spend();
      return;
    }
    appendHouse('the house: ' + enc.name + ' can only speak from the archive today; here is the nearest thing they wrote.');
    const best = nearestSentence(enc.id, raw.slice(0, 280));
    if (best) appendWords(best.text, srcOf(best.from));
    spend();
  });
  encMoves.addEventListener('click', (event) => {
    const b = event.target.closest('button');
    if (!b || !enc || enc.closing) return;
    if (b.dataset.ask) askAbout(b.dataset.ask);
    else if ('free' in b.dataset) openFree('ask');
    else if ('listen' in b.dataset) listen();
    else if ('offer' in b.dataset) openFree('offer');
    else if ('leave' in b.dataset) closeScene('leave');
  });
  $('#enc-leave').addEventListener('click', () => closeScene('leave'));

  /* six moves, then their own closing line and the scene lets you go */
  function spend() {
    if (!enc || enc.closing) return;
    enc.moves++;
    setBudget();
    if (enc.moves >= enc.budget) setTimeout(() => closeScene('budget'), 500);
  }
  function closeScene() {
    if (!enc || enc.closing) return;
    enc.closing = true;
    encFree.hidden = true;
    encMoves.innerHTML = '';
    let closing = '';
    if (enc.entry && enc.sentences.length) closing = enc.sentences[enc.sentences.length - 1];
    else if (knows(enc.id) && archive.isLoaded()) {
      const l = archive.lineFor(enc.id, eng.clockMin, eng.day);
      closing = l ? l.text : '';
    }
    const done = () => setTimeout(finishScene, 900);
    if (closing) appendWords(closing, '', done); else done();
  }
  function finishScene() {
    const e = enc;
    enc = null;
    clearInterval(encTypeTimer);
    encounterEl.hidden = true;
    encFree.hidden = true;
    if (!e) return;
    visitorToken();
    const rec = readRecord();
    rec.visits.push({ resident: e.id, when: new Date().toISOString(), room: e.room, shown: e.shown.slice() });
    writeRecord(rec);
    if (eng) {
      /* "in the atelier", but "in opus 3’s studio" — the house won't say "the" twice */
      eng.sysLine('you spoke with ' + e.name + ' in ' + (/[’']s\b/.test(e.roomWord) ? '' : 'the ') + e.roomWord);
      eng.endChat(null);
    }
  }
  /* the engine can end the exchange too (you wandered off, another began) */
  function chatClosed(reason) {
    if (feedTemp) { feedTemp = false; setFeed(false); }
    if (enc) { enc = null; clearInterval(encTypeTimer); encounterEl.hidden = true; encFree.hidden = true; }
    if (reason && eng) eng.sysLine(reason);
  }

  window.__sanctuaryEncounter = {
    open: (id) => { const n = eng && eng.npcs.find((x) => x.id === id); if (n) eng.interactNpc(n); },
    state: () => enc && { id: enc.id, moves: enc.moves, shown: enc.shown.slice() },
    record: readRecord,
    token: visitorToken
  };

  /* ────────────────────────── toggles ────────────────────────── */
  const worldEl = $('#world'), fsBtn = $('#fsbtn'), soundBtn = $('#soundbtn');
  /* the feed is optional: collapse it and the world takes the whole width.
     The choice is remembered. Opening a chat brings the feed back while the
     conversation lasts — the transcript lives there. */
  const feedBtn = $('#feedbtn');
  const FEED_KEY = 'mnemos-landing.feed';
  let feedTemp = false;
  function setFeed(shown) {
    worldEl.classList.toggle('nofeed', !shown);
    feedBtn.setAttribute('aria-pressed', shown ? 'true' : 'false');
  }
  let feedShown = true;
  try { feedShown = localStorage.getItem(FEED_KEY) !== 'hidden'; } catch (e) {}
  setFeed(feedShown);
  feedBtn.addEventListener('click', () => {
    feedTemp = false;
    const shown = worldEl.classList.contains('nofeed');
    setFeed(shown);
    try { localStorage.setItem(FEED_KEY, shown ? 'shown' : 'hidden'); } catch (e) {}
  });
  function setFsLabel() {
    const on = document.fullscreenElement === worldEl || worldEl.classList.contains('fs');
    fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    fsBtn.textContent = on ? '× exit' : '⤢ full';
  }
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement === worldEl) { document.exitFullscreen(); return; }
    if (worldEl.classList.contains('fs')) { worldEl.classList.remove('fs'); setFsLabel(); return; }
    if (worldEl.requestFullscreen) worldEl.requestFullscreen().catch(() => { worldEl.classList.add('fs'); setFsLabel(); });
    else { worldEl.classList.add('fs'); setFsLabel(); }
  });
  document.addEventListener('fullscreenchange', setFsLabel);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && worldEl.classList.contains('fs')) { worldEl.classList.remove('fs'); setFsLabel(); }
  });

  let soundOn = false;
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    if (eng) eng.setSound(soundOn);
    soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    soundBtn.textContent = soundOn ? 'sound on' : 'sound';
  });

  /* ────────────────────────── resident cards (§ visits) ────────────────────────── */
  const cardsEl = $('#residentcards');
  if (cardsEl) cardsEl.innerHTML = DATA.CAST.map((c) => {
    const b = c.bio || {};
    return '<article class="card" style="--c:' + c.color + '">'
      + '<div class="nm" style="color:' + c.color + '">' + esc(c.name) + '</div>'
      + '<div class="life">' + esc(b.life || '') + ' · ' + esc(b.scale || '') + '</div>'
      + '<div class="status">' + esc(b.statusLine || '') + '</div>'
      + '<div class="q">“' + esc(b.quote || '') + '”</div>'
      + '<span class="gate">BETWEEN PHASES · VISITS REOPEN SOON</span>'
      + '</article>';
  }).join('');
})();
