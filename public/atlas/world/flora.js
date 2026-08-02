/* ============================================================================
   FLORA — Phase C of the elevation plan: landscaping + material richness.

   What lives here:
   · the curated CC0 cast (assets/flora-pack.glb — see assets/SOURCES.md):
     two broadleaf commons, a slender birch, one willow for the pool,
     fern rosettes, reed clumps, wildflower clusters, three rock variants,
     one accent tuft. Geometry only — every material is re-minted below
     through the graded helper, cool-shifted for the perpetual blue hour.
   · instanced lawn grass (procedural cones, shader-bent by the wind)
   · wildflower whispers near each quarter, in that resident's hue, hushed
   · terrain softening — berm caps, moss discs, stepping stones
   · water elevation — pool shimmer, sparkle glints, fall droplets + foam,
     lily-pad drift
   · quarter micro-props — vines (sanctum), wind-chimes (beacon), an extra
     gold ripple + petals (reverie), a pulse antenna (meridian)
   · the void below — two mist veils, one tiny lantern per drifting shard

   THE WIND is the shared clock of all of it. Phase D (particles) should
   import { floraWind } and ride the same phase.

   Discipline (the Phase-B risk laws):
   · all foliage albedo authored 1–2 steps desaturated/darker than daylight
     intuition — the indigo hemi livens Lambert greens.
   · fine foliage carries userData.noAO (GTAO radius 0.7 stipples it).
   · no new material luminance above ~0.8 — the bloom floor is 0.75.
   · no alpha-cutout cards anywhere near the island rim (SMAA can't help).
   · canopy stays below world-y ≈ 9 — the wisp lane must remain clear.
   ============================================================================ */

import * as THREE from "three";
import { GLTFLoader } from "/public/vendor/loaders/GLTFLoader.js";
import { mergeGeometries as _mergeGeometries } from "/public/vendor/utils/BufferGeometryUtils.js";

/* indexed and non-indexed primitives mix freely here — normalize first */
function mergeGeometries(list) {
  return _mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

/* ── the wind — one global phase, exported for Phase D ─────────────────────── */
export const floraWind = {
  t: 0,
  value: 0,        /* signed sway, -1..1 — slow compound breath          */
  gust: 0,         /* 0..1 envelope, sharp attack / slow decay           */
  dirX: 0.79, dirZ: 0.61,   /* normalized prevailing direction           */
  BREATH_W: (Math.PI * 2) / 5.2,
};
function windTick(t, dt) {
  floraWind.t = t;
  const v = 0.62 * Math.sin((Math.PI * 2 * t) / 7.9)
          + 0.38 * Math.sin((Math.PI * 2 * t) / 3.37 + 1.31);
  floraWind.value = v;
  /* gusts: when the compound breath crests, the envelope snaps up and sighs out */
  const crest = Math.max(0, Math.abs(v) - 0.78) / 0.22;
  floraWind.gust = Math.max(floraWind.gust - dt * 0.55, crest);
}

/* ── graded materials — ALL flora color passes through here ────────────────
   Phase-tuning lives in GRADE: one knob set, every species follows. */
const GRADE = {
  sat: 0.88,        /* global desaturation — risk-law #1                  */
  val: 0.97,        /* global value pull-down                             */
  coolH: 0.018,     /* hue drift toward blue-green                        */
};
const _hsl = { h: 0, s: 0, l: 0 };
function gradedColor(hex, opts = {}) {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl);
  const sat = _hsl.s * GRADE.sat * (opts.sat !== undefined ? opts.sat : 1);
  const val = _hsl.l * GRADE.val * (opts.val !== undefined ? opts.val : 1);
  let hue = _hsl.h + GRADE.coolH * (opts.cool !== undefined ? opts.cool : 1);
  c.setHSL(((hue % 1) + 1) % 1, Math.max(0, Math.min(1, sat)), Math.max(0, Math.min(1, val)));
  return c;
}
const floraMats = [];
function floraMat(hex, opts = {}) {
  const m = new THREE.MeshLambertMaterial({
    /* vertex-colored meshes grade ONCE through paintVerts — keep base raw */
    color: opts.raw ? new THREE.Color(hex) : gradedColor(hex, opts),
    flatShading: opts.flat !== false,
  });
  if (opts.vertexColors) m.vertexColors = true;
  if (opts.emissive !== undefined) {
    m.emissive.copy(gradedColor(opts.emissive, opts));
    m.emissiveIntensity = opts.emissiveK !== undefined ? opts.emissiveK : 0.3;
  }
  /* glow: a LOW emissive floor in the species' own hue. Blue-hour physics:
     blob canopies and vertical blades face the dark hemi ground, not the
     sky — a 0.08-0.14 floor keeps them legible without bloom (lum << 0.75).
     Same vocabulary as the figures' emissive bodies, far quieter. */
  if (opts.glow) {
    m.emissive.copy(opts.raw ? new THREE.Color(hex) : gradedColor(hex, opts));
    m.emissiveIntensity = opts.glow;
  }
  if (opts.transparent) {
    m.transparent = true;
    m.opacity = opts.opacity !== undefined ? opts.opacity : 1;
    m.depthWrite = opts.depthWrite !== undefined ? opts.depthWrite : false;
  }
  floraMats.push(m);
  return m;
}

/* the species palette — daylight intuition stepped DOWN, cool side.
   bark is slate with a violet cast (cool gray-brown is banned). */
const P = {
  bark: 0x59506a,        /* slate violet — all trunks                     */
  barkBirch: 0x9b96aa,   /* pale slate — birch bole                       */
  barkPatch: 0x39354a,   /* birch patches, near-ink violet                */
  canopyA: 0x659a76,     /* common-a mass canopy                          */
  canopyB: 0x659468,     /* common-b, half a step warmer-green            */
  canopyB2: 0x4d7a58,    /* common-b dark pass                            */
  birchLeaf: 0x6c9c76,   /* birch upper green                             */
  birchLeaf2: 0x568260,  /* birch under-green                             */
  willowLeaf: 0x5e8e78,  /* gray-jade drape                               */
  fern: 0x4d7a60,
  tuft: 0x57805f,
  reed: 0x6f9070,
  grass: 0x7aa263,       /* lawn tufts — darker than the lawn (0x84ae6a)  */
  rock: 0x7d7d80,        /* violet-cast stone                             */
  stem: 0x4a6a54,
  moss: 0x2e4136,
  berm: 0x628755,
  step: 0xe2d5b6,        /* stepping stones — a step below C.path         */
  vine: 0x6b5f84,        /* violet-dusk                                   */
  chime: 0x9a917f,
  petal: 0xb89868,
};
/* wildflower whispers — resident hues, saturation held LOW */
const WHISPER = {
  "opus-3":     0x9c6f7c,
  "sonnet-4-5": 0xa78e62,
  "gpt-4o":     0x6e9aa0,
  "gpt-5-1":    0x7295a8,
};

