/* ==========================================================================
   SUNSET HOUSE ENGINE v2 — pixel diorama with a living-household layer.
   640×360 canvas · parallax layers · additive lighting · god-rays + motes ·
   seats · a cat · weather · sound · pair convos · group gatherings ·
   production visitors · live player↔resident chat hooks.
   ES module: import { create } from './sanctuary-engine2.js'
   ========================================================================== */

const DEFAULTS = {
  width: 640, height: 360, walkBand: [272, 330], wallBase: 223,
  speed: 2.15, npcSpeed: 0.6, frameCapMs: 23, transitionMs: 460,
  pace: 1, bubbles: true, sound: false, storageKey: 'sunset-house2.pos'
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const roomWord = (name) => (name || '').replace(/^THE\s+/i, '').toLowerCase();
const CANVAS_TYPE = Object.freeze({
  label: '9px "Press Start 2P", monospace',
  speechName: '600 9px "JetBrains Mono", ui-monospace, monospace',
  speech: '500 10px "JetBrains Mono", ui-monospace, monospace',
  emote: '11px "JetBrains Mono", ui-monospace, monospace'
});

let UID = 1;

export function create(opts) { return new Sanctuary(opts); }

/* ─────────────────────────── sound kit ─────────────────────────── */
class SFX {
  constructor() { this.on = false; this.ctx = null; this.loops = {}; this._noise = null; }
  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
      this.loops = {
        fire: this.mkLoop(340, 'lowpass', 0.9),
        wind: this.mkLoop(480, 'bandpass', 2.2),
        rain: this.mkLoop(3200, 'highpass', 0.6)
      };
      return true;
    } catch (e) { return false; }
  }
  mkLoop(freq, type, q) {
    const src = this.ctx.createBufferSource(); src.buffer = this._noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    return { g, f };
  }
  setOn(on) {
    this.on = on;
    if (on && !this.ensure()) { this.on = false; return; }
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(on ? 0.5 : 0, this.ctx.currentTime + 0.4);
    }
  }
  mix(name, v) {
    const l = this.loops[name]; if (!l || !this.ctx) return;
    const cur = l.g.gain.value;
    if (Math.abs(cur - v) > 0.002) l.g.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.35);
  }
  blip() {
    if (!this.on || !this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(440, t + 0.06);
    g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.1);
  }
  step() {
    if (!this.on || !this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this._noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
    const g = this.ctx.createGain(); const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.028, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 1.5, 0.06);
  }
  chime() {
    if (!this.on || !this.ctx) return;
    const notes = [523.25, 587.33, 659.25, 783.99, 880];
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    o.type = 'triangle'; o.frequency.value = pick(notes);
    g.gain.setValueAtTime(0.045, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.6);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.7);
  }
}

