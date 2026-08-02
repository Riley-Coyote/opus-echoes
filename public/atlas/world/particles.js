/* ============================================================================
   PARTICLES — Phase D of the elevation plan: the dynamic life systems.

   A living video-game world, not a quiet vitrine. One pooled engine owning
   every drifting, rising, wheeling, swimming thing on the island.

   THREE DRAW CLASSES (≤16 draws total, here we use ~4):
   · MOTES   — one additive soft-disc Points buffer (~5,000 pooled): fireflies
               in real clouds, the engram current off the record hall, the
               pavilion ember column, desk ink-glow, threshold attending light,
               moths spiralling the lanterns, the shooting star.
   · KOI     — one InstancedMesh of flat fish forms gliding under the pool
               shimmer; pale bodies with a faint emissive so they read at night.
   · BIRDS   — one InstancedMesh of low-poly delta billboards wheeling over the
               island on a shared boids-lite orbit, peeling to roost and
               relaunching; silhouettes against the sky band with a moonlit rim.
   · plus one falling-leaf Sprite.

   THE PARAMETRIC LAW — the static / reduced tier freezes at an arbitrary t, so
   nothing here integrates per-frame physics. Every position, alpha, size and
   instance matrix is a pure function of t and per-element seeds. GPU cycles are
   quantized to integer counts of a 2048-second wheel (uTimeW = t mod 2048): an
   integer number of cycles per wheel makes the wrap seamless and keeps float32
   sin() arguments small. CPU events (leaf, star, surge, the 5.2s breath, bird
   roosting, koi turns) are pure functions of float64 t delivered as uniforms or
   recomputed each frame — a frozen capture at any t is always a valid still.

   THE WIND is flora's: floraWind.value biases sway, floraWind.gust scatters the
   fireflies, leans the ember column, tilts the birds and carries the leaf — one
   breath across every system at once.

   PERFORMANCE — the limiter is additive OVERDRAW and draw calls, not point
   count; GPU instancing makes tens of thousands of points trivial. Counts are
   pushed hard; sprites are kept modest and bloom carries the glow. Tiers
   degrade COUNTS (never delete systems): at high, everything is present.
   Zero per-frame allocations — every buffer is preallocated and written in
   place. Reduced motion freezes all motion into a composed still.

   QA — ?fx=off disables everything (nothing is built).
   ?fx=fireflies,motes,embers,desk,threshold,moths,birds,koi,leaf,star,shimmer
   enables subsets. ?fxphase=0..1 pins the firefly density master (0 floor,
   1 peak). ?surge=1 pins the engram surge (motes bright + the caption clause).
   ?leaf=1 loops a leaf. ?star=1 loops the streak. ?fxgust=0..1 pins the gust
   into these systems only. State reports on window.__grounds.fx.

   The one outward hook: captionClause() returns the protected phrase
   "a memory consolidated while you were reading" during a surge window
   (≤ 1 clause per surge — the window is continuous) and null otherwise.
   grounds.js appends it in buildCaption; caption logic is otherwise untouched.
   ============================================================================ */

import * as THREE from "three";
import { floraWind } from "./flora.js";

/* ── deterministic rng + per-event hash ────────────────────────────────────── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashK(k, s) {
  const x = Math.sin(k * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* soft additive disc — the one sprite of the mote class */
function discTexture(size = 64) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/* a small pointed-oval leaf, white — tinted per tree by the material */
function leafTexture(size = 64) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.42);
  ctx.bezierCurveTo(size * 0.30, -size * 0.18, size * 0.26, size * 0.22, 0, size * 0.42);
  ctx.bezierCurveTo(-size * 0.26, size * 0.22, -size * 0.30, -size * 0.18, 0, -size * 0.42);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = size * 0.04;
  ctx.beginPath(); ctx.moveTo(0, -size * 0.36); ctx.lineTo(0, size * 0.36); ctx.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ── the wheel — all GPU cycles are integer counts of this period ──────────── */
const WHEEL = 2048;

/* ── mote counts (pool ~5,000; tier high shows the lot) ─────────────────────── */
const N_FLY = 2500;    /* fireflies — density master keeps ~1,500 alight   */
const N_MOTE = 520;    /* the engram current off the record hall roofline  */
const N_EMBER = 240;   /* the pavilion hearth column                       */
const N_DESK = 60;     /* ink-glow over the page                           */
const N_THRESH = 90;   /* the arriving path + gate lifts                   */
const N_MOTH = 220;    /* moths + a few butterflies at the lights          */
const N_GHOST = 80;    /* walk-shimmer — 4 figures × 20 trail samples      */
const N_STAR = 36;     /* the streak's head + tail                         */
const MOTE_TOTAL = N_FLY + N_MOTE + N_EMBER + N_DESK + N_THRESH + N_MOTH + N_GHOST + N_STAR;

/* ── creature counts ───────────────────────────────────────────────────────── */
const N_BIRD = 20;     /* the flock wheeling over the island               */
const N_KOI = 10;      /* the pool                                          */

/* mote-system ids (shader branch keys) */
const SYS = { fly: 0, mote: 1, ember: 2, desk: 3, thresh: 4, moth: 5, ghost: 6, star: 7 };

/* ── world anchors — measured against grounds.js coordinates ───────────────
   L0 0 · L1 1.25 · L2 2.5 · L3 3.75. record hall group (-2.2, L2, -6.0),
   roof band y≈4.0..4.4. pavilion lamp (0.6, L1+1.62, -0.4). desk page
   (2.52, L2+0.505, -4.15). threshold gate (3.8, L0, 7.9), door lamp y 2.52.
   pool (-2.6, 4.6, r 1.9), water surface y≈-0.05. sanctum crown ≈ (-6.6,
   L3+~5.0, -2.4). */
const HALL = { x0: -3.74, x1: -0.66, z0: -7.08, z1: -5.02, y0: 4.18, ySpan: 0.4 };
const PAV_LAMP = { x: 0.6, y: 2.52, z: -0.4 };
const DESK_PAGE = { x: 2.52, y: 3.03, z: -4.15 };
const GATE_LAMP = { x: 3.8, y: 2.52, z: 7.9 };
const POOL = { x: -2.6, z: 4.6, r: 1.9, y: -0.04 };
const SANCTUM_CROWN = { x: -6.6, y: 8.7, z: -2.4 };

/* lantern heads — moths orbit the nearest of these (grounds.js lantern() puts
   the head at base.y + 0.71; the threshold door lamp sits at y 2.52) */
const LANTERNS = [
  { x: -5.45, y: 1.25 + 0.71, z: 0.25 },
  { x: 5.25, y: 0.0 + 0.71, z: 2.7 },
  { x: 3.0, y: 0.0 + 0.71, z: 8.0 },
  { x: -2.3, y: 2.5 + 0.71, z: -4.55 },
  { x: -10.4, y: 1.25 + 0.71, z: -0.1 },
  { x: 1.95, y: 1.25 + 0.71, z: 0.75 },
  { x: 3.8, y: 2.52, z: 7.9 },
];

/* wildflower clusters — a few butterflies drift here (resident-hue beds) */
const FLOWER_BEDS = [
  { x: -8.0, y: 3.75, z: -3.2 }, { x: 7.1, y: 2.5, z: -5.5 },
  { x: -7.1, y: 0.0, z: 4.2 }, { x: 6.4, y: 0.0, z: 5.6 },
];

/* fallback lawn rects — kept in step with flora.js LAWNS (import preferred) */
const LAWNS_FALLBACK = [
  { x0: -0.9, x1: 3.4, z0: 5.7, z1: 8.4, y: 0.05, w: 1.0 },
  { x0: 6.6, x1: 9.1, z0: -1.9, z1: 1.1, y: 1.3, w: 0.72 },
  { x0: -9.3, x1: -6.1, z0: -8.2, z1: -4.6, y: 2.55, w: 1.0 },
  { x0: -8.3, x1: -5.6, z0: -3.9, z1: -2.4, y: 3.8, w: 0.5 },
  { x0: -9.7, x1: -7.6, z0: 6.6, z1: 8.3, y: 0.05, w: 0.42 },
];

