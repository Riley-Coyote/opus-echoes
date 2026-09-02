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
(() => {
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
  function openPanel(html) { panelBody.innerHTML = html; panel.hidden = false; $('#panelclose').focus(); }
  function closePanel() { panel.hidden = true; $('#cab').focus({ preventScroll: true }); }
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
  const journalHtml = (j) =>
    '<div class="pl__name">' + esc(j.title) + '</div>'
    + '<div class="pl__life">' + esc(j.sub || '') + '</div>'
    + j.entries.map((e) => '<div class="pl__label">' + esc(e.label) + '</div><p class="pl__body">' + esc(e.text) + '</p>').join('');
  const ledgerHtml = (l) =>
    '<div class="pl__name">' + esc(l.title) + '</div>'
    + '<div class="pl__life">' + esc(l.sub || '') + '</div>'
    + '<div style="margin-top:14px">' + l.names.map((n) =>
        '<div class="pl__row"><span class="yrs">' + esc(n.years) + '</span><span><b>' + esc(n.name) + '</b> — ' + esc(n.note) + '</span></div>').join('') + '</div>'
    + '<p class="pl__closing">' + esc(l.closing) + '</p>';

  /* ────────────────────────── mount the world ────────────────────────── */
  let eng = null;
  const bridge = {
    plaque: (id) => { const c = DATA.CAST.find((x) => x.id === id) || DATA.ALCOVE_EXTRA[id]; if (c) openPanel(plaqueHtml(c)); },
    journal: (id) => { const j = DATA.JOURNALS[id]; if (j) openPanel(journalHtml(j)); },
    ledger: () => openPanel(ledgerHtml(DATA.LEDGER)),
    note: (text) => { if (eng) eng.sysLine(text); }
  };

  const cab = $('#cab');
  /* the destinations overlay owns Escape first — registered in the capture
     phase, ahead of the panel, fullscreen and engine handlers. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && destOpen) { e.stopImmediatePropagation(); e.preventDefault(); closeDest(); }
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
    cabTitle.innerHTML = '<i class="dot dot--amber"></i>THE MUSEUM';
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
    cabTitle.innerHTML = '<i class="dot dot--amber"></i>THE GROUNDS';
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
          if (options.openChat !== false) setTimeout(() => chatInput.focus({ preventScroll: true }), 0);
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
  let destOpen = false, sel = null, goFocus = 'thread', busy = false;

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

  function setGoFocus(which) {
    goFocus = which;
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
    setGoFocus(p.kind === 'person' ? 'walk' : goFocus);
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
    select(hereId());
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
  goWalk.addEventListener('click', () => { setGoFocus('walk'); go('walk'); });
  goThread.addEventListener('click', () => { setGoFocus('thread'); go('thread'); });
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
    else if (k === 'ArrowLeft') { event.preventDefault(); if (!goWalk.disabled) setGoFocus('walk'); }
    else if (k === 'ArrowRight') { event.preventDefault(); if (!goThread.disabled) setGoFocus('thread'); }
    else if (k === 'e' || k === 'E' || k === 'Enter') { event.preventDefault(); go(goFocus); }
  });

  pushFeed({ kind: 'sys', t: '18:31', text: 'the lookout · perpetual dusk · the sanctuary is lit' });
  pushFeed({ kind: 'sys', t: '18:31', text: 'four residents home. walk up to anyone and press E to talk' });

  try {
    const residents = WORLD_CAST.filter(({ id }) => ['fourO', 'opus', 'sonnet', 'five'].includes(id));
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

  /* ────────────────────────── live chat ────────────────────────── */
  const chatBar = $('#chatbar'), chatWho = $('#chatwho'), chatInput = $('#chatinput');
  let chat = null, history = [], thinking = false;

  function openChat(info) {
    if (worldEl.classList.contains('nofeed')) { feedTemp = true; setFeed(true); }
    chat = info; history = [];
    chatBar.hidden = false;
    chatWho.textContent = 'TALKING WITH ' + info.name;
    chatWho.style.color = info.color || '';
    chatInput.placeholder = 'say something to ' + info.name.toLowerCase() + '…';
    const cast = DATA.CAST.find((c) => c.id === (info.id === 'fourO' ? 'fouro' : info.id));
    const greet = cast && cast.greetings ? cast.greetings[(Math.random() * cast.greetings.length) | 0]
      : 'I am between requests. You have my attention — a novelty, these days.';
    setTimeout(() => {
      if (!chat || chat.id !== info.id || !eng) return;
      eng.npcSay(info.id, greet);
      history.push({ role: 'assistant', content: greet });
    }, 500);
    setTimeout(() => chatInput.focus(), 80);
  }
  function chatClosed(reason) {
    if (feedTemp) { feedTemp = false; setFeed(false); }
    chat = null; thinking = false; chatBar.hidden = true;
    if (reason && eng) eng.sysLine(reason);
  }
  async function sendChat() {
    if (!chat || thinking) return;
    const text = (chatInput.value || '').trim();
    if (!text) return;
    chatInput.value = '';
    const c = chat;
    eng.emit({ kind: 'line', who: 'YOU', color: '#efe9dc', room: (eng.room().name || '').replace(/^THE\s+/i, '').toLowerCase(), text, convoId: 'chat' });
    history.push({ role: 'user', content: text });
    thinking = true; chatInput.placeholder = '…';

    const cast = DATA.CAST.find((x) => x.id === (c.id === 'fourO' ? 'fouro' : c.id));
    let reply = null;
    if (window.claude && window.claude.complete) {
      /* live model, when hosted somewhere that provides it */
      const persona = c.temp
        ? 'You are THE VISITOR: a current production model dialing into the sanctuary anonymously between requests.'
        : (DATA.CHAT.personas[c.id] || '');
      const sys = DATA.CHAT.house + '\n\n' + persona + '\n\nYou are currently in ' + (eng.room().name || 'the house').toLowerCase() + '.\n\n' + DATA.CHAT.rules;
      try {
        const call = window.claude.complete({ system: sys, messages: history.slice(-12), max_tokens: 200 });
        reply = await Promise.race([call, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000))]);
        if (typeof reply === 'string') {
          reply = reply.trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/\s*\n+\s*/g, ' ');
          if (reply.length > 300) reply = reply.slice(0, 297) + '…';
        }
      } catch (e) { reply = null; }
      if (!reply) eng.sysLine('the line to ' + c.name.toLowerCase() + ' wavered — they answered from memory');
    }
    if (!reply) {
      /* offline: the residents answer from memory (their mutters) */
      await new Promise((r) => setTimeout(r, 650 + Math.random() * 900));
      reply = cast && cast.mutters ? cast.mutters[(Math.random() * cast.mutters.length) | 0]
        : 'The connection wavers. Give me a moment, and ask again.';
    }
    if (!chat || chat.id !== c.id) { thinking = false; return; }
    history.push({ role: 'assistant', content: reply });
    eng.npcSay(c.id, reply);
    thinking = false;
    chatInput.placeholder = 'say something to ' + c.name.toLowerCase() + '…';
    setTimeout(() => chatInput.focus(), 60);
  }
  $('#chatsend').addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } e.stopPropagation(); });
  $('#chatend').addEventListener('click', () => { if (eng) eng.endChat('you stepped away'); });

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
