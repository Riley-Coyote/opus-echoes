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

/* the door card's words, byte for byte — index.html #doorcard .door__body */
export const BOOT_BODY = 'Four minds live here — OPUS 3, SONNET 4.5, 4o and GPT-5.1 — and HAIKU keeps to the garden. Everything they say is their own, from an archive captured 28 May 2026. Live voices come later. You are remembered in this browser only.';
export const BOOT_TAIL = '> come in';

export const KEY_CAME_IN = 'mnemos.door.camein';
export const KEY_STEWARD = 'mnemos.steward.present';
export const KEY_CLOCK = 'mnemos-landing.clock';

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
    g.fillStyle = 'rgba(242,193,78,0.55)';
    g.fillRect(34, 56, W - 68, 1);

    const shown = BODY.slice(0, boot.typed);
    g.font = '17px "JetBrains Mono", monospace';
    const lines = wrapText(g, shown, W - 68);
    g.fillStyle = '#f2c14e';
    let y = 86;
    if (!boot.typed && !boot.tail) {
      /* standby: it was already on before you came in */
      g.fillStyle = 'rgba(242,193,78,0.72)';
      g.font = '16px "JetBrains Mono", monospace';
      STANDBY.forEach((ln, i) => g.fillText(ln, 34, 92 + i * 28));
      y = 92 + STANDBY.length * 28 + 6;
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
    draw();
  }

  /* the visitor sits down: either the words type, or — if this browser has come
     in before — they are simply already there */
  function begin(skip) {
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
  return { canvas, texture, boot, draw, tick, begin, text, W, H };
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
  scr.id = 'scr';
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
  obj.rotation.y = o.rotY || 0;
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
  /* the keys have to land inside the screen, not on the room */
  function focusGame() {
    try {
      iframe.contentWindow.focus();
      const el = iframe.contentDocument.getElementById('cab');
      if (el) { el.setAttribute('tabindex', el.getAttribute('tabindex') || '0'); el.focus(); }
    } catch (e) {}
  }

  return {
    cssRenderer, cssScene, obj, iframe, el: scr, cab, focusGame,
    show() {
      if (!iframe.src) iframe.src = o.src || 'index.html?door=1';
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
