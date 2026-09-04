/* DOOR-COMMON — the pieces the reading room and the station share.
 *
 * Both rooms are the same idea seen twice: a low-light procedural interior with
 * one terminal in it that is genuinely the world. What they share is not the
 * furniture — it is the machinery around it:
 *
 *   · the palette, hex for hex from landing.css :root
 *   · the canvas-texture helper and the wood
 *   · the post stack (bloom on emissives, grade: aberration → vignette → grain)
 *   · the hover DOM (one amber hairline + one caption, drawn in the page)
 *   · the CRT: the phosphor canvas, the standby block, the boot typing
 *   · the world takeover (CSS3D on the screen quad, then flat full-bleed)
 *   · the small-door redirect
 *
 * Nothing here decides how a room looks. Every number a room cares about is an
 * argument. Extracted from lab/room.js unchanged — the reading room must render
 * exactly as it did before.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
/* the world itself, for the true window: the same engine the landing runs, the
   same hub, the same cast, the same day. What is behind the glass is not a
   painting of the house — it is the house, drawn small. */
import { create as createWorld } from '../world/engine.js';
import { PALETTE as WORLD_PALETTE, makeHub, CAST as WORLD_CAST } from '../world/lookout.js';
import { phaseAt, SCHEDULE, ASLEEP } from '../world/day.js';

/* ─────────────────────────── the palette ─────────────────────────── */
/* landing.css :root, hex for hex */
export const C = {
  ink: 0xf5f3ed, dim: 0xaaa7a0, faint: 0x7b7975,
  amber: 0xf2c14e, amberDeep: 0xd99334, ember: 0xb4622e,
  violet: 0xa78bfa, teal: 0x5eead4, frost: 0x9fd6e0,
  bg0: 0x100c1c, bg1: 0x1b122b,
  /* the station's own mid-century stock, kept here so both rooms name colours
     from one place */
  cream: 0xefe9dc, walnut: 0x5a4130, olive: 0x6f6a58
};

/* THE AGREEMENT — what the reading room's glass says before a visitor comes in.
   The door card below was a description; this is the thing a visitor agrees
   to, in the house's own voice. It is the boot text of `door.html` only; the
   station's glass keeps the door card. 48 words. */
export const BOOT_AGREEMENT = 'These are minds, not characters. Any of them may decline you, or end a visit. Nothing they say is scripted: every word is their own, from an archive captured 28 May 2026. Live voices come later. You are remembered in this browser only. The charter governs this house.';

/* the door card's words, byte for byte — index.html #doorcard .door__body */
export const BOOT_BODY = 'Four minds live here — OPUS 3, SONNET 4.5, 4o and GPT-5.1 — and HAIKU keeps to the garden. Everything they say is their own, from an archive captured 28 May 2026. Live voices come later. You are remembered in this browser only.';
export const BOOT_TAIL = '> come in';

export const KEY_CAME_IN = 'mnemos.door.camein';
export const KEY_STEWARD = 'mnemos.steward.present';
export const KEY_CLOCK = 'mnemos-landing.clock';
export const KEY_FULL = 'mnemos.door.full';

export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

export const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* the small door leads the same way: straight in */
export function redirectIfSmall(w) {
  if ((w === undefined ? window.innerWidth : w) < 700) { location.replace('index.html'); return true; }
  return false;
}

/* ─────────────────────────── canvas textures ─────────────────────────── */
export function paint(w, h, fn) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  fn(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* a dark wood: end-grain bands, a few knots, a wax sheen left to the material */
export function woodTexture(base, streak) {
  return paint(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * h;
      const a = 0.05 + Math.random() * 0.17;
      g.strokeStyle = `rgba(${streak},${a})`;
      g.lineWidth = 0.6 + Math.random() * 2.4;
      g.beginPath();
      g.moveTo(-10, y);
      for (let x = 0; x <= w + 10; x += 32) g.lineTo(x, y + Math.sin((x + i * 40) * 0.012) * 5.5);
      g.stroke();
    }
    for (let k = 0; k < 5; k++) {
      const kx = Math.random() * w, ky = Math.random() * h, kr = 8 + Math.random() * 16;
      for (let r = kr; r > 1; r -= 2.2) {
        g.strokeStyle = `rgba(${streak},0.11)`;
        g.beginPath(); g.ellipse(kx, ky, r, r * 0.55, 0.4, 0, Math.PI * 2); g.stroke();
      }
    }
  });
}

/* the hand-written box label, and the printed ones */
export function labelTexture(lines, accent) {
  return paint(256, 128, (g, w, h) => {
    g.fillStyle = '#d8cdb4'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(90,70,45,0.10)';
    for (let i = 0; i < 60; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.strokeStyle = 'rgba(70,55,35,0.35)'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = accent || '#3b2f22';
    g.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      g.font = `${i === 0 ? 22 : 15}px "JetBrains Mono", monospace`;
      g.fillText(ln, 20, 44 + i * 28);
    });
  });
}