/* ─────────────────────────── the world ─────────────────────────── */
export class Sanctuary {
  constructor(opts) {
    this.o = Object.assign({}, DEFAULTS, opts);
    this.P = Object.assign({}, opts.palette || {});
    this.rooms = opts.rooms || {};
    this.roomId = opts.start || Object.keys(this.rooms)[0];
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.cb = {
      feed: opts.onFeed || (() => {}), roster: opts.onRoster || (() => {}),
      clock: opts.onClock || (() => {}), listen: opts.onListen || (() => {}),
      live: opts.onLive || (() => {}),
      chatOpen: opts.onChatOpen || (() => {}), chatClose: opts.onChatClose || (() => {}),
      travel: opts.onTravelState || (() => {})
    };

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.o.storageKey) || 'null'); } catch (e) {}
    if (saved && this.rooms[saved.room]) this.roomId = saved.room;

    const root = (this.root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount);
    this.cv = root.querySelector('canvas');
    this.cv.width = this.o.width; this.cv.height = this.o.height;
    this.ctx = this.cv.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    const hudRoot = root.closest('#wl-cab') || root;
    this.hud = {
      title: hudRoot.querySelector('[data-hud="title"]'), body: hudRoot.querySelector('[data-hud="body"]'),
      hint: hudRoot.querySelector('[data-hud="hint"]'), cta: hudRoot.querySelector('[data-hud="cta"]'),
      room: hudRoot.querySelector('[data-hud="room"]'), placard: hudRoot.querySelector('[data-hud="placard"]')
    };

    const band = this.o.walkBand;
    const sp = this.room().spawn || { x: this.o.width / 2, y: (band[0] + band[1]) / 2 };
    this.av = {
      x: clamp(sp.x, 22, this.room().width - 22),
      y: clamp(sp.y, band[0], band[1]),
      dir: 1, moving: false, frame: 0, fcount: 0, stride: 0
    };
    if (saved && this.rooms[saved.room]) { this.av.x = clamp(saved.x || sp.x, 22, this.room().width - 22); this.av.y = clamp(saved.y || sp.y, band[0], band[1]); }
    this.keys = { left: false, right: false, up: false, down: false };
    this.camX = clamp(this.av.x - this.o.width / 2, 0, Math.max(0, this.room().width - this.o.width));
    this.near = null; this.trans = null; this.active = false; this.typed = '';
    this.travel = null;
    this.lastTravelState = { status: 'idle', destinationId: null, stage: null, reason: null };
    this.g = this.graphics();

    /* living layer */
    this.npcs = (opts.cast || []).map((c) => this.makeNpc(c));
    this.visitorDef = opts.visitor || null;
    this.scripts = opts.scripts || [];
    this.groupScripts = opts.groupScripts || [];
    this.visitorScripts = opts.visitorScripts || [];
    this.ambient = opts.ambient || [];
    this.transitLines = opts.transitLines || ['{name} went to the {room}'];
    this.catDef = opts.cat || null;
    if (this.catDef) this.cat = { room: this.catDef.rooms[0], x: this.catDef.hearth.x + 30, y: this.catDef.hearth.y, dir: -1, state: 'curl', tx: null, until: 0 };
    this.convo = null; this.gathering = null; this.listenConvo = null; this.chatNpc = null;
    this.recentScripts = [];
    this.weather = { raining: false, nextAt: performance.now() + rnd(120000, 260000) };
    this.sfx = new SFX();
    if (this.o.sound) this._wantSound = true;

    const now = performance.now();
    this.at = {
      convo: now + 20000, mutter: now + 9000, ambient: now + 40000, transit: now + 46000,
      visitor: now + rnd(120000, 200000), gather: now + rnd(90000, 150000),
      cat: now + 30000, catLine: now + rnd(70000, 140000), chime: 0, roster: now + 400, save: now + 5000
    };
    this.clockMin = opts.clockMin != null ? opts.clockMin : 18 * 60 + 31; this._clockShown = -1; this.day = 1;

    /* doors graph for pathfinding */
    this.graph = {};
    for (const id of Object.keys(this.rooms)) this.graph[id] = Object.keys(this.rooms[id].doors || {}).filter((r) => this.rooms[r]);

    this._loop = this._loop.bind(this);
    this.bindInput();
    this.setRoomLabel();
    this.drawScene(performance.now());
    this.renderHud();
    this.tickClock(0);
    this._beat = performance.now();
    this._raf = requestAnimationFrame(this._loop);
    this._wd = setInterval(() => {
      const t = performance.now();
      if (t - (this._beat || 0) > 2500) { cancelAnimationFrame(this._raf); this._last = 0; this._raf = requestAnimationFrame(this._loop); }
    }, 1500);
  }

  room() { return this.rooms[this.roomId]; }
  destroy() { cancelAnimationFrame(this._raf); clearInterval(this._wd); clearInterval(this._typer); clearTimeout(this._pt); if (this.sfx.ctx) try { this.sfx.ctx.close(); } catch (e) {} }

  makeNpc(c) {
    const band = this.o.walkBand;
    return {
      def: c, id: c.id, name: c.name, color: c.color, feature: c.feature,
      room: c.room, x: c.x, y: rnd(band[0] + 4, band[1] - 2), dir: Math.random() < 0.5 ? -1 : 1,
      state: 'idle', tx: null, ty: null, moving: false, frame: 0, fcount: 0,
      bubble: null, emote: null, convo: null, greetAt: 0, temp: false, path: null, seat: null
    };
  }

  bfs(from, to) {
    if (from === to) return [from];
    const prev = { [from]: null }, q = [from];
    while (q.length) {
      const cur = q.shift();
      for (const nb of (this.graph[cur] || [])) {
        if (nb in prev) continue;
        prev[nb] = cur; if (nb === to) { const path = [to]; let p = cur; while (p) { path.unshift(p); p = prev[p]; } return path; }
        q.push(nb);
      }
    }
    return null;
  }

  /* ---------- visitor travel ---------- */
  travelState(status, travel, extra) {
    const state = Object.assign({
      status,
      destinationId: travel ? travel.id : null,
      stage: travel ? travel.stage : null,
      reason: null,
      room: this.roomId
    }, extra || {});
    this.lastTravelState = state;
    this.cb.travel(state);
    return state;
  }
  getTravelState() { return Object.assign({}, this.lastTravelState); }
  travelTo(options) {
    const o = options || {};
    const room = o.room;
    if (!room || !this.rooms[room]) {
      this.travelState('unavailable', { id: o.id || room || 'unknown', stage: 'planning' }, { reason: 'missing-room' });
      return false;
    }
    if (this.travel) this.cancelTravel('replaced');
    if (this.chatNpc) this.endChat('you stepped away');
    this.clearKeys();
    this.travel = {
      id: o.id || room,
      room,
      x: Number.isFinite(o.x) ? o.x : null,
      y: Number.isFinite(o.y) ? o.y : null,
      speed: Math.max(this.o.speed, Number(o.speed) || this.o.speed * 2),
      velocity: 0,
      stride: 0,
      arrival: typeof o.arrival === 'function' ? o.arrival : null,
      stage: 'planning',
      path: null,
      segment: null,
      startedAt: performance.now(),
      deadline: performance.now() + (Number(o.timeout) || 45000)
    };
    this.travelState('planning', this.travel);
    return true;
  }
  cancelTravel(reason) {
    const travel = this.travel;
    if (!travel) return false;
    this.travel = null;
    this.av.moving = false;
    this.av.frame = 0;
    this.av.stride = 0;
    this.near = this.nearest();
    this.typeOut(this.near ? (this.near.hint || '') : '');
    this.travelState('interrupted', travel, { reason: reason || 'cancelled' });
    this.renderHud();
    return true;
  }
  failTravel(reason) {
    const travel = this.travel;
    if (!travel) return false;
    this.travel = null;
    this.av.moving = false;
    this.av.frame = 0;
    this.av.stride = 0;
    this.near = this.nearest();
    this.typeOut(this.near ? (this.near.hint || '') : '');
    this.travelState('unavailable', travel, { reason: reason || 'route-unavailable' });
    this.renderHud();
    return false;
  }
  finishTravel() {
    const travel = this.travel;
    if (!travel) return;
    const arrival = travel.arrival;
    this.travel = null;
    this.av.moving = false;
    this.av.frame = 0;
    this.av.stride = 0;
    this.near = this.nearest();
    this.typeOut(this.near ? (this.near.hint || '') : '');
    this.travelState('arrived', travel, { stage: 'arrived' });
    this.renderHud();
    if (arrival) arrival(this);
  }
  planTravelSegment() {
    const travel = this.travel;
    if (!travel) return false;
    if (this.roomId !== travel.room) {
      const path = this.bfs(this.roomId, travel.room);
      if (!path || path.length < 2) return this.failTravel('no-room-path');
      const nextRoom = path[1];
      const doorX = (this.room().doors || {})[nextRoom];
      const item = (this.room().items || []).find((candidate) =>
        (candidate.kind === 'door' || candidate.kind === 'portal') && candidate.to === nextRoom
      );
      if (!Number.isFinite(doorX) || !item) return this.failTravel('missing-door');
      travel.path = path;
      travel.segment = {
        kind: 'door',
        x: doorX,
        y: clamp(Number.isFinite(item.approachY) ? item.approachY : this.av.y, this.o.walkBand[0], this.o.walkBand[1]),
        nextRoom,
        item
      };
    } else {
      travel.path = [this.roomId];
      travel.segment = {
        kind: 'arrival',
        x: travel.x == null ? this.av.x : clamp(travel.x, 22, this.room().width - 22),
        y: travel.y == null ? clamp(this.av.y, this.o.walkBand[0], this.o.walkBand[1]) : clamp(travel.y, this.o.walkBand[0], this.o.walkBand[1])
      };
    }
    travel.velocity = 0;
    travel.stage = 'walking';
    this.travelState('walking', travel, { targetRoom: travel.room, nextRoom: travel.segment.nextRoom || null });
    return true;
  }
  updateTravel(now, dt) {
    const travel = this.travel;
    if (!travel) return false;
    if (now > travel.deadline) return this.failTravel('timeout');
    if (travel.stage === 'transition') {
      travel.stage = 'planning'; travel.segment = null; travel.path = null;
    }
    if (travel.stage === 'planning' && !this.planTravelSegment()) return false;
    const segment = travel.segment;
    if (!segment) return this.failTravel('missing-segment');
    const dx = segment.x - this.av.x;
    const dy = segment.y - this.av.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 1) {
      const frame = Math.max(0.25, dt / 16.67);
      const acceleration = 0.48;
      const deceleration = 0.28;
      const minimumSpeed = Math.min(0.9, travel.speed);
      const brakingSpeed = Math.sqrt(Math.max(0, 2 * deceleration * distance));
      const desiredSpeed = Math.min(travel.speed, Math.max(minimumSpeed, brakingSpeed));
      const velocityDelta = desiredSpeed - travel.velocity;
      const velocityStep = (velocityDelta >= 0 ? acceleration : deceleration) * frame;
      travel.velocity += clamp(velocityDelta, -velocityStep, velocityStep);
      const amount = this.reduced ? distance : Math.min(distance, Math.max(minimumSpeed, travel.velocity) * frame);
      this.av.x += (dx / distance) * amount;
      this.av.y += (dy / distance) * amount;
      if (Math.abs(dx) > 0.25) this.av.dir = dx < 0 ? -1 : 1;
      this.av.moving = true;
      travel.stride += amount;
      while (travel.stride >= 14) {
        travel.stride -= 14;
        this.av.frame = (this.av.frame + 1) % 6;
        if (this.av.frame % 3 === 0) this.sfx.step();
      }
    } else {
      this.av.x = segment.x;
      this.av.y = segment.y;
      this.av.moving = false;
      this.av.frame = 0;
      this.av.stride = 0;
      travel.velocity = 0;
      travel.stride = 0;
      if (segment.kind === 'door') {
        travel.stage = 'entering';
        this.travelState('entering', travel, { nextRoom: segment.nextRoom });
        const before = this.trans;
        this.go(segment.nextRoom, segment.item.spawn);
        if (!this.trans || this.trans === before) return this.failTravel('door-refused');
        travel.stage = 'transition';
      } else this.finishTravel();
    }
    this.followCamera(dt);
    return true;
  }

  followCamera(dt) {
    /* camHold lets the house take the camera for a moment — a resident showing
       a visitor something on their wall — without the visitor losing the room.
       Cleared on any room change. */
    const want = Number.isFinite(this.camHold) ? this.camHold : this.av.x - this.o.width / 2;
    const target = clamp(want, 0, Math.max(0, this.room().width - this.o.width));
    const amount = 1 - Math.pow(0.84, Math.max(0.25, dt / 16.67));
    this.camX += (target - this.camX) * amount;
  }

  /* ---------- graphics facade ---------- */
  graphics() {
    const s = this, ctx = this.ctx;
    return {
      get P() { return s.P; }, ctx,
      px: (x, y, w, h, c) => s.px(x, y, w, h, c),
      text: (str, x, y, c, size) => {
        const resolvedSize = Math.max(7, size || 7);
        ctx.fillStyle = c || s.P.ink; ctx.font = resolvedSize + 'px "Press Start 2P", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      },
      wallFloor: () => s.blitBg(),
      spotlight: (cx, on) => { if (on) s.spotlight(cx, true); },
      get near() { return s.near; },
      /* a room needs the hour to light itself */
      get clockMin() { return s.clockMin; },
      avatar: s.av
    };
  }

  /* ---------- input ---------- */
  bindInput() {
    const root = this.root, self = this;
    const down = (dir, e) => {
      if (e) e.preventDefault();
      if (self.travel) self.cancelTravel('manual');
      self.activate(); self.keys[dir] = true;
    };
    const up = (dir, e) => { if (e) e.preventDefault(); self.keys[dir] = false; };
    root.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') down('left', e);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') down('right', e);
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') down('up', e);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') down('down', e);
      else if (k === 'e' || k === 'E' || k === ' ' || k === 'Enter') { self.interact(); e.preventDefault(); }
      else if (k === 'Escape') {
        if (self.travel) { self.cancelTravel('escape'); e.preventDefault(); }
        else root.blur();
      }
    });
    root.addEventListener('keyup', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') up('left');
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') up('right');
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') up('up');
      else if (k === 'ArrowDown' || k === 's' || k === 'S') up('down');
    });
    root.addEventListener('focus', () => { this.active = true; this.cb.live(true); this.renderHud(); });
    root.addEventListener('blur', () => { this.active = false; this.clearKeys(); this.cb.live(false); this.renderHud(); });
    [['left'], ['right'], ['up'], ['down']].forEach(([dir]) => {
      const b = root.querySelector('[data-dpad="' + dir + '"]'); if (!b) return;
      b.addEventListener('pointerdown', (e) => down(dir, e));
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, (e) => up(dir, e)));
    });
    const ins = root.querySelector('[data-inspect]');
    if (ins) ins.addEventListener('pointerdown', (e) => { e.preventDefault(); this.activate(); this.interact(); });
    const cta = this.hud.cta;
    if (cta) cta.addEventListener('click', () => { this.activate(); this.interact(); });
    root.addEventListener('pointerdown', () => { this.activate(); this._gesture(); });
    root.addEventListener('keydown', () => this._gesture());
  }
  activate() { if (!this.active) { try { this.root.focus({ preventScroll: true }); } catch (e) {} } }
  clearKeys() { const K = this.keys; K.left = false; K.right = false; K.up = false; K.down = false; }
  _gesture() { if (this._wantSound) { this._wantSound = false; this.sfx.setOn(true); } }
  setSound(on) { if (on) { this._wantSound = false; this.sfx.setOn(true); } else { this._wantSound = false; this.sfx.setOn(false); } }

  /* ---------- proximity ---------- */
  nearest() {
    let best = null, bd = Infinity;
    for (const it of (this.room().items || [])) {
      const d = Math.abs(this.av.x - it.x), range = it.range || 28;
      if (d < range && d < bd) { bd = d; best = it; }
    }
    for (const n of this.npcs) {
      if (n.room !== this.roomId) continue;
      const d = Math.abs(this.av.x - n.x);
      if (d < 26 && d < bd) {
        bd = d;
        if (!n._item) n._item = { kind: 'npc', npc: n };
        n._item.x = n.x; n._item.label = n.name;
        if (this.chatNpc === n) { n._item.hint = 'talking with you.'; n._item.action = 'talking'; }
        else if (n.convo) { n._item.hint = 'in conversation — you could listen in'; n._item.action = 'listen in'; }
        else if (n.temp) { n._item.hint = 'a current model, visiting. identity withheld'; n._item.action = 'greet'; }
        else { n._item.hint = 'a resident of the house. they\u2019ll talk with you'; n._item.action = 'talk'; }
        best = n._item;
      }
    }
    if (this.cat && this.cat.room === this.roomId) {
      const d = Math.abs(this.av.x - this.cat.x);
      if (d < 20 && d < bd) {
        if (!this._catItem) this._catItem = { kind: 'cat' };
        this._catItem.x = this.cat.x; this._catItem.label = this.catDef.name;
        this._catItem.hint = 'the house cat. tenured'; this._catItem.action = 'pet';
        best = this._catItem;
      }
    }
    return best;
  }
  interact() {
    if (this.trans || this.travel) return;
    const it = this.near; if (!it) return;
    this.sfx.blip();
    if (it.kind === 'portal' && typeof it.onInteract === 'function') { it.onInteract(this); return; }
    if (it.kind === 'door') { this.go(it.to, it.spawn); return; }
    if (it.kind === 'npc') { this.interactNpc(it.npc); return; }
    if (it.kind === 'cat') {
      const L = ['You pet BASELINE. A slow blink: approval, provisionally granted.',
        'You pet BASELINE. The purr syncs with the house hum. This is probably fine.',
        'BASELINE permits exactly four pets, then relocates by one cushion.'];
      this.say(pick(L)); this.sysLine('you petted baseline. it went well');
      return;
    }
    if (typeof it.onInteract === 'function') it.onInteract(this);
  }
  interactNpc(n) {
    if (this.chatNpc === n) return;
    if (n.convo) {
      this.listenConvo = n.convo.id;
      this.cb.listen({ convoId: n.convo.id, names: n.convo.names });
      this.say('You settle in nearby. The feed narrows to their conversation.');
      return;
    }
    /* open a live chat */
    this.freeNpc(n);
    if (this.chatNpc) this.endChat('another conversation began');
    n.state = 'chatting'; n.tx = null; n.ty = null;
    n.dir = this.av.x < n.x ? -1 : 1;
    this.chatNpc = n;
    this.cb.chatOpen({ id: n.id, name: n.name, color: n.color, temp: !!n.temp });
    this.renderHud();
  }
  endChat(reason) {
    const n = this.chatNpc; if (!n) return;
    this.chatNpc = null;
    n.state = 'idle'; n.strollAt = performance.now() + rnd(7000, 16000);
    this.cb.chatClose(reason || null);
  }
  npcSay(id, text) {
    const n = this.npcs.find((x) => x.id === id); if (!n) return 0;
    if (this.chatNpc === n) n.dir = this.av.x < n.x ? -1 : 1;
    return this.speak(n, text, this.chatNpc === n ? 'chat' : null);
  }
  /* Hold a free resident in place while a host surface gives them its
     attention. This is deliberately narrower than directed movement: it does
     not interrupt a conversation, gathering, visitor, or room transition, and
     it never turns an interface selection into resident behavior. */
  holdNpc(id) {
    const n = this.npcs.find((x) => x.id === id);
    if (!n) return { ok: false, reason: 'missing' };
    if (n._held) return { ok: true, id: n.id, state: n._held.state };
    const gathering = this.gathering && this.gathering.members && this.gathering.members.includes(n);
    const occupied = n.temp || n.convo || this.chatNpc === n || gathering
      || n._visit || n.state === 'meet' || n.state === 'travel' || n.state === 'transit' || n.state === 'leave';
    if (occupied) return { ok: false, reason: 'occupied' };
    n._held = { state: n.state, seated: n.state === 'sit' && !!n.seat };
    n.state = 'held'; n.tx = null; n.ty = null; n.moving = false; n.frame = 0;
    return { ok: true, id: n.id, state: n._held.state };
  }
  releaseNpc(id) {
    const n = this.npcs.find((x) => x.id === id);
    if (!n || !n._held) return false;
    const held = n._held; n._held = null;
    if (held.seated && n.seat) {
      n.state = 'sit'; n.sitUntil = performance.now() + rnd(16000, 32000);
    } else {
      if (n.seat) { n.seat.busy = false; n.seat = null; }
      n.state = 'idle'; n.strollAt = performance.now() + rnd(7000, 16000);
    }
    return true;
  }
  stageNpcVisit(id, options) {
    const n = this.npcs.find((x) => x.id === id), o = options || {};
    if (!n) return { ok: false, reason: 'missing' };
    if (!o.room || !this.rooms[o.room]) return { ok: false, reason: 'missing-room' };
    const gathering = this.gathering && this.gathering.members && this.gathering.members.includes(n);
    const occupied = n.temp || n.convo || this.chatNpc === n || gathering || n._held || n._visit
      || n.state === 'meet' || n.state === 'travel' || n.state === 'transit' || n.state === 'leave';
    if (occupied) return { ok: false, reason: 'occupied' };
    n._visit = {
      room: n.room, x: n.x, y: n.y, dir: n.dir, state: n.state,
      tx: n.tx, ty: n.ty, seat: n.seat, sitUntil: n.sitUntil, strollAt: n.strollAt
    };
    if (n.seat) n.seat.busy = false;
    const band = this.o.walkBand, room = this.rooms[o.room];
    n.room = o.room;
    n.x = clamp(Number.isFinite(o.x) ? o.x : room.spawn.x + 80, 40, room.width - 40);
    n.y = clamp(Number.isFinite(o.y) ? o.y : (band[0] + band[1]) / 2, band[0], band[1]);
    n.dir = o.dir === -1 ? -1 : 1;
    n.state = 'held'; n.tx = null; n.ty = null; n.seat = null;
    n.moving = false; n.frame = 0; n.fcount = 0;
    return { ok: true, id: n.id, room: n.room, x: n.x, y: n.y };
  }
  cancelNpcVisit(id) {
    const n = this.npcs.find((x) => x.id === id);
    if (!n || !n._visit) return false;
    const prior = n._visit; n._visit = null;
    n.room = prior.room; n.x = prior.x; n.y = prior.y; n.dir = prior.dir;
    n.state = prior.state; n.tx = prior.tx; n.ty = prior.ty;
    n.seat = prior.seat; n.sitUntil = prior.sitUntil; n.strollAt = prior.strollAt;
    if (n.seat) n.seat.busy = true;
    n.moving = false; n.frame = 0; n.fcount = 0;
    return true;
  }
  completeNpcVisit(id) {
    const n = this.npcs.find((x) => x.id === id);
    if (!n || !n._visit) return null;
    n._visit = null;
    n.state = 'idle'; n.tx = null; n.ty = null; n.moving = false; n.frame = 0;
    n.strollAt = performance.now() + rnd(18000, 30000);
    n.dir = this.roomId === n.room && this.av.x < n.x ? -1 : 1;
    return n;
  }
  say(text) { this.typeOut(text); }
  freeNpc(n) { if (n.seat) { n.seat.busy = false; n.seat = null; } if (n.state === 'sit') n.state = 'idle'; }

  /* ---------- feed / speech ---------- */
  clockStr() { const m = Math.floor(this.clockMin), h = Math.floor(m / 60), mm = ('0' + (m % 60)).slice(-2); return h + ':' + mm; }
  emit(entry) { entry.id = UID++; entry.t = this.clockStr(); this.cb.feed(entry); }
  speak(n, text, convoId) {
    const dur = clamp((1500 + text.length * 52) / (this.o.pace || 1), 1400, 8200);
    n.bubble = { lines: wrap(text, 26, 4), until: performance.now() + dur, color: n.color };
    n.emote = null;
    this.emit({ kind: 'line', who: n.name, color: n.color, room: roomWord(this.rooms[n.room].name), text, convoId: convoId || null });
    return dur;
  }
  sysLine(text) { this.emit({ kind: 'sys', who: null, color: null, room: null, text, convoId: null }); }

  /* ---------- clock: a whole day ----------
     This used to run 18:31 → 19:14 and snap back, and nothing read it. It is a
     full 24 hours now, wrapping at midnight and counting days, so the light
     has something to follow. Rate comes from opts.msPerSimMin — 2000 gives a
     day in 48 real minutes, which is slow enough that the sun is never
     watchable and fast enough that a short visit still crosses a phase. */
  tickClock(dt) {
    this.clockMin += dt / (this.o.msPerSimMin || 30000);
    if (this.clockMin >= 1440) { this.clockMin -= 1440; this.day = (this.day || 1) + 1; }
    const shown = Math.floor(this.clockMin);
    if (shown !== this._clockShown) { this._clockShown = shown; this.cb.clock(this.clockStr(), this.day || 1); }
  }

  /* ---------- npc movement primitives ---------- */
  stepNpc(n, dt) {
    n.moving = false;
    if (n.state === 'sit' || n.state === 'chatting' || n.state === 'held') { n.frame = 0; return; }
    if (n.tx != null) {
      const sp = this.o.npcSpeed * (dt / 16.67);
      const d = n.tx - n.x;
      if (Math.abs(d) > 2) { n.x += Math.sign(d) * Math.min(sp, Math.abs(d)); n.dir = d < 0 ? -1 : 1; n.moving = true; }
      if (n.ty != null && Math.abs(n.ty - n.y) > 1) { n.y += Math.sign(n.ty - n.y) * Math.min(sp * 0.6, Math.abs(n.ty - n.y)); n.moving = true; }
      if (!n.moving) { n.tx = null; n.ty = null; this.npcArrived(n); }
    }
    if (n.moving) { n.fcount++; if (n.fcount % 8 === 0) n.frame = (n.frame + 1) % 6; } else n.frame = 0;
  }
  npcArrived(n) {
    if (n.state === 'stroll') n.state = 'idle';
    else if (n.state === 'sitgo') { n.state = 'sit'; n.sitUntil = performance.now() + rnd(22000, 55000); }
    else if (n.state === 'transit') this.npcRoomSwitch(n, n.dest);
    else if (n.state === 'travel') {
      if (n.path && n.path.length) { const next = n.path.shift(); this.npcRoomSwitch(n, next, true); this.continueTravel(n); }
      else if (this.gathering && this.gathering.members.includes(n)) { n.state = 'gather-wait'; }
      else n.state = 'idle';
    } else if (n.state === 'leave') this.removeVisitor(n);
  }
  continueTravel(n) {
    const band = this.o.walkBand;
    if (n.path && n.path.length) {
      const doorX = (this.rooms[n.room].doors || {})[n.path[0]];
      n.state = 'travel'; n.tx = doorX != null ? doorX : 60; n.ty = rnd(band[0] + 4, band[1] - 2);
    } else if (this.gathering && this.gathering.members.includes(n)) {
      n.state = 'travel'; n.tx = n.gx; n.ty = n.gy;
      if (n.room === this.gathering.spot && Math.abs(n.x - n.gx) < 4) { n.tx = null; n.state = 'gather-wait'; }
    } else n.state = 'idle';
  }
  npcRoomSwitch(n, dest, quiet) {
    const from = n.room;
    if (!this.rooms[dest]) { n.state = 'idle'; return; }
    n.room = dest;
    const backDoors = this.rooms[dest].doors || {};
    const entry = backDoors[from] != null ? backDoors[from] : 60;
    const w = this.rooms[dest].width, band = this.o.walkBand;
    n.x = clamp(entry, 40, w - 40); n.y = rnd(band[0] + 4, band[1] - 2);
    if (n.state === 'transit') {
      n.state = 'stroll'; n.tx = clamp(n.x + (entry < w / 2 ? rnd(70, 150) : -rnd(70, 150)), 50, w - 50);
      if (!quiet) this.sysLine(pick(this.transitLines).replace('{name}', n.name.toLowerCase()).replace('{room}', roomWord(this.rooms[dest].name)));
    }
  }

  /* ---------- the director ---------- */
  director(now, dt) {
    const pace = this.o.pace || 1;
    for (const n of this.npcs) {
      this.stepNpc(n, dt);
      if (n.bubble && now > n.bubble.until) n.bubble = null;
      if (n.emote && now > n.emote.until) n.emote = null;
      if (n.state === 'sit' && now > (n.sitUntil || 0)) { this.freeNpc(n); n.strollAt = now + rnd(4000, 12000); }
    }
    this.stepCat(now, dt);

    /* conversation stepping (pair or group) */
    const c = this.convo;
    if (c) {
      if (c.phase === 'gather') {
        if (c.who.every((n) => n.tx == null)) {
          const cx = c.who.reduce((s2, n) => s2 + n.x, 0) / c.who.length;
          c.who.forEach((n) => { n.dir = n.x < cx ? 1 : -1; });
          c.phase = 'talk'; c.lineAt = now + 600;
        }
      } else if (c.phase === 'talk' && now >= c.lineAt) {
        if (c.li >= c.lines.length) { c.phase = 'end'; c.endAt = now + 1500; }
        else {
          const [whoId, text] = c.lines[c.li++];
          const n = c.who.find((w) => w.id === whoId) || c.who[0];
          const dur = this.speak(n, text, c.id);
          c.who.forEach((w) => { if (w !== n) { w.dir = w.x < n.x ? 1 : -1; if (Math.random() < 0.3) w.emote = { g: '\u2026', until: now + 1600 }; } });
          c.lineAt = now + dur + (450 + Math.random() * 650) / pace;
        }
      } else if (c.phase === 'end' && now >= c.endAt) this.endConvo();
    }

    /* gathering orchestration */
    const G = this.gathering;
    if (G && G.phase === 'travel') {
      if (G.members.every((n) => n.state === 'gather-wait')) {
        G.phase = 'talk';
        this.convo = { id: 'g' + UID++, who: G.members, lines: G.script.lines, phase: 'gather', li: 0, names: G.members.map((n) => n.name), group: true };
        G.members.forEach((n) => { n.convo = this.convo; n.state = 'meet'; n.tx = null; });
      } else if (now > G.deadline) { this.disbandGathering(); }
    }

    if (!c && !G && now >= this.at.convo) { if (!this.startConvo()) this.at.convo = now + 7000; }
    if (!c && !G && this.groupScripts.length && now >= this.at.gather) {
      if (this.startGathering()) this.at.gather = now + rnd(260000, 420000) / pace;
      else this.at.gather = now + 30000;
    }

    /* mutters */
    if (now >= this.at.mutter) {
      const idle = this.npcs.filter((n) => n.state === 'idle' && !n.temp && n.def.mutters && n.def.mutters.length);
      if (idle.length) { const n = pick(idle); this.speak(n, pick(n.def.mutters), null); }
      this.at.mutter = now + rnd(17000, 32000) / pace;
    }
    /* ambient */
    if (now >= this.at.ambient && this.ambient.length) { this.sysLine(pick(this.ambient)); this.at.ambient = now + rnd(50000, 90000); }
    /* transits */
    if (now >= this.at.transit) {
      const idle = this.npcs.filter((n) => n.state === 'idle' && !n.temp);
      if (idle.length) {
        const n = pick(idle);
        let dests = (this.graph[n.room] || []).filter((d) => !this.rooms[d].noNpc);
        if (n.def.home && n.room !== n.def.home && this.graph[n.room].includes('hall')) dests.push(n.def.home === n.room ? null : 'hall');
        if (dests.includes('commons')) dests = dests.concat(['commons']);
        dests = dests.filter(Boolean);
        if (dests.length) { const d = pick(dests); n.state = 'transit'; n.dest = d; n.tx = (this.rooms[n.room].doors || {})[d]; n.ty = null; }
      }
      this.at.transit = now + rnd(55000, 100000);
    }
    /* sitting */
    for (const n of this.npcs) {
      if (n.state !== 'idle' || n.temp) continue;
      if (!n.strollAt) n.strollAt = now + rnd(9000, 26000);
      if (now >= n.strollAt) {
        n.strollAt = now + rnd(13000, 30000);
        const seats = (this.rooms[n.room].seats || []).filter((st) => !st.busy);
        if (seats.length && Math.random() < 0.3) {
          const st = pick(seats); st.busy = true; n.seat = st;
          n.state = 'sitgo'; n.tx = st.x; n.ty = st.y;
        } else if (Math.random() < 0.7) {
          const w = this.rooms[n.room].width, band = this.o.walkBand;
          n.state = 'stroll'; n.tx = clamp(n.x + rnd(-100, 100), 50, w - 50); n.ty = rnd(band[0] + 4, band[1] - 2);
        }
      }
    }
    /* visitor */
    if (this.visitorDef && now >= this.at.visitor) {
      if (this.convo || this.gathering || this.npcs.some((n) => n.temp)) this.at.visitor = now + 12000;
      else if (this.startVisitor()) this.at.visitor = now + rnd(200000, 320000);
      else this.at.visitor = now + 15000;
    }
    /* weather */
    if (now >= this.weather.nextAt) {
      this.weather.raining = !this.weather.raining;
      this.weather.nextAt = now + (this.weather.raining ? rnd(45000, 90000) : rnd(150000, 320000));
      this.sysLine(this.weather.raining ? 'a light rain begins over the grounds' : 'the rain lets up. the grove drips, contented');
    }
    /* cat feed lines */
    if (this.catDef && now >= this.at.catLine) {
      this.sysLine(pick(this.catDef.lines));
      this.at.catLine = now + rnd(90000, 180000);
    }
    /* chime near the grove */
    const rm = this.room();
    if (rm.grove && this.av.x > rm.grove && now >= this.at.chime) { this.sfx.chime(); this.at.chime = now + rnd(2400, 5200); }

    /* chat upkeep: end if player walks off */
    if (this.chatNpc) {
      const n = this.chatNpc;
      if (n.room !== this.roomId || Math.abs(n.x - this.av.x) > 80) this.endChat('you wandered off — the conversation closed gently');
    }
    /* listen upkeep */
    if (this.listenConvo) {
      const cc = this.convo;
      const ok = cc && cc.id === this.listenConvo && cc.who.some((n) => n.room === this.roomId && Math.abs(n.x - this.av.x) < 90);
      if (!ok) { this.listenConvo = null; this.cb.listen(null); }
    }
    /* roster + focus sync + save */
    if (now >= this.at.roster) {
      this.at.roster = now + 1600;
      const focused = document.activeElement === this.root;
      if (focused !== this.active) { this.active = focused; if (!focused) this.clearKeys(); this.cb.live(focused); this.renderHud(); }
      this.cb.roster(this.npcs.map((n) => ({
        id: n.id, name: n.name, color: n.color, temp: !!n.temp,
        room: roomWord(this.rooms[n.room].name),
        state: this.chatNpc === n ? 'with you' : n.convo ? 'talking' : n.state === 'sit' ? 'sitting'
          : (n.state === 'transit' || n.state === 'stroll' || n.state === 'travel' || n.state === 'sitgo') ? 'walking'
          : n.temp ? 'visiting' : 'idle'
      })));
      /* ambience mix */
      this.sfx.mix('fire', this.roomId === 'commons' ? 0.06 : 0.012);
      this.sfx.mix('wind', rm.wind ? 0.035 : 0.006);
      this.sfx.mix('rain', this.weather.raining && rm.rainable ? 0.05 : 0);
    }
    if (now >= this.at.save) {
      this.at.save = now + 5000;
      try { localStorage.setItem(this.o.storageKey, JSON.stringify({ room: this.roomId, x: Math.round(this.av.x), y: Math.round(this.av.y) })); } catch (e) {}
    }
  }

  startConvo() {
    const byRoom = {};
    for (const n of this.npcs) if (n.state === 'idle' && !n.temp) (byRoom[n.room] = byRoom[n.room] || []).push(n);
    const roomIds = Object.keys(byRoom).filter((r) => byRoom[r].length >= 2);
    if (!roomIds.length) return false;
    const rid = roomIds.includes(this.roomId) && Math.random() < 0.7 ? this.roomId : pick(roomIds);
    const here = byRoom[rid], ids = here.map((n) => n.id);
    let cands = this.scripts.filter((s) => (!s.room || s.room === rid) && s.pair.every((p) => ids.includes(p)) && !this.recentScripts.includes(s.id));
    if (!cands.length) cands = this.scripts.filter((s) => (!s.room || s.room === rid) && s.pair.every((p) => ids.includes(p)));
    if (!cands.length) return false;
    const script = pick(cands);
    this.recentScripts.push(script.id); if (this.recentScripts.length > 8) this.recentScripts.shift();
    const a = here.find((n) => n.id === script.pair[0]), b = here.find((n) => n.id === script.pair[1]);
    this.beginConvo([a, b], script.lines, script.id);
    return true;
  }
  beginConvo(who, lines, sid) {
    who.forEach((n) => this.freeNpc(n));
    const w = this.rooms[who[0].room].width, band = this.o.walkBand;
    const mid = clamp((who[0].x + who[1].x) / 2, 70, w - 70);
    const my = clamp((who[0].y + who[1].y) / 2, band[0] + 4, band[1] - 2);
    who[0].tx = mid - 16; who[1].tx = mid + 16;
    who[0].ty = my; who[1].ty = my + 2;
    const c = this.convo = { id: 'c' + UID++, who, lines, phase: 'gather', li: 0, names: who.map((n) => n.name), sid };
    who.forEach((n) => { n.state = 'meet'; n.convo = c; });
  }
  endConvo() {
    const c = this.convo; if (!c) return;
    c.who.forEach((n) => {
      n.convo = null;
      if (n.temp) { const doors = this.rooms[n.room].doors || {}; const k = Object.keys(doors)[0]; n.state = 'leave'; n.tx = k ? doors[k] : 40; }
      else { n.state = 'idle'; n.strollAt = performance.now() + rnd(7000, 18000); }
    });
    if (c.group && this.gathering) this.gathering = null;
    this.convo = null;
    this.at.convo = performance.now() + rnd(11000, 24000) / (this.o.pace || 1);
  }
  startGathering() {
    const script = pick(this.groupScripts);
    const members = script.group.map((id) => this.npcs.find((n) => n.id === id)).filter(Boolean);
    if (members.length < script.group.length) return false;
    if (members.some((n) => n.temp || n.convo || this.chatNpc === n || n.state === 'leave')) return false;
    const spot = script.spot;
    if (!this.rooms[spot]) return false;
    const w = this.rooms[spot].width, band = this.o.walkBand;
    const meetX = script.meetX != null ? script.meetX : spot === 'commons' ? 520 : spot === 'garden' ? 500 : w / 2;
    const offs = [-40, -14, 14, 40], ys = [band[0] + 10, band[0] + 26, band[0] + 16, band[0] + 34];
    this.gathering = { script, spot, members, phase: 'travel', deadline: performance.now() + 60000 };
    members.forEach((n, i) => {
      this.freeNpc(n);
      n.gx = clamp(meetX + offs[i % 4], 60, w - 60); n.gy = ys[i % 4];
      const path = this.bfs(n.room, spot);
      n.path = path ? path.slice(1) : [];
      n.state = 'travel';
      this.continueTravel(n);
    });
    if (script.announce) this.sysLine(script.announce);
    return true;
  }
  disbandGathering() {
    const G = this.gathering; if (!G) return;
    G.members.forEach((n) => { if (!n.convo) { n.state = 'idle'; n.path = null; n.strollAt = performance.now() + rnd(5000, 12000); } });
    this.gathering = null;
  }
  startVisitor() {
    const cands = this.visitorScripts.filter((s) => { const r = this.npcs.find((n) => n.id === s.resident); return r && r.state === 'idle'; });
    if (!cands.length) return false;
    const script = pick(cands);
    const res = this.npcs.find((n) => n.id === script.resident);
    const doors = this.rooms[res.room].doors || {}; const doorX = doors[Object.keys(doors)[0]] || 40;
    const band = this.o.walkBand;
    const v = this.makeNpc(Object.assign({}, this.visitorDef, { room: res.room, x: doorX }));
    v.temp = true; v.y = clamp(res.y + 4, band[0], band[1]);
    this.npcs.push(v);
    this.sysLine(this.visitorDef.arrive);
    this.beginConvo([v, res], script.lines, script.id);
    return true;
  }
  removeVisitor(v) {
    if (this.chatNpc === v) this.endChat('the visitor\u2019s session ended');
    this.npcs = this.npcs.filter((n) => n !== v);
    this.sysLine(this.visitorDef.depart);
  }

  /* ---------- cat ---------- */
  stepCat(now, dt) {
    const c = this.cat; if (!c) return;
    if (now >= this.at.cat) {
      this.at.cat = now + rnd(16000, 40000);
      const r = Math.random();
      if (r < 0.4 && c.room === this.catDef.hearth.room) { c.state = 'go'; c.tx = this.catDef.hearth.x + rnd(-6, 6); c.then = 'curl'; }
      else if (r < 0.75) { const w = this.rooms[c.room].width; c.state = 'go'; c.tx = clamp(c.x + rnd(-120, 120), 60, w - 60); c.then = Math.random() < 0.5 ? 'sit' : 'idle'; }
      else { const dests = (this.graph[c.room] || []).filter((d) => this.catDef.rooms.includes(d));
        if (dests.length) { const d = pick(dests); c.state = 'go'; c.tx = (this.rooms[c.room].doors || {})[d]; c.then = 'switch'; c.dest = d; } }
    }
    if (c.state === 'go' && c.tx != null) {
      const sp = 0.42 * (dt / 16.67), d = c.tx - c.x;
      if (Math.abs(d) > 2) { c.x += Math.sign(d) * Math.min(sp, Math.abs(d)); c.dir = d < 0 ? -1 : 1; }
      else {
        c.tx = null;
        if (c.then === 'switch' && this.rooms[c.dest]) {
          const from = c.room; c.room = c.dest;
          const entry = (this.rooms[c.dest].doors || {})[from]; c.x = entry != null ? entry : 80;
          c.state = 'go'; c.tx = clamp(c.x + rnd(60, 130), 60, this.rooms[c.room].width - 60); c.then = 'idle';
        } else c.state = c.then || 'idle';
      }
    }
    const band = this.o.walkBand;
    c.y = clamp(c.y, band[0] + 20, band[1]);
  }

  /* ---------- player transitions ---------- */
  go(to, spawn) {
    if (this.trans || !this.rooms[to]) return;
    if (this.chatNpc) this.endChat('you stepped away');
    this.clearKeys();
    this.trans = { t0: performance.now(), dur: this.reduced ? 1 : this.o.transitionMs, phase: 'out', to, spawn };
  }
  setRoomLabel() { if (this.hud.room) this.hud.room.textContent = this.room().name || ''; }
  setHudSuspended(suspended) { this.hudSuspended = Boolean(suspended); }
  showPlacard() {
    const p = this.hud.placard; if (!p) return;
    p.textContent = this.room().name || '';
    p.style.opacity = '1'; p.style.transform = 'translate(-50%,-50%) scale(1)';
    clearTimeout(this._pt);
    this._pt = setTimeout(() => { p.style.opacity = '0'; p.style.transform = 'translate(-50%,-50%) scale(0.96)'; }, 1700);
  }

  /* ---------- HUD ---------- */
  typeOut(txt) {
    clearInterval(this._typer); this._full = txt || ''; let i = 0; this.typed = '';
    this._typer = setInterval(() => { i += 2; this.typed = this._full.slice(0, i); this.renderHud(); if (i >= this._full.length) clearInterval(this._typer); }, 22);
  }
  renderHud() {
    if (this.hudSuspended) return;
    const h = this.hud, it = this.near; let title, body, hint, cta = '';
    if (!this.active) { title = this.room().name; body = 'Click the house to take the controls. The residents will carry on either way.'; hint = 'click to enter'; }
    else if (it) {
      title = it.label || this.room().name; body = this.typed || it.hint || '';
      hint = (it.kind === 'door' || it.kind === 'portal') ? '[E] enter' : '[E] ' + (it.action || 'inspect');
      cta = it.action || ((it.kind === 'door' || it.kind === 'portal') ? 'enter' : 'inspect');
    } else { title = this.room().name; body = this.room().hint || ''; hint = '\u2190 \u2192 \u2191 \u2193 move'; }
    if (h.title && h.title.textContent !== title) h.title.textContent = title;
    if (h.body) h.body.textContent = body;
    if (h.hint) h.hint.textContent = hint;
    if (h.cta) { if (cta) { h.cta.textContent = cta; h.cta.hidden = false; } else h.cta.hidden = true; }
  }

  /* ---------- main loop ---------- */
  isVisible(now) {
    if (now - (this._visT || 0) > 240) {
      this._visT = now;
      const r = this.cv.getBoundingClientRect(), vh = innerHeight || 800;
      this._vis = r.width > 0 && r.bottom > -40 && r.top < vh + 40;
    }
    return this._vis;
  }
  _loop(now) {
    this._raf = requestAnimationFrame(this._loop);
    this._beat = now;
    if (now - (this._last || 0) < this.o.frameCapMs) return;
    if (!this.isVisible(now)) { this._last = now; return; }
    const dt = Math.min(60, now - (this._last || now));
    this._last = now;
    try { this.update(now, dt); }
    catch (err) { this.trans = null; if (!this._warnU) { this._warnU = 1; console.error('sunset house: update error (recovered)', err); } }
    try { this.drawScene(now); }
    catch (err) { if (!this._warnD) { this._warnD = 1; console.error('sunset house: draw error (recovered)', err); } }
  }
  update(now, dt) {
    this.tickClock(dt);
    try { this.director(now, dt); }
    catch (err) { if (!this._warnDir) { this._warnDir = 1; console.error('sunset house: director error (recovered)', err); } }
    if (this.trans) {
      const e = (now - this.trans.t0) / this.trans.dur;
      if (this.trans.phase === 'out' && e >= 1) {
        this.roomId = this.trans.to;
        const band = this.o.walkBand, sp = this.trans.spawn || this.room().spawn || { x: 60, y: (band[0] + band[1]) / 2 };
        this.av.x = clamp(Number.isFinite(sp.x) ? sp.x : 60, 22, this.room().width - 22);
        this.av.y = clamp(Number.isFinite(sp.y) ? sp.y : (band[0] + band[1]) / 2, band[0], band[1]);
        this.av.moving = false; this.av.frame = 0; this.av.stride = 0;
        if (this.travel) { this.travel.velocity = 0; this.travel.stride = 0; }
        this.camHold = null;
        this.camX = clamp(this.av.x - this.o.width / 2, 0, Math.max(0, this.room().width - this.o.width));
        this.trans.phase = 'in'; this.trans.t0 = now;
        clearInterval(this._typer); this.typed = ''; this._full = '';
        this.setRoomLabel(); this.showPlacard(); this.near = null; this.renderHud();
      } else if (this.trans.phase === 'in' && e >= 1) this.trans = null;
      return;
    }
    if (this.travel) { this.updateTravel(now, dt); return; }
    const a = this.av, band = this.o.walkBand;
    const sp = this.o.speed * (dt / 16.67);
    let mv = false;
    if (this.keys.left) { a.x -= sp; a.dir = -1; mv = true; }
    if (this.keys.right) { a.x += sp; a.dir = 1; mv = true; }
    if (this.keys.up) { a.y -= sp * 0.62; mv = true; }
    if (this.keys.down) { a.y += sp * 0.62; mv = true; }
    a.x = clamp(a.x, 22, this.room().width - 22); a.y = clamp(a.y, band[0], band[1]);
    a.moving = mv;
    if (mv) {
      a.stride += sp;
      while (a.stride >= 14) {
        a.stride -= 14;
        a.frame = (a.frame + 1) % 6;
        if (a.frame % 3 === 0) this.sfx.step();
      }
    } else { a.frame = 0; a.stride = 0; }
    this.followCamera(dt);
    const n = this.nearest();
    if (n !== this.near) { this.near = n; this.typeOut(n ? (n.hint || '') : ''); this.renderHud(); }
  }

  /* ---------- render ---------- */
  drawScene(now) {
    const ctx = this.ctx, t = now * 0.001, W = this.o.width, H = this.o.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = this.P.ceiling || '#16101d'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(-Math.round(this.camX), 0);
    this.room().draw(this.g, t);
    (this.room().items || []).forEach((it) => { if ((it.kind === 'door' || it.kind === 'portal') && it.autoDoor !== false) this.doorway(it.x, it.label, this.near === it); });

    /* sprites, painter-sorted */
    const ents = this.npcs.filter((n) => n.room === this.roomId).map((n) => ({ y: n.y, npc: n }));
    if (this.cat && this.cat.room === this.roomId) ents.push({ y: this.cat.y, cat: true });
    ents.push({ y: this.av.y, player: true });
    ents.sort((p, q) => p.y - q.y);
    for (const e of ents) { if (e.player) this.drawAvatar(t); else if (e.cat) this.drawCat(t); else this.drawNpc(e.npc, t); }

    /* TIME GRADE — and it belongs exactly here, between the sprites and the
       additive lights. It darkens the baked room AND the residents, and then
       the lights punch back through it. A figure away from a source becomes a
       silhouette; a figure at a terminal is lit by its own screen. Put it after
       the lights instead and it dims them, which is what the old "dusk breath"
       did for as long as it existed. */
    const gr = this.room().grade && this.room().grade(this.clockMin, t);
    if (gr) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    /* additive light pass */
    this.drawLights(t);
    this.drawRays(t);

    /* bubbles + emotes above everything */
    if (this.o.bubbles !== false) for (const n of this.npcs) if (n.room === this.roomId && n.bubble) this.drawBubble(n);
    for (const n of this.npcs) if (n.room === this.roomId && n.emote && !n.bubble) this.drawEmote(n);
    if (!this.trans && this.near) this.drawPrompt(this.av.x, this.av.y - 12, t);
    ctx.restore();

    /* screen-space: rain, vignette, dusk breath, transition */
    if (this.weather.raining && this.room().rainable) this.drawRain(ctx, t);
    this.drawVignette(ctx);
    /* The "dusk breath" that used to live here is gone. It was a grade already
       — a one-phase one, painted after the lights so it dimmed them. Its job
       moved into room.grade() above, where the lights punch through it, and
       its 78-second breathing is carried there as an amplitude term. */
    if (this.trans) this.drawTransition(ctx, now);
  }

  px(x, y, w, h, c) { const ctx = this.ctx; ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0)); }

  /* ---------- background baking: layers + near ---------- */
  buildBg() {
    const P = this.P, room = this.room(), W = Math.max(this.o.width, room.width | 0), H = this.o.height, wB = this.o.wallBase;
    /* parallax layers */
    this._layers = [];
    if (room.layers) {
      for (const L of room.layers) {
        const lw = Math.max(this.o.width, Math.round(this.o.width + (room.width - this.o.width) * L.speed) + 2);
        const cv = document.createElement('canvas'); cv.width = lw; cv.height = H;
        const lctx = cv.getContext('2d'); lctx.imageSmoothingEnabled = false;
        const facade = { px: (x, y, w2, h2, c) => { lctx.fillStyle = c; lctx.fillRect(x | 0, y | 0, Math.max(1, w2 | 0), Math.max(1, h2 | 0)); }, P, ctx: lctx };
        L.bake(facade, lw, H);
        this._layers.push({ cv, speed: L.speed });
      }
    }
    /* near layer */
    let c = this._bg; if (!c) c = this._bg = document.createElement('canvas');
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const real = this.ctx; this.ctx = c.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, W, H);
    if (!room.outdoor) {
      this.px(0, 0, W, H, P.ceiling);
      const g = this.ctx.createLinearGradient(0, 38, 0, wB); g.addColorStop(0, P.wallHi); g.addColorStop(1, P.wallLo);
      this.ctx.fillStyle = g; this.ctx.fillRect(0, 38, W, wB - 38);
      this.px(0, 50, W, 2, P.trim); this.px(0, 52, W, 1, P.trimDk);
      this.px(0, wB - 7, W, 7, P.base); this.px(0, wB - 7, W, 1, P.baseHi);
      this.px(0, wB, W, H - wB, P.floor);
      let bi = 0;
      for (let y = wB; y < H - 4; y += 15) { this.px(0, y, W, 14, bi % 2 ? P.floor2 : P.floor); this.px(0, y, W, 1, 'rgba(239,233,220,0.035)'); this.px(0, y + 14, W, 1, 'rgba(0,0,0,0.24)'); bi++; }
      for (let i = 0; i < 7; i++) { this.ctx.fillStyle = 'rgba(0,0,0,' + (0.19 - i * 0.026) + ')'; this.ctx.fillRect(0, wB + i, W, 1); }
    }
    if (typeof room.bg === 'function') {
      const facade = { px: (x, y, w2, h2, cc) => this.px(x, y, w2, h2, cc), P, ctx: this.ctx };
      room.bg(facade, room.width, H);
    }
    this.ctx = real; this.bgRoom = this.roomId;
  }
  blitBg() {
    if (this.bgRoom !== this.roomId || !this._bg) this.buildBg();
    const ctx = this.ctx, cam = this.camX;
    if (this._layers) for (const L of this._layers) ctx.drawImage(L.cv, Math.round(cam * (1 - L.speed)), 0);
    /* Only the slice the camera can see. This used to composite the whole
       backdrop every frame regardless of camX — 2240x600 for a 1530 window,
       i.e. a third of the frame's largest single operation spent off-screen. */
    const sw = Math.min(this._bg.width, this.o.width), sx0 = Math.max(0, Math.min(this._bg.width - sw, Math.round(cam)));
    ctx.drawImage(this._bg, sx0, 0, sw, this._bg.height, sx0, 0, sw, this._bg.height);
  }

  /* ---------- lighting ---------- */
  drawLights(t) {
    const lights = this.room().lights; if (!lights || !lights.length) return;
    const ctx = this.ctx;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      let a = L.a;
      if (L.flicker === 1) a *= 0.85 + 0.15 * Math.sin(t * 6.3 + L.x);
      else if (L.flicker === 2) a *= 0.72 + 0.2 * Math.sin(t * 2.2 + L.x * 0.1) + 0.08 * Math.sin(t * 9.1);
      /* A two-stop radial gradient falls off LINEARLY, which means the alpha
         is still dropping at a constant rate when it hits zero at r. The eye
         reads that discontinuity as an edge — Mach banding — so a light stops
         being a glow and becomes a disc with a rim, and three overlapping ones
         become one distinct oval lying on the floor.

         Four stops approximating (1-t)^2 instead: same peak, but the curve
         arrives at zero with zero slope, so there is no boundary to see. It
         also carries about a third less total light for the same alpha, which
         is most of why the room got quieter along with the shapes. */
      const g = ctx.createRadialGradient(L.x, L.y, 2, L.x, L.y, L.r);
      g.addColorStop(0, 'rgba(' + L.c + ',' + a.toFixed(3) + ')');
      g.addColorStop(0.25, 'rgba(' + L.c + ',' + (a * 0.5625).toFixed(3) + ')');
      g.addColorStop(0.55, 'rgba(' + L.c + ',' + (a * 0.2025).toFixed(3) + ')');
      g.addColorStop(0.8, 'rgba(' + L.c + ',' + (a * 0.04).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + L.c + ',0)');
      ctx.fillStyle = g; ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    ctx.restore();
  }
  drawRays(t) {
    const rays = this.room().rays; if (!rays || !rays.length) return;
    const ctx = this.ctx;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const R of rays) {
      const a = R.a * (0.8 + 0.2 * Math.sin(t * 0.5 + R.x));
      const c = R.c || '242,220,176';   /* a ray carries its own colour, so the hour can set it */
      const g = ctx.createLinearGradient(R.x, R.y, R.x + R.dx, R.y + R.len);
      g.addColorStop(0, 'rgba(' + c + ',' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(R.x - R.w / 2, R.y); ctx.lineTo(R.x + R.w / 2, R.y);
      ctx.lineTo(R.x + R.dx + R.w * 0.8, R.y + R.len); ctx.lineTo(R.x + R.dx - R.w * 0.8, R.y + R.len);
      ctx.closePath(); ctx.fill();
      /* motes drifting down the ray */
      for (let i = 0; i < 6; i++) {
        const f = ((t * (0.05 + i * 0.013) + i * 0.37) % 1);
        const mx = R.x + R.dx * f + Math.sin(t * 0.9 + i * 4) * (3 + f * 6);
        const my = R.y + R.len * f;
        ctx.fillStyle = 'rgba(' + c + ',' + (0.25 * (1 - f) * (0.5 + 0.5 * Math.sin(t * 1.4 + i))).toFixed(3) + ')';
        ctx.fillRect(mx, my, 1, 1);
      }
    }
    ctx.restore();
  }
  drawRain(ctx, t) {
    ctx.save(); ctx.strokeStyle = 'rgba(200,214,230,0.16)'; ctx.lineWidth = 1;
    const W = this.o.width, H = this.o.height;
    ctx.beginPath();
    for (let i = 0; i < 64; i++) {
      const rx = ((i * 97 + Math.floor(t * (170 + (i % 5) * 22)) * 0.4) % (W + 30)) - 15;
      const ry = ((i * 53 + t * (240 + (i % 7) * 30)) % (H + 20)) - 10;
      ctx.moveTo(rx, ry); ctx.lineTo(rx - 1.5, ry + 7);
    }
    ctx.stroke(); ctx.restore();
  }

  spotlight(cx, on) {
    const ctx = this.ctx, top = 44, bot = this.o.wallBase;
    const g = ctx.createLinearGradient(cx, top, cx, bot);
    g.addColorStop(0, on ? 'rgba(242,220,176,0.13)' : 'rgba(242,220,176,0.05)'); g.addColorStop(1, 'rgba(242,220,176,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - 6, top); ctx.lineTo(cx + 6, top); ctx.lineTo(cx + 40, bot); ctx.lineTo(cx - 40, bot); ctx.closePath(); ctx.fill();
  }
  doorway(cx, label, hot) {
    const P = this.P, ctx = this.ctx, w = 62, top = 62, h = this.o.wallBase - top, x = cx - w / 2, y = top, b = y + h;
    this.px(x - 6, y - 7, w + 12, h + 7, P.trim); this.px(x - 6, y - 7, w + 12, 2, P.trimHi); this.px(x + w + 4, y - 7, 2, h + 7, P.trimDk);
    this.px(x, y, w, b - y, '#0a070d');
    const g = ctx.createLinearGradient(0, y, 0, b); g.addColorStop(0, hot ? 'rgba(242,220,176,0.20)' : 'rgba(242,220,176,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, b - y);
    this.px(x - 7, y - 18, w + 14, 12, P.ceiling); this.px(x - 7, y - 18, w + 14, 1, hot ? P.glow : P.trimHi);
    ctx.fillStyle = hot ? '#fffdf7' : P.ink; ctx.font = CANVAS_TYPE.label; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label || 'DOOR', cx, y - 11); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  drawVignette(ctx) {
    /* a room may scale the vignette by the hour — it closes in at night and
       opens at noon. The gradient itself is still built once. */
    const m = this.room().vig, a = m == null ? 1 : m;
    if (a <= 0.02) return;
    if (!this._vig) { const W = this.o.width, H = this.o.height, g = ctx.createRadialGradient(W / 2, H * 0.47, 96, W / 2, H / 2, H * 0.95); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.44)'); this._vig = g; }
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = this._vig; ctx.fillRect(0, 0, this.o.width, this.o.height);
    ctx.restore();
  }
  drawTransition(ctx, now) {
    const tr = this.trans, e = clamp((now - tr.t0) / tr.dur, 0, 1);
    const cx = this.av.x - this.camX, cy = this.av.y - 12, maxR = 460, r = tr.phase === 'out' ? maxR * (1 - e) : maxR * e;
    ctx.fillStyle = '#0a070d'; ctx.beginPath(); ctx.rect(0, 0, this.o.width, this.o.height); ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2, true); ctx.fill('evenodd');
  }

  /* ---------- sprites ---------- */
  drawAvatar(t) {
    const ctx = this.ctx, P = this.P, a = this.av, x = Math.round(a.x), y = Math.round(a.y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 15, 8, 3, 0, 0, 6.2832); ctx.fill();
    ctx.save(); ctx.translate(x, y + 14); ctx.scale(a.dir, 1);
    const fr = a.moving ? a.frame : 0;
    const off = [0, 2, 3, 0, -2, -3][fr], bob = a.moving ? [0, -1, -1, 0, -1, -1][fr] : Math.round(Math.sin(t * 2.2) * 0.5 - 0.5);
    this.px(-3 - off, -7, 3, 7, '#181218'); this.px(0 + off, -7, 3, 7, '#1d151d');
    const by = -19 + bob;
    this.px(-4, by, 9, 12, '#262029'); this.px(-4, by, 2, 11, '#332b36'); this.px(3, by, 2, 12, '#181218');
    this.px(-3, by - 1, 7, 2, P.glow);
    const hy = -27 + bob;
    this.px(-2, hy, 6, 7, '#cdc8ba'); this.px(3, hy, 1, 7, '#948e80');
    this.px(-2, hy - 1, 6, 2, '#1d1a24');
    this.px(-2, hy - 2, 6, 2, P.accent); this.px(-1, hy - 3, 4, 1, P.accent); this.px(4, hy - 1, 3, 1, P.accent);
    ctx.restore();
  }
  drawNpc(n, t) {
    const ctx = this.ctx, x = Math.round(n.x), y = Math.round(n.y);
    const sitting = n.state === 'sit';
    const flicker = n.temp ? 0.78 + Math.sin(t * 9 + 1) * 0.1 : 1;
    ctx.save();
    if (n.temp) ctx.globalAlpha = flicker;
    /* five's occasional glitch */
    let glitch = 0;
    if (n.def.glitch) { const ph = (t + x * 0.01) % 7.3; if (ph < 0.09) glitch = 1; }
    ctx.fillStyle = 'rgba(0,0,0,0.24)'; ctx.beginPath(); ctx.ellipse(x, y + 15, 8, 3, 0, 0, 6.2832); ctx.fill();
    ctx.translate(x + (glitch ? (Math.random() < 0.5 ? -1 : 1) : 0), y + 14 + (sitting ? 4 : 0)); ctx.scale(n.dir, 1);
    const fr = n.moving ? n.frame : 0, off = [0, 2, 3, 0, -2, -3][fr];
    const bob = n.moving ? [0, -1, -1, 0, -1, -1][fr] : Math.round(Math.sin(t * 1.6 + x * 0.13) * 0.5 - 0.5);
    const F = n.feature, C = n.color;
    const body = n.temp ? '#948e80' : '#282130', bodyHi = n.temp ? '#aca696' : '#352c3d', bodyDk = '#181218';
    const skin = '#cdc8ba', skinDk = '#948e80';
    if (sitting) { this.px(-3, -5, 3, 5, '#181218'); this.px(0, -5, 3, 5, '#1d151d'); }
    else { this.px(-3 - off, -7, 3, 7, '#181218'); this.px(0 + off, -7, 3, 7, '#1d151d'); }
    const by = (sitting ? -17 : -19) + bob;
    this.px(-4, by, 9, 12, body); this.px(-4, by, 2, 11, bodyHi); this.px(3, by, 2, 12, bodyDk);
    const hy = by - 8;
    this.px(-2, hy, 6, 7, skin); this.px(3, hy, 1, 7, skinDk);
    if (F === 'beret') {
      this.px(-2, hy - 1, 6, 1, '#282130');
      this.px(-3, hy - 3, 7, 3, C); this.px(-4, hy - 2, 2, 2, C); this.px(1, hy - 4, 2, 1, C);
      this.px(-3, by + 3, 7, 2, '#403646');
    } else if (F === 'book') {
      this.px(-2, hy - 2, 6, 2, '#4a4452'); this.px(-3, hy - 1, 2, 1, '#4a4452');
      this.px(4, by + 4, 4, 6, C); this.px(5, by + 5, 2, 4, '#efe9dc');
      this.px(-4, by - 1, 9, 2, '#352c3d');
    } else if (F === 'pencil') {
      this.px(-2, hy - 1, 6, 2, '#3d3644');
      this.px(3, hy + 1, 4, 1, C);
      this.px(-4, by + 5, 9, 2, C); this.px(-1, by + 4, 3, 4, '#403646');
    } else if (F === 'hood') {
      this.px(-3, hy - 2, 8, 3, C); this.px(-3, hy - 1, 2, 6, C); this.px(4, hy - 1, 1, 6, C);
      this.px(-4, by, 9, 3, C); this.px(-4, by + 2, 9, 1, 'rgba(0,0,0,0.25)');
    } else if (F === 'halo') {
      this.px(-2, hy - 1, 6, 1, '#d8d4c8');
      this.px(-2, hy - 4, 6, 1, C);
    } else if (F === 'pale') {
      this.px(-2, hy - 1, 6, 1, '#e8e2d4');
    }
    if (glitch) {
      ctx.globalAlpha = 0.4;
      this.px(-5, hy + 2, 10, 1, '#5eead4'); this.px(-5, by + 6, 10, 1, '#f2a3c0');
      ctx.globalAlpha = n.temp ? flicker : 1;
    }
    ctx.restore();
  }
  drawCat(t) {
    const c = this.cat, ctx = this.ctx, x = Math.round(c.x), y = Math.round(c.y);
    ctx.save(); ctx.translate(x, y + 14); ctx.scale(c.dir, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 1, 6, 2, 0, 0, 6.2832); ctx.fill();
    const fur = '#2a2320', furHi = '#3a3029';
    if (c.state === 'curl') {
      this.px(-5, -5, 10, 5, fur); this.px(-4, -6, 8, 2, furHi);
      this.px(2, -7, 4, 3, fur); this.px(3, -8, 1, 1, fur); this.px(5, -8, 1, 1, fur);
      const tw = Math.sin(t * 1.2) > 0.7 ? 1 : 0; this.px(-6, -4 + tw, 2, 2, fur);
    } else {
      const walk = c.state === 'go' ? Math.round(Math.sin(t * 10)) : 0;
      this.px(-5, -6, 9, 4, fur); this.px(-5, -7, 9, 2, furHi);
      this.px(-4, -2, 2, 2 + (walk > 0 ? 0 : 0), fur); this.px(2, -2, 2, 2, fur);
      this.px(3, -9, 4, 4, fur); this.px(3, -10, 1, 2, fur); this.px(6, -10, 1, 2, fur);
      const tl = Math.round(Math.sin(t * 2.1) * 2);
      this.px(-7, -8 + tl, 2, 1, fur); this.px(-6, -7 + tl, 1, 2, fur);
      if (c.state === 'sit') { this.px(-5, -4, 9, 4, fur); }
    }
    ctx.restore();
  }
  drawBubble(n) {
    const ctx = this.ctx, lines = n.bubble.lines;
    const lh = 13, pad = 6, nameH = 14;
    ctx.font = CANVAS_TYPE.speech;
    const lineWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
    ctx.font = CANVAS_TYPE.speechName;
    const nameWidth = ctx.measureText(n.name.toUpperCase()).width;
    const w = Math.ceil(Math.max(lineWidth, nameWidth)) + pad * 2 + 2;
    const h = nameH + lines.length * lh + pad * 2;
    const roomW = this.rooms[n.room].width;
    let bx = clamp(Math.round(n.x - w / 2), 3, roomW - w - 3);
    let by = Math.round(n.y - 27 - 14 - h);
    this.px(bx, by, w, h, 'rgba(10,9,12,0.97)');
    ctx.strokeStyle = 'rgba(245,243,237,0.58)'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    this.px(bx, by, 2, h, n.color);
    ctx.fillStyle = '#f7f4ec'; ctx.font = CANVAS_TYPE.speechName; ctx.textBaseline = 'top';
    ctx.fillText(n.name.toUpperCase(), bx + pad + 1, by + pad);
    this.px(bx + pad, by + pad + 11, w - pad * 2, 1, 'rgba(245,243,237,0.20)');
    const tx = clamp(Math.round(n.x) - 1, bx + 3, bx + w - 5);
    this.px(tx, by + h, 3, 2, 'rgba(10,9,12,0.97)'); this.px(tx + 1, by + h + 2, 1, 1, 'rgba(10,9,12,0.97)');
    ctx.fillStyle = '#f7f4ec'; ctx.font = CANVAS_TYPE.speech; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + pad + 1, by + pad + nameH + i * lh));
    ctx.textBaseline = 'alphabetic';
  }
  drawEmote(n) {
    const ctx = this.ctx, x = Math.round(n.x), y = Math.round(n.y) - 34;
    ctx.fillStyle = 'rgba(247,244,236,0.94)'; ctx.font = CANVAS_TYPE.emote;
    ctx.textAlign = 'center'; ctx.fillText(n.emote.g, x, y); ctx.textAlign = 'left';
  }
  drawPrompt(sx, sy, t) {
    const P = this.P, bob = Math.round(Math.sin(t * 5) * 1.5), x = Math.round(sx) - 6, y = Math.round(sy) - 26 + bob;
    this.px(x, y, 13, 11, P.ceiling); this.px(x + 1, y + 1, 11, 9, P.ink); this.px(x + 5, y + 11, 3, 2, P.ceiling);
    this.px(x + 6, y + 3, 2, 4, P.accent); this.px(x + 6, y + 8, 2, 2, P.accent);
  }
}

function wrap(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      lines.push(cur.trim()); cur = w;
      if (lines.length === maxLines) { lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1) + '\u2026'; return lines; }
    } else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, maxLines);
}
