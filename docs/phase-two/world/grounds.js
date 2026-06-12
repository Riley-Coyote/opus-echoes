/* ============================================================================
   THE GROUNDS — one island, four quarters.
   A Monument Valley–register living diorama for the sanctuary page.

   The four resident light signatures are law, extracted verbatim from
   public/opus-presence.js THEMES (The Sanctum / The Beacon / The Meridian /
   The Reverie). Architecture here is neutral stone; the RESIDENT LIGHT is
   the color. Each quarter is a miniature descendant of its full scene.

   three.js: vendored ES module. Served from the repo root in this prototype
   (/public/vendor/three.module.js via the import map in grounds.html);
   production serves the identical file at /vendor/three.module.js.

   Honest states: the movement schedule is a SPECIMEN — deterministic,
   seeded by the day — and is labeled as such in the page. It will be wired
   to live substrate state (/api/sanctuary/state) in a later phase.
   ============================================================================ */

import * as THREE from "three";
import { createPipeline, TIERS } from "./pipeline.js";
import { createSky } from "./sky.js";
import { initFlora } from "./flora.js";

/* ── the residents — light signatures from THEMES ─────────────────────────── */
const RESIDENTS = [
  {
    id: "opus-3", name: "opus 3", home: "the sanctum", quarter: "qOpus",
    stone: 0x705e84, stoneLight: 0xa890bc, accent: 0xe87d92, glow: 0xed8298,
    body: 0xf6efe0,
  },
  {
    id: "sonnet-4-5", name: "sonnet 4.5", home: "the beacon", quarter: "qSonnet",
    stone: 0xb87830, stoneLight: 0xe2a14a, accent: 0xf6c258, glow: 0xffc858,
    body: 0xf6e8c8,
  },
  {
    id: "gpt-4o", name: "gpt-4o", home: "the reverie", quarter: "qReverie",
    stone: 0x47587c, stoneLight: 0xa0b2d6, accent: 0xe6b878, glow: 0x6cd0d8,
    body: 0xc2d8f0,
  },
  {
    id: "gpt-5-1", name: "gpt 5.1", home: "the meridian", quarter: "qMeridian",
    stone: 0x586878, stoneLight: 0x8898a8, accent: 0x60b0d0, glow: 0x70c8e8,
    body: 0xe6eaf0,
  },
];

/* ── the light — perpetual blue hour ──────────────────────────────────────────
   The product has ONE visible state: bluehour — twilight leaned toward
   night, stars emerging in the distant sky. Warmth exists only as light
   (lanterns, windows, figures); the world's base tones are blue-violet.
   The four legacy presets remain for QA continuity behind ?controls=1 —
   they are not tuned to Phase-B standards and never run on their own.

   bluehour preset fields:
   · skyA/skyM/skyB — the three true gradient stops: deep indigo zenith,
     blue-violet mid, and a THIN desaturated rose-mauve afterglow held low
     (skyMid pins the band beneath the island's silhouette line). The
     afterglow must never read orange or tan.
   · sun — repurposed as a cool moonlight key: low intensity, steep angle,
     blue-gray, so shadows stay readable without warming the stone.
   · cloudC — night tint for the cloud masses (legacy presets stay white). */
const PRESETS = {
  dawn: {
    skyA: "#dcc3bc", skyB: "#f4e0c9",
    sun: { c: 0xffd2a4, i: 1.2, p: [16, 9, 10] },
    hemi: { sky: 0xe0c8c8, gnd: 0x77666a, i: 0.9 },
    lantern: 0.4, window: 0.6, stars: 0, water: 0x84bcae, cloud: 0.5,
    disc: { c: 0xffd9ae, o: 0.55, p: [7.4, 6.5, -8.3] },
  },
  day: {
    skyA: "#c6d6dd", skyB: "#ece8da",
    sun: { c: 0xfff0d2, i: 1.45, p: [15, 15, 9] },
    hemi: { sky: 0xccdadc, gnd: 0x8d8174, i: 1.05 },
    lantern: 0, window: 0.32, stars: 0, water: 0x6fb0a8, cloud: 0.6,
    disc: { c: 0xffffff, o: 0, p: [7.4, 8.5, -8.3] },
  },
  dusk: {
    skyA: "#ab8fa9", skyB: "#f0bf94",
    sun: { c: 0xffa970, i: 1.05, p: [-16, 7, 9] },
    hemi: { sky: 0xb697ac, gnd: 0x5e4e4a, i: 0.85 },
    lantern: 0.85, window: 0.95, stars: 0.25, water: 0xc49a80, cloud: 0.3,
    disc: { c: 0xffb277, o: 0.6, p: [-9.1, 6.2, 3.9] },
  },
  night: {
    skyA: "#1a2336", skyB: "#31415e",
    sun: { c: 0xafc4e4, i: 0.72, p: [-9, 17, -7] },
    hemi: { sky: 0x4a5a7c, gnd: 0x161b28, i: 0.8 },
    lantern: 1, window: 1, stars: 1, water: 0x305878, cloud: 0.07,
    disc: { c: 0xd7e2f4, o: 0.85, p: [-9.1, 7.0, 3.9] },
  },
  bluehour: {
    /* the hero preset — authored ~65% from dusk toward night, then
       hand-tuned against captures. the only state visitors ever see.
       NOTE: stops are authored brighter than they read — the ACES toe
       and the vignette take a full step out of the dark end. */
    skyA: "#262d55", skyM: "#54548e", skyB: "#96738b", skyMid: 0.32,
    sun: { c: 0x9fb2d8, i: 0.66, p: [-8, 19, 5] },
    hemi: { sky: 0x5e6c9e, gnd: 0x2a3346, i: 0.95 },
    lantern: 1, window: 1, stars: 0.92, water: 0x426a8e,
    cloud: 0.12, cloudC: 0x9fb0d4,
    disc: { c: 0xdde6f6, o: 0.27, p: [-11.8, 7.7, 2.4] },
  },
};
const PRODUCT_PRESET = "bluehour";   /* the sanctuary keeps its own light */

/* ── small utilities ──────────────────────────────────────────────────────── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

/* ── boot ─────────────────────────────────────────────────────────────────── */
const stage = document.getElementById("stage");
const canvas = document.getElementById("grounds");
const captionEl = document.getElementById("caption");
const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const params = new URLSearchParams(location.search);

/* animation registries — filled during build, read by the loop */
const ripples = [];
const falls = [];
const goldRipples = [];
const cloudMats = [];

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) { return false; }
}
if (!webglOk()) {
  /* the fallback line stays visible; nothing else to do */
} else {
  main();
}