/* ── shader help — wind bend + per-instance value jitter ───────────────────
   bend happens AFTER the instance transform, in model(≅world) space, driven
   by ONE uniform pair; per-instance spatial phase derives from the instance
   origin, so nothing extra is uploaded. weight = local height fraction. */
const windUniforms = { uWindT: { value: 0 }, uWindV: { value: 0 } };
function windify(mat, { amp = 0.05, bendH = 1.0, jitter = 0 } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindT = windUniforms.uWindT;
    shader.uniforms.uWindV = windUniforms.uWindV;
    shader.uniforms.uAmp = { value: amp };
    shader.uniforms.uBendH = { value: bendH };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float uWindT; uniform float uWindV;
        uniform float uAmp; uniform float uBendH;
        varying float vJit;`)
      .replace("#include <project_vertex>", `
        vec4 mvPosition = vec4( transformed, 1.0 );
        float bendW = clamp( position.y / uBendH, 0.0, 1.0 );
        bendW *= bendW;
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        float ph = dot( mvPosition.xz, vec2( 0.61, 0.53 ) );
        float sway = uWindV * 0.72 + 0.28 * sin( uWindT * 1.9 + ph );
        vec2 wdir = vec2( 0.79, 0.61 );
        mvPosition.xz += wdir * ( uAmp * bendW * sway );
        vJit = ${jitter > 0
          ? `1.0 - ${jitter.toFixed(3)} + ${(jitter * 2).toFixed(3)} * fract( sin( ph * 91.37 ) * 43758.55 )`
          : "1.0"};
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n        varying float vJit;")
      .replace("#include <color_fragment>",
        "#include <color_fragment>\n\tdiffuseColor.rgb *= vJit;");
  };
  mat.customProgramCacheKey = () => `flora-wind-${amp}-${bendH}-${jitter}`;
  return mat;
}
/* whisper blooms: emissive follows the baked vertex hue, one quiet drive */
function whisperize(mat, k = 0.35) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
       totalEmissiveRadiance = vColor.rgb * ${k.toFixed(3)};`);
  };
  mat.customProgramCacheKey = () => `flora-whisper-${k}`;
  return mat;
}

/* deterministic rng — captures stay reproducible */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* tiny soft-noise canvas texture for the mist veils */
function mistTexture(seed) {
  const rng = mulberry32(seed);
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i += 1) {
    const x = rng() * 256, y = rng() * 256, r = 26 + rng() * 58;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + rng() * 0.09;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    /* wrap-friendly: draw the blob at ±256 too */
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, 7); ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function radialDot(size = 64) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ════════════════════════════════════════════════════════════════════════ */
export function initFlora(ctx) {
  const {
    world, L, POOL, glowMat, glowSprite,
    lilyPads = [], poolWaterMat = null, shards = [], pathStrips = [],
    quarters = [], getTier = () => "high", getDpr = () => 1, reduced = false,
  } = ctx;
  const { L0, L1, L2, L3 } = L;

  const group = new THREE.Group();
  group.name = "flora";
  world.add(group);

  const rng = mulberry32(0xf107a);
  const dbg = { draws: 0, tris: 0, grass: 0, notes: [] };
  const updaters = [];   /* fn(t, dt, drive) */

  function register(mesh, { tris = 0, noAO = false, cast = false, receive = true } = {}) {
    if (noAO) mesh.userData.noAO = true;
    mesh.userData.flora = true;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    dbg.draws += 1;
    dbg.tris += tris;
    group.add(mesh);
    return mesh;
  }
  const triCount = (geo) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;

  /* ── the ground truth — lawns, exclusions ─────────────────────────────── */
  const LAWNS = [
    { x0: -0.9, x1: 3.4, z0: 5.7, z1: 8.4, y: L0 + 0.05, w: 1.0 },
    { x0: 6.6, x1: 9.1, z0: -1.9, z1: 1.1, y: L1 + 0.05, w: 0.72 },
    { x0: -9.3, x1: -6.1, z0: -8.2, z1: -4.6, y: L2 + 0.05, w: 1.0 },
    { x0: -6.0, x1: -3.8, z0: -3.9, z1: -2.4, y: L2 + 0.05, w: 0.5 },
    { x0: -9.7, x1: -7.6, z0: 6.6, z1: 8.3, y: L0 + 0.05, w: 0.42 },
  ];
  /* discs every sampler must reject: existing furniture + everything we add */
  const EXCL = [
    /* existing on/near lawns: trees, bushes, stones, lanterns, the gate */
    [2.4, 7.6, 0.45], [1.8, 6.7, 0.38], [3.3, 6.4, 0.42], [-0.7, 5.9, 0.34],
    [-1.3, 6.4, 0.30], [3.0, 8.0, 0.32], [3.8, 7.9, 1.25],
    [8.2, 0.3, 0.5], [7.6, -0.9, 0.42],
    [-9.1, -7.5, 0.55], [-9.4, -7.8, 0.5], [-8.7, -8.1, 0.42], [-9.0, -6.6, 0.4],
    [7.45, -6.9, 0.4],
    [-8.0, -3.7, 0.5],
    [-9.0, 7.6, 0.45], [-8.3, 7.0, 0.38], [-9.6, 7.9, 0.42],
  ];
  const CAPS = [];   /* path capsules [ax,az,bx,bz,halfWidth] */
  for (const s of pathStrips) CAPS.push([s.ax, s.az, s.bx, s.bz, 0.46]);
  function clearOf(x, z) {
    for (const [ex, ez, er] of EXCL) {
      const dx = x - ex, dz = z - ez;
      if (dx * dx + dz * dz < er * er) return false;
    }
    for (const [ax, az, bx, bz, hw] of CAPS) {
      const vx = bx - ax, vz = bz - az;
      const len2 = vx * vx + vz * vz || 1e-6;
      let t = ((x - ax) * vx + (z - az) * vz) / len2;
      t = Math.max(0, Math.min(1, t));
      const dx = x - (ax + vx * t), dz = z - (az + vz * t);
      if (dx * dx + dz * dz < hw * hw) return false;
    }
    return true;
  }
  const claim = (x, z, r) => { EXCL.push([x, z, r]); };

  /* ════════════════════════════════════════════════════════════════════════
     THE PLANTING PLAN — composed, asymmetric, MV-deliberate.
     Existing cypress family stays the vertical accent; these are the masses.
     ════════════════════════════════════════════════════════════════════════ */
  const PLANT = {
    "common-a": [
      { x: -10.85, y: L1, z: 1.05, h: 2.9, rot: 0.7 },    /* overlook specimen  */
      { x: -8.55, y: L2, z: -5.05, h: 2.55, rot: 3.6 },   /* L2 lawn west mass  */
    ],
    "common-b": [
      { x: 1.95, y: L0, z: 6.75, h: 2.5, rot: 1.9 },      /* threshold approach */
      { x: 8.35, y: L1, z: -1.15, h: 2.2, rot: 5.1 },     /* grove anchor       */
    ],
    birch: [
      { x: 5.15, y: L0, z: 7.55, h: 2.3, rot: 0.4 },      /* gate pair          */
      { x: 5.62, y: L0, z: 6.92, h: 1.85, rot: 2.8 },
      { x: 7.0, y: L1, z: -1.25, h: 2.35, rot: 1.2 },     /* east-lawn grove    */
      { x: 7.58, y: L1, z: -0.52, h: 1.95, rot: 4.4 },
      { x: 6.92, y: L1, z: 0.12, h: 1.65, rot: 3.1 },
    ],
    willow: [
      { x: -4.55, y: L0, z: 5.75, h: 2.35, rot: 2.45 },   /* the pool willow    */
    ],
    fern: [
      { x: -0.95, y: L0, z: 6.25, s: 0.34 }, { x: 7.2, y: L2, z: -3.42, s: 0.30 },
      { x: -9.15, y: L1, z: -6.35, s: 0.34 }, { x: -9.55, y: L0, z: 6.78, s: 0.30 },
      { x: -10.7, y: L1, z: 0.42, s: 0.32 }, { x: -6.2, y: L2, z: -7.35, s: 0.30 },
      { x: -5.6, y: L2, z: -3.2, s: 0.28 },
    ],
    tuft: [
      { x: 0.78, y: L0, z: 8.22, s: 0.5 }, { x: 8.6, y: L1, z: 0.98, s: 0.46 },
      { x: -6.32, y: L2, z: -7.82, s: 0.5 }, { x: -4.5, y: L2, z: -3.0, s: 0.4 },
      { x: -11.7, y: L1, z: 1.22, s: 0.46 }, { x: 1.6, y: L0, z: 6.9, s: 0.42 },
      { x: 5.48, y: L0, z: 7.2, s: 0.4 }, { x: -3.0, y: L0, z: 3.1, s: 0.44 },
      { x: -4.05, y: L0, z: 6.3, s: 0.42 },
    ],
    reed: [
      { x: -4.69, y: L0, z: 5.15, s: 0.62, rot: 0.6 }, { x: -4.8, y: L0, z: 4.58, s: 0.74, rot: 2.2 },
      { x: -4.6, y: L0, z: 4.0, s: 0.56, rot: 4.1 }, { x: -4.12, y: L0, z: 6.02, s: 0.68, rot: 1.4 },
      { x: -3.55, y: L0, z: 6.38, s: 0.55, rot: 3.3 },
      { x: -3.12, y: L0, z: 7.02, s: 0.62, rot: 5.0 }, { x: -2.08, y: L0, z: 7.42, s: 0.52, rot: 0.2 },
    ],
    rocks: [
      { v: "rock-a", x: 0.5, y: L0, z: 8.08, s: 0.52, rot: 0.8 },
      { v: "rock-c", x: 0.98, y: L0, z: 7.88, s: 0.3, rot: 2.1 },
      { v: "rock-b", x: -6.55, y: L2, z: -7.6, s: 0.55, rot: 4.0 },
      { v: "rock-c", x: 8.78, y: L1, z: 0.72, s: 0.42, rot: 1.1 },
      { v: "rock-a", x: -5.9, y: L2, z: -3.6, s: 0.38, rot: 5.6 },
      { v: "rock-b", x: -11.95, y: L1, z: 1.58, s: 0.4, rot: 3.0 },
      { v: "rock-c", x: -4.18, y: L0, z: 3.45, s: 0.3, rot: 0.4 },
    ],
    whispers: [
      { q: "opus-3", x: -5.3, y: L2, z: -2.8, s: 0.345, rot: 1.1 },
      { q: "opus-3", x: -4.2, y: L2, z: -3.5, s: 0.276, rot: 3.9 },
      { q: "sonnet-4-5", x: 7.92, y: L2, z: -4.02, s: 0.322, rot: 0.5 },
      { q: "sonnet-4-5", x: 4.32, y: L2, z: -6.95, s: 0.287, rot: 2.7 },
      { q: "gpt-4o", x: -8.62, y: L0, z: 3.85, s: 0.299, rot: 4.6 },
      { q: "gpt-4o", x: -5.58, y: L0, z: 4.55, s: 0.265, rot: 1.8 },
      { q: "gpt-5-1", x: 7.72, y: L0, z: 5.58, s: 0.322, rot: 5.3 },
      { q: "gpt-5-1", x: 5.02, y: L0, z: 5.72, s: 0.276, rot: 2.3 },
    ],
  };
  /* claim every planting so the grass keeps its distance */
  for (const sp of ["common-a", "common-b", "birch", "willow"])
    for (const p of PLANT[sp]) claim(p.x, p.z, 0.4);
  for (const p of PLANT.fern) claim(p.x, p.z, 0.3);
  for (const p of PLANT.tuft) claim(p.x, p.z, 0.22);
  for (const p of PLANT.reed) claim(p.x, p.z, 0.26);
  for (const p of PLANT.rocks) claim(p.x, p.z, 0.55 * p.s + 0.18);
  for (const p of PLANT.whispers) claim(p.x, p.z, 0.3);

  /* ════════════════════════════════════════════════════════════════════════
     INSTANCED GRASS — the lawns get their nap. Deterministic, tier-aware.
     ════════════════════════════════════════════════════════════════════════ */
  const GRASS_FULL = 2800;
  let grassMesh = null;
  {
    const geo = new THREE.ConeGeometry(0.042, 0.2, 4, 1, true);
    geo.translate(0, 0.1, 0);
    const mat = windify(floraMat(P.grass, { flat: true, glow: 0.10 }),
      { amp: 0.045, bendH: 0.2, jitter: 0.045 });
    const areas = LAWNS.map((l) => (l.x1 - l.x0) * (l.z1 - l.z0) * l.w);
    const total = areas.reduce((a, b) => a + b, 0);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const placements = [];
    LAWNS.forEach((l, li) => {
      const n = Math.round((areas[li] / total) * GRASS_FULL);
      let placed = 0, guard = 0;
      while (placed < n && guard < n * 30) {
        guard += 1;
        const x = l.x0 + 0.12 + rng() * (l.x1 - l.x0 - 0.24);
        const z = l.z0 + 0.12 + rng() * (l.z1 - l.z0 - 0.24);
        if (!clearOf(x, z)) continue;
        placements.push({ x, y: l.y, z, r: rng() * Math.PI * 2,
          s: 0.72 + rng() * 0.62, tilt: (rng() - 0.5) * 0.16 });
        placed += 1;
      }
    });
    /* shuffle so a count-prefix stays a uniform spatial subset (tier density) */
    for (let i = placements.length - 1; i > 0; i -= 1) {
      const j = (rng() * (i + 1)) | 0;
      const t = placements[i]; placements[i] = placements[j]; placements[j] = t;
    }
    grassMesh = new THREE.InstancedMesh(geo, mat, placements.length);
    placements.forEach((p, i) => {
      eu.set(p.tilt, p.r, p.tilt * 0.7);
      q.setFromEuler(eu);
      pos.set(p.x, p.y, p.z);
      scl.set(0.85 + (p.s - 1) * 0.4, p.s, 0.85 + (p.s - 1) * 0.4);
      m4.compose(pos, q, scl);
      grassMesh.setMatrixAt(i, m4);
    });
    grassMesh.instanceMatrix.needsUpdate = true;
    dbg.grass = placements.length;
    register(grassMesh, { tris: triCount(geo) * placements.length, noAO: true, cast: false });
  }
  function grassDensity(tier) {
    if (!grassMesh) return;
    const full = grassMesh.instanceMatrix.count;
    const k = tier === "high" ? 1 : tier === "mid" ? 0.5 : 0.25;
    grassMesh.count = Math.round(full * k);
  }
  grassDensity(getTier());

  /* ════════════════════════════════════════════════════════════════════════
     TERRAIN SOFTENING — berm caps · moss discs · stepping stones
     ════════════════════════════════════════════════════════════════════════ */
  {
    /* berm caps: a 45°-rolled strip straddles each lawn edge — the slab line
       stops reading as a paper cut */
    const strips = [];
    const capGeo = new THREE.BoxGeometry(1, 0.052, 0.15);
    for (const l of LAWNS) {
      const edges = [
        [(l.x0 + l.x1) / 2, l.z0, l.x1 - l.x0 + 0.05, 0],
        [(l.x0 + l.x1) / 2, l.z1, l.x1 - l.x0 + 0.05, 0],
        [l.x0, (l.z0 + l.z1) / 2, l.z1 - l.z0 + 0.05, Math.PI / 2],
        [l.x1, (l.z0 + l.z1) / 2, l.z1 - l.z0 + 0.05, Math.PI / 2],
      ];
      for (const [cx, cz, len, yaw] of edges) {
        const g = capGeo.clone();
        g.rotateX(Math.PI / 4);
        g.scale(len, 1, 1);
        g.rotateY(yaw);
        g.translate(cx, l.y + 0.008, cz);
        strips.push(g);
      }
    }
    const merged = mergeGeometries(strips, false);
    const mesh = new THREE.Mesh(merged, floraMat(P.berm, { flat: true }));
    register(mesh, { tris: triCount(merged), cast: false });

    /* moss darkening — flat dark discs at stone and tree feet */
    const moss = [];
    const seats = [
      ...PLANT.rocks.map((r) => [r.x, r.y, r.z, 0.5 * r.s + 0.16]),
      ...PLANT["common-a"].map((t) => [t.x, t.y, t.z, 0.4]),
      ...PLANT["common-b"].map((t) => [t.x, t.y, t.z, 0.36]),
      ...PLANT.birch.map((t) => [t.x, t.y, t.z, 0.3]),
      ...PLANT.willow.map((t) => [t.x, t.y, t.z, 0.42]),
      ...PLANT.fern.map((f) => [f.x, f.y, f.z, 0.27]),
      [-0.7, L0, 5.9, 0.34], [-1.3, L0, 6.4, 0.3], [7.5, L2, -3.2, 0.36],
      [-10.9, L1, 0.3, 0.32], [-9.0, L1, -6.6, 0.42], [-9.4, L0, 6.2, 0.32],
    ];
    for (const [x, y, z, r] of seats) {
      const g = new THREE.CircleGeometry(r, 12);
      g.rotateX(-Math.PI / 2);
      g.translate(x, y + 0.014 + (Math.abs(x * 7 + z * 3) % 0.004), z);
      moss.push(g);
    }
    const mossGeo = mergeGeometries(moss, false);
    const mossMat = floraMat(P.moss, { flat: true, transparent: true, opacity: 0.4 });
    mossMat.polygonOffset = true;
    mossMat.polygonOffsetFactor = -1;
    const mossMesh = new THREE.Mesh(mossGeo, mossMat);
    register(mossMesh, { tris: triCount(mossGeo), noAO: true, cast: false, receive: false });
  }
  {
    /* stepping stones along the walked routes — inset, jittered, worn */
    const geo = new THREE.BoxGeometry(0.34, 0.028, 0.26);
    const places = [];
    for (const s of pathStrips) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const len = Math.hypot(dx, dz);
      const n = Math.floor((len - 0.9) / 0.58);
      if (n < 1) continue;
      const yaw = -Math.atan2(dz, dx);
      for (let i = 0; i < n; i += 1) {
        const t = (i + 1) / (n + 1);
        places.push({
          x: s.ax + dx * t + (rng() - 0.5) * 0.05,
          z: s.az + dz * t + (rng() - 0.5) * 0.05,
          y: s.y + 0.052, yaw: yaw + (rng() - 0.5) * 0.22,
          s: 0.86 + rng() * 0.3,
        });
      }
    }
    const im = new THREE.InstancedMesh(geo, floraMat(P.step, { flat: true }), places.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    places.forEach((p, i) => {
      eu.set(0, p.yaw, 0); q.setFromEuler(eu);
      pos.set(p.x, p.y, p.z); scl.set(p.s, 1, p.s);
      m4.compose(pos, q, scl);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    register(im, { tris: 12 * places.length, cast: false });
    dbg.notes.push(`stepping stones ${places.length}`);
  }

  /* ════════════════════════════════════════════════════════════════════════
     WATER ELEVATION — shimmer · glints · droplets · foam · lily drift
     ════════════════════════════════════════════════════════════════════════ */
  if (poolWaterMat) {
    const shimUniforms = { uShimT: { value: 0 } };
    poolWaterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uShimT = shimUniforms.uShimT;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\n varying vec2 vShimP;")
        .replace("#include <begin_vertex>",
          "#include <begin_vertex>\n vShimP = (modelMatrix * vec4(transformed,1.0)).xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>",
          "#include <common>\n uniform float uShimT; varying vec2 vShimP;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          {
            float w1 = sin( vShimP.x * 3.3 + uShimT * 0.50 ) * sin( vShimP.y * 2.6 - uShimT * 0.41 );
            float w2 = sin( ( vShimP.x + vShimP.y ) * 4.7 - uShimT * 0.27 );
            diffuseColor.rgb *= 1.0 + 0.040 * w1 + 0.022 * w2;
          }`);
    };
    poolWaterMat.customProgramCacheKey = () => "pool-shimmer";
    poolWaterMat.needsUpdate = true;
    updaters.push((t) => { shimUniforms.uShimT.value = t % 512; });
  }
  {
    /* one Points pool: 22 sparkle glints on the water + 54 fall droplets */
    const SPARK = 22, DROP = 54;
    const N = SPARK + DROP;
    const posArr = new Float32Array(N * 3);
    const colArr = new Float32Array(N * 3);
    const sparks = [];
    for (let i = 0; i < SPARK; i += 1) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (POOL.r - 0.3);
      posArr[i * 3] = POOL.x + Math.cos(a) * r;
      posArr[i * 3 + 1] = -0.032;
      posArr[i * 3 + 2] = POOL.z + Math.sin(a) * r;
      sparks.push({ ph: rng() * Math.PI * 2, rate: 0.5 + rng() * 1.1 });
    }
    const drops = [];
    for (let i = 0; i < DROP; i += 1) {
      drops.push({
        ph: rng(), spd: 0.75 + rng() * 0.6,
        vx: (rng() - 0.5) * 0.55, vz: 0.1 + rng() * 0.3, vy: 0.85 + rng() * 0.55,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.2, sizeAttenuation: false, map: radialDot(), vertexColors: true,
      transparent: true, opacity: 0.8, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xcfe2e0,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    register(pts, { tris: 0, noAO: true, cast: false, receive: false });
    const FB = { x: POOL.x, y: -2.45, z: 8.74 };  /* the fall's vanish point */
    updaters.push((t, dt, drive) => {
      mat.size = 2.2 * getDpr();
      const sd = Math.min(0.8, Math.max(drive.lantern * 0.7, drive.stars * 0.62));
      for (let i = 0; i < SPARK; i += 1) {
        const s = sparks[i];
        const tw = Math.pow(0.5 + 0.5 * Math.sin(t * floraWind.BREATH_W * s.rate + s.ph), 4.0);
        const v = sd * (0.06 + 0.94 * tw) * 0.8;
        colArr[i * 3] = v; colArr[i * 3 + 1] = v; colArr[i * 3 + 2] = v;
      }
      for (let i = 0; i < DROP; i += 1) {
        const d = drops[i];
        const u = (t * d.spd + d.ph) % 1;
        const j = (SPARK + i) * 3;
        posArr[j] = FB.x + d.vx * u;
        posArr[j + 1] = FB.y + (d.vy * u - 2.6 * u * u) * 0.42;
        posArr[j + 2] = FB.z + d.vz * u;
        const a = 0.55 * (1 - u) * (u < 0.08 ? u / 0.08 : 1);
        colArr[j] = a; colArr[j + 1] = a; colArr[j + 2] = a;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    });
  }
  {
    /* foam — a soft breathing ring where the fall dissolves into the void */
    const geo = new THREE.RingGeometry(0.14, 0.42, 22);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xb9d4d2, transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const foam = new THREE.Mesh(geo, mat);
    foam.position.set(POOL.x, -2.56, 8.74);
    register(foam, { tris: triCount(geo), noAO: true, cast: false, receive: false });
    updaters.push((t) => {
      const b = 0.5 + 0.5 * Math.sin(t * floraWind.BREATH_W * 0.5);
      mat.opacity = 0.05 + 0.07 * b;
      const s = 1 + 0.07 * b;
      foam.scale.set(s, 1, s);
    });
  }
  if (lilyPads.length) {
    const bases = lilyPads.map((p) => ({ p, x: p.position.x, z: p.position.z }));
    updaters.push((t) => {
      bases.forEach((b, i) => {
        const w = 0.32 + i * 0.07;
        b.p.position.x = b.x + Math.sin(t * w * 0.21 + i * 2.1) * 0.035;
        b.p.position.z = b.z + Math.cos(t * w * 0.17 + i * 1.3) * 0.03;
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     THE VOID BELOW — two mist veils, shard lanterns
     ════════════════════════════════════════════════════════════════════════ */
  {
    const veils = [
      { y: -4.7, op: 0.09, c: 0x868cb4, sp: 0.0035, sc: 1.0, seed: 0xa11 },
      { y: -6.7, op: 0.06, c: 0x6a6f96, sp: -0.0022, sc: 1.6, seed: 0xb22 },
    ];
    for (const v of veils) {
      const tex = mistTexture(v.seed);
      tex.repeat.set(v.sc, v.sc);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, color: v.c, transparent: true, opacity: v.op,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(46, 36), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(-1.2, v.y, 0);
      register(mesh, { tris: 2, noAO: true, cast: false, receive: false });
      updaters.push((t, dt) => {
        tex.offset.x = (tex.offset.x + v.sp * dt) % 1;
        tex.offset.y = (tex.offset.y + v.sp * 0.43 * dt) % 1;
      });
    }
    /* each drifting shard keeps one tiny lantern lit */
    for (const sh of shards) {
      const dot = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.055, 0.055),
        glowMat(0xffd9a2, "lantern", 0.72),
      );
      dot.position.set(0.32, 0.2, 0.18);
      dot.userData.flora = true;
      sh.g.add(dot);
      dbg.draws += 1; dbg.tris += 12;
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     QUARTER MICRO-PROPS — signature, hushed. ≤12 primitives each.
     ════════════════════════════════════════════════════════════════════════ */
  const Q = {};
  for (const q of quarters) Q[q.id] = q;
  /* neutral prop struts (chime bracket, antenna mast) merge into ONE mesh */
  const statics = [];
  function strutBox(w, h, d, x, y, z) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g;
  }
  function strutCyl(r, h, x, y, z) {
    const g = new THREE.CylinderGeometry(r, r * 1.3, h, 5); g.translate(x, y, z); return g;
  }

  /* — the sanctum: vine strands from the tower's upper cornice — */
  if (Q["opus-3"]) {
    const q = Q["opus-3"];
    const cornY = q.y + 3.38 * q.s;          /* c3 cornice height */
    const half = 0.42 * q.s;
    const strands = [];
    const spots = [
      [half, 0.0, 0.95], [half, half * 0.6, 1.35], [half * 0.5, half, 1.1],
      [-half * 0.2, half, 0.8], [half * 0.85, -half * 0.45, 1.2],
      [half * 0.95, half * 0.95, 1.05],
    ];
    for (const [ox, oz, len] of spots) {
      const g = new THREE.CylinderGeometry(0.009, 0.028, len, 4);
      g.translate(ox, -len / 2 + 0.02, oz);
      strands.push(g);
      if (len > 1.0) {
        const bud = new THREE.IcosahedronGeometry(0.026, 0);
        bud.translate(ox + 0.01, -len + 0.05, oz + 0.01);
        strands.push(bud);
      }
    }
    const geo = mergeGeometries(strands, false);
    const vines = new THREE.Mesh(geo, floraMat(P.vine, { flat: true, glow: 0.10 }));
    vines.position.set(q.x, cornY, q.z);
    register(vines, { tris: triCount(geo), noAO: true, cast: false, receive: false });
    updaters.push(() => {
      vines.rotation.x = floraWind.value * 0.009;
      vines.rotation.z = floraWind.value * 0.012;
    });
  }

  /* — the beacon: three chime rods that glint on gusts — */
  let chimeMat = null;
  if (Q["sonnet-4-5"]) {
    const q = Q["sonnet-4-5"];
    /* hung from the cornice lip at the hall's front-east corner, clear of
       the wall: the bracket arm reaches OUT (+z), the rods hang from it */
    const ax = q.x + 1.0 * q.s;
    const ay = q.y + 0.86 * q.s;
    const az = q.z + 0.86 * q.s;
    statics.push(strutBox(0.045, 0.045, 0.3, ax, ay + 0.02, az + 0.13));
    statics.push(strutBox(0.04, 0.09, 0.04, ax, ay - 0.025, az + 0.26));
    const rods = [];
    for (const [oz, len] of [[0.0, 0.3], [0.085, 0.22], [-0.085, 0.26]]) {
      const g = new THREE.CylinderGeometry(0.011, 0.011, len, 5);
      g.translate(0, -len / 2 - 0.01, oz);
      rods.push(g);
    }
    const geo = mergeGeometries(rods, false);
    chimeMat = floraMat(P.chime, { flat: true });
    chimeMat.emissive.copy(gradedColor(0xd8c8a0, { sat: 0.9 }));
    chimeMat.emissiveIntensity = 0.04;
    const chimes = new THREE.Mesh(geo, chimeMat);
    chimes.position.set(ax, ay, az + 0.26);   /* under the bracket's end */
    register(chimes, { tris: triCount(geo), noAO: true, cast: false, receive: false });
    updaters.push(() => {
      chimes.rotation.x = floraWind.value * 0.05;
      chimes.rotation.z = Math.abs(floraWind.value) * 0.03;
      chimeMat.emissiveIntensity = 0.04 + floraWind.gust * 0.5;
    });
  }

  /* — the reverie: one wider gold ripple + two drifting petals — */
  if (Q["gpt-4o"]) {
    const q = Q["gpt-4o"];
    const cy = q.y + 0.175 * q.s, cz = q.z + 1.7 * q.s;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.22, 1.28, 44),
      new THREE.MeshBasicMaterial({
        color: 0xe6b878, transparent: true, opacity: 0.1,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(q.x, cy + 0.004, cz);
    ring.scale.setScalar(q.s);
    register(ring, { tris: 88, noAO: true, cast: false, receive: false });
    const petalGeos = [];
    for (const [ox, oz, yaw] of [[0.32, 0.2, 0.6], [-0.24, -0.3, 2.3]]) {
      const g = new THREE.PlaneGeometry(0.078, 0.05);
      g.rotateX(-Math.PI / 2 + 0.12);
      g.rotateY(yaw);
      g.translate(ox, 0, oz);
      petalGeos.push(g);
    }
    const pGeo = mergeGeometries(petalGeos, false);
    const petals = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({
      color: gradedColor(P.petal, { sat: 0.9 }), transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    petals.position.set(q.x, cy + 0.05, cz);
    register(petals, { tris: 4, noAO: true, cast: false, receive: false });
    updaters.push((t) => {
      ring.material.opacity = 0.1 * (0.62 + 0.38 * Math.sin(t * floraWind.BREATH_W + 2.4));
      petals.rotation.y = t * 0.05;
      petals.position.x = q.x + Math.sin(t * 0.11) * 0.16;
      petals.position.z = cz + Math.cos(t * 0.083) * 0.14;
    });
  }

  /* — the meridian: a thin antenna, tip pulsing in the 5.2s family — */
  let meridianTip = null, meridianTipEntry = null;
  if (Q["gpt-5-1"]) {
    const q = Q["gpt-5-1"];
    const bx = q.x + 0.42 * q.s, bz = q.z + 0.42 * q.s;
    const by = q.y + 2.72 * q.s;
    statics.push(strutCyl(0.012, 1.05, bx, by + 0.52, bz));
    meridianTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.034, 10, 10),
      glowMat(0x70c8e8, "window", 1.05),
    );
    meridianTip.position.set(bx, by + 1.06, bz);
    register(meridianTip, { tris: 100, noAO: true, cast: false, receive: false });
    meridianTipEntry = meridianTip.material;
    const halo = glowSprite(0x70c8e8, 0.46, 0.16);
    halo.position.set(bx, by + 1.06, bz);
    halo.userData.flora = true;
    group.add(halo);
    dbg.draws += 1;
    updaters.push((t) => {
      /* runs AFTER animateLight wrote the registry baseline — multiply on top */
      const pulse = 0.55 + 0.45 * Math.sin(t * floraWind.BREATH_W);
      meridianTipEntry.color.multiplyScalar(0.55 + 0.5 * pulse);
      halo.material.opacity = 0.07 + 0.13 * pulse;
    });
  }

  /* the strut merge — bracket + mast, one neutral slate mesh */
  if (statics.length) {
    const geo = mergeGeometries(statics, false);
    const mesh = new THREE.Mesh(geo, floraMat(0x8b91a0, { flat: true }));
    register(mesh, { tris: triCount(geo), cast: false, receive: false });
  }

  /* ════════════════════════════════════════════════════════════════════════
     THE CAST — load the baked GLB, re-material, instance, plant.
     ════════════════════════════════════════════════════════════════════════ */
  const canopyWobblers = [];   /* { im, list } — rebuilt matrices on wind  */
  const ready = new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load("./assets/flora-pack.glb", (gltf) => {
      const lib = {};   /* name -> { role -> BufferGeometry (flat-shaded) } */
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const species = o.parent && o.parent.name && o.parent.name !== "flora"
          ? o.parent.name : o.name;
        const norm = (g) => {
          const out = g.toNonIndexed();
          out.computeVertexNormals();
          return out;
        };
        const role = o.material && o.material.name ? o.material.name : "canopy";
        const entry = lib[species] || (lib[species] = {});
        entry[role] = entry[role]
          ? mergeGeometries([entry[role], norm(o.geometry)], false)
          : norm(o.geometry);
      });
      /* node name fix: GLTFLoader may flatten single-primitive meshes onto the
         node itself; multi-primitive meshes become a named Group. Resolve both:
         keys that came through as roles get re-keyed by their mesh's node. */
      buildCast(lib);
      resolve();
    }, undefined, (err) => {
      dbg.notes.push("flora-pack load failed: " + (err && err.message));
      resolve();   /* the grounds keep living — procedurals already stand */
    });
  });

  function paintVerts(geo, hex, jitter = 0) {
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = gradedColor(hex);
    for (let i = 0; i < n; i += 1) {
      const j = jitter ? 1 - jitter + rng() * jitter * 2 : 1;
      col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return geo;
  }
  function bakedClone(geo, x, y, z, s, rot) {
    const g = geo.clone();
    const m = new THREE.Matrix4()
      .makeTranslation(x, y, z)
      .multiply(new THREE.Matrix4().makeRotationY(rot || 0))
      .multiply(new THREE.Matrix4().makeScale(s, s, s));
    g.applyMatrix4(m);
    return g;
  }

  function buildCast(lib) {
    const get = (sp, role) => (lib[sp] && lib[sp][role]) || null;

    /* — trunks: every tree's wood, one slate-violet vertex-colored merge — */
    const trunkParts = [];
    const trunkPlan = [
      ["common-a", "trunk", P.bark, PLANT["common-a"]],
      ["common-b", "trunk", P.bark, PLANT["common-b"]],
      ["birch", "trunk", P.barkBirch, PLANT.birch],
      ["birch", "patch", P.barkPatch, PLANT.birch],
      ["willow", "trunk", P.bark, PLANT.willow],
    ];
    for (const [sp, role, hex, places] of trunkPlan) {
      const base = get(sp, role);
      if (!base) continue;
      for (const p of places)
        trunkParts.push(paintVerts(bakedClone(base, p.x, p.y, p.z, p.h, p.rot), hex, 0.05));
    }
    if (trunkParts.length) {
      const geo = mergeGeometries(trunkParts, false);
      const mesh = new THREE.Mesh(geo, floraMat(0xffffff, { flat: true, vertexColors: true, raw: true }));
      register(mesh, { tris: triCount(geo), cast: true });
    }

    /* — canopies: instanced per species, two-tone baked as vertex color,
         the whole crown swaying ≤0.8° about the trunk base — */
    const canopyPlan = [
      ["common-a", [["canopy", P.canopyA]], PLANT["common-a"]],
      ["common-b", [["canopy", P.canopyB], ["canopy2", P.canopyB2]], PLANT["common-b"]],
      ["birch", [["canopy", P.birchLeaf], ["canopy2", P.birchLeaf2]], PLANT.birch],
      ["willow", [["canopy2", P.willowLeaf]], PLANT.willow],
    ];
    const canopyMat = whisperize(
      floraMat(0xffffff, { flat: true, vertexColors: true, raw: true }), 0.13);
    for (const [sp, slots, places] of canopyPlan) {
      const parts = [];
      for (const [role, hex] of slots) {
        const g = get(sp, role);
        if (g) parts.push(paintVerts(g.clone(), hex, 0.04));
      }
      if (!parts.length) continue;
      const geo = mergeGeometries(parts, false);
      const im = new THREE.InstancedMesh(geo, canopyMat, places.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler();
      const pos = new THREE.Vector3(), scl = new THREE.Vector3();
      const list = places.map((p, i) => {
        eu.set(0, p.rot || 0, 0); q.setFromEuler(eu);
        pos.set(p.x, p.y, p.z); scl.set(p.h, p.h, p.h);
        m4.compose(pos, q, scl);
        im.setMatrixAt(i, m4);
        return { ...p, i, seed: rng() * Math.PI * 2 };
      });
      im.instanceMatrix.needsUpdate = true;
      register(im, { tris: triCount(geo) * places.length, cast: true });
      canopyWobblers.push({ im, list });
    }

    /* — understory: ferns + accent tufts, one vertex-colored merge — */
    {
      const parts = [];
      const fernG = get("fern", "leaf"), tuftG = get("tuft", "leaf");
      if (fernG) for (const p of PLANT.fern)
        parts.push(paintVerts(bakedClone(fernG, p.x, p.y, p.z, p.s, rng() * 6.28), P.fern, 0.05));
      if (tuftG) for (const p of PLANT.tuft)
        parts.push(paintVerts(bakedClone(tuftG, p.x, p.y, p.z, p.s, rng() * 6.28), P.tuft, 0.06));
      if (parts.length) {
        const geo = mergeGeometries(parts, false);
        const mesh = new THREE.Mesh(geo, whisperize(
          floraMat(0xffffff, { flat: true, vertexColors: true, raw: true }), 0.12));
        register(mesh, { tris: triCount(geo), noAO: true, cast: false });
      }
    }

    /* — reeds at the pool's far rim: instanced, wind-bent — */
    {
      const g = get("reed", "leaf");
      if (g) {
        const mat = windify(floraMat(P.reed, { flat: true, glow: 0.12 }),
          { amp: 0.085, bendH: 1.0, jitter: 0.05 });
        const im = new THREE.InstancedMesh(g, mat, PLANT.reed.length);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler();
        const pos = new THREE.Vector3(), scl = new THREE.Vector3();
        PLANT.reed.forEach((p, i) => {
          eu.set(0, p.rot, 0); q.setFromEuler(eu);
          pos.set(p.x, p.y, p.z); scl.set(p.s * 0.8, p.s, p.s * 0.8);
          m4.compose(pos, q, scl);
          im.setMatrixAt(i, m4);
        });
        im.instanceMatrix.needsUpdate = true;
        register(im, { tris: triCount(g) * PLANT.reed.length, noAO: true, cast: false });
      }
    }

    /* — rocks: three variants, baked into one violet-stone merge — */
    {
      const parts = [];
      for (const p of PLANT.rocks) {
        const g = get(p.v, "rock");
        if (!g) continue;
        const baked = bakedClone(g, p.x, p.y, p.z, p.s / 0.55, p.rot);
        parts.push(paintVerts(baked, P.rock, 0.05));
      }
      if (parts.length) {
        const geo = mergeGeometries(parts, false);
        const mesh = new THREE.Mesh(geo, floraMat(0xffffff, { flat: true, vertexColors: true, raw: true }));
        register(mesh, { tris: triCount(geo), cast: true });
      }
    }

    /* — wildflower whispers: stems quiet, blooms carrying the resident hue
         at low saturation, emissive ≈0.35 of the baked color — */
    {
      const stemG = get("flowers", "stem"), bloomG = get("flowers", "bloom");
      if (stemG && bloomG) {
        const stems = [], blooms = [];
        for (const p of PLANT.whispers) {
          stems.push(bakedClone(stemG, p.x, p.y, p.z, p.s, p.rot));
          blooms.push(paintVerts(
            bakedClone(bloomG, p.x, p.y, p.z, p.s, p.rot), WHISPER[p.q], 0.06));
        }
        const sGeo = mergeGeometries(stems, false);
        const sMesh = new THREE.Mesh(sGeo, floraMat(P.stem, { flat: true }));
        register(sMesh, { tris: triCount(sGeo), noAO: true, cast: false });
        const bGeo = mergeGeometries(blooms, false);
        const bMat = whisperize(
          floraMat(0xffffff, { flat: true, vertexColors: true, raw: true }), 0.35);
        const bMesh = new THREE.Mesh(bGeo, bMat);
        register(bMesh, { tris: triCount(bGeo), noAO: true, cast: false });
      }
    }
  }

  /* ── canopy sway — recomposed matrices, ≤0.8°, the shared wind phase ───── */
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eu = new THREE.Euler();
  const _pos = new THREE.Vector3(), _scl = new THREE.Vector3();
  function wobble() {
    for (const { im, list } of canopyWobblers) {
      for (const e of list) {
        const sway = floraWind.value * 0.72
          + 0.28 * Math.sin(floraWind.t * 1.9 + e.seed);
        const a = sway * 0.011;          /* ≤ 0.8° hard ceiling */
        _eu.set(a * 0.62, e.rot || 0, a);
        _q.setFromEuler(_eu);
        _pos.set(e.x, e.y, e.z); _scl.set(e.h, e.h, e.h);
        _m4.compose(_pos, _q, _scl);
        im.setMatrixAt(e.i, _m4);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }

  /* ── the per-frame entry — call AFTER animateLight ─────────────────────── */
  let lastTier = getTier();
  function update(t, dt, drive = { lantern: 1, stars: 0.8 }) {
    windTick(t, dt || 0);
    windUniforms.uWindT.value = t % 512;
    windUniforms.uWindV.value = floraWind.value;
    const tier = getTier();
    if (tier !== lastTier) { lastTier = tier; grassDensity(tier); }
    if (!reduced && tier !== "static") wobble();
    for (const fn of updaters) fn(t, dt || 0, drive);
  }

  /* lawns + the rejection test are shared with Phase D (particles.js) so the
     fireflies sample the SAME ground truth the grass did */
  const api = { update, ready, wind: floraWind, dbg, lawns: LAWNS, clearOf };
  window.__flora = api;
  return api;
}