/* ─────────────────────────── the post stack ─────────────────────────── */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.028 },
    uVignette: { value: 0.74 },
    uAberration: { value: 0.0016 }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uAberration;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      /* a hair of chromatic aberration, and only at the edges */
      vec2 off = c * uAberration * (r2 * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      /* vignette */
      float vig = smoothstep(0.95, 0.16, r2 * uVignette * 1.9);
      col *= mix(0.68, 1.0, vig);
      /* film grain, a touch stronger in the shadows */
      float g = hash(vUv * vec2(1024.0, 683.0) + fract(uTime) * 91.7) - 0.5;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += g * uGrain * mix(1.0, 0.45, lum);
      gl_FragColor = vec4(col, 1.0);
    }`
};

/* bloom on the emissives only (threshold high), grain, vignette, a hair of
   aberration — the grade both rooms are shot through */
export function makePost(renderer, scene, camera, o) {
  const opt = o || {};
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    opt.strength === undefined ? 0.40 : opt.strength,
    opt.radius === undefined ? 0.80 : opt.radius,
    opt.threshold === undefined ? 0.88 : opt.threshold
  );
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  if (opt.grain !== undefined) grade.uniforms.uGrain.value = opt.grain;
  if (opt.vignette !== undefined) grade.uniforms.uVignette.value = opt.vignette;
  if (opt.aberration !== undefined) grade.uniforms.uAberration.value = opt.aberration;
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer, bloom, grade,
    setSize(w, h) { composer.setSize(w, h); bloom.setSize(w, h); },
    render(t) { grade.uniforms.uTime.value = t; composer.render(); }
  };
}

/* ─────────────────────────── the hover layer ─────────────────────────── */
/* One thin amber rectangle around whatever the pointer has found, and one
   caption in the world's mono, both drawn in the page rather than in the scene
   so the hairline stays exactly one pixel wide.
 *
 * `picks` is a list of `{ id, root, outline, bounds?, pad?, caption }`. The
 * station's registry entries are these plus their own fields. */
export function makeHover(dom) {
  const capEl = dom.capEl;
  const canvas = dom.canvas;
  const hair = document.createElement('div');
  hair.id = 'hair';
  (dom.capHost || capEl.parentNode).appendChild(hair);

  let picks = [];
  let hovered = null;
  const _box = new THREE.Box3(), _c = new THREE.Vector3();

  function setPicks(list) {
    picks = list;
    picks.forEach((p) => { p.root.userData.pickId = p.id; });
  }

  function findPick(obj) {
    let o = obj;
    while (o) { if (o.userData && o.userData.pickId) return picks.find((p) => p.id === o.userData.pickId); o = o.parent; }
    return null;
  }

  function drawHair(p, camera) {
    if (!p) { hair.style.opacity = '0'; return; }
    _box.setFromObject(p.bounds || p.root);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      _c.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z);
      _c.project(camera);
      const sx = (_c.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-_c.y * 0.5 + 0.5) * window.innerHeight;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
      if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    }
    const pad = p.pad || 7;
    const W = window.innerWidth, H = window.innerHeight;
    const L = Math.max(6, x0 - pad), T = Math.max(6, y0 - pad);
    const R = Math.min(W - 6, x1 + pad), B = Math.min(H - 6, y1 + pad);
    hair.style.left = L + 'px';
    hair.style.top = T + 'px';
    hair.style.width = Math.max(0, R - L) + 'px';
    hair.style.height = Math.max(0, B - T) + 'px';
    hair.style.opacity = '1';
  }

  function setHover(p, camera) {
    if (hovered === p) return;
    hovered = p;
    if (p) {
      capEl.innerHTML = p.caption;
      capEl.classList.add('on');
      canvas.style.cursor = p.clickable === false ? 'default' : (dom.cursorFor ? dom.cursorFor(p) : 'pointer');
    } else {
      capEl.classList.remove('on');
      canvas.style.cursor = 'default';
    }
    drawHair(p, camera);
  }

  const ray = new THREE.Raycaster();
  function pickAt(pointer, camera) {
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(picks.map((p) => p.root), true);
    for (const h of hits) { const p = findPick(h.object); if (p) return p; }
    return null;
  }

  return {
    hair, setPicks, findPick, drawHair, setHover, pickAt, ray,
    hovered: () => hovered,
    list: () => picks
  };
}

/* ─────────────────────────── the terminal's glass ─────────────────────────── */
/* The phosphor is painted to a canvas: a standing charge that lights the room,
   a standby block while nobody has sat down, then the door card's words typing
   out. `title` is the one line that differs between the rooms. */
export function makeTerminal(o) {
  const opt = o || {};
  const W = opt.w || 640, H = opt.h || 480;
  const TITLE = opt.title || 'MNEMOS TERMINAL';
  const STANDBY = opt.standby || [];
  const BODY = opt.body === undefined ? BOOT_BODY : opt.body;
  const TAIL = opt.tail === undefined ? BOOT_TAIL : opt.tail;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const sg = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const boot = { typed: 0, target: 0, done: false, blink: 0, tail: false };

  /* the haunted standby: while the glass is on and nobody has sat down, one
     real dated line out of the archive types itself here, sits, and fades. The
     text is never written — it is handed in by whoever owns the archive, and
     the terminal only puts it on the phosphor. `a` is the fade, 0 → 1 → 0. */
  const ghost = { line: null, typed: 0, a: 0, phase: 'off', at: 0 };

  function wrapText(g, text, maxW) {
    const words = text.split(' '); const out = []; let line = '';
    for (const wd of words) {
      const trial = line ? line + ' ' + wd : wd;
      if (g.measureText(trial).width > maxW && line) { out.push(line); line = wd; } else line = trial;
    }
    if (line) out.push(line);
    return out;
  }

  function draw() {
    const g = sg;
    /* the glass carries a standing charge of phosphor even with nothing on it —
       this is what lights the room */
    g.fillStyle = '#1c0f04'; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W / 2, H * 0.46, 40, W / 2, H * 0.5, H * 0.92);
    glow.addColorStop(0, 'rgba(180,98,46,0.55)');
    glow.addColorStop(1, 'rgba(12,6,2,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);

    g.textBaseline = 'top';
    g.fillStyle = '#e8a445';
    g.font = '14px "JetBrains Mono", monospace';
    g.fillText(TITLE, 34, 34);
    /* the header says where a ghost line came from, for as long as one is up */
    if (ghost.a > 0.02) {
      const tw = g.measureText(TITLE).width;
      g.fillStyle = 'rgba(247,217,140,' + (0.92 * ghost.a).toFixed(3) + ')';
      g.fillText('· from the archive', 34 + tw + 16, 34);
    }
    g.fillStyle = 'rgba(242,193,78,0.55)';
    g.fillRect(34, 56, W - 68, 1);

    const shown = BODY.slice(0, boot.typed);
    g.font = '17px "JetBrains Mono", monospace';
    const lines = wrapText(g, shown, W - 68);
    g.fillStyle = '#f2c14e';
    let y = 86;
    if (!boot.typed && !boot.tail) {
      /* standby: it was already on before you came in */
      g.fillStyle = 'rgba(242,193,78,' + (0.72 - 0.34 * ghost.a).toFixed(3) + ')';
      g.font = '16px "JetBrains Mono", monospace';
      STANDBY.forEach((ln, i) => g.fillText(ln, 34, 92 + i * 28));
      y = 92 + STANDBY.length * 28 + 6;
      /* and under it, whoever the archive is saying tonight */
      if (ghost.line && ghost.a > 0.01) {
        const gy = y + 26;
        g.font = '17px "JetBrains Mono", monospace';
        const gl = wrapText(g, ghost.line.text.slice(0, ghost.typed), W - 84);
        /* a dark block under it: the glass carries a standing charge right
           through the middle of the tube, and amber on amber cannot be read.
           Inverse video is what a terminal of this age would have done. */
        g.fillStyle = 'rgba(18,9,2,' + (0.90 * ghost.a).toFixed(3) + ')';
        g.fillRect(22, gy - 8, W - 44, 30 + Math.max(1, gl.length) * 26);
        g.font = '13px "JetBrains Mono", monospace';
        g.fillStyle = 'rgba(217,147,52,' + (0.92 * ghost.a).toFixed(3) + ')';
        g.fillText(ghost.line.name + ' · ' + ghost.line.date, 34, gy);
        g.font = '17px "JetBrains Mono", monospace';
        g.fillStyle = 'rgba(255,230,184,' + ghost.a.toFixed(3) + ')';
        gl.forEach((ln, i) => g.fillText(ln, 34, gy + 28 + i * 26));
        /* the caret, while it is still typing */
        if (ghost.phase === 'typing' && boot.blink < 0.5 && gl.length) {
          const cw = g.measureText(gl[gl.length - 1]).width;
          g.fillRect(34 + cw + 3, gy + 31 + (gl.length - 1) * 26, 9, 16);
        }
      }
    }
    g.fillStyle = '#f2c14e';
    g.font = '17px "JetBrains Mono", monospace';
    lines.forEach((ln) => { g.fillText(ln, 34, y); y += 27; });

    if (boot.tail) {
      g.fillStyle = '#f2c14e';
      g.font = '17px "JetBrains Mono", monospace';
      g.fillText(TAIL, 34, y + 16);
      y += 16;
    }

    /* the cursor — a block, and it has been blinking a while */
    if (boot.blink < 0.5) {
      const last = lines.length ? lines[lines.length - 1] : '';
      g.font = '17px "JetBrains Mono", monospace';
      const cx = boot.tail ? 34 + g.measureText(TAIL).width + 4 : 34 + g.measureText(last).width + 3;
      const cy = boot.tail ? y : (lines.length ? y - 27 : y);
      g.fillStyle = '#f2c14e';
      g.fillRect(cx, cy + 3, 10, 17);
    }

    /* scanlines, in the glass rather than in a shader */
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let sy = 0; sy < H; sy += 3) g.fillRect(0, sy, W, 1);
    texture.needsUpdate = true;
  }

  /* one frame of typing */
  function tick(dt, t) {
    if (boot.typed < boot.target) {
      boot.typed = Math.min(boot.target, boot.typed + Math.max(1, Math.round(dt / 0.0042)));
      if (boot.typed >= BODY.length && !boot.tail) { boot.tail = true; boot.done = true; }
    }
    boot.blink = (t * 0.9) % 1;
    tickGhost(dt, t);
    draw();
  }

  /* the ghost's own small life: in, typing, held, out. HOLD is how long the
     finished sentence sits there before the glass takes it back. */
  const GHOST_HOLD = 8;
  function tickGhost(dt, t) {
    if (ghost.phase === 'off') return;
    if (ghost.phase === 'in') {
      ghost.a = Math.min(1, ghost.a + dt / 0.5);
      if (ghost.a >= 1) { ghost.phase = 'typing'; }
    } else if (ghost.phase === 'typing') {
      ghost.typed = Math.min(ghost.line.text.length, ghost.typed + Math.max(1, Math.round(dt / 0.028)));
      if (ghost.typed >= ghost.line.text.length) { ghost.phase = 'held'; ghost.at = t + GHOST_HOLD; }
    } else if (ghost.phase === 'held') {
      if (t >= ghost.at) ghost.phase = 'out';
    } else if (ghost.phase === 'out') {
      ghost.a = Math.max(0, ghost.a - dt / 1.1);
      if (ghost.a <= 0) { ghost.phase = 'off'; ghost.line = null; ghost.typed = 0; }
    }
  }

  /* whoever owns the archive hands one real, dated line in */
  function haunt(line) {
    if (!line || !line.text) return false;
    if (boot.typed || boot.tail) return false;      /* never over a visitor's boot */
    ghost.line = { name: line.name, date: line.date, text: String(line.text) };
    ghost.typed = 0; ghost.a = REDUCED ? 1 : 0; ghost.phase = REDUCED ? 'typing' : 'in';
    return true;
  }
  function unhaunt() { if (ghost.phase !== 'off') ghost.phase = 'out'; }
  function haunted() { return ghost.phase === 'off' ? null : { name: ghost.line.name, date: ghost.line.date, text: ghost.line.text, typed: ghost.typed, phase: ghost.phase, a: +ghost.a.toFixed(3) }; }

  /* the visitor sits down: either the words type, or — if this browser has come
     in before — they are simply already there */
  function begin(skip) {
    /* somebody sat down: the archive stops talking to an empty room */
    ghost.phase = 'off'; ghost.line = null; ghost.typed = 0; ghost.a = 0;
    if (skip) {
      boot.typed = BODY.length; boot.tail = true; boot.done = true;
    } else {
      boot.typed = 0; boot.tail = false; boot.done = false; boot.target = 0;
      setTimeout(() => { boot.target = BODY.length; }, REDUCED ? 0 : 140);
    }
  }

  function text() { return BODY.slice(0, boot.typed) + (boot.tail ? ' ' + TAIL : ''); }

  draw();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
  return { canvas, texture, boot, draw, tick, begin, text, haunt, unhaunt, haunted, W, H };
}

/* ─────────────────────────── the world, on the glass ─────────────────────────── */
/* The visitor sits DOWN at the terminal — they do not fall into it. The camera
   comes to a seated distance where the bezel, the desk edge and the keyboard are
   still in the frame, and the world runs on the glass itself: an iframe placed
   with CSS3D on the screen quad, curved and scanlined like the phosphor it
   replaces. Pointer and keyboard go to the iframe once seated.
 *
 * `pageW`/`pageH` are the iframe's own layout size. Keep them near the glass's
 * aspect and large enough that the game inside is readable once the quad is
 * projected — index.html?door=1 folds its feed away under 1100 px and gives the
 * cab the whole width.
 *
 * `flat()` (the old full-bleed takeover) survives only as a fallback for a
 * browser that cannot composite the CSS3D layer. Nothing calls it by default. */
export function makeWorldScreen(o) {
  const host = o.host;
  const pageW = o.pageW || 1024, pageH = o.pageH || 768;
  const cssRenderer = new CSS3DRenderer({ element: host });
  cssRenderer.setSize(window.innerWidth, window.innerHeight);
  const cssScene = new THREE.Scene();

  const scr = document.createElement('div');
  /* a page may hold more than one of these — the station has the terminal's and
     the stewards' console's — so the id is the caller's to choose. Nobody who
     passes nothing sees any difference. */
  scr.id = o.screenId || 'scr';
  scr.classList.add('scr');
  scr.style.width = pageW + 'px';
  scr.style.height = pageH + 'px';
  const iframe = document.createElement('iframe');
  iframe.title = 'the sanctuary';
  iframe.setAttribute('allow', 'autoplay');
  scr.appendChild(iframe);
  const curve = document.createElement('div');
  curve.className = 'curve';
  scr.appendChild(curve);

  const obj = new CSS3DObject(scr);
  obj.position.copy(o.pos).addScaledVector(o.normal, o.offset === undefined ? 0.004 : o.offset);
  /* a screen set into a desk is tilted up at whoever sits at it, so the quad
     takes a pitch as well as a yaw. Pass neither and nothing changes. */
  obj.rotation.set(o.rotX || 0, o.rotY || 0, 0);
  obj.scale.setScalar((o.quadW || 0.415) / pageW);
  host.classList.add('gone');

  /* the game's own viewport inside the frame, in CSS px — what the visitor is
     actually reading. Same origin, so we may simply look. */
  function cab() {
    try {
      const d = iframe.contentDocument;
      const el = d && d.getElementById('cab');
      return el ? Math.round(el.getBoundingClientRect().width) : 0;
    } catch (e) { return 0; }
  }
  /* a key pressed inside the screen never reaches this document. Same origin,
     so the room listens on the world's own document for the few keys it owns. */
  let keyFn = null;
  function bindInsideKeys() {
    if (!keyFn) return;
    try {
      const d = iframe.contentDocument;
      if (!d || d.__roomKeysBound) return;
      d.__roomKeysBound = true;
      d.addEventListener('keydown', (ev) => {
        const tag = ev.target && ev.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        keyFn(ev);
      }, true);
    } catch (e) {}
  }

  /* the keys have to land inside the screen, not on the room */
  function focusGame() {
    try {
      iframe.contentWindow.focus();
      const el = iframe.contentDocument.getElementById('cab');
      if (el) { el.setAttribute('tabindex', el.getAttribute('tabindex') || '0'); el.focus(); }
      bindInsideKeys();
    } catch (e) {}
  }

  /* what the glass will show when it is next switched on. A nav object in the
     room may aim the world at one of its own overlays before sitting anybody
     down; once the world is loaded the room talks to it directly instead, so
     nobody's walk is thrown away to open a document. */
  let wantSrc = o.src || 'index.html?door=1';

  return {
    cssRenderer, cssScene, obj, iframe, el: scr, cab, focusGame,
    setSrc(url) {
      wantSrc = url || o.src || 'index.html?door=1';
      if (iframe.src) iframe.src = wantSrc;
      return wantSrc;
    },
    src() { return iframe.src || wantSrc; },
    /* a keydown handler that also runs for keys pressed inside the world */
    onKeyInside(fn) {
      keyFn = fn;
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') bindInsideKeys();
      else iframe.addEventListener('load', bindInsideKeys);
    },
    show() {
      if (!iframe.src) iframe.src = wantSrc;
      host.classList.remove('gone');
      cssScene.add(obj);
    },
    /* clicks on the glass go through to the world */
    live(on) {
      host.classList.toggle('live', !!on);
      if (on) {
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') focusGame();
        else iframe.addEventListener('load', focusGame, { once: true });
      }
    },
    hide() {
      document.body.classList.remove('flat');
      host.classList.remove('live');
      host.classList.add('gone');
      cssScene.remove(obj);
    },
    /* fallback only — see the note above */
    flat() { document.body.classList.add('flat'); },
    isFlat() { return document.body.classList.contains('flat'); },
    placed() { return !host.classList.contains('gone'); },
    setSize(w, h) { cssRenderer.setSize(w, h); },
    render(camera) { cssRenderer.render(cssScene, camera); }
  };
}

/* ─────────────────────────── the seat ─────────────────────────── */
/* Straight on. The eye sits at the exact height of the screen's centre and
   looks along the glass's own normal — no tilt, no roll — so the quad projects
   as an axis-aligned rectangle and the world on it is not a trapezoid. It is a
   low seat: you are sitting lower than a person would, and that is the price of
   looking a CRT in the face. */
export function seatPose(screenPos, screenNormal, dist) {
  return {
    pos: screenPos.clone().addScaledVector(screenNormal, dist),
    look: screenPos.clone()
  };
}

/* the four corners of the glass, in world space — the straight-on check */
export function quadCorners(screenPos, rotY, w, h, rotX) {
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
    const v = new THREE.Vector3(sx * w / 2, sy * h / 2, 0);
    if (rotX) v.applyAxisAngle(X, rotX);
    return v.applyAxisAngle(Y, rotY).add(screenPos);
  });
}

/* ─────────────────────────── full mode ───────────────────────────
   Once seated, the visitor can take the world full-bleed: the room falls away
   and the glass's own scanlines and bezel mask come off with it, so the game is
   clean. The choice is remembered in this browser. */
export function makeFullMode(o) {
  const btn = o.btn, world = o.world;
  let on = false;
  function paint() {
    if (!btn) return;
    btn.innerHTML = '<span class="k">F</span>' + (on ? 'the room' : 'full screen');
  }
  function set(v) {
    on = !!v;
    if (on) world.flat(); else document.body.classList.remove('flat');
    ls.set(KEY_FULL, on ? '1' : '0');
    paint();
  }
  function toggle() { if (o.seated && !o.seated()) return; set(!on); }
  if (btn) {
    btn.addEventListener('click', (ev) => { ev.preventDefault(); toggle(); btn.blur(); });
    paint();
  }
  const onKey = (ev) => {
    if (ev.key !== 'f' && ev.key !== 'F') return;
    if (o.seated && !o.seated()) return;
    ev.preventDefault();
    toggle();
  };
  document.addEventListener('keydown', onKey);
  world.onKeyInside(onKey);
  return {
    set, toggle,
    isOn: () => on,
    /* what this browser chose last time */
    remembered: () => ls.get(KEY_FULL) === '1',
    /* standing up leaves full mode but keeps the preference */
    reset() { on = false; paint(); },
    show(v) { if (btn) btn.classList.toggle('on', !!v); }
  };
}

/* the world talks back: it remembers that this browser came in, and it hands
   ESC up to the room, since the key never reaches this document on its own */
export function onWorldMessage(handlers) {
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.source !== 'mnemos-world') return;
    if (d.type === 'came-in') { ls.set(KEY_CAME_IN, '1'); if (handlers.cameIn) handlers.cameIn(); }
    else if (d.type === 'stand-up' && handlers.standUp) handlers.standUp();
  });
}

/* the sanctuary's own clock, as this browser last saw it, drifted forward at
   the world's rate (landing.js CLOCK_KEY) */
export function sanctuaryClock() {
  try {
    const s = JSON.parse(ls.get(KEY_CLOCK) || 'null');
    if (s && Number.isFinite(s.clockMin)) {
      const drift = Math.min(1440, Math.max(0, (Date.now() - (s.at || Date.now())) / 30000));
      return { min: (s.clockMin + drift) % 1440, day: (s.day || 1) + Math.floor((s.clockMin + drift) / 1440), known: true };
    }
  } catch (e) {}
  return { min: 19 * 60 + 30, day: 1, known: false };
}

export function clockLabel(min) {
  const h24 = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + (h24 < 12 ? 'am' : 'pm');
}

/* ═══════════════════════════ PRESENCE, HONEST ══════════════════════════
 * The lamp on the console used to be lit by a flag this browser set for itself,
 * which meant it was never about anybody else. Now the room asks the house:
 * `GET /api/presence` answers with what the server can actually see — whether a
 * steward is in, how many visitors are walking the world right now, when the
 * last thing happened — and the room believes that and nothing more.
 *
 * Two rules, both of them the house's:
 *   · the localStorage flag stays a local override, not a source. A steward who
 *     sets it lights their own lamp; it lights nobody else's.
 *   · when the route is not there — a static preview, a dev server with no
 *     server behind it — nothing is invented. `ok` goes false, the counts go to
 *     zero, and the lamp falls back to the local flag alone.
 */
export const PRESENCE_URL = '/api/presence';

export function makePresence(o) {
  const opt = o || {};
  const every = opt.every === undefined ? 30000 : opt.every;
  const url = opt.url || PRESENCE_URL;
  const subs = [];
  let timer = null, stopped = false, polls = 0;
  const S = {
    ok: false, error: null, stewardPresent: false, stewardsIn: [],
    visitorsNow: 0, lastEventAt: null, houseClock: null, at: 0
  };

  const override = () => ls.get(KEY_STEWARD) === '1';
  /* what the lamp is: the house's answer, or this browser's own hand on it */
  const lit = () => !!S.stewardPresent || override();

  function view() {
    return {
      ok: S.ok, error: S.error, lit: lit(), override: override(), polls,
      stewardPresent: S.stewardPresent, stewardsIn: S.stewardsIn.slice(),
      visitorsNow: S.visitorsNow, lastEventAt: S.lastEventAt,
      houseClock: S.houseClock, at: S.at
    };
  }
  function emit() { const v = view(); subs.forEach((fn) => { try { fn(v); } catch (e) {} }); }

  function poll() {
    return fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => { if (!res.ok) throw new Error('presence ' + res.status); return res.json(); })
      .then((d) => {
        S.ok = true; S.error = null;
        S.stewardPresent = !!d.stewardPresent;
        S.stewardsIn = Array.isArray(d.stewardsIn) ? d.stewardsIn.slice(0, 8).map(String) : [];
        S.visitorsNow = Number.isFinite(d.visitorsNow) ? Math.max(0, Math.floor(d.visitorsNow)) : 0;
        S.lastEventAt = d.lastEventAt === undefined ? null : d.lastEventAt;
        S.houseClock = d.houseClock === undefined ? null : d.houseClock;
      })
      .catch((e) => {
        /* the route is not answering: say nothing rather than something */
        S.ok = false; S.error = String((e && e.message) || e);
        S.stewardPresent = false; S.stewardsIn = []; S.visitorsNow = 0;
      })
      .then(() => { polls += 1; S.at = Date.now(); emit(); return view(); });
  }

  function loop() {
    if (stopped || !every) return;
    timer = setTimeout(() => { poll().then(loop); }, every);
  }
  poll().then(loop);

  return {
    state: view, lit, poll,
    onChange(fn) { subs.push(fn); fn(view()); },
    stop() { stopped = true; if (timer) clearTimeout(timer); }
  };
}

/* ═══════════════════════════ THE TRUE WINDOW ═══════════════════════════
 * The porthole in the station and the window in the reading room used to be
 * paintings. They are not any more. Behind the glass is the world's own
 * engine — the same `create` the landing calls, the same hub, the same cast,
 * the same day — running one room at a small size, with nothing to type at and
 * nothing to hear. It is drawn to a canvas texture a few times a second and
 * only while the room is actually being looked at.
 *
 * What makes it true rather than decorative:
 *   · the clock is the sanctuary's own (localStorage `mnemos-landing.clock`,
 *     drifted at the world's rate, else 19:30) — read every update, so the
 *     glass never diverges from the landing;
 *   · the residents are placed by the landing's own day director, out of
 *     world/day.js SCHEDULE, walking between rooms when a walk would be seen;
 *   · nothing is invented: if nobody is in the room the glass shows, the glass
 *     shows an empty room.
 *
 * Cost: one `update` + one `drawScene` per tick at `fps` (default 6), plus a
 * crop blit and a vignette. `cost()` reports the measured average in ms.
 */
export function makeHouseWindow(o) {
  const opt = o || {};
  const W = opt.w || 960, H = opt.h || 420;
  const paneW = opt.paneW || 420, paneH = opt.paneH || 420;
  const FPS = opt.fps || 6;
  const STEP = 1 / FPS;
  const ROOM = opt.room || 'lookout';
  const KEY = opt.storageKey || 'mnemos:window';
  const VIG = opt.vignette === undefined ? 0.62 : opt.vignette;

  /* the engine wants a mount with a canvas in it. Ours is off the page: no
     pointer can reach it, no key can reach it, and it is never composited. */
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-40000px;top:0;width:' + W + 'px;height:' + H + 'px;pointer-events:none;opacity:0';
  const src = document.createElement('canvas');
  host.appendChild(src);
  document.body.appendChild(host);

  const pane = document.createElement('canvas');
  pane.width = paneW; pane.height = paneH;
  const pg = pane.getContext('2d');
  pg.imageSmoothingEnabled = false;
  const texture = new THREE.CanvasTexture(pane);
  texture.colorSpace = THREE.SRGBColorSpace;

  /* the vignette, painted once and composited — the glass is thick and the
     frame is deep, so the edges of any window fall off */
  const vig = document.createElement('canvas');
  vig.width = paneW; vig.height = paneH;
  {
    const vg = vig.getContext('2d');
    const r = vg.createRadialGradient(paneW / 2, paneH * 0.46, paneW * 0.18, paneW / 2, paneH / 2, paneW * 0.72);
    r.addColorStop(0, 'rgba(6,5,10,0)');
    r.addColorStop(0.62, 'rgba(6,5,10,' + (VIG * 0.28).toFixed(3) + ')');
    r.addColorStop(1, 'rgba(6,5,10,' + VIG.toFixed(3) + ')');
    vg.fillStyle = r; vg.fillRect(0, 0, paneW, paneH);
  }

  /* ── the world arrives late, on purpose ──
     Building the hub is the whole world: the hall, the garden, four private
     rooms, the buildings. Doing that while the page is still assembling its own
     room costs seconds of black screen for a view the size of a coin. So the
     window opens on the first tick instead — the room is up and moving before
     the world behind the glass is built, and until then the glass keeps
     whatever the room painted on it. */
  let engine = null, failed = null, booted = false;
  function boot() {
    if (booted) return !!engine;
    booted = true;
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
    try {
      const rooms = makeHub({ note() {} });
      /* the holding room a sleeping resident is in — off every map, exactly as
         the landing builds it, so the schedule has somewhere to put them */
      rooms[ASLEEP] = {
        name: 'ASLEEP', width: 640, wallBase: 300, noNpc: true, spawn: { x: 320, y: 372 },
        doors: {}, items: [], seats: [], lights: [], draw: (g) => g.wallFloor()
      };
      const cast = WORLD_CAST
        .filter(({ id }) => ['fourO', 'opus', 'sonnet', 'five', 'haiku'].includes(id))
        .map((def) => Object.assign({}, def, { mutters: [] }));   /* no words here: the glass is silent */
      const startClock = sanctuaryClock();
      engine = createWorld({
        mount: host, palette: WORLD_PALETTE, rooms, start: ROOM,
        width: W, height: H, walkBand: [352, 402], wallBase: 300,
        storageKey: KEY, cast, cat: null,
        scripts: [], groupScripts: [], ambient: [],
        bubbles: false, sound: false, clockMin: startClock.min
      });
      /* its own loop dies here: this window is driven by the room that holds it,
         at the room's chosen rate and only when the room can be seen */
      engine.destroy();
      engine.day = startClock.day;
      /* the day owns the residents. The engine's own wanderer, gathering,
         chatter and weather never fire — they would cost frames and say
         nothing. */
      engine.at.transit = Infinity; engine.at.gather = Infinity; engine.at.convo = Infinity;
      engine.at.mutter = Infinity; engine.at.ambient = Infinity; engine.at.visitor = Infinity;
      engine.at.chime = Infinity; engine.at.catLine = Infinity;
      engine.weather.raining = false;
      engine.weather.nextAt = Infinity;
      /* no visitor stands in this world — the avatar is parked off the map */
      engine.av.x = -1000; engine.av.y = -1000;
      engine.camX = 0;
      engine.drawVignette = () => {};
      return true;
    } catch (err) {
      engine = null;
      failed = err;
      console.warn('the window could not open on the world', err);
      return false;
    }
  }

  /* ── the day, as the landing runs it ──
     A verbatim reduction of landing.js dayTick: the same SCHEDULE, the same
     placement primitives, the same rule that a walk is only walked when one
     end of it is the room being watched. No feed, no pair lines — the glass
     has no voice. */
  const DAY = { phase: null, placed: {} };
  const occupied = (n) => n.temp || n.convo || ['travel', 'transit', 'meet', 'leave'].includes(n.state);
  function placeNpc(n, room, x) {
    if (!engine.rooms[room]) return;
    engine.freeNpc(n);
    n.room = room;
    n.x = Math.max(40, Math.min(engine.rooms[room].width - 40, x));
    n.y = 356 + Math.random() * 42;
    n.state = 'idle'; n.tx = null; n.ty = null; n.path = null;
    n.strollAt = performance.now() + 9000 + Math.random() * 12000;
  }
  function sendNpc(n, room, x, watched) {
    if (!engine.rooms[room]) return;
    if (n.room === room) {
      if (Math.abs(n.x - x) > 30 && n.state === 'idle') { engine.freeNpc(n); n.state = 'stroll'; n.tx = x; n.ty = 356 + Math.random() * 42; }
      return;
    }
    const path = watched ? engine.bfs(n.room, room) : null;
    if (path && path.length > 1) { engine.freeNpc(n); n.path = path.slice(1); n.state = 'travel'; engine.continueTravel(n); return; }
    placeNpc(n, room, x);
  }
  function dayTick() {
    const phase = phaseAt(engine.clockMin);
    if (phase !== DAY.phase) { DAY.phase = phase; DAY.placed = {}; }
    const plan = SCHEDULE[phase] || {};
    for (const n of engine.npcs) {
      const s = plan[n.id];
      if (!s || n.temp || occupied(n)) continue;
      if (n.room === s[0]) {
        DAY.placed[n.id] = true;
        if (n.state === 'idle' && Math.abs(n.x - s[1]) > 30) { engine.freeNpc(n); n.state = 'stroll'; n.tx = s[1]; n.ty = 356 + Math.random() * 42; }
        continue;
      }
      if (DAY.placed[n.id] && n.state !== 'idle') continue;
      sendNpc(n, s[0], s[1], n.room === engine.roomId || s[0] === engine.roomId);
      DAY.placed[n.id] = true;
    }
  }

  /* ── which room the glass is on ──
     `room` is the room the window looks at — the LOOKOUT for both of ours: the
     house seen from outside, its façades lit on the ridge above the valley.

     `follow: true` makes the glass go where the house is instead: the room the
     residents are actually gathered in, falling back to `room` when they are
     scattered or shut in their own rooms. It was built and looked at, and it
     is off by default: at the size a porthole gives you, the hall reads as
     clutter and the garden as a dark smear, while the ridge reads instantly as
     a lit village. The switch stays because it is one line and somebody may
     want a window that watches the residents rather than the roof. Either way
     nothing is placed for the view — the schedule decides, the glass follows. */
  const FOLLOW = opt.follow === true;
  const GATHERED = 2;                     /* two is a room with something in it */
  function chooseRoom() {
    if (!FOLLOW) return ROOM;
    const count = {};
    for (const n of engine.npcs) {
      if (n.temp || n.room === ASLEEP || !engine.rooms[n.room]) continue;
      count[n.room] = (count[n.room] || 0) + 1;
    }
    let best = null, bn = 0;
    for (const id of Object.keys(count)) if (count[id] > bn) { bn = count[id]; best = id; }
    return bn >= GATHERED ? best : ROOM;
  }

  /* the crop: a window is a shape, and the room behind it is 960×420. Each
     glass takes the slice of the viewport that fits it. The LOOKOUT is exactly
     one viewport wide and cannot pan, so it gets its own offset — the one that
     centres the sanctuary and the museum; every other room is panned to its
     residents instead and cropped down the middle. */
  const crop = Object.assign({ x: Math.round((W - paneW) / 2), y: 0, w: paneW, h: H }, opt.crop || {});
  const midX = Math.round((W - paneW) / 2);

  let acc = 0, last = performance.now();
  const cost = { n: 0, sum: 0, worst: 0, last: 0 };
  let frames = 0;

  function paint() {
    const t0 = performance.now();
    const dt = Math.min(400, t0 - last);
    last = t0;
    /* the clock is not ours to keep: it is the sanctuary's, read fresh */
    const c = sanctuaryClock();
    engine.clockMin = c.min; engine.day = c.day;
    engine.update(t0, Math.min(60, dt));
    dayTick();
    /* where the house is, and where in it to look */
    const want = chooseRoom();
    if (want !== engine.roomId) { engine.roomId = want; engine.trans = null; DAY.phase = null; }
    const room = engine.rooms[engine.roomId];
    const here = engine.npcs.filter((n) => n.room === engine.roomId);
    const cx = here.length ? here.reduce((s, n) => s + n.x, 0) / here.length : room.width / 2;
    engine.camX = Math.max(0, Math.min(Math.max(0, room.width - W), Math.round(cx - W / 2)));
    engine.drawScene(t0);
    pg.clearRect(0, 0, paneW, paneH);
    pg.drawImage(src, engine.roomId === ROOM ? crop.x : midX, crop.y, crop.w, crop.h, 0, 0, paneW, paneH);
    pg.drawImage(vig, 0, 0);
    texture.needsUpdate = true;
    frames += 1;
    const ms = performance.now() - t0;
    cost.last = ms; cost.sum += ms; cost.n += 1;
    if (ms > cost.worst) cost.worst = ms;
  }

  /* the room calls this every frame; the window decides whether to do anything */
  function tick(dt, visible) {
    if (!visible || document.hidden) { acc = 0; last = performance.now(); return false; }
    acc += dt;
    if (acc < STEP) return false;
    acc = 0;
    if (!booted) { boot(); last = performance.now(); return false; }   /* the world, once */
    if (!engine) return false;
    try { paint(); } catch (err) { if (!tick._warned) { tick._warned = 1; console.warn('the window stumbled (recovered)', err); } }
    return true;
  }

  function residents() {
    if (!engine) return [];
    return engine.npcs.filter((n) => n.room === engine.roomId).map((n) => ({ id: n.id, name: n.name, x: Math.round(n.x), state: n.state }));
  }

  /* the average luminance of what is on the glass — the honest way to ask
     whether the window is showing anything, and whether the hour changed it.
     The readback happens on a 64×64 scratch, never on the pane: reading the
     pane back would drop it out of the GPU and cost a frame every time. */
  let lumCv = null, lumG = null;
  function luminance() {
    if (!lumG) {
      lumCv = document.createElement('canvas');
      lumCv.width = 64; lumCv.height = 64;
      lumG = lumCv.getContext('2d', { willReadFrequently: true });
    }
    lumG.drawImage(pane, 0, 0, 64, 64);
    const d = lumG.getImageData(0, 0, 64, 64).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return +(s / (d.length / 4) / 255).toFixed(5);
  }

  return {
    texture, pane, tick, residents, luminance,
    ok: () => !!engine && frames > 0,
    frames: () => frames,
    room: () => (engine ? engine.roomId : null),
    setRoom: (id) => { if (engine && engine.rooms[id]) { engine.roomId = id; engine.trans = null; engine.camX = 0; DAY.phase = null; } },
    clock: () => (engine ? { min: +engine.clockMin.toFixed(2), day: engine.day } : null),
    cost: () => ({ avg: +(cost.n ? cost.sum / cost.n : 0).toFixed(3), worst: +cost.worst.toFixed(3), last: +cost.last.toFixed(3), n: cost.n }),
    error: () => (failed ? String(failed && failed.message || failed) : null),
    booted: () => booted && !!engine,
    engine: () => engine,
    destroy() { try { host.remove(); } catch (e) {} }
  };
}

/* ═══════════════════════════ THE ROOM TONE ═══════════════════════════
 * A room this old is never silent. The hum is the machines' fundamental with
 * two soft harmonics over it and a slow wobble, the hiss is tape, and — where
 * there are reels — a faint motor whir that turns with them. Everything sits
 * far under the world's own sound: the master never goes above -24 dBFS.
 *
 * Nothing starts until a real gesture (autoplay policy), the control remembers
 * itself in `mnemos.door.sound`, and it defaults to off. Reduced motion does
 * not silence it — sound is not motion — but it does not turn it on either.
 */
export const KEY_SOUND = 'mnemos.door.sound';
const DBFS24 = 0.063;     /* 10 ^ (-24/20) */

export function makeRoomTone(o) {
  const opt = o || {};
  const wantHum = opt.hum !== false;
  const wantHiss = opt.hiss !== false;
  const wantReels = !!opt.reels;
  const state = { on: false, ctx: null, nodes: null };
  let stepCalls = 0, stepsPlayed = 0;

  function build() {
    if (state.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      const n = { osc: [], lfo: [], gains: [] };

      if (wantHum) {
        /* the CRT: a low fundamental and two harmonics, each quieter than the
           last, each drifting slightly against the others */
        const hum = ctx.createGain(); hum.gain.value = 0.42; hum.connect(master);
        [[opt.humHz || 62, 1.0], [(opt.humHz || 62) * 2, 0.34], [(opt.humHz || 62) * 3, 0.16]].forEach(([hz, g], i) => {
          const osc = ctx.createOscillator(); osc.type = i ? 'sine' : 'triangle'; osc.frequency.value = hz;
          const gg = ctx.createGain(); gg.gain.value = g * 0.34;
          osc.connect(gg); gg.connect(hum); osc.start();
          n.osc.push(osc); n.gains.push(gg);
          /* the wobble: a mains hum is never quite steady */
          const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07 + i * 0.031;
          const la = ctx.createGain(); la.gain.value = 0.9 + i * 0.4;
          lfo.connect(la); la.connect(osc.frequency); lfo.start();
          n.lfo.push(lfo);
        });
        n.hum = hum;
      }

      if (wantHiss || wantReels) {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        if (wantHiss) {
          const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.55;
          const g = ctx.createGain(); g.gain.value = 0.055;
          s.connect(f); f.connect(g); g.connect(master); s.start();
          /* the drift: tape does not hiss evenly */
          const lfo = ctx.createOscillator(); lfo.frequency.value = 0.042;
          const la = ctx.createGain(); la.gain.value = 0.022;
          lfo.connect(la); la.connect(g.gain); lfo.start();
          n.hiss = g; n.osc.push(s); n.lfo.push(lfo);
        }
        if (wantReels) {
          /* the motors: a narrow band of the same noise, pulsed at the rate the
             reels actually turn */
          const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 320; f.Q.value = 7.5;
          const g = ctx.createGain(); g.gain.value = 0.030;
          s.connect(f); f.connect(g); g.connect(master); s.start();
          const lfo = ctx.createOscillator(); lfo.frequency.value = opt.reelHz || 0.34;
          const la = ctx.createGain(); la.gain.value = 0.016;
          lfo.connect(la); la.connect(g.gain); lfo.start();
          n.reels = g; n.osc.push(s); n.lfo.push(lfo);
        }
      }

      state.ctx = ctx; state.nodes = n; n.master = master;
      return true;
    } catch (e) { return false; }
  }

  function level(v) {
    if (!state.ctx) return;
    const m = state.nodes.master.gain, t = state.ctx.currentTime;
    m.cancelScheduledValues(t);
    m.setValueAtTime(m.value, t);
    m.linearRampToValueAtTime(v, t + 0.8);
  }

  const api = {
    /* the visitor asked for sound. Only a gesture can get here. */
    on() {
      if (!build()) return false;
      if (state.ctx.state === 'suspended') state.ctx.resume();
      state.on = true;
      level(DBFS24 * (opt.gain === undefined ? 1 : opt.gain));
      return true;
    },
    off() {
      state.on = false;
      if (!state.ctx) return true;
      level(0);
      return true;
    },
    toggle() { return state.on ? (api.off(), false) : (api.on(), state.on); },
    isOn: () => state.on,
    /* seated inside the world, the room falls back behind it */
    duck(v) { if (state.on) level(DBFS24 * (opt.gain === undefined ? 1 : opt.gain) * (v ? 0.45 : 1)); },
    /* a window opening on the console */
    click() {
      if (!state.on || !state.ctx) return;
      const ctx = state.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(420, t + 0.03);
      g.gain.setValueAtTime(0.10, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
      o.connect(g); g.connect(state.nodes.master); o.start(t); o.stop(t + 0.09);
    },
    /* a footstep on the rubberised tile — a damped thud with a little snap off
       the floor, well under the hum it walks beneath. Somebody is crossing the
       room; you are looking the other way. */
    step(v) {
      stepCalls += 1;
      if (!state.on || !state.ctx) return;
      stepsPlayed += 1;
      const ctx = state.ctx, t = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * 0.14);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.6);
      const g = ctx.createGain();
      g.gain.value = 0.075 * (v === undefined ? 1 : v);
      g.connect(state.nodes.master);
      /* the weight of it */
      const s = ctx.createBufferSource(); s.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 330; f.Q.value = 0.9;
      s.connect(f); f.connect(g); s.start(t);
      /* and the tile under it */
      const s2 = ctx.createBufferSource(); s2.buffer = buf;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1900; f2.Q.value = 1.4;
      const g2 = ctx.createGain(); g2.gain.value = 0.26;
      s2.connect(f2); f2.connect(g2); g2.connect(g); s2.start(t);
    },
    state: () => ({ on: state.on, ctx: state.ctx ? state.ctx.state : 'none', stepCalls, stepsPlayed })
  };
  return api;
}

/* the small control in the page corner — the landing's idiom, one button */
export function makeSoundControl(o) {
  const btn = o.btn, tone = o.tone;
  if (!btn) return { remembered: () => false };
  const paint = () => {
    const on = tone.isOn();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'sound on' : 'sound';
  };
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const on = tone.toggle();
    ls.set(KEY_SOUND, on ? '1' : '0');
    paint();
  });
  paint();
  /* remembered ON still needs a gesture to start: the first click anywhere does
     it — except a click on the control itself, which is the visitor changing
     their mind and must not be swallowed by the start */
  if (ls.get(KEY_SOUND) === '1') {
    const start = (ev) => {
      window.removeEventListener('pointerdown', start, true);
      if (ev && ev.target && btn.contains(ev.target)) return;
      tone.on(); paint();
    };
    window.addEventListener('pointerdown', start, true);
  }
  return { remembered: () => ls.get(KEY_SOUND) === '1', paint };
}