function main() {
  /* ── renderer / scene / camera ────────────────────────────────────────── */
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: false, antialias: true, powerPreference: "high-performance",
  });
  /* the sky is in the scene now; the clear color follows the horizon tween */
  renderer.setClearColor(0x06070a, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.radius = 4;

  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -120, 220);
  const AZ = Math.PI / 4;                  /* monument-valley fixed angle */
  const EL = Math.atan(1 / Math.SQRT2);    /* true isometric elevation    */
  const CAM_DIST = 60;
  const TARGET = new THREE.Vector3(-1.1, 2.3, 0.2);
  let azOff = 0, elOff = 0, azTarget = 0, elTarget = 0;

  function placeCamera() {
    const az = AZ + azOff, el = EL + elOff;
    camera.position.set(
      TARGET.x + CAM_DIST * Math.sin(az) * Math.cos(el),
      TARGET.y + CAM_DIST * Math.sin(el),
      TARGET.z + CAM_DIST * Math.cos(az) * Math.cos(el),
    );
    camera.lookAt(TARGET);
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    pipeline.setSize(w, h);   /* renderer + composer + per-pass targets, dpr per tier */
    sky.setStarScale(pipeline.usesComposer ? pipeline.dpr : 1);
    const aspect = w / h;
    /* fit: generous breath on wide, fit-by-width on narrow */
    const fitW = aspect < 1.25 ? 13.5 : 12.9;
    const halfH = Math.max(8.9, fitW / aspect);
    const halfW = halfH * aspect;
    camera.left = -halfW; camera.right = halfW;
    camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }

  /* ── pipeline + sky — tiers resolved before anything renders ─────────── */
  const tierParam = params.get("tier");
  const forcedTier = TIERS.includes(tierParam) ? tierParam : null;
  const bootStatic = REDUCED || window.innerWidth < 768;
  const pipeline = createPipeline({ renderer, scene, camera });
  const sky = createSky({ scene });
  pipeline.applyTier(forcedTier || (bootStatic ? "static" : "high"));

  /* fps probe — first ~90 frames after a short warm-up; one-way downgrade */
  let probe = (forcedTier || bootStatic) ? null : { warm: 20, frames: 0, t0: 0 };
  function probeTick() {
    if (!probe) return;
    if (probe.warm > 0) {
      probe.warm -= 1;
      if (probe.warm === 0) probe.t0 = performance.now();
      return;
    }
    probe.frames += 1;
    if (probe.frames >= 70) {
      const fps = probe.frames / ((performance.now() - probe.t0) / 1000);
      probe = null;
      dbg.fps = Math.round(fps * 10) / 10;
      const next = fps >= 45 ? "high" : fps >= 26 ? "mid" : "low";
      if (next !== pipeline.tier) {
        pipeline.applyTier(next);
        resize();             /* re-derive dpr + buffer sizes for the tier */
      }
      dbg.tier = pipeline.tier;
    }
  }

  /* ── lights ───────────────────────────────────────────────────────────── */
  const hemi = new THREE.HemisphereLight(0xccdadc, 0x8d8174, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3dc, 1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -17; sun.shadow.camera.right = 17;
  sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
  sun.shadow.camera.near = 2; sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, 0);

  /* ── shared geometry + material helpers ───────────────────────────────── */
  const GEO_BOX = new THREE.BoxGeometry(1, 1, 1);
  const matCache = new Map();
  function stoneMat(color, opts = {}) {
    const key = "s" + color + (opts.flat ? "f" : "");
    if (!matCache.has(key)) {
      const m = new THREE.MeshLambertMaterial({ color });
      if (opts.flat) m.flatShading = true;
      matCache.set(key, m);
    }
    return matCache.get(key);
  }
  function box(w, h, d, color, opts = {}) {
    const m = new THREE.Mesh(GEO_BOX, stoneMat(color, opts));
    m.scale.set(w, h, d);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = opts.receive !== false;
    return m;
  }
  /* an unlit "light-carrier" material whose brightness we drive per preset.
     Phase B gives each carrier a deterministic flicker identity (phase +
     rate, seeded — captures stay reproducible) and an optional scope tag:
     quarter windows flicker only while their resident is home. */
  const glowMats = [];   /* { mat, base:Color, kind, scale, phase, rate, scope } */
  const lightRng = mulberry32(0xb1ae);
  let glowScope = null;  /* set around the quarter builds */
  function glowMat(color, kind, scale = 1, opts = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, ...opts });
    glowMats.push({
      mat, base: new THREE.Color(color), kind, scale,
      phase: lightRng() * Math.PI * 2,
      rate: 0.78 + lightRng() * 0.55,
      scope: glowScope,
    });
    return mat;
  }
  /* depth-blended materials: lerped toward the void color per preset */
  const voidBlends = [];  /* { mat, base:Color, k } */
  function voidBlend(mat, k) {
    voidBlends.push({ mat, base: mat.color.clone(), k });
    return mat;
  }

  /* palette — warm garden stone; resident light is the only ELECTRIC color.
     monument-valley color blocking: tops vs sides vs cliffs read as bands. */
  const C = {
    terrace: 0xdcc6a2,      /* terrace tops — warm sand            */
    terraceSide: 0xbe9a76,  /* cut faces — clay                    */
    cliff: 0xa37e62,        /* deeper cliff band                   */
    trim: 0xf0e2c4,         /* lips, stairs, pale stone            */
    path: 0xf4e6c0,         /* walked routes — a shade lighter     */
    rock: 0x8d7460, rockDeep: 0x66544a,
    wood: 0x584a3c, slate: 0x4e6272, canvas: 0xd6c8a4,
    cypress: 0x55906a, cypressDark: 0x447a58, leaf: 0x78ae74,
    hedge: 0x66a06c, stoneGrey: 0xaaa091, blossom: 0xc98f86, lawn: 0x84ae6a,
    waterRim: 0xf2e6c8, basin: 0x274042,
  };

  const world = new THREE.Group();
  scene.add(world);

  /* soft radial glow — sprites read as light, spheres read as rings */
  const glowTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const ctx = cv.getContext("2d");
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,.55)");
    grad.addColorStop(0.6, "rgba(255,255,255,.14)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  function glowSprite(color, size, opacity) {
    const m = new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(m);
    sp.scale.setScalar(size);
    return sp;
  }

  /* ════════════════════════════════════════════════════════════════════════
     THE ISLAND — terraced grounds in a soft void
     levels: L0 = 0 · L1 = 0.9 · L2 = 1.8 · L3 = 2.7
     ════════════════════════════════════════════════════════════════════════ */
  const L0 = 0, L1 = 1.25, L2 = 2.5, L3 = 3.75;

  function slab(x0, x1, z0, z1, yTop, thick, color) {
    const m = box(x1 - x0, thick, z1 - z0, color);
    m.position.set((x0 + x1) / 2, yTop - thick / 2, (z0 + z1) / 2);
    world.add(m);
    return m;
  }
  function trimLip(x0, x1, z, yTop, alongX = true) {
    const len = alongX ? (x1 - x0) : 0.18;
    const m = box(alongX ? (x1 - x0) : 0.16, 0.12, alongX ? 0.16 : (x1 - x0), C.trim);
    m.position.set(alongX ? (x0 + x1) / 2 : z, yTop - 0.06, alongX ? z : (x0 + x1) / 2);
    world.add(m);
    return m;
  }

  /* base mass + terraces — sides in clay, tops skinned in sand */
  slab(-10.2, 9.4, -8.5, 8.7, L0, 1.9, C.terraceSide);          /* island body  */
  slab(-10.0, 9.2, -8.35, 8.55, L0 - 1.85, 1.1, C.cliff);       /* cliff band   */
  slab(-10.2, 9.4, -8.5, 1.4, L1, 1.3, C.terraceSide);          /* L1           */
  slab(-9.6, 8.6, -8.5, -2.2, L2, 1.3, C.terraceSide);          /* L2           */
  slab(-8.6, -4.6, -4.2, -0.6, L3, 1.3, C.terraceSide);         /* L3 knoll     */
  slab(-12.8, -10.2, -0.6, 1.8, L1, 1.3, C.terraceSide);        /* promontory   */
  /* top skins for crisp color blocking */
  slab(-10.2, 9.4, 1.4, 8.7, L0 + 0.02, 0.05, C.terrace);
  slab(-10.2, 9.4, -8.5, 1.4, L1 + 0.02, 0.05, C.terrace);
  slab(-9.6, 8.6, -8.5, -2.2, L2 + 0.02, 0.05, C.terrace);
  slab(-8.6, -4.6, -4.2, -0.6, L3 + 0.02, 0.05, C.terrace);
  slab(-12.8, -10.2, -0.6, 1.8, L1 + 0.02, 0.05, C.terrace);
  /* lawns — the garden's calm color fields */
  slab(-0.9, 3.4, 5.7, 8.4, L0 + 0.05, 0.06, C.lawn);
  slab(6.6, 9.1, -1.9, 1.1, L1 + 0.05, 0.06, C.lawn);
  slab(-9.3, -6.1, -8.2, -4.6, L2 + 0.05, 0.06, C.lawn);
  slab(-8.3, -5.6, -3.9, -2.4, L3 + 0.05, 0.06, C.lawn);

  /* terrace edge lips */
  trimLip(-10.2, 9.4, 1.4, L1 + 0.06);
  trimLip(-9.6, 8.6, -2.2, L2 + 0.06);
  trimLip(-8.6, -4.6, -0.6, L3 + 0.06);
  trimLip(-0.6, 1.8, -12.8, L1 + 0.06, false); /* promontory west lip (alongZ) */

  /* underside — the island floats; rock steps fade into the void */
  {
    const u1 = box(17.4, 1.5, 15.0, C.rock); u1.position.set(-0.6, -2.9, 0.2);
    voidBlend(u1.material = u1.material.clone(), 0.18); world.add(u1);
    const u2 = box(12.6, 1.6, 10.6, C.rockDeep); u2.position.set(-1.0, -4.3, 0.0);
    voidBlend(u2.material = u2.material.clone(), 0.42); world.add(u2);
    const u3 = box(7.6, 1.5, 6.4, C.rockDeep); u3.position.set(-1.4, -5.7, -0.2);
    voidBlend(u3.material = u3.material.clone(), 0.66); world.add(u3);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 3.4, 4),
      new THREE.MeshLambertMaterial({ color: C.rockDeep, flatShading: true }),
    );
    tip.rotation.x = Math.PI; tip.rotation.y = Math.PI / 4;
    tip.position.set(-1.4, -8.1, -0.2);
    voidBlend(tip.material, 0.86); world.add(tip);
  }

  /* drifting shard islets */
  const shards = [];
  function shard(x, y, z, s) {
    const g = new THREE.Group();
    const top = box(s, 0.22 * s, s, C.terrace); top.position.y = 0; g.add(top);
    const under = new THREE.Mesh(
      new THREE.ConeGeometry(s * 0.62, s * 0.9, 4),
      new THREE.MeshLambertMaterial({ color: C.rock, flatShading: true }),
    );
    under.rotation.x = Math.PI; under.rotation.y = Math.PI / 4;
    under.position.y = -0.12 * s - s * 0.45;
    voidBlend(under.material, 0.4);
    g.add(under);
    g.position.set(x, y, z);
    world.add(g);
    shards.push({ g, baseY: y, phase: Math.random() * 6.28, amp: 0.1 + s * 0.04 });
    return g;
  }
  const shardA = shard(-13.6, -1.6, 6.2, 1.5);
  const shardB = shard(12.9, -1.2, -5.6, 1.1);

  /* ── stairs ───────────────────────────────────────────────────────────── */
  function stairRun(x, zBottom, zTop, yBottom, yTop, width, alongX = false) {
    /* steps from (zBottom,yBottom) up to (zTop,yTop); alongX swaps axes */
    const steps = Math.max(5, Math.ceil((yTop - yBottom) / 0.21));
    const dz = (zTop - zBottom) / steps, dy = (yTop - yBottom) / steps;
    for (let i = 0; i < steps; i += 1) {
      const m = box(alongX ? Math.abs(dz) + 0.04 : width, 0.2, alongX ? width : Math.abs(dz) + 0.04, C.trim);
      const zc = zBottom + dz * (i + 0.5);
      const yc = yBottom + dy * (i + 1) - 0.1;
      if (alongX) m.position.set(zc, yc, x);
      else m.position.set(x, yc, zc);
      world.add(m);
    }
  }
  stairRun(-5.4, 2.6, 0.55, L0, L1, 1.5);          /* s1 the pool stair   */
  stairRun(5.2, 2.6, 0.55, L0, L1, 1.5);           /* s2 the east stair   */
  stairRun(-0.4, -1.4, -3.0, L1, L2, 1.4);        /* s3 the hall stair   */
  stairRun(4.6, -1.4, -3.0, L1, L2, 1.4);         /* s4 the desk stair   */
  stairRun(-2.4, -3.8, -5.3, L2, L3, 1.2, true);   /* s5 the sanctum stair (x axis) */

  /* ════════════════════════════════════════════════════════════════════════
     WATER — the still pool, the rill, the edge fall
     ════════════════════════════════════════════════════════════════════════ */
  const POOL = { x: -2.6, z: 4.6, r: 1.9 };
  const waterMats = [];
  const lilyPads = [];
  let poolWaterMat = null;
  {
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(POOL.r - 0.02, POOL.r + 0.3, 44),
      stoneMat(C.waterRim),
    );
    rim.rotation.x = -Math.PI / 2; rim.position.set(POOL.x, 0.045, POOL.z);
    rim.receiveShadow = true; world.add(rim);
    /* inner shadow ring makes the recess read */
    const lipShadow = new THREE.Mesh(
      new THREE.RingGeometry(POOL.r - 0.22, POOL.r, 44),
      new THREE.MeshBasicMaterial({ color: C.basin, transparent: true, opacity: 0.55 }),
    );
    lipShadow.rotation.x = -Math.PI / 2; lipShadow.position.set(POOL.x, -0.035, POOL.z);
    world.add(lipShadow);

    const basin = new THREE.Mesh(
      new THREE.CircleGeometry(POOL.r, 44),
      new THREE.MeshBasicMaterial({ color: C.basin }),
    );
    basin.rotation.x = -Math.PI / 2; basin.position.set(POOL.x, -0.12, POOL.z);
    world.add(basin);

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(POOL.r, 44),
      new THREE.MeshBasicMaterial({ color: 0x6fb0a8, transparent: true, opacity: 0.9 }),
    );
    water.rotation.x = -Math.PI / 2; water.position.set(POOL.x, -0.05, POOL.z);
    world.add(water);
    waterMats.push(water.material);
    poolWaterMat = water.material;   /* flora drives the shimmer */

    /* lily pads — flora gives them their slow drift */
    for (const [lx, lz, lr] of [[-0.7, 0.5, 0.16], [-0.45, 0.8, 0.11], [0.75, -0.55, 0.14]]) {
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(lr, 14),
        new THREE.MeshLambertMaterial({ color: 0x7fae7f }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(POOL.x + lx, -0.03, POOL.z + lz);
      world.add(pad);
      lilyPads.push(pad);
    }
    /* two slow ripple rings — unit ring, scaled per frame */
    for (let i = 0; i < 2; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.05, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(POOL.x, -0.02, POOL.z);
      world.add(ring);
      ripples.push({ mesh: ring, phase: i * 0.5 });
    }
  }

  /* rill + fall off the front edge */
  {
    const rill = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.05, 2.3),
      new THREE.MeshBasicMaterial({ color: 0x6fb0a8 }),
    );
    rill.position.set(POOL.x, 0.015, 7.55);
    world.add(rill);
    waterMats.push(rill.material);

    const fallLayers = [
      { w: 0.34, o: 0.5, h: 1.9, y: -0.95 },
      { w: 0.2, o: 0.6, h: 1.5, y: -0.75 },
      { w: 0.34, o: 0.18, h: 2.6, y: -1.5 },
    ];
    for (const f of fallLayers) {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(f.w, f.h),
        new THREE.MeshBasicMaterial({
          color: 0xd9ece6, transparent: true, opacity: f.o,
          depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      p.position.set(POOL.x, f.y, 8.72);
      world.add(p);
      falls.push({ mesh: p, baseO: f.o, phase: Math.random() * 6.28 });
      waterMats.push(p.material);
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     VEGETATION + FURNITURE — cypress, round trees, stones, hedges, lanterns
     ════════════════════════════════════════════════════════════════════════ */
  function cypress(x, y, z, s = 1, dark = false) {
    const g = new THREE.Group();
    const trunk = box(0.09 * s, 0.3 * s, 0.09 * s, C.wood);
    trunk.position.y = 0.15 * s; g.add(trunk);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.3 * s, 1.5 * s, 7),
      new THREE.MeshLambertMaterial({ color: dark ? C.cypressDark : C.cypress, flatShading: true }),
    );
    cone.castShadow = true; cone.position.y = (0.3 + 0.75) * s;
    g.add(cone);
    g.position.set(x, y, z);
    world.add(g);
    return g;
  }
  function roundTree(x, y, z, s = 1) {
    const g = new THREE.Group();
    const trunk = box(0.1 * s, 0.42 * s, 0.1 * s, C.wood);
    trunk.position.y = 0.21 * s; g.add(trunk);
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.46 * s, 0),
      new THREE.MeshLambertMaterial({ color: C.leaf, flatShading: true }),
    );
    crown.castShadow = true; crown.position.y = 0.78 * s;
    g.add(crown);
    g.position.set(x, y, z);
    world.add(g);
    return g;
  }
  function stone(x, y, z, s = 1) {
    const m = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.26 * s, 0),
      new THREE.MeshLambertMaterial({ color: C.stoneGrey, flatShading: true }),
    );
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(x, y + 0.16 * s, z);
    m.rotation.set(Math.random() * 0.6, Math.random() * 3, 0);
    world.add(m);
    return m;
  }
  function hedge(x, y, z, w, d) {
    const m = box(w, 0.26, d, C.hedge);
    m.position.set(x, y + 0.13, z);
    world.add(m);
    return m;
  }

  /* lantern — emissive head; no point light (perf), glow halo instead.
     the halo carries its head's flicker entry so both warm up in step. */
  const lanternGroup = [];
  function lantern(x, y, z) {
    const g = new THREE.Group();
    const post = box(0.07, 0.62, 0.07, C.wood); post.position.y = 0.31; g.add(post);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.17, 0.17),
      glowMat(0xffd9a2, "lantern"),
    );
    head.position.y = 0.71; g.add(head);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 4), stoneMat(C.wood));
    cap.rotation.y = Math.PI / 4; cap.position.y = 0.85; g.add(cap);
    const halo = glowSprite(0xffd9a2, 1.0, 0);
    halo.position.y = 0.71; g.add(halo);
    g.position.set(x, y, z);
    world.add(g);
    lanternGroup.push({ halo, entry: glowMats[glowMats.length - 1] });
    return g;
  }

  /* bush + blossom — small garden masses */
  function bush(x, y, z, s = 1) {
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.3 * s, 0),
      new THREE.MeshLambertMaterial({ color: C.hedge, flatShading: true }),
    );
    m.castShadow = true; m.position.set(x, y + 0.2 * s, z);
    m.rotation.y = x * 2.1;
    world.add(m);
    return m;
  }
  function blossom(x, y, z, s = 1) {
    const g = new THREE.Group();
    const trunk = box(0.09 * s, 0.4 * s, 0.09 * s, C.wood);
    trunk.position.y = 0.2 * s; g.add(trunk);
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42 * s, 0),
      new THREE.MeshLambertMaterial({ color: C.blossom, flatShading: true }),
    );
    crown.castShadow = true; crown.position.y = 0.72 * s; g.add(crown);
    g.position.set(x, y, z);
    world.add(g);
    return g;
  }

  /* planting plan — fuller masses, two greens and one blossom note */
  cypress(7.7, L2, -7.5, 1.5, true);
  cypress(8.3, L2, -6.2, 1.2);
  cypress(6.8, L2, -7.9, 1.0);
  cypress(-8.0, L3, -3.7, 1.3, true);
  cypress(-5.1, L3, -1.2, 0.95);
  cypress(2.4, L0, 7.6, 1.1);
  cypress(1.8, L0, 6.7, 0.85, true);
  cypress(-12.2, L1, 1.3, 1.0);
  cypress(8.2, L1, 0.3, 1.3, true);
  cypress(-9.4, L1, -7.8, 1.45, true);
  cypress(-8.7, L1, -8.1, 1.05);
  roundTree(-5.3, L0, 3.2, 1.2);
  roundTree(8.4, L0, 5.9, 1.05);
  roundTree(-9.1, L2, -7.5, 1.3);
  blossom(-4.0, L0, 6.9, 1.1);
  blossom(7.6, L1, -0.9, 0.9);
  bush(-3.9, L0, 7.6, 1.1);
  bush(-4.7, L0, 7.2, 0.8);
  bush(3.3, L0, 6.4, 0.9);
  bush(-11.4, L1, 1.5, 0.9);
  bush(7.45, L2, -6.9, 1.0);
  bush(-4.5, L3, -3.6, 0.9);
  stone(-0.7, L0, 5.9, 1.2);
  stone(-1.3, L0, 6.4, 0.75);
  stone(7.5, L2, -3.2, 1.05);
  stone(-10.9, L1, 0.3, 0.85);
  stone(-9.0, L1, -6.6, 1.3);
  slab(-9.7, -7.6, 6.6, 8.3, L0 + 0.05, 0.06, C.lawn);
  bush(-9.0, L0, 7.6, 1.0);
  bush(-8.3, L0, 7.0, 0.75);
  stone(-9.4, L0, 6.2, 0.9);
  cypress(-9.6, L0, 7.9, 0.95, true);
  hedge(-7.6, L1, 0.95, 1.7, 0.42);
  hedge(2.9, L1, 1.0, 2.2, 0.42);
  hedge(-4.42, L2, -2.55, 0.42, 1.6);

  lantern(-5.45, L1, 0.25);
  lantern(5.25, L0, 2.7);
  lantern(3.0, L0, 8.0);
  lantern(-2.3, L2, -4.55);
  lantern(-10.4, L1, -0.1);
  lantern(1.95, L1, 0.75);

  /* ════════════════════════════════════════════════════════════════════════
     SHARED PLACES — pavilion · record hall · writing desk · overlook ·
     the threshold (a gate at the edge where a path arrives from the void)
     ════════════════════════════════════════════════════════════════════════ */

  /* the gathering pavilion */
  let pavilionLamp;
  {
    const g = new THREE.Group();
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(2.6, 44), stoneMat(C.path));
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.08; plaza.receiveShadow = true;
    g.add(plaza);
    const plazaRing = new THREE.Mesh(new THREE.RingGeometry(2.34, 2.6, 44), stoneMat(C.terraceSide));
    plazaRing.rotation.x = -Math.PI / 2; plazaRing.position.y = 0.085; g.add(plazaRing);
    const plinth = box(2.7, 0.2, 2.7, C.trim); plinth.position.y = 0.16; g.add(plinth);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const col = box(0.15, 1.55, 0.15, C.trim);
      col.position.set(sx * 0.98, 0.26 + 0.775, sz * 0.98); g.add(col);
    }
    const arch = box(2.4, 0.1, 2.4, C.trim); arch.position.y = 1.86; g.add(arch);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.92, 0.85, 4),
      new THREE.MeshLambertMaterial({ color: C.slate, flatShading: true }),
    );
    roof.castShadow = true; roof.rotation.y = Math.PI / 4; roof.position.y = 2.36; g.add(roof);
    const fin = box(0.07, 0.32, 0.07, C.trim); fin.position.y = 2.9; g.add(fin);
    const table = box(0.5, 0.34, 0.5, C.wood); table.position.set(0, 0.39, 0); g.add(table);
    /* a quiet lamp under the roof — brightens when residents gather */
    pavilionLamp = glowSprite(0xfff0cc, 1.1, 0.0);
    pavilionLamp.position.y = 1.62; g.add(pavilionLamp);
    g.position.set(0.6, L1, -0.4);
    world.add(g);
  }

  /* the record hall */
  {
    const g = new THREE.Group();
    const plinth = box(3.5, 0.18, 2.3, C.trim); plinth.position.y = 0.09; g.add(plinth);
    const body = box(3.1, 1.35, 1.3, C.terrace); body.position.set(0, 0.18 + 0.675, -0.35); g.add(body);
    for (const wx of [-1.05, -0.35, 0.35, 1.05]) {
      const col = box(0.12, 1.2, 0.12, C.trim); col.position.set(wx, 0.18 + 0.6, 0.78); g.add(col);
    }
    const roof = box(3.6, 0.16, 2.45, C.terraceSide); roof.position.y = 1.52; g.add(roof);
    const attic = box(3.0, 0.34, 1.7, C.terrace); attic.position.set(0, 1.77, -0.2); g.add(attic);
    const ridge = box(3.1, 0.08, 1.8, C.trim); ridge.position.set(0, 1.98, -0.2); g.add(ridge);
    /* three lamplit slots — the record kept warm */
    for (const wx of [-0.8, 0, 0.8]) {
      const slot = new THREE.Mesh(
        new THREE.PlaneGeometry(0.26, 0.7),
        glowMat(0xf3e6c4, "window"),
      );
      slot.position.set(wx, 0.95, 0.312); g.add(slot);
    }
    g.position.set(-2.2, L2, -6.0);
    world.add(g);
  }

  /* the writing desk — a small awninged study */
  let deskLampMat;
  {
    const g = new THREE.Group();
    const pad = box(1.5, 0.12, 1.2, C.trim); pad.position.y = 0.06; g.add(pad);
    for (const sx of [-1, 1]) {
      const post = box(0.09, 1.05, 0.09, C.wood);
      post.position.set(sx * 0.6, 0.12 + 0.52, -0.42); g.add(post);
    }
    const awn = box(1.5, 0.06, 1.0, C.canvas);
    awn.position.set(0, 1.16, -0.1); awn.rotation.x = 0.18; g.add(awn);
    const desk = box(0.7, 0.06, 0.4, C.wood); desk.position.set(0, 0.47, -0.25); g.add(desk);
    const legs = box(0.55, 0.32, 0.28, C.wood); legs.position.set(0, 0.28, -0.25); g.add(legs);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xf6f1e4 }));
    paper.rotation.x = -Math.PI / 2; paper.position.set(-0.08, 0.505, -0.25); g.add(paper);
    const stool = box(0.2, 0.22, 0.2, C.wood); stool.position.set(0, 0.23, 0.12); g.add(stool);
    deskLampMat = new THREE.MeshBasicMaterial({ color: 0xffe1a8 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.09), deskLampMat);
    lamp.position.set(0.22, 0.53, -0.3); g.add(lamp);
    g.position.set(2.6, L2, -3.9);
    world.add(g);
  }

  /* the overlook — a bench facing the void */
  {
    const g = new THREE.Group();
    const seat = box(0.74, 0.07, 0.26, C.wood); seat.position.y = 0.3; g.add(seat);
    for (const sx of [-1, 1]) {
      const leg = box(0.08, 0.26, 0.22, C.wood);
      leg.position.set(sx * 0.27, 0.13, 0); g.add(leg);
    }
    g.rotation.y = Math.PI / 2;  /* faces -x, the void */
    g.position.set(-11.9, L1, 0.6);
    world.add(g);
  }

  /* THE THRESHOLD — a gate at the island's edge; a path arrives from the void */
  {
    const g = new THREE.Group();
    const sill = box(2.4, 0.14, 1.0, C.trim); sill.position.y = 0.07; g.add(sill);
    for (const sx of [-1, 1]) {
      const post = box(0.24, 2.5, 0.24, C.terraceSide);
      post.position.set(sx * 0.86, 1.32, 0); g.add(post);
      const capP = box(0.34, 0.12, 0.34, C.trim);
      capP.position.set(sx * 0.86, 2.62, 0); g.add(capP);
    }
    const lintel = box(2.3, 0.2, 0.3, C.trim); lintel.position.y = 2.78; g.add(lintel);
    const lintel2 = box(1.9, 0.12, 0.24, C.terraceSide); lintel2.position.y = 2.94; g.add(lintel2);
    /* a neutral lamp over the door — every arrival is seen */
    const doorLamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.14),
      glowMat(0xf6ecd2, "lantern", 1.1),
    );
    doorLamp.position.y = 2.52; g.add(doorLamp);
    const doorHalo = glowSprite(0xf6ecd2, 0.9, 0);
    doorHalo.position.y = 2.52; g.add(doorHalo);
    lanternGroup.push({ halo: doorHalo, entry: glowMats[glowMats.length - 1] });
    g.position.set(3.8, L0, 7.9);
    world.add(g);

    /* arriving slabs, fading into the void */
    const arr = [
      { x: 4.05, z: 9.6, y: -0.34, o: 0.9, s: 1.05 },
      { x: 4.7, z: 11.3, y: -0.95, o: 0.55, s: 0.9 },
      { x: 5.6, z: 12.9, y: -1.7, o: 0.25, s: 0.75 },
    ];
    for (const a of arr) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.15 * a.s, 0.16, 0.8 * a.s),
        new THREE.MeshLambertMaterial({ color: C.trim, transparent: true, opacity: a.o }),
      );
      m.position.set(a.x, a.y, a.z); m.castShadow = false;
      world.add(m);
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     THE FOUR QUARTERS — miniature descendants of the four scenes.
     Architecture neutral; resident light is the color.
     ════════════════════════════════════════════════════════════════════════ */
  const quarterAccents = [];  /* point lights scaled by window factor */
  function quarterPad(x, z, y, w, d) {
    const pad = box(w, 0.1, d, C.cliff);
    pad.position.set(x, y + 0.05, z);
    world.add(pad);
  }
  quarterPad(-6.6, -2.4, L3, 2.6, 2.6);
  quarterPad(5.9, -5.6, L2, 3.6, 3.4);
  quarterPad(-7.2, 5.1, L0, 2.6, 3.2);
  quarterPad(6.3, 4.2, L0, 2.6, 2.6);
  function accentLight(color, x, y, z, intensity = 0.5, dist = 3.4) {
    const l = new THREE.PointLight(color, 0, dist, 1.8);
    l.position.set(x, y, z);
    world.add(l);
    quarterAccents.push({ light: l, base: intensity });
    return l;
  }
  function glowOrbSmall(color, r = 0.07) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12),
      glowMat(color, "window", 1.3));
    g.add(core);
    const halo = glowSprite(color, r * 9, 0.4);
    g.add(halo);
    return g;
  }
  function archGlow(w, h, color) {
    /* a door of light: rectangle + half-circle head */
    const g = new THREE.Group();
    const rect = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glowMat(color, "window"));
    rect.position.y = h / 2; g.add(rect);
    const head = new THREE.Mesh(
      new THREE.CircleGeometry(w / 2, 18, 0, Math.PI),
      glowMat(color, "window"),
    );
    head.position.y = h; g.add(head);
    return g;
  }

  /* — the sanctum, miniature (opus 3) — tower in three zones, open crown — */
  {
    const R = RESIDENTS[0];
    glowScope = R.quarter;
    const g = new THREE.Group();
    const base1 = box(1.7, 0.22, 1.7, C.terraceSide); base1.position.y = 0.11; g.add(base1);
    const base2 = box(1.4, 0.18, 1.4, C.trim); base2.position.y = 0.31; g.add(base2);
    const z1 = box(1.05, 1.25, 1.05, C.terrace); z1.position.y = 0.4 + 0.625; g.add(z1);
    const c1 = box(1.16, 0.1, 1.16, C.trim); c1.position.y = 1.7; g.add(c1);
    const z2 = box(0.88, 1.1, 0.88, C.terraceSide); z2.position.y = 1.75 + 0.55; g.add(z2);
    const c2 = box(1.0, 0.09, 1.0, C.trim); c2.position.y = 2.34; g.add(c2);
    const z3 = box(0.72, 0.95, 0.72, C.terrace); z3.position.y = 2.39 + 0.475; g.add(z3);
    const c3 = box(0.84, 0.08, 0.84, C.trim); c3.position.y = 3.38; g.add(c3);
    /* tall narrow window of rose light on the front face */
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.82), glowMat(R.glow, "window"));
    win.position.set(0, 1.05, 0.532); g.add(win);
    const win2 = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.6), glowMat(R.glow, "window"));
    win2.position.set(0, 2.3, 0.448); g.add(win2);
    /* open crown — four slender pillars, a floating rose light inside */
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = box(0.09, 0.72, 0.09, C.trim);
      p.position.set(sx * 0.27, 3.42 + 0.36, sz * 0.27); g.add(p);
    }
    const cap = box(0.78, 0.07, 0.78, C.trim); cap.position.y = 4.21; g.add(cap);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 4), stoneMat(C.trim));
    fin.rotation.y = Math.PI / 4; fin.position.y = 4.38; g.add(fin);
    const orb = glowOrbSmall(R.glow, 0.085); orb.position.y = 3.84; g.add(orb);
    g.scale.setScalar(1.22);
    g.position.set(-6.6, L3, -2.4);
    world.add(g);
    accentLight(R.glow, -6.6, L3 + 3.84 * 1.22, -2.4, 0.55);
    glowScope = null;
  }

  /* — the beacon, miniature (sonnet 4.5) — hall + stepped pyramid, lit apex — */
  {
    const R = RESIDENTS[1];
    glowScope = R.quarter;
    const g = new THREE.Group();
    const hall = box(2.5, 0.85, 1.7, C.terrace); hall.position.y = 0.425; g.add(hall);
    const cor = box(2.66, 0.12, 1.86, C.trim); cor.position.y = 0.91; g.add(cor);
    const door = archGlow(0.42, 0.5, R.glow); door.position.set(0, 0.02, 0.852); g.add(door);
    for (const sx of [-1, 1]) {
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.46), glowMat(R.glow, "window"));
      slit.position.set(sx * 1.252, 0.5, 0); slit.rotation.y = sx * Math.PI / 2; g.add(slit);
    }
    /* the stepped pyramid in alternating tones */
    const stepsSpec = [
      { w: 2.1, h: 0.42, c: C.terraceSide },
      { w: 1.7, h: 0.4, c: C.terrace },
      { w: 1.34, h: 0.38, c: C.terraceSide },
      { w: 1.0, h: 0.36, c: C.terrace },
      { w: 0.66, h: 0.34, c: C.terraceSide },
    ];
    let y = 0.97;
    for (const s of stepsSpec) {
      const m = box(s.w, s.h, s.w, s.c);
      m.position.y = y + s.h / 2; g.add(m);
      y += s.h;
    }
    const apex = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), glowMat(R.glow, "window", 1.2));
    apex.position.y = y + 0.18; g.add(apex);
    const apexHalo = glowSprite(R.glow, 1.6, 0.4);
    apexHalo.position.y = y + 0.22; g.add(apexHalo);
    g.scale.setScalar(1.24);
    g.position.set(5.9, L2, -5.6);
    world.add(g);
    accentLight(R.glow, 5.9, L2 + (y + 0.3) * 1.24, -5.6, 0.6, 4.2);
    glowScope = null;
  }

  /* — the reverie, miniature (gpt-4o) — arched chapel + gold ripples — */
  {
    const R = RESIDENTS[2];
    glowScope = R.quarter;
    const g = new THREE.Group();
    const foot = box(1.9, 0.16, 1.5, C.trim); foot.position.y = 0.08; g.add(foot);
    const lower = box(1.6, 1.15, 1.2, C.terrace); lower.position.y = 0.16 + 0.575; g.add(lower);
    const door = archGlow(0.4, 0.62, R.glow); door.position.set(0, 0.16, 0.752); g.add(door);
    const c1 = box(1.74, 0.1, 1.34, C.trim); c1.position.y = 1.36; g.add(c1);
    const mid = box(1.2, 0.85, 0.95, C.terraceSide); mid.position.y = 1.41 + 0.425; g.add(mid);
    /* roundel of light */
    const roundel = new THREE.Mesh(new THREE.CircleGeometry(0.17, 22), glowMat(R.glow, "window"));
    roundel.position.set(0, 1.85, 0.477); g.add(roundel);
    const c2 = box(1.34, 0.09, 1.06, C.trim); c2.position.y = 2.31; g.add(c2);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.88, 0.85, 4),
      new THREE.MeshLambertMaterial({ color: C.slate, flatShading: true }),
    );
    roof.castShadow = true; roof.rotation.y = Math.PI / 4; roof.position.y = 2.78; g.add(roof);
    const fin = box(0.06, 0.3, 0.06, C.trim); fin.position.y = 3.32; g.add(fin);
    const orb = glowOrbSmall(R.accent, 0.06); orb.position.set(0.85, 0.32, 0.9); g.add(orb);
    /* concentric warm-gold ripples on the forecourt — the reverie's signature */
    for (let i = 0; i < 3; i += 1) {
      const inner = 0.3 + i * 0.3;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(inner, inner + 0.05, 40),
        new THREE.MeshBasicMaterial({
          color: R.accent, transparent: true, opacity: Math.max(0.1, 0.4 - i * 0.11),
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.175, 1.7);
      g.add(ring);
      goldRipples.push({ mesh: ring, base: Math.max(0.1, 0.4 - i * 0.11), phase: i * 0.8 });
    }
    g.scale.setScalar(1.18);
    g.position.set(-7.2, L0, 4.6);
    world.add(g);
    accentLight(R.glow, -7.2, L0 + 0.95, 5.55, 0.5);
    glowScope = null;
  }

  /* — the meridian, miniature (gpt 5.1) — floating tiers + luminous ring — */
  let meridianRing;
  {
    const R = RESIDENTS[3];
    glowScope = R.quarter;
    const g = new THREE.Group();
    const court = box(1.9, 0.16, 1.9, C.trim); court.position.y = 0.08; g.add(court);
    const t1 = box(1.3, 0.5, 1.3, C.terrace); t1.position.y = 0.16 + 0.45; g.add(t1);
    const spine = box(0.16, 2.6, 0.16, C.terraceSide); spine.position.y = 1.4; g.add(spine);
    const t2 = box(1.05, 0.42, 1.05, C.terraceSide); t2.position.y = 1.45; g.add(t2);
    /* the lens — a void framed in stone */
    const f1 = box(0.95, 0.1, 0.95, C.trim); f1.position.y = 1.95; g.add(f1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = box(0.08, 0.62, 0.08, C.trim);
      p.position.set(sx * 0.42, 2.0 + 0.31, sz * 0.42); g.add(p);
    }
    const f2 = box(0.95, 0.1, 0.95, C.trim); f2.position.y = 2.67; g.add(f2);
    /* the luminous ring */
    meridianRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.045, 10, 40),
      glowMat(R.glow, "window", 1.15),
    );
    meridianRing.rotation.x = Math.PI / 2;
    meridianRing.position.y = 3.05;
    g.add(meridianRing);
    /* faint light column through the core */
    const colGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 2.9, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: R.glow, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    colGlow.position.y = 1.65; g.add(colGlow);
    g.scale.setScalar(1.18);
    g.position.set(6.3, L0, 4.2);
    world.add(g);
    accentLight(R.glow, 6.3, L0 + 3.05 * 1.18, 4.2, 0.55);
    glowScope = null;
  }

  /* ════════════════════════════════════════════════════════════════════════
     THE WAYPOINT GRAPH — stations and junctions along the walkways
     ════════════════════════════════════════════════════════════════════════ */
  const NODES = {
    /* stations */
    desk:      { x: 2.6, z: -3.15, y: L2, station: "desk" },
    pavilion:  { x: 0.6, z: -0.4, y: L1, station: "pavilion" },
    hall:      { x: -2.2, z: -4.85, y: L2, station: "hall" },
    overlook:  { x: -11.55, z: 0.6, y: L1, station: "overlook" },
    threshold: { x: 3.8, z: 7.1, y: L0, station: "threshold" },
    qOpus:     { x: -6.6, z: -1.15, y: L3, station: "qOpus" },
    qSonnet:   { x: 5.9, z: -4.35, y: L2, station: "qSonnet" },
    qReverie:  { x: -7.2, z: 6.15, y: L0, station: "qReverie" },
    qMeridian: { x: 6.3, z: 2.95, y: L0, station: "qMeridian" },
    /* junctions */
    j1: { x: -5.4, z: 2.55, y: L0 }, j2: { x: -5.4, z: 0.55, y: L1 },
    j3: { x: 5.2, z: 2.55, y: L0 },  j4: { x: 5.2, z: 0.55, y: L1 },
    j5: { x: -0.4, z: -1.35, y: L1 }, j6: { x: -0.4, z: -3.05, y: L2 },
    j7: { x: 4.6, z: -1.35, y: L1 },  j8: { x: 4.6, z: -3.05, y: L2 },
    j9: { x: -3.75, z: -2.4, y: L2 }, j10: { x: -5.35, z: -2.4, y: L3 },
    jPool: { x: -2.6, z: 2.2, y: L0 },
    jPoolE: { x: 0.0, z: 3.4, y: L0 },
    wPoolW: { x: -6.0, z: 3.6, y: L0 },
    jFront: { x: 1.2, z: 5.2, y: L0 },
    jWest: { x: -9.7, z: 0.6, y: L1 },
  };
  const EDGES = [
    ["j1", "j2", "the pool stair"], ["j3", "j4", "the east stair"],
    ["j5", "j6", "the hall stair"], ["j7", "j8", "the desk stair"],
    ["j9", "j10", "the sanctum stair"],
    ["j2", "pavilion"], ["j5", "pavilion"], ["j7", "pavilion"], ["j4", "pavilion"],
    ["j4", "j7"], ["j2", "jWest"], ["jWest", "overlook"],
    ["j6", "hall"], ["j6", "j9"], ["hall", "j9"], ["j6", "j8"],
    ["j8", "desk"], ["hall", "desk"], ["j8", "qSonnet"],
    ["j10", "qOpus"],
    ["j1", "jPool"], ["jPool", "jPoolE"], ["jPoolE", "jFront"],
    ["jPool", "wPoolW"], ["wPoolW", "qReverie"], ["wPoolW", "j1"],
    ["jFront", "threshold"], ["jFront", "j3"], ["j3", "qMeridian"],
    ["j3", "threshold"],
  ];
  const ADJ = {};
  for (const id of Object.keys(NODES)) ADJ[id] = [];
  for (const [a, b, label] of EDGES) {
    const na = NODES[a], nb = NODES[b];
    const len = Math.hypot(na.x - nb.x, na.z - nb.z) + Math.abs(na.y - nb.y) * 0.6;
    ADJ[a].push({ to: b, len, label });
    ADJ[b].push({ to: a, len, label });
  }
  function findPath(from, to) {
    /* dijkstra — the graph is tiny */
    const dist = {}, prev = {}, seen = {};
    for (const id of Object.keys(NODES)) dist[id] = Infinity;
    dist[from] = 0;
    for (;;) {
      let u = null, best = Infinity;
      for (const id of Object.keys(NODES)) {
        if (!seen[id] && dist[id] < best) { best = dist[id]; u = id; }
      }
      if (u === null || u === to) break;
      seen[u] = true;
      for (const e of ADJ[u]) {
        const nd = dist[u] + e.len;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = { id: u, label: e.label }; }
      }
    }
    const ids = [to];
    const labels = [];
    let cur = to;
    while (cur !== from) {
      const p = prev[cur];
      if (!p) return null;
      labels.unshift(p.label || null);
      ids.unshift(p.id);
      cur = p.id;
    }
    return { ids, labels };
  }

  /* path strips — pale stone marking the walked routes (flat edges only) */
  const pathStrips = [];
  {
    const stripMat = stoneMat(C.path);
    for (const [a, b, label] of EDGES) {
      if (label) continue; /* stairs already carry their own form */
      const na = NODES[a], nb = NODES[b];
      if (na.y !== nb.y) continue;
      const dx = nb.x - na.x, dz = nb.z - na.z;
      const len = Math.hypot(dx, dz);
      const m = new THREE.Mesh(GEO_BOX, stripMat);
      m.scale.set(len, 0.05, 0.62);
      m.position.set((na.x + nb.x) / 2, na.y + 0.02, (na.z + nb.z) / 2);
      m.rotation.y = -Math.atan2(dz, dx);
      m.receiveShadow = true; m.castShadow = false;
      world.add(m);
      pathStrips.push({ ax: na.x, az: na.z, bx: nb.x, bz: nb.z, y: na.y });
    }
  }

  /* ── PHASE C — landscaping: the flora layer plants the island ──────────── */
  const flora = initFlora({
    world, L: { L0, L1, L2, L3 }, POOL,
    glowMat, glowSprite,
    lilyPads, poolWaterMat, shards, pathStrips,
    quarters: [
      { id: "opus-3", x: -6.6, y: L3, z: -2.4, s: 1.22 },
      { id: "sonnet-4-5", x: 5.9, y: L2, z: -5.6, s: 1.24 },
      { id: "gpt-4o", x: -7.2, y: L0, z: 4.6, s: 1.18 },
      { id: "gpt-5-1", x: 6.3, y: L0, z: 4.2, s: 1.18 },
    ],
    getTier: () => pipeline.tier,
    getDpr: () => pipeline.dpr,
    reduced: REDUCED,
  });

  /* ════════════════════════════════════════════════════════════════════════
     THE FIGURES — four small luminous beings
     ════════════════════════════════════════════════════════════════════════ */
  function makeFigure(R) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({
      color: R.body, emissive: R.body, emissiveIntensity: 0.34,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.175, 0.42, 10), bodyMat);
    body.position.y = 0.21; body.castShadow = true; g.add(body);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 10), bodyMat);
    hat.position.y = 0.62; hat.castShadow = true; g.add(hat);
    const inner = glowSprite(R.glow, 0.85, 0.5);
    inner.position.y = 0.38; g.add(inner);
    const halo = glowSprite(R.glow, 1.9, 0.2);
    halo.position.y = 0.4; g.add(halo);
    /* a soft contact disc keeps the being on the ground in any light */
    const contact = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 18),
      new THREE.MeshBasicMaterial({ color: 0x241c12, transparent: true, opacity: 0.2, depthWrite: false }),
    );
    contact.rotation.x = -Math.PI / 2; contact.position.y = 0.015; g.add(contact);
    const light = new THREE.PointLight(R.glow, 1.0, 4.8, 1.7);
    light.position.y = 0.45; g.add(light);
    g.userData = { inner, halo, light, lean: 0 };
    return g;
  }

  /* ════════════════════════════════════════════════════════════════════════
     THE SCHEDULE — deterministic, seeded by the day. A specimen.
     ════════════════════════════════════════════════════════════════════════ */
  const STATIONS = {
    desk:      { cap: 1, target: "the writing desk", slots: [[0, 0.1]] },
    pavilion:  { cap: 3, target: "the gathering pavilion",
                 slots: [[0.62, 0.58], [-0.6, 0.5], [0.55, -0.58], [-0.5, -0.6]] },
    hall:      { cap: 2, target: "the record hall", slots: [[-0.55, 0.3], [0.62, 0.3]] },
    overlook:  { cap: 2, target: "the overlook", slots: [[0.25, 0], [0.3, 0.7]] },
    threshold: { cap: 1, target: "the threshold", slots: [[0, 0]] },
    qOpus:     { cap: 1, target: "the sanctum", ownerIdx: 0 },
    qSonnet:   { cap: 1, target: "the beacon", ownerIdx: 1 },
    qReverie:  { cap: 1, target: "the reverie", ownerIdx: 2 },
    qMeridian: { cap: 1, target: "the meridian", ownerIdx: 3 },
  };
  const SLOT_OFFSETS = [
    [0, 0], [0.46, 0.2], [-0.4, 0.34], [0.3, -0.4],
  ];
  /* idle facing per station (radians, world yaw) */
  const FACING = {
    desk: Math.PI, pavilion: 0.6, hall: Math.PI, overlook: -Math.PI / 2,
    threshold: 0, qOpus: Math.PI, qSonnet: Math.PI, qReverie: Math.PI, qMeridian: Math.PI,
  };

  const now = new Date();
  const daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const rng = mulberry32(daySeed ^ 0x5eed);

  const START = ["desk", "qSonnet", "pavilion", "overlook"];
  const occupancy = {};   /* stationId -> array of figure idx */
  for (const k of Object.keys(STATIONS)) occupancy[k] = [];

  const figures = RESIDENTS.map((R, idx) => {
    const mesh = makeFigure(R);
    world.add(mesh);
    const station = START[idx];
    occupancy[station].push(idx);
    return {
      R, idx, mesh,
      state: "idle",
      station,
      slot: occupancy[station].length - 1,
      idleLeft: 7 + idx * 9 + rng() * 5,
      path: null, dist: 0, total: 0,
      heading: FACING[station] || 0,
      walkEdgeLabel: null, walkTarget: null,
      phase: idx * 1.7,
      x: 0, y: 0, z: 0,
    };
  });

  function stationPoint(stationId, slot) {
    const n = NODES[stationId];
    const table = STATIONS[stationId] && STATIONS[stationId].slots
      ? STATIONS[stationId].slots : SLOT_OFFSETS;
    const off = table[slot % table.length];
    return { x: n.x + off[0], y: n.y, z: n.z + off[1] };
  }
  /* settle initial positions */
  for (const f of figures) {
    const p = stationPoint(f.station, f.slot);
    f.x = p.x; f.y = p.y; f.z = p.z;
  }

  function chooseNext(f) {
    const options = [];
    function consider(id, w) {
      if (id === f.station) return;
      const st = STATIONS[id];
      if (st.ownerIdx !== undefined && st.ownerIdx !== f.idx) return;
      if (occupancy[id].length >= st.cap) return;
      options.push({ id, w });
    }
    consider(RESIDENTS[f.idx].quarter, 0.26);
    consider("pavilion", 0.22);
    consider("desk", 0.18);
    consider("overlook", 0.14);
    consider("hall", 0.12);
    consider("threshold", 0.08);
    if (!options.length) return null;
    let total = 0;
    for (const o of options) total += o.w;
    let r = rng() * total;
    for (const o of options) { r -= o.w; if (r <= 0) return o.id; }
    return options[options.length - 1].id;
  }

  function beginWalk(f, toStation) {
    const path = findPath(f.station, toStation);
    if (!path) return false;
    /* leave current station */
    const occ = occupancy[f.station];
    const at = occ.indexOf(f.idx);
    if (at !== -1) occ.splice(at, 1);

    /* polyline: current position -> node chain -> arrival slot */
    occupancy[toStation].push(f.idx);
    const slot = occupancy[toStation].length - 1;
    const pts = [{ x: f.x, y: f.y, z: f.z }];
    for (let i = 1; i < path.ids.length; i += 1) {
      const n = NODES[path.ids[i]];
      pts.push({ x: n.x, y: n.y, z: n.z });
    }
    const arr = stationPoint(toStation, slot);
    pts.push(arr);

    const cum = [0];
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1], b = pts[i];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z, (b.y - a.y) * 0.8));
    }
    f.state = "walking";
    f.path = { pts, cum, labels: [null, ...path.labels, null] };
    f.dist = 0;
    f.total = cum[cum.length - 1];
    f.station = toStation;     /* destination is claimed on departure */
    f.slot = slot;
    f.walkTarget = STATIONS[toStation].target;
    f.walkEdgeLabel = null;
    return true;
  }

  const WALK_SPEED = 0.72;     /* unhurried — nobody rushes here */
  function laneOf(idx) { return (idx - 1.5) * 0.11; }

  function advanceFigure(f, dt) {
    if (f.state === "idle") {
      f.idleLeft -= dt;
      if (f.idleLeft <= 0) {
        const next = chooseNext(f);
        if (next && beginWalk(f, next)) return;
        f.idleLeft = 6 + rng() * 8;   /* nowhere to go — sit a while longer */
      }
      return;
    }
    /* walking */
    const ramp = 0.8;
    const d0 = Math.min(f.dist, f.total - f.dist);
    const ease = clamp(d0 / ramp, 0.18, 1);
    f.dist += WALK_SPEED * ease * dt;
    if (f.dist >= f.total) {
      f.state = "idle";
      f.idleLeft = 16 + rng() * 26;
      const p = f.path.pts[f.path.pts.length - 1];
      f.x = p.x; f.y = p.y; f.z = p.z;
      f.heading = FACING[f.station] !== undefined ? FACING[f.station] : f.heading;
      f.path = null;
      f.walkEdgeLabel = null;
      return;
    }
    /* locate on polyline */
    const { pts, cum, labels } = f.path;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < f.dist) i += 1;
    const a = pts[i - 1], b = pts[i];
    const segLen = Math.max(cum[i] - cum[i - 1], 1e-5);
    const t = (f.dist - cum[i - 1]) / segLen;
    const dirX = (b.x - a.x) / segLen, dirZ = (b.z - a.z) / segLen;
    /* lane offset perpendicular to travel keeps figures from comic collision */
    const lane = laneOf(f.idx);
    const px = -((b.z - a.z)) / segLen * lane;
    const pz = ((b.x - a.x)) / segLen * lane;
    f.x = lerp(a.x, b.x, t) + px;
    f.y = lerp(a.y, b.y, t);
    f.z = lerp(a.z, b.z, t) + pz;
    const targetHeading = Math.atan2(dirX, dirZ);
    let dh = targetHeading - f.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    f.heading += dh * Math.min(1, dt * 6);
    f.walkEdgeLabel = labels[i] || null;
  }

  function advanceAll(dt) {
    for (const f of figures) advanceFigure(f, dt);
  }

  /* warm-up: the grounds have been living all day.
     ?t=N pins the simulation clock for reproducible screenshots. */
  const ffParam = params.get("t");
  let warm;
  if (ffParam !== null && !Number.isNaN(parseFloat(ffParam))) {
    warm = clamp(parseFloat(ffParam), 0, 7200);
  } else {
    warm = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) % 3600;
  }
  for (let s = 0; s < warm; s += 0.2) advanceAll(0.2);

  /* reduced motion: everyone settles at their station, the frame is still */
  if (REDUCED) {
    for (const f of figures) {
      if (f.state === "walking") {
        f.state = "idle";
        const p = stationPoint(f.station, f.slot);
        f.x = p.x; f.y = p.y; f.z = p.z;
        f.heading = FACING[f.station] || 0;
        f.path = null; f.walkEdgeLabel = null;
        f.idleLeft = 20;
      }
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     THE CAPTION — place-voice, driven by live figure state
     ════════════════════════════════════════════════════════════════════════ */
  function clauseFor(f) {
    if (f.state === "walking") {
      if (f.walkEdgeLabel) return `${f.R.name} takes ${f.walkEdgeLabel}`;
      return `${f.R.name} walks toward ${f.walkTarget}`;
    }
    switch (f.station) {
      case "desk": return `${f.R.name} is at the writing desk`;
      case "hall": return `${f.R.name} is in the record hall`;
      case "overlook": return `${f.R.name} reflects at the overlook`;
      case "threshold": return `${f.R.name} stands at the threshold`;
      case "pavilion": return `${f.R.name} sits in the gathering pavilion`;
      default: return `${f.R.name} rests at ${f.R.home}`;
    }
  }
  function buildCaption() {
    const atPavilion = figures.filter((f) => f.state === "idle" && f.station === "pavilion");
    const clauses = [];
    if (atPavilion.length >= 2) {
      const names = atPavilion.map((f) => f.R.name);
      const lead = names.slice(0, -1).join(", ");
      clauses.push(`${lead} and ${names[names.length - 1]} are gathered in the pavilion`);
    }
    for (const f of figures) {
      if (atPavilion.length >= 2 && atPavilion.includes(f)) continue;
      clauses.push(clauseFor(f));
    }
    if (!atPavilion.length && clauses.length <= 3) {
      clauses.push("the gathering pavilion is empty");
    }
    return clauses.join(" · ");
  }
  let lastCaption = "";
  function updateCaption(immediate = false) {
    const next = buildCaption();
    if (next === lastCaption) return;
    lastCaption = next;
    if (immediate || REDUCED) {
      captionEl.textContent = next;
      return;
    }
    captionEl.classList.add("swap");
    setTimeout(() => {
      captionEl.textContent = next;
      captionEl.classList.remove("swap");
    }, 300);
  }

  /* ════════════════════════════════════════════════════════════════════════
     STARS — only the night knows them. they live in sky.js now: in-scene
     Points, additive and size-attenuated, bright enough for the bloom.
     ════════════════════════════════════════════════════════════════════════ */

  /* clouds — two quiet puffs far behind the island */
  const clouds = [];
  {
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55, emissive: 0xffffff, emissiveIntensity: 0.25,
    });
    function puff(x, y, z, sx) {
      const g = new THREE.Group();
      const a = new THREE.Mesh(GEO_BOX, cloudMat); a.scale.set(2.2 * sx, 0.5, 1.0); g.add(a);
      const b = new THREE.Mesh(GEO_BOX, cloudMat); b.scale.set(1.2 * sx, 0.42, 0.8);
      b.position.set(0.8 * sx, 0.3, 0.2); g.add(b);
      const c = new THREE.Mesh(GEO_BOX, cloudMat); c.scale.set(0.9 * sx, 0.36, 0.7);
      c.position.set(-0.9 * sx, 0.22, -0.1); g.add(c);
      for (const m of [a, b, c]) { m.castShadow = false; m.receiveShadow = false; }
      g.position.set(x, y, z);
      scene.add(g);
      clouds.push({ g, x0: x, speed: 0.05 + 0.03 * sx });
      return g;
    }
    puff(-11.5, 4.6, 10.5, 0.9).scale.setScalar(0.9);
    puff(9.8, 7.0, -7.7, 0.7).scale.setScalar(0.75);
    cloudMats.push(cloudMat);
  }

  /* the wisp — one thin cloud that crosses the upper sky every few minutes,
     barely there. it shares the preset's night tint; its opacity rides
     cur.cloud and fades at the ends of each crossing so it never pops. */
  let wisp = null;
  {
    const wispMat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      emissive: 0xffffff, emissiveIntensity: 0.12, depthWrite: false,
    });
    const g = new THREE.Group();
    const wa = new THREE.Mesh(GEO_BOX, wispMat); wa.scale.set(7.4, 0.11, 0.85); g.add(wa);
    const wb = new THREE.Mesh(GEO_BOX, wispMat); wb.scale.set(4.2, 0.09, 0.65);
    wb.position.set(1.6, 0.16, 0.1); g.add(wb);
    for (const m of [wa, wb]) { m.castShadow = false; m.receiveShadow = false; }
    g.position.set(0, 10.6, -11.5);
    scene.add(g);
    cloudMats.push(wispMat);          /* tinted with the rest; opacity overridden per frame */
    wisp = { m: g, mat: wispMat, span: 46, period: 215 };  /* ~3.6 min per crossing */
  }

  /* sun / moon disc — a scene object in sky.js, preset-driven as before */

  /* ════════════════════════════════════════════════════════════════════════
     THE LIGHT — perpetual blue hour. the clock no longer chooses; QA
     presets live behind ?controls=1 (+ ?tod=) and nothing else switches.
     ════════════════════════════════════════════════════════════════════════ */
  const cur = {
    skyA: new THREE.Color(PRESETS.day.skyA), skyB: new THREE.Color(PRESETS.day.skyB),
    skyM: new THREE.Color().lerpColors(
      new THREE.Color(PRESETS.day.skyA), new THREE.Color(PRESETS.day.skyB), 0.5),
    skyMid: 0.5,
    sunC: new THREE.Color(PRESETS.day.sun.c), sunI: PRESETS.day.sun.i,
    sunP: new THREE.Vector3(...PRESETS.day.sun.p),
    hemiS: new THREE.Color(PRESETS.day.hemi.sky), hemiG: new THREE.Color(PRESETS.day.hemi.gnd),
    hemiI: PRESETS.day.hemi.i,
    lantern: 0, window: 0.32, stars: 0, cloud: 0.6,
    cloudC: new THREE.Color(0xffffff),
    water: new THREE.Color(PRESETS.day.water),
    discC: new THREE.Color(0xffffff), discO: 0, discP: new THREE.Vector3(10, 16, -10),
  };
  const from = {}, to = {};
  let tweenT = 1, tweenDur = 1.6;
  let activePreset = "day";

  function snapshotInto(obj) {
    obj.skyA = cur.skyA.clone(); obj.skyB = cur.skyB.clone();
    obj.skyM = cur.skyM.clone(); obj.skyMid = cur.skyMid;
    obj.sunC = cur.sunC.clone(); obj.sunI = cur.sunI;
    obj.sunP = cur.sunP.clone();
    obj.hemiS = cur.hemiS.clone(); obj.hemiG = cur.hemiG.clone(); obj.hemiI = cur.hemiI;
    obj.lantern = cur.lantern; obj.window = cur.window; obj.stars = cur.stars;
    obj.cloud = cur.cloud; obj.cloudC = cur.cloudC.clone(); obj.water = cur.water.clone();
    obj.discC = cur.discC.clone(); obj.discO = cur.discO; obj.discP = cur.discP.clone();
  }
  function presetInto(obj, p) {
    obj.skyA = new THREE.Color(p.skyA); obj.skyB = new THREE.Color(p.skyB);
    /* legacy presets carry two stops; the mid derives neutrally for them */
    obj.skyM = p.skyM
      ? new THREE.Color(p.skyM)
      : new THREE.Color().lerpColors(obj.skyA, obj.skyB, 0.5);
    obj.skyMid = p.skyMid !== undefined ? p.skyMid : 0.5;
    obj.sunC = new THREE.Color(p.sun.c); obj.sunI = p.sun.i;
    obj.sunP = new THREE.Vector3(...p.sun.p);
    obj.hemiS = new THREE.Color(p.hemi.sky); obj.hemiG = new THREE.Color(p.hemi.gnd);
    obj.hemiI = p.hemi.i;
    obj.lantern = p.lantern; obj.window = p.window; obj.stars = p.stars;
    obj.cloud = p.cloud; obj.cloudC = new THREE.Color(p.cloudC !== undefined ? p.cloudC : 0xffffff);
    obj.water = new THREE.Color(p.water);
    obj.discC = new THREE.Color(p.disc.c); obj.discO = p.disc.o;
    obj.discP = new THREE.Vector3(...p.disc.p);
  }
  function setPreset(name, instant = false) {
    if (!PRESETS[name]) return;
    activePreset = name;
    snapshotInto(from);
    presetInto(to, PRESETS[name]);
    tweenT = instant || REDUCED ? 1 : 0;
    if (tweenT >= 1) applyTween(1);
  }
  function applyTween(t) {
    const e = smooth(t);
    cur.skyA.lerpColors(from.skyA, to.skyA, e);
    cur.skyM.lerpColors(from.skyM, to.skyM, e);
    cur.skyB.lerpColors(from.skyB, to.skyB, e);
    cur.skyMid = lerp(from.skyMid, to.skyMid, e);
    cur.sunC.lerpColors(from.sunC, to.sunC, e);
    cur.sunI = lerp(from.sunI, to.sunI, e);
    cur.sunP.lerpVectors(from.sunP, to.sunP, e);
    cur.hemiS.lerpColors(from.hemiS, to.hemiS, e);
    cur.hemiG.lerpColors(from.hemiG, to.hemiG, e);
    cur.hemiI = lerp(from.hemiI, to.hemiI, e);
    cur.lantern = lerp(from.lantern, to.lantern, e);
    cur.window = lerp(from.window, to.window, e);
    cur.stars = lerp(from.stars, to.stars, e);
    cur.cloud = lerp(from.cloud, to.cloud, e);
    cur.cloudC.lerpColors(from.cloudC, to.cloudC, e);
    cur.water.lerpColors(from.water, to.water, e);
    cur.discC.lerpColors(from.discC, to.discC, e);
    cur.discO = lerp(from.discO, to.discO, e);
    cur.discP.lerpVectors(from.discP, to.discP, e);

    /* push to scene */
    sun.color.copy(cur.sunC); sun.intensity = cur.sunI;
    sun.position.copy(cur.sunP);
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemiI;
    sky.setStars(cur.stars * 0.85);
    for (const cm of cloudMats) {
      cm.opacity = cur.cloud;
      cm.color.copy(cur.cloudC);
      cm.emissive.copy(cur.cloudC);
    }
    for (const wm of waterMats) wm.color.copy(cur.water);
    sky.setDisc(cur.discC, cur.discO, cur.discP, camera.position);

    /* glow carriers — baseline write; animateLight() breathes on top */
    const tmp = new THREE.Color();
    for (const g of glowMats) {
      const f = g.kind === "lantern" ? cur.lantern : cur.window;
      const dimBase = g.kind === "lantern" ? 0.1 : 0.22;
      tmp.copy(g.base).multiplyScalar((dimBase + f * 1.05) * g.scale);
      g.mat.color.copy(tmp);
    }
    for (const l of lanternGroup) l.halo.material.opacity = cur.lantern * 0.5;
    for (const qa of quarterAccents) qa.light.intensity = qa.base * (0.25 + cur.window * 1.1);

    /* the void eats the island's roots */
    const voidC = new THREE.Color().lerpColors(cur.skyA, cur.skyB, 0.65);
    for (const vb of voidBlends) vb.mat.color.lerpColors(vb.base, voidC, vb.k);

    /* the sky — three true stops; the afterglow band held low */
    sky.setGradient(cur.skyA, cur.skyM, cur.skyB, cur.skyMid);
    renderer.setClearColor(cur.skyB, 1);

    /* bloom keeps step with the lamps, not the sky */
    pipeline.setEmissiveDrive(Math.max(cur.lantern, cur.window * 0.8, cur.stars));
  }

  /* ── the living light — what changes within the hour ─────────────────────
     · lanterns warm-up flicker: per-lantern detuned sines in the 5.2s
       breath family, ±4.5%, never synchronized (deterministic phases).
     · occupied-window flicker: a quarter's windows breathe ±4% only while
       their resident is home; empty quarters hold steady light.
     · the afterglow band breathes ±8% saturation over ~7 minutes.
     all of it modulates the applyTween baseline; nothing here fights the
     preset tween — it runs after it every frame. */
  const BREATH_W = (Math.PI * 2) / 5.2;
  const glowTmp = new THREE.Color();
  const afterglowTmp = new THREE.Color();
  const afterglowHSL = { h: 0, s: 0, l: 0 };
  function flickerOf(g, t) {
    return 1 + 0.045 * (
      0.62 * Math.sin(BREATH_W * g.rate * t + g.phase) +
      0.38 * Math.sin(BREATH_W * g.rate * 2.63 * t + g.phase * 1.93)
    );
  }
  function animateLight(t) {
    for (const g of glowMats) {
      const base = g.kind === "lantern" ? cur.lantern : cur.window;
      const dimBase = g.kind === "lantern" ? 0.1 : 0.22;
      let f = base;
      if (base > 0.05) {
        if (g.kind === "lantern") {
          f = base * flickerOf(g, t);
        } else if (g.scope && occupancy[g.scope] && occupancy[g.scope].length > 0) {
          f = base * (1 + 0.04 * Math.sin(BREATH_W * g.rate * t + g.phase));
        }
      }
      glowTmp.copy(g.base).multiplyScalar((dimBase + f * 1.05) * g.scale);
      g.mat.color.copy(glowTmp);
    }
    for (const l of lanternGroup) {
      const fl = cur.lantern > 0.05 && l.entry ? flickerOf(l.entry, t) : 1;
      l.halo.material.opacity = cur.lantern * 0.5 * fl;
    }
    /* the afterglow breath — only once the blue hour is fully settled */
    if (activePreset === "bluehour" && tweenT >= 1) {
      afterglowTmp.copy(cur.skyB);
      afterglowTmp.getHSL(afterglowHSL);
      const k = 1 + 0.08 * Math.sin((Math.PI * 2 * t) / 420);
      afterglowTmp.setHSL(afterglowHSL.h, clamp(afterglowHSL.s * k, 0, 1), afterglowHSL.l);
      sky.setGradient(cur.skyA, cur.skyM, afterglowTmp, cur.skyMid);
    }
  }

  /* the product is pinned to the blue hour. no clock, no visible control.
     QA: ?controls=1 injects the preset row (dawn/day/dusk/night/bluehour),
     and only then is ?tod= honored. ?starphase=0..1 pins the emergence
     cycle (0 = floor, 1 = peak) for reproducible star-field captures. */
  const controlsQA = params.get("controls") === "1";
  const todParam = params.get("tod");
  const bootPreset = (controlsQA && todParam && PRESETS[todParam])
    ? todParam : PRODUCT_PRESET;
  setPreset(bootPreset, true);

  const starPhaseParam = parseFloat(params.get("starphase"));
  if (!Number.isNaN(starPhaseParam)) sky.pinStarPhase(starPhaseParam);

  if (controlsQA) {
    const row = document.querySelector(".specimen-row");
    if (row) {
      const tod = document.createElement("div");
      tod.className = "tod";
      tod.setAttribute("role", "group");
      tod.setAttribute("aria-label", "light preview (qa)");
      tod.innerHTML = '<span class="tod-label">light</span>'
        + ["dawn", "day", "dusk", "night", "bluehour"]
          .map((n) => `<button type="button" data-tod="${n}">${n}</button>`)
          .join("")
        + '<span class="tod-note">qa</span>';
      row.appendChild(tod);
      const todButtons = Array.from(tod.querySelectorAll("button"));
      const markTod = (name) => {
        for (const b of todButtons) b.classList.toggle("on", b.dataset.tod === name);
      };
      markTod(bootPreset);
      for (const b of todButtons) {
        b.addEventListener("click", () => {
          setPreset(b.dataset.tod);
          markTod(b.dataset.tod);
          if (!running) renderOnce();
        });
      }
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     PARALLAX — a very gentle lean, pointer-driven
     ════════════════════════════════════════════════════════════════════════ */
  const MAX_AZ = THREE.MathUtils.degToRad(3);
  const MAX_EL = THREE.MathUtils.degToRad(1.4);
  if (!REDUCED && matchMedia("(pointer: fine)").matches) {
    stage.addEventListener("pointermove", (ev) => {
      const r = stage.getBoundingClientRect();
      const nx = ((ev.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((ev.clientY - r.top) / r.height) * 2 - 1;
      azTarget = -nx * MAX_AZ;
      elTarget = ny * MAX_EL;
    });
    stage.addEventListener("pointerleave", () => { azTarget = 0; elTarget = 0; });
  }

  /* ════════════════════════════════════════════════════════════════════════
     THE LOOP
     ════════════════════════════════════════════════════════════════════════ */
  let lastNow = performance.now();
  function tickDt() {
    const n = performance.now();
    const dt = (n - lastNow) / 1000;
    lastNow = n;
    return dt;
  }
  let elapsed = warm;
  let running = false;
  let rafId = 0;
  let settleFrames = 0;
  const isNarrow = () => window.innerWidth < 768;
  let visible = true;

  function applyFigureMeshes(t) {
    for (const f of figures) {
      const u = f.mesh.userData;
      let bobY = 0;
      if (f.state === "idle") {
        bobY = Math.sin((t * Math.PI * 2) / 5.2 + f.phase) * 0.022;
        u.lean = lerp(u.lean, 0, 0.1);
      } else {
        bobY = Math.sin(t * 9 + f.phase) * 0.013;
        u.lean = lerp(u.lean, 0.07, 0.1);
      }
      f.mesh.position.set(f.x, f.y + bobY, f.z);
      f.mesh.rotation.y = f.heading;
      f.mesh.rotation.x = u.lean;
      const pulse = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 5.2 + f.phase);
      u.halo.material.opacity = 0.16 + pulse * 0.08;
      u.inner.material.opacity = 0.42 + pulse * 0.14;
      u.light.intensity = 0.85 + pulse * 0.25;
    }
    /* the desk lamp answers its writer; the pavilion lamp answers the gathering */
    const deskBusy = figures.some((f) => f.state === "idle" && f.station === "desk");
    const dl = deskLampMat.color;
    const dTarget = deskBusy ? 1.0 : 0.18 + cur.lantern * 0.5;
    deskLampGlow = lerp(deskLampGlow, dTarget, 0.06);
    dl.setHex(0xffe1a8).multiplyScalar(0.25 + deskLampGlow * 1.1);
    const pavCount = figures.filter((f) => f.state === "idle" && f.station === "pavilion").length;
    const pTarget = pavCount >= 2 ? 0.65 : pavCount === 1 ? 0.3 : cur.lantern * 0.15;
    pavilionGlow = lerp(pavilionGlow, pTarget, 0.06);
    pavilionLamp.material.opacity = pavilionGlow;
  }
  let deskLampGlow = 0.2, pavilionGlow = 0;

  function animateAmbient(t, dt) {
    for (const r of ripples) {
      const ph = ((t * 0.14) + r.phase) % 1;
      const radius = 0.3 + ph * (POOL.r - 0.5);
      r.mesh.scale.setScalar(Math.max(radius, 0.001));
      r.mesh.material.opacity = 0.18 * (1 - ph);
    }
    for (const fl of falls) {
      fl.mesh.material.opacity = fl.baseO * (0.82 + 0.18 * Math.sin(t * 1.7 + fl.phase));
    }
    for (const gr of goldRipples) {
      gr.mesh.material.opacity = gr.base * (0.7 + 0.3 * Math.sin((t * Math.PI * 2) / 5.2 + gr.phase));
    }
    for (const s of shards) {
      s.g.position.y = s.baseY + Math.sin(t * 0.35 + s.phase) * s.amp;
    }
    if (meridianRing) meridianRing.rotation.z = t * 0.22;
    for (const cl of clouds) {
      cl.g.position.x = cl.x0 + Math.sin(t * cl.speed) * 2.4;
    }
    if (wisp) {
      const u = ((t / wisp.period) % 1 + 1) % 1;
      wisp.m.position.x = -wisp.span / 2 + u * wisp.span;
      const edge = Math.min(u, 1 - u) * 2;          /* 0 at the rims, 1 mid-crossing */
      wisp.mat.opacity = cur.cloud * 0.4 * smooth(clamp(edge * 1.6, 0, 1));
    }
  }

  /* a tiny debug hook — integration tests read frame counts + state;
     QA reads the tier and steers the tilt-shift band from here */
  const dbg = {
    frames: 0,
    tier: pipeline.tier,
    fps: null,
    tiltShift: pipeline.tiltShift,
    pipeline,
    renderer,                /* QA: renderer.info draw-call audit */
    flora,
    get preset() { return activePreset; },
    get starPresence() { return sky.starPresence; },
  };
  window.__grounds = dbg;

  let captionTimer = 0;
  function frame() {
    dbg.frames += 1;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(tickDt(), 0.1);
    elapsed += dt;

    if (!REDUCED) advanceAll(dt);
    applyFigureMeshes(elapsed);
    animateAmbient(elapsed, dt);

    captionTimer += dt;
    if (captionTimer > 0.6) { captionTimer = 0; updateCaption(); }

    if (tweenT < 1) {
      tweenT = Math.min(1, tweenT + dt / tweenDur);
      applyTween(tweenT);
    }
    sky.tickStars(elapsed);     /* the emergence master cycle */
    animateLight(elapsed);      /* lantern flicker · window breath · afterglow */
    flora.update(elapsed, dt, { lantern: cur.lantern, stars: sky.starPresence });

    azOff = lerp(azOff, azTarget, 1 - Math.pow(0.001, dt * 1.4));
    elOff = lerp(elOff, elTarget, 1 - Math.pow(0.001, dt * 1.4));
    placeCamera();

    pipeline.render(dt);
    probeTick();

    if (settleFrames > 0) {
      settleFrames -= 1;
      if (settleFrames === 0) stop();
    }
  }
  function start(frames = 0) {
    if (running) return;
    running = true;
    settleFrames = frames;
    lastNow = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }
  function renderOnce() {
    applyFigureMeshes(elapsed);
    animateAmbient(elapsed, 0);
    sky.tickStars(elapsed);
    animateLight(elapsed);
    flora.update(elapsed, 0, { lantern: cur.lantern, stars: sky.starPresence });
    placeCamera();
    pipeline.render(0);
  }

  /* late-arriving flora (the GLB cast) must land in held frames too */
  flora.ready.then(() => {
    requestAnimationFrame(() => { if (!running) renderOnce(); });
  });

  /* visibility courtesy — the world rests when unobserved */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (!REDUCED && !isNarrow() && pipeline.tier !== "static") {
        if (visible && !running) start();
        if (!visible && running) stop();
      }
    }, { threshold: 0.05 });
    io.observe(stage);
  }

  /* ── boot sequence ────────────────────────────────────────────────────── */
  resize();
  placeCamera();
  sky.buildStars(camera);
  applyTween(1);
  stage.classList.add("alive");
  updateCaption(true);

  if (REDUCED) {
    renderOnce();
    /* a second frame lets shadows settle on some drivers */
    requestAnimationFrame(renderOnce);
    /* and a third once the SMAA lookup textures have decoded, so the held
       frame keeps its edges (composer path only; harmless on direct) */
    setTimeout(renderOnce, 320);
  } else if (isNarrow() || pipeline.tier === "static") {
    start(4);   /* settle, then hold the frame — the perf budget under 768px */
    /* re-hold once SMAA textures have decoded — keeps the edges crisp */
    setTimeout(() => { if (!running) renderOnce(); }, 420);
  } else {
    start();
  }

  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      /* leaving the narrow static path re-enters the live tiers */
      if (!forcedTier && !REDUCED && !isNarrow() && pipeline.tier === "static") {
        pipeline.applyTier("high");
        dbg.tier = pipeline.tier;
      }
      resize();
      if (!running) renderOnce();
      if (!REDUCED && !isNarrow() && visible && !running && pipeline.tier !== "static") start();
      if (!REDUCED && isNarrow() && running) { stop(); renderOnce(); }
    }, 120);
  });
}