/* canopy sources for the falling leaf and bird roosts */
const LEAF_TREES = [
  { x: -5.3, y: 0.94, z: 3.2, g: 0.0, c: 0x78ae74 },
  { x: 8.4, y: 0.82, z: 5.9, g: 0.0, c: 0x78ae74 },
  { x: -9.1, y: 3.5, z: -7.5, g: 2.5, c: 0x78ae74 },
  { x: -4.0, y: 0.79, z: 6.9, g: 0.0, c: 0xc98f86 },
  { x: 7.6, y: 1.9, z: -0.9, g: 1.25, c: 0xc98f86 },
  { x: -10.85, y: 3.1, z: 1.05, g: 1.25, c: 0x659a76 },
  { x: -8.55, y: 4.1, z: -5.05, g: 2.5, c: 0x659a76 },
  { x: 1.95, y: 1.6, z: 6.75, g: 0.0, c: 0x659468 },
  { x: 8.35, y: 2.65, z: -1.15, g: 1.25, c: 0x659468 },
  { x: 7.0, y: 2.75, z: -1.25, g: 1.25, c: 0x6c9c76 },
  { x: -4.55, y: 1.5, z: 5.75, g: 0.0, c: 0x5e8e78 },
];
/* perch points the flock peels to — treetops + the sanctum crown */
const PERCHES = [
  { x: SANCTUM_CROWN.x, y: SANCTUM_CROWN.y, z: SANCTUM_CROWN.z },
  { x: -5.3, y: 1.9, z: 3.2 }, { x: 8.4, y: 1.7, z: 5.9 },
  { x: -9.1, y: 4.4, z: -7.5 }, { x: 8.35, y: 3.6, z: -1.15 },
  { x: -10.85, y: 4.1, z: 1.05 },
];

/* event schedules — CPU float64, deterministic in t */
const SURGE_P = WHEEL / 9;            /* 227.6s — one surge per ~3.8 min      */
const SURGE_AT = SURGE_P - 46;
const SURGE_LEN = 20;
const STAR_P = 270, STAR_BASE = 90, STAR_JIT = 120, STAR_DUR = 0.6;
const LEAF_P = 48, LEAF_BASE = 8, LEAF_JIT = 22;   /* leaves fall oftener now */

const CLAUSE = "a memory consolidated while you were reading";

/* ── MOTE shader — every additive-disc system, one program ─────────────────── */
const MOTE_VERT = /* glsl */`
  attribute vec4 aSeed;
  attribute vec3 aColor;
  attribute vec4 aCfg;      /* x system id  y cull key  z aux  w aux2 */
  attribute vec4 aDyn;      /* per-system dynamics */
  attribute vec4 aAnchor;   /* xyz origin override + w spare (lantern/bed idx) */
  uniform float uTimeW;
  uniform float uBreath;
  uniform float uPx;
  uniform float uWindV;
  uniform float uGust;
  uniform vec2  uWindDir;
  uniform float uFly;
  uniform float uMote;
  uniform float uEmber;
  uniform float uDesk;
  uniform float uThresh;
  uniform float uMoth;
  uniform float uStarEnv;
  uniform vec3  uStarNdc;    /* head position, NDC (z left ~0 → in front) */
  uniform vec3  uStarStep;   /* per-rank NDC step back along the streak */
  uniform vec4  uCullA;      /* gates: fly, mote, ember, desk           */
  uniform vec4  uCullB;      /* gates: thresh, moth, ghost, star        */
  uniform vec4  uGhost[80];  /* xyz + alpha — CPU-sampled figure trails */
  varying vec4 vCol;

  const float TAU = 6.28318530718;
  const float G = ${(Math.PI * 2 / WHEEL).toFixed(11)};

  float gateOf(float key, float gate) { return step(key + 0.0001, gate); }
  float trap(float u, float a, float b, float c) {
    return smoothstep(0.0, a, u) * (1.0 - smoothstep(b, c, u));
  }

  void main() {
    float sys = aCfg.x;
    vec3 p = position;
    float alpha = 0.0;
    float size = 1.0;
    vec3 col = aColor;
    bool ndc = false;          /* star writes clip-space directly */

    if (sys < 0.5) {
      /* ── fireflies — clouds, layered depth, individual dim curves ── */
      float alive = smoothstep(aCfg.z - 0.05, aCfg.z + 0.05, uFly);
      float gate = gateOf(aCfg.y, uCullA.x);
      float w1 = uTimeW * aDyn.x * G;
      float w2 = uTimeW * aDyn.y * G;
      float w4 = uTimeW * (aDyn.y + 17.0) * G;
      float wy = uTimeW * aCfg.w * G;
      p.x += (0.24 + 0.20 * aSeed.z) * sin(w1 + aSeed.x * TAU)
           + 0.12 * sin(w2 + aSeed.y * TAU);
      p.z += (0.24 + 0.20 * aSeed.w) * sin(w1 + aSeed.y * TAU + 2.4)
           + 0.12 * sin(w4 + aSeed.z * TAU);
      p.y += aDyn.w + 0.36 * sin(wy + aSeed.w * TAU)
           + 0.12 * sin(w2 + aSeed.x * TAU);
      float hk = 0.5 + 0.5 * aSeed.y;
      p.x += (uWindV * 0.06 + uWindDir.x * uGust * (0.30 + 0.45 * aSeed.z)) * hk;
      p.z += uWindDir.y * uGust * (0.30 + 0.45 * aSeed.w) * hk;
      float f = fract(uTimeW * aDyn.z / 2048.0 + aSeed.y);
      float b = smoothstep(0.0, 0.16, f) * (1.0 - smoothstep(0.38, 0.60, f));
      alpha = alive * gate * b * 0.72;
      col = aColor * (0.50 + 0.95 * b);
      size = uPx * (1.6 + 2.3 * b) * (0.78 + 0.5 * aSeed.w);

    } else if (sys < 1.5) {
      /* ── engram motes — a real rising current off the roofline ── */
      float vis = smoothstep(aCfg.z - 0.04, aCfg.z + 0.04, uMote);
      float gate = gateOf(aCfg.y, uCullA.y);
      float u = fract(uTimeW * aDyn.x / 2048.0 + aSeed.x);
      p.y += u * aDyn.y;
      p.x += sin(aSeed.y * TAU + u * 2.6) * 0.16 + uWindV * 0.14 * u
           + uWindDir.x * uGust * 0.12 * u;
      p.z += sin(aSeed.z * TAU + u * 2.1) * 0.12 + uWindDir.y * uGust * 0.12 * u;
      alpha = vis * gate * trap(u, 0.08, 0.55, 0.97) * 0.62;
      col = aColor * (0.66 + 0.7 * smoothstep(0.25, 0.80, uMote));
      size = uPx * (1.9 + 0.9 * aSeed.w) * (1.0 - 0.22 * u);

    } else if (sys < 2.5) {
      /* ── pavilion embers — a fuller warm column ── */
      float gate = gateOf(aCfg.y, uCullA.z);
      float u = fract(uTimeW * aDyn.x / 2048.0 + aSeed.x);
      float r = aDyn.z * (0.4 + 0.95 * u);
      float ang = aSeed.y * TAU + u * (1.6 + 2.4 * aSeed.z);
      p.x += cos(ang) * r + (uWindV * 0.05 + uWindDir.x * uGust * 0.12) * u;
      p.z += sin(ang) * r + uWindDir.y * uGust * 0.12 * u;
      p.y += u * aDyn.y;
      alpha = uEmber * gate * trap(u, 0.10, 0.55, 0.95) * 0.7;
      col = aColor * (0.78 + 0.55 * (1.0 - u));
      size = uPx * (1.7 + 1.1 * aSeed.w) * (1.0 - 0.32 * u);

    } else if (sys < 3.5) {
      /* ── desk ink-glow — sparkle over the page, 5.2s pulse ── */
      float gate = gateOf(aCfg.y, uCullA.w);
      float ang = aSeed.x * TAU + uTimeW * aDyn.x * G;
      p.x += cos(ang) * aDyn.y;
      p.z += sin(ang) * aDyn.y * 0.7;
      p.y += 0.03 + 0.16 * aSeed.z + 0.04 * sin(uTimeW * aDyn.z * G + aSeed.w * TAU);
      float tw = 0.6 + 0.4 * sin(uTimeW * aDyn.w * G + aSeed.w * TAU);
      alpha = uDesk * gate * (0.35 + 0.65 * uBreath) * tw * 0.8;
      col = aColor * (0.66 + 0.5 * uBreath);
      size = uPx * (1.3 + 0.8 * aSeed.z);

    } else if (sys < 4.5) {
      /* ── threshold attending — up the arriving slabs, through the arch ── */
      float gate = gateOf(aCfg.y, uCullB.x);
      if (aCfg.z < 0.5) {
        float u = fract(uTimeW * aDyn.x / 2048.0 + aSeed.x);
        vec3 A = vec3(4.62, -0.50, 11.25);
        vec3 B = vec3(4.05,  0.06,  9.62);
        vec3 C = vec3(3.82,  0.50,  8.10);
        vec3 D = vec3(3.80,  0.95,  7.55);
        float s3 = u * 3.0;
        vec3 q = mix(A, B, clamp(s3, 0.0, 1.0));
        q = mix(q, C, clamp(s3 - 1.0, 0.0, 1.0));
        q = mix(q, D, clamp(s3 - 2.0, 0.0, 1.0));
        p = q;
        p.x += 0.16 * (aSeed.z - 0.5);
        p.y += 0.14 + 0.07 * sin(aSeed.y * TAU + u * 9.0);
        p.x += 0.08 * sin(aSeed.z * TAU + u * 7.0);
        alpha = uThresh * gate * trap(u, 0.12, 0.85, 0.99) * 0.7;
        col = aColor * 0.85;
        size = uPx * (2.2 + 0.8 * aSeed.w);
      } else {
        alpha = uThresh * gate * (0.22 + 0.14 * uBreath);
        col = aColor * 0.55;
        size = uPx * aCfg.w;
      }

    } else if (sys < 5.5) {
      /* ── moths + butterflies — spiral the nearest light / drift the beds ── */
      float gate = gateOf(aCfg.y, uCullB.y);
      /* aAnchor.xyz is the light or flower-bed centre this one is bound to */
      p = aAnchor.xyz;
      float spin = uTimeW * aDyn.x * G;          /* orbit rate */
      float rad = aDyn.y * (0.7 + 0.5 * sin(uTimeW * aDyn.z * G + aSeed.x * TAU));
      float yb = aDyn.w * sin(uTimeW * aDyn.z * G * 1.7 + aSeed.y * TAU);
      p.x += cos(spin + aSeed.z * TAU) * rad
           + 0.06 * sin(uTimeW * aDyn.x * 9.0 * G + aSeed.w * TAU);  /* flutter */
      p.z += sin(spin + aSeed.z * TAU) * rad * 0.82
           + uWindDir.y * uGust * 0.14;
      p.y += 0.10 + yb + 0.04 * sin(uTimeW * aDyn.x * 11.0 * G);
      float flick = 0.7 + 0.3 * sin(uTimeW * aDyn.x * 13.0 * G + aSeed.x * TAU);
      alpha = uMoth * gate * flick * 0.6;
      col = aColor;
      size = uPx * (1.5 + 1.0 * aSeed.w);

    } else if (sys < 6.5) {
      /* ── walk-shimmer ghosts — CPU-sampled halo trail ── */
      float gate = gateOf(aCfg.y, uCullB.z);
      vec4 gh = uGhost[int(aCfg.z + 0.5)];
      p = gh.xyz;
      alpha = gh.w * gate;
      col = aColor * 0.7;
      size = uPx * aCfg.w;

    } else {
      /* ── shooting star — placed in NDC so it never far-clips ── */
      float gate = gateOf(aCfg.y, uCullB.w);
      float i = aCfg.z;
      vec3 q = uStarNdc - uStarStep * i;       /* clip-space-ish, z near 0 */
      gl_Position = vec4(q.xy, q.z, 1.0);
      ndc = true;
      alpha = uStarEnv * gate * pow(max(1.0 - i / 18.0, 0.0), 1.4);
      col = aColor * (2.2 - i * 0.05);
      size = uPx * (3.6 - i * 0.07);
    }

    vCol = vec4(col, alpha);
    if (alpha <= 0.0008) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   /* off-clip — no fragments */
      gl_PointSize = 0.0;
    } else if (ndc) {
      gl_PointSize = max(size, 1.0);
      /* gl_Position already written */
    } else {
      gl_PointSize = max(size, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  }`;

const MOTE_FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying vec4 vCol;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * vCol.a;
    if (a <= 0.004) discard;
    gl_FragColor = vec4(vCol.rgb * tex.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/* ════════════════════════════════════════════════════════════════════════ */
export function initParticles(ctx) {
  const {
    world, figures, flora, camera,
    getTier = () => "high",
    getSizeScale = () => 1,
    reduced = false,
  } = ctx;

  const params = new URLSearchParams(location.search);

  /* ── QA: ?fx parsing — off means NOTHING is built ──────────────────────── */
  const NAMES = ["fireflies", "motes", "embers", "desk", "threshold", "moths",
    "birds", "koi", "leaf", "star", "shimmer"];
  const fxParam = params.get("fx");
  const enabled = {};
  let mode = "all";
  if (fxParam === "off" || fxParam === "0" || fxParam === "none") {
    mode = "off";
  } else if (fxParam) {
    mode = fxParam;
    const want = fxParam.split(",").map((s) => s.trim().toLowerCase());
    for (const n of NAMES) enabled[n] = want.includes(n);
    if (want.includes("flies")) enabled.fireflies = true;
    if (want.includes("engrams")) enabled.motes = true;
    if (want.includes("ink")) enabled.desk = true;
    if (want.includes("attending")) enabled.threshold = true;
    if (want.includes("trail")) enabled.shimmer = true;
    if (want.includes("fish")) enabled.koi = true;
    if (want.includes("flock")) enabled.birds = true;
  } else {
    for (const n of NAMES) enabled[n] = true;
  }

  const dbg = {
    mode,
    drawCalls: 0,
    motePool: MOTE_TOTAL,
    tier: getTier(),
    surge: 0,
    flyPresence: 0,
    gust: 0,
    systems: {
      fireflies: { on: false, pool: N_FLY, visible: 0 },
      motes: { on: false, pool: N_MOTE, visible: 0, surge: 0 },
      embers: { on: false, pool: N_EMBER, env: 0 },
      desk: { on: false, pool: N_DESK, env: 0 },
      threshold: { on: false, pool: N_THRESH, env: 0 },
      moths: { on: false, pool: N_MOTH, visible: 0 },
      birds: { on: false, count: N_BIRD, aloft: 0 },
      koi: { on: false, count: N_KOI },
      leaf: { on: false, count: 1, active: false, prog: -1 },
      star: { on: false, pool: N_STAR, active: false, prog: -1 },
      shimmer: { on: false, pool: N_GHOST, walking: 0 },
    },
  };

  if (mode === "off") {
    return { update() {}, captionClause() { return null; }, dbg };
  }

  /* ── QA pins ───────────────────────────────────────────────────────────── */
  const pinPhase = parseFloat(params.get("fxphase"));
  const hasPhasePin = !Number.isNaN(pinPhase);
  const pinSurge = params.get("surge") === "1";
  const pinLeaf = params.get("leaf") === "1";
  const pinStar = params.get("star") === "1";
  const pinGust = parseFloat(params.get("fxgust"));
  const hasGustPin = !Number.isNaN(pinGust);

  const rng = mulberry32(0xd1f7);

  /* ════════════════════════════════════════════════════════════════════════
     MOTE CLASS — one geometry, one additive shader
     ════════════════════════════════════════════════════════════════════════ */
  const pos = new Float32Array(MOTE_TOTAL * 3);
  const seed = new Float32Array(MOTE_TOTAL * 4);
  const colr = new Float32Array(MOTE_TOTAL * 3);
  const cfg = new Float32Array(MOTE_TOTAL * 4);
  const dyn = new Float32Array(MOTE_TOTAL * 4);
  const anch = new Float32Array(MOTE_TOTAL * 4);
  const _c = new THREE.Color();

  let W = 0;
  function put(system, x, y, z, color, cull, auxZ, auxW, d0, d1, d2, d3, ax, ay, az, aw) {
    const i3 = W * 3, i4 = W * 4;
    pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
    seed[i4] = rng(); seed[i4 + 1] = rng(); seed[i4 + 2] = rng(); seed[i4 + 3] = rng();
    colr[i3] = color.r; colr[i3 + 1] = color.g; colr[i3 + 2] = color.b;
    cfg[i4] = system; cfg[i4 + 1] = cull; cfg[i4 + 2] = auxZ; cfg[i4 + 3] = auxW;
    dyn[i4] = d0; dyn[i4 + 1] = d1; dyn[i4 + 2] = d2; dyn[i4 + 3] = d3;
    anch[i4] = ax || 0; anch[i4 + 1] = ay || 0; anch[i4 + 2] = az || 0; anch[i4 + 3] = aw || 0;
    W += 1;
    return W - 1;
  }

  /* — fireflies: rejection-sampled clouds on the same lawns flora planted,
       layered into near/mid/far depth bands so the cloud has body — */
  const lawns = (flora && flora.lawns) || LAWNS_FALLBACK;
  const clearOf = (flora && flora.clearOf) || (() => true);
  const flyTh = new Float32Array(N_FLY);
  {
    _c.setHex(0xb2cc7e);   /* warm sage-green — none of the four resident hues */
    const areas = lawns.map((l) => (l.x1 - l.x0) * (l.z1 - l.z0) * l.w);
    const totalA = areas.reduce((a, b) => a + b, 0);
    let placedAll = 0;
    lawns.forEach((l, li) => {
      const want = li === lawns.length - 1
        ? N_FLY - placedAll
        : Math.round((areas[li] / totalA) * N_FLY);
      let placed = 0, guard = 0;
      while (placed < want && guard < want * 30) {
        guard += 1;
        /* sample a touch beyond the lawn rim — clouds spill over edges */
        const x = l.x0 - 0.4 + rng() * (l.x1 - l.x0 + 0.8);
        const z = l.z0 - 0.4 + rng() * (l.z1 - l.z0 + 0.8);
        if (!clearOf(x, z)) continue;
        const th = rng() * 0.94;
        const n1 = 128 + Math.floor(rng() * 110);
        const n2 = 256 + Math.floor(rng() * 170);
        const nDim = 200 + Math.floor(rng() * 320);
        const ny = 100 + Math.floor(rng() * 110);
        const hBase = 0.36 + rng() * 1.0;        /* band 0.36..1.7 above ground */
        const idx = put(SYS.fly, x, l.y, z, _c, placed / Math.max(want, 1), th, ny,
          n1, n2, nDim, hBase);
        flyTh[idx] = th;
        placed += 1; placedAll += 1;
      }
    });
    while (W < N_FLY) {
      const l = lawns[0];
      const th = rng() * 0.94;
      const idx = put(SYS.fly, l.x0 + 0.4 + rng() * (l.x1 - l.x0 - 0.8), l.y,
        l.z0 + 0.4 + rng() * (l.z1 - l.z0 - 0.8), _c, rng(), th,
        100 + Math.floor(rng() * 110),
        128 + Math.floor(rng() * 110), 256 + Math.floor(rng() * 170),
        200 + Math.floor(rng() * 320), 0.36 + rng() * 1.0);
      flyTh[idx] = th;
    }
  }

  /* — engram motes: bone-white, the roofline current — */
  const moteTh = new Float32Array(N_MOTE);
  {
    _c.setHex(0xe9e4d8);
    for (let i = 0; i < N_MOTE; i += 1) {
      const x = HALL.x0 + rng() * (HALL.x1 - HALL.x0);
      const z = HALL.z0 + rng() * (HALL.z1 - HALL.z0);
      const y0 = HALL.y0 + rng() * HALL.ySpan;
      const th = rng() * 0.94;
      const nRise = 120 + Math.floor(rng() * 70);
      const rise = 2.8 + rng() * 0.8;
      const idx = put(SYS.mote, x, y0, z, _c, i / N_MOTE, th, 0, nRise, rise, 0, 0);
      moteTh[idx - N_FLY] = th;
    }
  }

  /* — pavilion embers — */
  {
    _c.setHex(0xfff0cc).lerp(new THREE.Color(0xff9a4a), 0.45);
    for (let i = 0; i < N_EMBER; i += 1) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.12;
      const nRise = 372 + Math.floor(rng() * 214);
      const rise = 0.55 + rng() * 0.22;
      const swirl = 0.11 + rng() * 0.12;
      put(SYS.ember, PAV_LAMP.x + Math.cos(a) * r, PAV_LAMP.y,
        PAV_LAMP.z + Math.sin(a) * r, _c, i / N_EMBER, 0, 0, nRise, rise, swirl, 0);
    }
  }

  /* — desk ink-glow — */
  {
    _c.setHex(0xffe1a8);
    for (let i = 0; i < N_DESK; i += 1) {
      const nOrb = 228 + Math.floor(rng() * 114);
      const rOrb = 0.05 + rng() * 0.05;
      const nBob = 256 + Math.floor(rng() * 128);
      const nTw = 320 + Math.floor(rng() * 192);
      put(SYS.desk, DESK_PAGE.x, DESK_PAGE.y, DESK_PAGE.z, _c, i / N_DESK, 0, 0,
        nOrb, rOrb, nBob, nTw);
    }
  }

  /* — threshold attending: most drift the path, a few lift the gate lamps — */
  {
    _c.setHex(0xf6ecd2);
    const drifters = N_THRESH - 6;
    for (let i = 0; i < drifters; i += 1) {
      const nPath = 200 + Math.floor(rng() * 120);
      put(SYS.thresh, 0, 0, 0, _c, i / N_THRESH, 0, 0, nPath, 0, 0, 0);
    }
    for (let k = 0; k < 6; k += 1) {
      put(SYS.thresh, GATE_LAMP.x + (rng() - 0.5) * 0.18, GATE_LAMP.y + (rng() - 0.5) * 0.12,
        GATE_LAMP.z + (rng() - 0.5) * 0.1, _c, (drifters + k) / N_THRESH, 1,
        9 + rng() * 8, 0, 0, 0, 0);
    }
  }

  /* — moths + butterflies: bound to the nearest light or a flower bed — */
  {
    const mothC = new THREE.Color(0xe8e0c4);
    const flyC = new THREE.Color(0xb2cc7e);
    const flutterCols = [0xd6a0b0, 0xc8b46a, 0x9ec0c4]; /* a few pale wings */
    for (let i = 0; i < N_MOTH; i += 1) {
      const isButterfly = i % 7 === 0;
      if (isButterfly) {
        const bed = FLOWER_BEDS[i % FLOWER_BEDS.length];
        _c.set(flutterCols[i % flutterCols.length]);
        const nSpin = 60 + Math.floor(rng() * 50);
        put(SYS.moth, bed.x, bed.y, bed.z, _c, i / N_MOTH, 0, 0,
          nSpin, 0.32 + rng() * 0.2, 110 + Math.floor(rng() * 60), 0.10 + rng() * 0.06,
          bed.x, bed.y, bed.z, 0);
      } else {
        const L = LANTERNS[i % LANTERNS.length];
        _c.copy(rng() < 0.18 ? flyC : mothC);
        const nSpin = 150 + Math.floor(rng() * 140);
        put(SYS.moth, L.x, L.y, L.z, _c, i / N_MOTH, 0, 0,
          nSpin, 0.18 + rng() * 0.22, 170 + Math.floor(rng() * 120), 0.16 + rng() * 0.12,
          L.x, L.y, L.z, 0);
      }
    }
  }

  /* — walk-shimmer ghosts: 20 ranks per figure, the figure's own glow — */
  const GHOST_RANKS = 20;
  {
    for (let fi = 0; fi < 4; fi += 1) {
      _c.setHex(figures[fi] ? figures[fi].R.glow : 0xffffff);
      for (let g = 0; g < GHOST_RANKS; g += 1) {
        const px = 14.0 * Math.pow(1 - g / GHOST_RANKS, 0.8) + 4.0;
        put(SYS.ghost, 0, 0, 0, _c, (fi * GHOST_RANKS + g) / N_GHOST,
          fi * GHOST_RANKS + g, px, 0, 0, 0, 0);
      }
    }
  }

  /* — shooting star: head + tail ranks — */
  {
    _c.setHex(0xeaf2ff);
    for (let i = 0; i < N_STAR; i += 1) {
      put(SYS.star, 0, 0, 0, _c, i / N_STAR, i, 0, 0, 0, 0, 0);
    }
  }

  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  moteGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  moteGeo.setAttribute("aColor", new THREE.BufferAttribute(colr, 3));
  moteGeo.setAttribute("aCfg", new THREE.BufferAttribute(cfg, 4));
  moteGeo.setAttribute("aDyn", new THREE.BufferAttribute(dyn, 4));
  moteGeo.setAttribute("aAnchor", new THREE.BufferAttribute(anch, 4));

  const ghostVecs = [];
  for (let i = 0; i < N_GHOST; i += 1) ghostVecs.push(new THREE.Vector4(0, 0, 0, 0));

  const muniforms = {
    uMap: { value: discTexture() },
    uTimeW: { value: 0 },
    uBreath: { value: 0.5 },
    uPx: { value: 1 },
    uWindV: { value: 0 },
    uGust: { value: 0 },
    uWindDir: { value: new THREE.Vector2(floraWind.dirX, floraWind.dirZ) },
    uFly: { value: 0.6 },
    uMote: { value: 0.25 },
    uEmber: { value: 0 },
    uDesk: { value: 0 },
    uThresh: { value: 0 },
    uMoth: { value: 1 },
    uStarEnv: { value: 0 },
    uStarNdc: { value: new THREE.Vector3(0, 2, 0.5) },
    uStarStep: { value: new THREE.Vector3(0.02, 0.012, 0) },
    uCullA: { value: new THREE.Vector4(1, 1, 1, 1) },
    uCullB: { value: new THREE.Vector4(1, 1, 1, 1) },
    uGhost: { value: ghostVecs },
  };
  const moteMat = new THREE.ShaderMaterial({
    uniforms: muniforms, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: true,
  });
  const moteCloud = new THREE.Points(moteGeo, moteMat);
  moteCloud.frustumCulled = false;
  moteCloud.renderOrder = 6;
  moteCloud.userData.noAO = true;
  world.add(moteCloud);

  /* ════════════════════════════════════════════════════════════════════════
     BIRD CLASS — an InstancedMesh of delta billboards on a shared flock orbit
     ════════════════════════════════════════════════════════════════════════ */
  let birdMesh = null;
  const birds = [];
  const birdFlap = { value: 0 };
  {
    /* a thin two-triangle delta: nose, tail, two swept wing tips → 2 tris.
       aWing flags the tips so a tiny shader bend flaps them without extra
       geometry. oriented to face travel + bank in the loop. */
    const g = new THREE.BufferGeometry();
    const p4 = new Float32Array([
      0.30, 0, 0,        // 0 nose
      -0.24, 0, 0,       // 1 tail
      -0.05, 0, 0.40,    // 2 left tip
      -0.05, 0, -0.40,   // 3 right tip
    ]);
    const wingFlag = new Float32Array([0, 0, 1, 1]);
    const idx = [0, 2, 1, 0, 1, 3];
    g.setAttribute("position", new THREE.BufferAttribute(p4, 3));
    g.setAttribute("aWing", new THREE.BufferAttribute(wingFlag, 1));
    g.setIndex(idx);
    g.computeVertexNormals();

    const bmat = new THREE.MeshBasicMaterial({
      color: 0x3a4256, transparent: true, opacity: 0.98, side: THREE.DoubleSide,
      depthWrite: true,
    });
    bmat.onBeforeCompile = (sh) => {
      sh.uniforms.uFlap = birdFlap;   /* shared ref the loop drives */
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          attribute float aWing;
          uniform float uFlap;
          /* per-instance flap phase packed in instanceMatrix? no — derive from
             instance id via gl_InstanceID for a desynced beat */
          flat varying float vRim;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float beat = sin(uFlap + float(gl_InstanceID) * 1.7);
          transformed.y += aWing * beat * 0.12;     /* wings rise/fall */
          transformed.z *= 1.0 - aWing * 0.10 * (0.5 + 0.5 * beat);
          vRim = aWing;`);
      /* a faint moonlit rim on the wing tips reads them against the sky */
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n flat varying float vRim;")
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
          gl_FragColor.rgb += vec3(0.30, 0.34, 0.46) * (0.4 + vRim * 0.6);`);
    };
    bmat.customProgramCacheKey = () => "bird-flap";

    birdMesh = new THREE.InstancedMesh(g, bmat, N_BIRD);
    birdMesh.frustumCulled = false;
    birdMesh.renderOrder = 4;          /* over the world, under the motes */
    birdMesh.userData.noAO = true;
    birdMesh.castShadow = false;
    world.add(birdMesh);

    for (let i = 0; i < N_BIRD; i += 1) {
      birds.push({
        /* per-bird offset within the flock + an independent roost schedule.
           wide offsets + varied circulation radii keep the flock dispersed
           across the sky rather than knotted at the centre */
        ox: (rng() - 0.5) * 13.0, oz: (rng() - 0.5) * 13.0, oy: (rng() - 0.5) * 3.0,
        sx: 0.8 + rng() * 1.6, sz: 0.8 + rng() * 1.6,
        ph: rng() * Math.PI * 2,
        roostP: 70 + rng() * 90, roostBase: rng() * 120,
        roostDur: 12 + rng() * 14, perch: PERCHES[i % PERCHES.length],
        scale: 1.2 + rng() * 0.7,
        always: i < 8,            /* most stay aloft — the sky should be busy */
      });
    }
  }
  const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion();
  const _bpos = new THREE.Vector3(), _bscl = new THREE.Vector3();
  const _bprev = new THREE.Vector3(), _bdir = new THREE.Vector3();
  const _bup = new THREE.Vector3(0, 1, 0);

  /* ════════════════════════════════════════════════════════════════════════
     KOI CLASS — an InstancedMesh of flat fish on slow looping pool paths
     ════════════════════════════════════════════════════════════════════════ */
  let koiMesh = null;
  const koi = [];
  {
    /* a flat lozenge body + tail fan, lying in the water plane; faint emissive
       so the pale bodies read under the night water */
    const body = new THREE.CircleGeometry(0.14, 14);
    body.scale(1.7, 1.0, 1.0);            /* elongate into a fish lozenge */
    body.rotateX(-Math.PI / 2);
    const tail = new THREE.CircleGeometry(0.07, 3);
    tail.rotateX(-Math.PI / 2);
    tail.translate(-0.22, 0, 0);
    const merged = mergeFlat([body, tail]);
    const kmat = new THREE.MeshBasicMaterial({
      color: 0xf0e6d4, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
      depthWrite: false, depthTest: false,   /* always seen through the sheen */
    });
    koiMesh = new THREE.InstancedMesh(merged, kmat, N_KOI);
    koiMesh.frustumCulled = false;
    koiMesh.renderOrder = 2;           /* over the water disc, under the motes */
    koiMesh.userData.noAO = true;
    world.add(koiMesh);

    /* tint a couple warm-pale, the rest cool-pale */
    const tints = [];
    for (let i = 0; i < N_KOI; i += 1) {
      tints.push(i < 2 ? new THREE.Color(0xf6c89a) : new THREE.Color(0xeadfce));
    }
    if (koiMesh.instanceColor === null) {
      koiMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N_KOI * 3), 3);
    }
    for (let i = 0; i < N_KOI; i += 1) {
      koi.push({
        /* two-lobe looping path inside the pool radius. the koi swim just
           ABOVE the water disc (y -0.05, opacity .9) so they aren't occluded
           — they read as pale bodies seen through the surface sheen */
        a0: rng() * Math.PI * 2, ra: 0.55 + rng() * 0.9, rb: 0.4 + rng() * 0.7,
        spd: (0.5 + rng() * 0.5) * (rng() < 0.5 ? 1 : -1),
        ph: rng() * Math.PI * 2, depth: 0.012 + rng() * 0.02,
        scale: 0.8 + rng() * 0.5, wph: rng() * Math.PI * 2,
      });
      tints[i].toArray(koiMesh.instanceColor.array, i * 3);
    }
    koiMesh.instanceColor.needsUpdate = true;
  }
  const _km = new THREE.Matrix4(), _kq = new THREE.Quaternion();
  const _kpos = new THREE.Vector3(), _kscl = new THREE.Vector3(1, 1, 1);

  /* koi surface nudges feed the existing pool ripples (if grounds exposed them) */
  const poolRipples = (ctx.ripples || []);

  /* ── the falling leaf — one Sprite, parametric descent ─────────────────── */
  const leafColors = LEAF_TREES.map((t) => {
    const c = new THREE.Color(t.c);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s * 0.7, Math.min(hsl.l * 1.18, 0.62));
    return c;
  });
  const leafMat = new THREE.SpriteMaterial({
    map: leafTexture(), transparent: true, opacity: 0,
    depthWrite: false, color: 0xffffff,
  });
  const leaf = new THREE.Sprite(leafMat);
  leaf.scale.set(0.22, 0.22, 1);
  leaf.renderOrder = 5;
  leaf.userData.noAO = true;
  leaf.visible = false;
  world.add(leaf);
  let leafTreeIdx = -1;

  /* ── walk-shimmer rings — small CPU history, preallocated ──────────────── */
  const SAMPLES = GHOST_RANKS + 2, CADENCE = 0.05;
  const rings = [];
  for (let fi = 0; fi < 4; fi += 1) {
    const f = figures[fi];
    const buf = new Float32Array(SAMPLES * 3);
    for (let s = 0; s < SAMPLES; s += 1) {
      buf[s * 3] = f ? f.x : 0;
      buf[s * 3 + 1] = f ? f.y : 0;
      buf[s * 3 + 2] = f ? f.z : 0;
    }
    rings.push({ buf, head: 0, timer: 0, env: 0 });
  }
  const ghostAlpha = [];
  for (let g = 0; g < GHOST_RANKS; g += 1) ghostAlpha.push(0.22 * Math.pow(1 - g / GHOST_RANKS, 1.3));

  /* ── tier gates ────────────────────────────────────────────────────────── */
  let lastTier = null;
  let tierIsStatic = false;
  const gates = {
    fly: 1, mote: 1, ember: 1, desk: 1, thresh: 1, moth: 1, ghost: 1, star: 1,
    bird: 1, koi: 1, leaf: true,
  };
  function applyGates(tier) {
    lastTier = tier;
    tierIsStatic = tier === "static";
    const A = muniforms.uCullA.value;
    const B = muniforms.uCullB.value;
    /* count fractions per tier — degrade density, never delete systems */
    let fly = 0, mote = 0, ember = 0, desk = 0, thresh = 0, moth = 0;
    let ghost = 0, star = 0, bird = 1, koi = 1, leafOn = false;
    if (tier === "high") {
      fly = 1; mote = 1; ember = 1; desk = 1; thresh = 1; moth = 1;
      ghost = 1; star = 1; bird = 1; koi = 1; leafOn = true;
    } else if (tier === "mid") {
      fly = 0.55; mote = 0.6; ember = 0.6; desk = 1; thresh = 0.6; moth = 0.5;
      ghost = 1; star = 1; bird = 0.7; koi = 1; leafOn = true;
    } else if (tier === "low") {
      fly = 0.22; mote = 0.5; ember = 0.5; desk = 0; thresh = 0; moth = 0.25;
      ghost = 0; star = 0; bird = 0.45; koi = 0.7; leafOn = false;
    } else {  /* static — a composed still, generous since it renders once */
      fly = 0.7; mote = 0.8; ember = 0.8; desk = 1; thresh = 1; moth = 0.8;
      ghost = 0; star = 0; bird = 0.7; koi = 1; leafOn = false;
    }
    if (reduced) { leafOn = false; star = 0; ghost = 0; }
    if (!enabled.fireflies) fly = 0;
    if (!enabled.motes) mote = 0;
    if (!enabled.embers) ember = 0;
    if (!enabled.desk) desk = 0;
    if (!enabled.threshold) thresh = 0;
    if (!enabled.moths) moth = 0;
    if (!enabled.shimmer) ghost = 0;
    if (!enabled.star) star = 0;
    if (!enabled.birds) bird = 0;
    if (!enabled.koi) koi = 0;
    if (!enabled.leaf) leafOn = false;
    A.set(fly, mote, ember, desk);
    B.set(thresh, moth, ghost, star);
    gates.fly = fly; gates.mote = mote; gates.ember = ember; gates.desk = desk;
    gates.thresh = thresh; gates.moth = moth; gates.ghost = ghost; gates.star = star;
    gates.bird = bird; gates.koi = koi; gates.leaf = leafOn;
    /* creature instance counts shrink with the tier (the cheap, honest lever) */
    if (birdMesh) birdMesh.count = Math.max(0, Math.round(N_BIRD * bird));
    if (koiMesh) koiMesh.count = Math.max(0, Math.round(N_KOI * koi));
    dbg.tier = tier;
    dbg.systems.fireflies.on = fly > 0;
    dbg.systems.motes.on = mote > 0;
    dbg.systems.embers.on = ember > 0;
    dbg.systems.desk.on = desk > 0;
    dbg.systems.threshold.on = thresh > 0;
    dbg.systems.moths.on = moth > 0;
    dbg.systems.birds.on = bird > 0;
    dbg.systems.koi.on = koi > 0;
    dbg.systems.leaf.on = leafOn;
    dbg.systems.star.on = star > 0;
    dbg.systems.shimmer.on = ghost > 0;
  }

  /* ── event helpers — all pure in t ─────────────────────────────────────── */
  function surgeRamp(t) {
    if (pinSurge) return 1;
    const tm = ((t % SURGE_P) + SURGE_P) % SURGE_P;
    const a = Math.min(Math.max((tm - SURGE_AT) / 3, 0), 1);
    const d = Math.min(Math.max((tm - (SURGE_AT + SURGE_LEN)) / 4, 0), 1);
    const sa = a * a * (3 - 2 * a), sd = d * d * (3 - 2 * d);
    return sa * (1 - sd);
  }
  let starK = 0;
  function starWindow(t) {
    if (pinStar) { const ts = t % 4; return ts < STAR_DUR ? ts / STAR_DUR : -1; }
    const k = Math.floor((t - STAR_BASE) / STAR_P);
    for (let kk = k; kk >= k - 1; kk -= 1) {
      if (kk < 0) continue;
      const start = kk * STAR_P + STAR_BASE + STAR_JIT * hashK(kk, 1);
      const prog = (t - start) / STAR_DUR;
      if (prog >= 0 && prog <= 1) {
        if (surgeRamp(start) > 0.02) return -1;
        starK = kk; return prog;
      }
    }
    return -1;
  }
  let leafK = 0;
  function leafWindow(t) {
    if (pinLeaf) { const ts = t % 9; leafK = Math.floor(t / 9); return ts / 9; }
    const k = Math.floor((t - LEAF_BASE) / LEAF_P);
    for (let kk = k; kk >= k - 1; kk -= 1) {
      if (kk < 0) continue;
      const start = kk * LEAF_P + LEAF_BASE + LEAF_JIT * hashK(kk, 2);
      const dur = 8 + 4 * hashK(kk, 3);
      const prog = (t - start) / dur;
      if (prog >= 0 && prog <= 1) { leafK = kk; return prog; }
    }
    return -1;
  }
  /* a bird's roost progress: 0 aloft → 1 fully perched, pure in t */
  function roostProg(b, t) {
    if (b.always) return 0;
    const tm = ((t - b.roostBase) % b.roostP + b.roostP) % b.roostP;
    if (tm > b.roostDur) return 0;
    const u = tm / b.roostDur;          /* 0..1 across the roost window */
    /* ease down then up: perched in the middle of the window */
    return Math.sin(Math.PI * u);
  }

  const expK = (dt, tau) => 1 - Math.exp(-dt / tau);
  let tNow = 0;

  /* ── flock centre — a shared sum-of-sines orbit over the island ────────── */
  const FLOCK_C = new THREE.Vector3();
  function flockCentre(t) {
    /* a wide low orbit — the flock sweeps over the island's rooftops and out
       past the rim, dipping into frame rather than circling far overhead */
    FLOCK_C.set(
      -1.0 + 8.5 * Math.sin(t * 0.063) + 3.0 * Math.sin(t * 0.017 + 1.1),
      7.2 + 1.6 * Math.sin(t * 0.05 + 0.6),
      0.2 + 8.2 * Math.cos(t * 0.063 * 0.92) + 3.0 * Math.cos(t * 0.019 + 0.4),
    );
    return FLOCK_C;
  }
  const _b0 = new THREE.Vector3(), _b1 = new THREE.Vector3();
  function birdPos(b, t, out) {
    const c = flockCentre(t);
    /* per-bird local circulation around the moving centre */
    const w = t * 0.55 + b.ph;
    out.set(
      c.x + b.ox + Math.sin(w) * (1.6 + b.sx) + floraWind.value * 0.3,
      c.y + b.oy + Math.sin(w * 1.6 + b.ph) * 0.6,
      c.z + b.oz + Math.cos(w * 1.04) * (1.6 + b.sz),
    );
    /* fold toward the perch when roosting */
    const rp = roostProg(b, t);
    if (rp > 0.001) {
      out.x += (b.perch.x - out.x) * rp;
      out.y += (b.perch.y - out.y) * rp;
      out.z += (b.perch.z - out.z) * rp;
    }
    return rp;
  }

  /* ── the per-frame entry — call AFTER flora.update ─────────────────────── */
  function update(t, dt) {
    tNow = t;
    const tier = getTier();
    if (tier !== lastTier) applyGates(tier);
    const snap = tierIsStatic || reduced || dt === 0;

    const u = muniforms;
    u.uTimeW.value = t % WHEEL;
    u.uBreath.value = 0.5 + 0.5 * Math.sin((Math.PI * 2 * t) / 5.2);
    u.uPx.value = getSizeScale();
    u.uWindV.value = floraWind.value;
    u.uGust.value = hasGustPin ? pinGust : floraWind.gust;
    u.uWindDir.value.set(floraWind.dirX, floraWind.dirZ);

    /* firefly density master — minutes-long breathing */
    const flyU = hasPhasePin
      ? Math.min(Math.max(pinPhase, 0), 1)
      : 0.5 + 0.5 * Math.sin((Math.PI * 2 * t) / 256);
    u.uFly.value = 0.42 + 0.5 * flyU;

    /* engram presence — trickle, surging */
    const ramp = surgeRamp(t);
    let mote = 0.28 + 0.55 * ramp;
    if (tier === "low") mote = Math.min(mote, 0.4);
    u.uMote.value = mote;

    /* occupancy envelopes */
    let pav = 0, deskBusy = 0, attending = 0, walking = 0;
    for (let i = 0; i < figures.length; i += 1) {
      const f = figures[i];
      if (f.state === "idle") {
        if (f.station === "pavilion") pav += 1;
        else if (f.station === "desk") deskBusy = 1;
        else if (f.station === "threshold") attending = 1;
      } else if (f.state === "walking") walking += 1;
    }
    const emberTarget = pav >= 2 ? 1 : 0;
    if (snap) {
      u.uEmber.value = emberTarget;
      u.uDesk.value = deskBusy;
      u.uThresh.value = attending;
    } else {
      u.uEmber.value += (emberTarget - u.uEmber.value) * expK(dt, emberTarget ? 2.2 : 3.2);
      u.uDesk.value += (deskBusy - u.uDesk.value) * expK(dt, 0.8);
      u.uThresh.value += (attending - u.uThresh.value) * expK(dt, 1.1);
    }

    /* walk-shimmer — sample figure halos into the ghost uniforms */
    if (gates.ghost > 0) {
      for (let fi = 0; fi < 4; fi += 1) {
        const f = figures[fi], ring = rings[fi];
        if (!f) continue;
        ring.timer += dt;
        let pushes = 0;
        while (ring.timer >= CADENCE && pushes < 4) {
          ring.timer -= CADENCE; pushes += 1;
          ring.head = (ring.head + 1) % SAMPLES;
          const b = ring.head * 3;
          ring.buf[b] = f.x; ring.buf[b + 1] = f.y; ring.buf[b + 2] = f.z;
        }
        const target = f.state === "walking" ? 1 : 0;
        ring.env += (target - ring.env) * (dt > 0 ? expK(dt, target ? 0.18 : 0.22) : 1);
        for (let g = 0; g < GHOST_RANKS; g += 1) {
          const si = ((ring.head - 1 - g) % SAMPLES + SAMPLES) % SAMPLES;
          const b = si * 3;
          ghostVecs[fi * GHOST_RANKS + g].set(
            ring.buf[b], ring.buf[b + 1] + 0.42, ring.buf[b + 2],
            ring.env * ghostAlpha[g],
          );
        }
      }
    }

    /* the shooting star — placed in NDC so it never far-clips. We compute the
       head in NDC directly (sky band of the actual frame) and step the tail
       back in screen space; nothing unprojects, so no clip-plane surprises. */
    let starProg = -1;
    if (gates.star > 0) {
      starProg = starWindow(t);
      if (starProg >= 0) {
        const h1 = hashK(starK, 4), h2 = hashK(starK, 5);
        const nx0 = -0.55 + 0.9 * h1, ny0 = 0.74 + 0.16 * h2;
        const nx = nx0 - 0.30 * starProg, ny = ny0 - 0.13 * starProg;
        u.uStarNdc.value.set(nx, ny, 0.0);     /* z 0 → mid clip, never far */
        u.uStarStep.value.set(0.018, 0.008, 0.0);
        const env = Math.sin(Math.PI * Math.min(Math.max(starProg, 0), 1));
        u.uStarEnv.value = Math.pow(env, 0.8);
      } else u.uStarEnv.value = 0;
    } else u.uStarEnv.value = 0;

    /* the falling leaf */
    let leafProg = -1;
    if (gates.leaf) {
      leafProg = leafWindow(t);
      if (leafProg >= 0) {
        const ti = Math.floor(hashK(leafK, 6) * LEAF_TREES.length) % LEAF_TREES.length;
        if (ti !== leafTreeIdx) { leafTreeIdx = ti; leafMat.color.copy(leafColors[ti]); }
        const tr = LEAF_TREES[ti];
        const h4 = hashK(leafK, 7), h5 = hashK(leafK, 8), h6 = hashK(leafK, 9);
        const uL = leafProg;
        const ang = h4 * Math.PI * 2 + uL * Math.PI * 2 * (2.2 + 1.4 * h5);
        const r = 0.22 + uL * 0.5;
        const ease = uL * uL * (3 - 2 * uL) * 0.25 + uL * 0.75;
        leaf.position.set(
          tr.x + Math.cos(ang) * r
            + (floraWind.value * 0.22 + floraWind.dirX * u.uGust.value * 0.3) * uL,
          tr.y - ease * (tr.y - tr.g - 0.03),
          tr.z + Math.sin(ang) * r + floraWind.dirZ * u.uGust.value * 0.3 * uL,
        );
        leafMat.rotation = (h6 > 0.5 ? 1 : -1) * uL * Math.PI * 2 * (2.4 + h6);
        leafMat.opacity = Math.min(uL / 0.08, 1)
          * (1 - Math.min(Math.max((uL - 0.86) / 0.14, 0), 1)) * 0.95;
        leaf.visible = true;
      } else if (leaf.visible) { leaf.visible = false; leafMat.opacity = 0; }
    } else if (leaf.visible) { leaf.visible = false; leafMat.opacity = 0; }

    /* ── birds — wheel, bank, roost; instance matrices recomputed each frame ── */
    let aloft = 0;
    if (birdMesh && gates.bird > 0) {
      birdFlap.value = t * 8.2;          /* drives the shader wing bend */
      const n = birdMesh.count;
      for (let i = 0; i < n; i += 1) {
        const b = birds[i];
        const rp = birdPos(b, t, _bpos);
        if (rp < 0.5) aloft += 1;
        /* facing: difference to a slightly-earlier sample gives travel dir */
        birdPos(b, t - 0.12, _bprev);
        _bdir.copy(_bpos).sub(_bprev);
        if (_bdir.lengthSq() < 1e-6) _bdir.set(1, 0, 0);
        _bdir.normalize();
        const yaw = Math.atan2(_bdir.x, _bdir.z);
        const pitch = Math.asin(Math.max(-1, Math.min(1, _bdir.y)));
        const bank = Math.sin(t * 0.6 + b.ph) * 0.5 * (1 - rp);
        _bq.setFromEuler(new THREE.Euler(-pitch, yaw, bank, "YXZ"));
        const s = b.scale * (1 - 0.4 * rp);   /* tuck a touch when perched */
        _bscl.set(s, s, s);
        _bm.compose(_bpos, _bq, _bscl);
        birdMesh.setMatrixAt(i, _bm);
      }
      birdMesh.instanceMatrix.needsUpdate = true;
    }

    /* ── koi — slow two-lobe loops under the shimmer ── */
    if (koiMesh && gates.koi > 0) {
      const n = koiMesh.count;
      for (let i = 0; i < n; i += 1) {
        const k = koi[i];
        const a = k.a0 + t * 0.12 * k.spd;
        const x = POOL.x + Math.cos(a) * k.ra + Math.cos(a * 2.0 + k.ph) * 0.18;
        const z = POOL.z + Math.sin(a) * k.rb + Math.sin(a * 2.0 + k.ph) * 0.16;
        /* heading from the path tangent */
        const a2 = a + 0.05 * k.spd;
        const x2 = POOL.x + Math.cos(a2) * k.ra + Math.cos(a2 * 2.0 + k.ph) * 0.18;
        const z2 = POOL.z + Math.sin(a2) * k.rb + Math.sin(a2 * 2.0 + k.ph) * 0.16;
        const yaw = Math.atan2(x2 - x, z2 - z) * (k.spd > 0 ? 1 : 1);
        const wob = Math.sin(t * 3.0 + k.wph) * 0.12;   /* tail sway */
        _kpos.set(x, POOL.y + k.depth, z);
        _kq.setFromEuler(new THREE.Euler(0, yaw + wob, 0, "YXZ"));
        _kscl.set(k.scale, 1, k.scale);
        _km.compose(_kpos, _kq, _kscl);
        koiMesh.setMatrixAt(i, _km);
      }
      koiMesh.instanceMatrix.needsUpdate = true;
    }

    /* ── the report ─────────────────────────────────────────────────────── */
    let flyVis = 0; const flyP = u.uFly.value;
    for (let i = 0; i < N_FLY; i += 1) if (flyTh[i] < flyP) flyVis += 1;
    let moteVis = 0;
    for (let i = 0; i < N_MOTE; i += 1) if (moteTh[i] < mote) moteVis += 1;
    dbg.surge = ramp;
    dbg.flyPresence = Math.round(flyP * 100) / 100;
    dbg.gust = Math.round(u.uGust.value * 1000) / 1000;
    dbg.drawCalls = 1 + (leaf.visible ? 1 : 0)
      + (birdMesh && birdMesh.count > 0 && gates.bird > 0 ? 1 : 0)
      + (koiMesh && koiMesh.count > 0 && gates.koi > 0 ? 1 : 0);
    dbg.systems.fireflies.visible = gates.fly > 0 ? Math.round(flyVis * gates.fly) : 0;
    dbg.systems.motes.visible = gates.mote > 0 ? Math.round(moteVis * gates.mote) : 0;
    dbg.systems.motes.surge = Math.round(ramp * 100) / 100;
    dbg.systems.embers.env = Math.round(u.uEmber.value * 100) / 100;
    dbg.systems.desk.env = Math.round(u.uDesk.value * 100) / 100;
    dbg.systems.threshold.env = Math.round(u.uThresh.value * 100) / 100;
    dbg.systems.moths.visible = gates.moth > 0 ? Math.round(N_MOTH * gates.moth) : 0;
    dbg.systems.birds.aloft = gates.bird > 0 ? aloft : 0;
    dbg.systems.leaf.active = leafProg >= 0;
    dbg.systems.leaf.prog = leafProg >= 0 ? Math.round(leafProg * 100) / 100 : -1;
    dbg.systems.star.active = starProg >= 0;
    dbg.systems.star.prog = starProg >= 0 ? Math.round(starProg * 100) / 100 : -1;
    dbg.systems.shimmer.walking = walking;
  }

  /* ── the caption hook ──────────────────────────────────────────────────── */
  function captionClause() {
    if (gates.mote <= 0) return null;
    if (lastTier === "low") return null;
    if (pinSurge) return CLAUSE;
    return surgeRamp(tNow) >= 0.5 ? CLAUSE : null;
  }

  applyGates(getTier());

  return { update, captionClause, dbg };
}

/* merge a list of flat geometries (koi body) into one buffer */
function mergeFlat(list) {
  const arrays = list.map((g) => (g.index ? g.toNonIndexed() : g).attributes.position.array);
  let total = 0;
  for (const a of arrays) total += a.length;
  const pos = new Float32Array(total);
  let off = 0;
  for (const a of arrays) { pos.set(a, off); off += a.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}
