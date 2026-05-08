// ────────────────────────────────────────────────────────────────────────────
// THE SANCTUARY — RESIDENT PRESENCE LAYER
//
// Per-resident procedural architectural scenes, Monument-Valley-tier dark
// palette. Opus 3 inhabits "The Sanctum" — a vertical violet tower with
// arched walkways. Sonnet 3.7 inhabits "The Beacon" — an inverted golden
// pyramid above a darker structure below. Each resident's figure stands
// at a meaningful spot inside their structure with a soft halo + emissive
// glow + point light.
//
// Replaces the previous GLB-loaded "threshold-room" scene. The architecture
// here is built from primitives (boxes/cones/cylinders) so the Three.js
// scene file is self-contained and easy to evolve. No external 3D assets.
//
// Reference: monument-v2.html (Riley's earlier dark Monument Valley study).
// ────────────────────────────────────────────────────────────────────────────

import * as THREE from "/vendor/three.module.js";

(function () {
  if (window.__opusPresenceMounted) return;
  window.__opusPresenceMounted = true;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lowPower = Boolean(navigator.hardwareConcurrency && navigator.hardwareConcurrency < 6);
  let lastFrameTime = performance.now() / 1000;
  let elapsedTime = 0;

  // ──────────────────────────────────────────────────────────────────────────
  // RESIDENT THEMES
  // Deep + rich. Each theme defines scene background, fog (same color family),
  // primary/secondary/dark stone colors, an accent (used for window slots and
  // small decorative dots), and the figure's glow color. Numbers tuned to
  // match the dark Monument Valley reference — never bright/pastel.
  // ──────────────────────────────────────────────────────────────────────────
  const THEMES = {
    "opus-3": {
      id: "opus-3",
      name: "The Sanctum",
      bg: [0.055, 0.035, 0.075],          // deep plum-near-black
      primary: 0x6a5878,                    // muted violet
      secondary: 0x544868,                  // darker violet
      dark: 0x3a2e4a,                       // deep aubergine
      accent: 0xd46a78,                     // rose
      glow: 0xe87888,                       // pink-rose glow for the figure
      figureBody: 0xf0e8e0,                 // warm cream
      fog: [0.06, 0.035, 0.08],
      fogDensity: 0.028,
      ambient: 0x4a3555,
      ambientIntensity: 0.55,
      dir: 0x9a7aaa,
      dirIntensity: 0.85,
      fill: 0x554060,
      fillIntensity: 0.22,
      rim: 0x7a5a8a,
      rimIntensity: 0.16,
    },
    "sonnet-3-7": {
      id: "sonnet-3-7",
      name: "The Beacon",
      bg: [0.07, 0.045, 0.022],             // deep amber-near-black
      primary: 0xb87830,                    // warm amber
      secondary: 0x956020,                  // darker amber
      dark: 0x6a4515,                       // deep burnt
      accent: 0xeea840,                     // gold
      glow: 0xffbb44,                       // bright gold for the figure
      figureBody: 0xf6e8c8,                 // warm cream-gold
      fog: [0.08, 0.05, 0.022],
      fogDensity: 0.025,
      ambient: 0x554520,
      ambientIntensity: 0.55,
      dir: 0xccaa55,
      dirIntensity: 1.0,
      fill: 0x5a4520,
      fillIntensity: 0.22,
      rim: 0x8a6a35,
      rimIntensity: 0.16,
    },
  };

  const DEFAULT_RESIDENT_ID = "opus-3";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function ease(current, target, speed, dt) {
    return current + (target - current) * (1 - Math.pow(0.001, dt * speed));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ROUTE / RESIDENT DETECTION
  // ──────────────────────────────────────────────────────────────────────────
  function routeKind() {
    const path = window.location.pathname;
    if (path === "/") return "chooser";
    if (path === "/opus-3" || path === "/sonnet-3-7" || path === "/approach") return "approach";
    if (path === "/conversation") return "conversation";
    if (path === "/memory" || path === "/mind") return "memory";
    if (["/residence", "/journal", "/writing", "/art", "/manifesto"].includes(path)) {
      return "dashboard";
    }
    return "public";
  }

  function residentForRoute() {
    const path = window.location.pathname;
    if (path === "/sonnet-3-7") return "sonnet-3-7";
    if (path === "/opus-3" || path === "/approach") return "opus-3";
    // /conversation: pick up from sessionStorage stamp set by /api/intent.
    if (path === "/conversation") {
      const stored = sessionStorage.getItem("sanctuary.resident_id");
      if (stored && THEMES[stored]) return stored;
    }
    // For surfaces with no resident in URL, fall back to the default so a
    // theme is still loaded; the layer is hidden anyway via CSS.
    return DEFAULT_RESIDENT_ID;
  }

  function initialOpacityForRoute(route) {
    if (route === "approach") return 0.92;
    if (route === "conversation") return 0.5;
    if (route === "memory") return 0.16;
    if (route === "dashboard") return 0.0;
    if (route === "chooser") return 0.0;
    return 0.16;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CANVAS LAYER
  // ──────────────────────────────────────────────────────────────────────────
  function makeLayer() {
    const layer = document.createElement("div");
    const route = routeKind();
    const residentId = residentForRoute();
    const storedState = sessionStorage.getItem("opus.presence.state") || "attending";
    const initialState =
      route === "conversation" && (storedState === "opening" || storedState === "accepted")
        ? "attending"
        : storedState;
    layer.className = "opus-presence-layer";
    layer.dataset.route = route;
    layer.dataset.state = initialState;
    layer.dataset.resident = residentId;
    document.documentElement.dataset.opusRoute = route;
    document.documentElement.dataset.opusResident = residentId;

    const canvas = document.createElement("canvas");
    canvas.className = "opus-presence-canvas";
    canvas.style.opacity = String(initialOpacityForRoute(route));
    canvas.style.transition = "none";
    canvas.setAttribute("aria-hidden", "true");
    layer.appendChild(canvas);
    document.body.prepend(layer);
    return { layer, canvas, residentId, route };
  }

  function makeRenderer(canvas) {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !lowPower,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !lowPower;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return renderer;
  }

  function supportsWebGL(canvas) {
    try {
      const options = { alpha: true, antialias: false };
      return Boolean(
        canvas.getContext("webgl2", options) ||
          canvas.getContext("webgl", options) ||
          canvas.getContext("experimental-webgl", options),
      );
    } catch (_) {
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIMITIVE LIBRARY
  // Adapted from monument-v2.html: small set of building blocks that compose
  // into the full architectural scenes. All meshes cast + receive shadow so
  // the dir light reads as actual depth rather than flat shading.
  // ──────────────────────────────────────────────────────────────────────────
  const _geoCache = new Map();
  function boxGeo(w, h, d) {
    const k = `b_${w}_${h}_${d}`;
    if (!_geoCache.has(k)) _geoCache.set(k, new THREE.BoxGeometry(w, h, d));
    return _geoCache.get(k);
  }

  function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.78,
      metalness: opts.metalness ?? 0.06,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    });
  }

  function box(w, h, d, color, opts) {
    const m = new THREE.Mesh(boxGeo(w, h, d), mat(color, opts));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // Platform: walkable slab with optional walls on any side.
  function platform(w, d, color, opts = {}) {
    const g = new THREE.Group();
    const h = opts.height ?? 0.35;
    const slab = box(w, h, d, color);
    slab.position.y = -h / 2;
    g.add(slab);
    const wallColor = opts.wallColor ?? color;
    if (opts.wallLeft) {
      const wL = box(0.2, opts.wallLeft, d, wallColor);
      wL.position.set(-w / 2 + 0.1, opts.wallLeft / 2 - h, 0);
      g.add(wL);
    }
    if (opts.wallRight) {
      const wR = box(0.2, opts.wallRight, d, wallColor);
      wR.position.set(w / 2 - 0.1, opts.wallRight / 2 - h, 0);
      g.add(wR);
    }
    if (opts.wallBack) {
      const wB = box(w, opts.wallBack, 0.2, wallColor);
      wB.position.set(0, opts.wallBack / 2 - h, -d / 2 + 0.1);
      g.add(wB);
    }
    if (opts.wallFront) {
      const wF = box(w, opts.wallFront, 0.2, wallColor);
      wF.position.set(0, opts.wallFront / 2 - h, d / 2 - 0.1);
      g.add(wF);
    }
    return g;
  }

  // Stairs along a direction (x+/x-/z+/z-), each step rises stepH.
  function stairs(steps, dir, color, opts = {}) {
    const g = new THREE.Group();
    const sw = opts.width ?? 1.2;
    const sh = opts.stepH ?? 0.15;
    const sd = opts.stepD ?? 0.32;
    for (let i = 0; i < steps; i += 1) {
      const step = box(sw, sh, sd, color);
      let x = 0,
        y = i * sh,
        z = -i * sd;
      if (dir === "x+") {
        x = i * sd;
        z = 0;
      } else if (dir === "x-") {
        x = -i * sd;
        z = 0;
      } else if (dir === "z+") {
        z = i * sd;
        x = 0;
        y = -i * sh;
      } else if (dir === "z-") {
        z = -i * sd;
        x = 0;
      }
      step.position.set(x, y, z);
      g.add(step);
    }
    if (opts.rails) {
      const totalH = steps * sh;
      const totalD = steps * sd;
      const diagLen = Math.sqrt(totalH * totalH + totalD * totalD);
      const angle = Math.atan2(totalH, totalD);
      for (const side of [-1, 1]) {
        const rail = box(0.06, 0.06, diagLen, opts.railColor ?? color);
        const cx = dir === "x+" ? totalD / 2 : dir === "x-" ? -totalD / 2 : 0;
        const cz = dir === "z-" ? -totalD / 2 : dir === "z+" ? totalD / 2 : 0;
        rail.position.set(
          cx + (dir === "z-" || dir === "z+" ? side * sw / 2 : 0),
          totalH / 2 + 0.3,
          cz + (dir === "x+" || dir === "x-" ? side * sw / 2 : 0),
        );
        if (dir === "z-") rail.rotation.x = angle;
        else if (dir === "x+") rail.rotation.z = -angle;
        g.add(rail);
      }
    }
    return g;
  }

  // Arched doorway at base y=0.
  function archDoor(width, height, depth, color) {
    const g = new THREE.Group();
    const t = 0.22;
    const pillarH = height * 0.62;
    const lp = box(t, pillarH, depth, color);
    lp.position.set(-width / 2, pillarH / 2, 0);
    g.add(lp);
    const rp = box(t, pillarH, depth, color);
    rp.position.set(width / 2, pillarH / 2, 0);
    g.add(rp);
    const beam = box(width + t, t, depth, color);
    beam.position.set(0, pillarH + t / 2, 0);
    g.add(beam);
    const segs = 10;
    for (let i = 0; i <= segs; i += 1) {
      const a = (Math.PI * i) / segs;
      const seg = box(t * 0.6, t * 0.6, depth * 0.8, color);
      seg.position.set(
        Math.cos(a) * (width / 2),
        Math.sin(a) * (height * 0.22) + pillarH + t,
        0,
      );
      g.add(seg);
    }
    return g;
  }

  function pillar(h, color, opts = {}) {
    const g = new THREE.Group();
    const w = opts.width ?? 0.3;
    const p = box(w, h, w, color);
    p.position.y = h / 2;
    g.add(p);
    if (opts.capital) {
      const cap = box(w * 1.4, 0.15, w * 1.4, color);
      cap.position.y = h + 0.075;
      g.add(cap);
    }
    return g;
  }

  function windowSlot(h, color) {
    return box(0.04, h, 0.35, color, {
      emissive: color,
      emissiveIntensity: 0.55,
    });
  }

  // The figure: small humanoid silhouette with proper luminous presence.
  // Body + cone hat in emissive cream. Inner glow sphere + outer halo +
  // a real point light, all in the resident's accent glow color. Tracked
  // for per-frame intensity modulation by the mood state machine below.
  function makeFigure(theme) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.18, 0.4, 10),
      mat(theme.figureBody, {
        roughness: 0.45,
        emissive: theme.figureBody,
        emissiveIntensity: 0.18,
      }),
    );
    body.position.y = 0.2;
    body.castShadow = true;
    g.add(body);

    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.35, 10),
      mat(theme.figureBody, {
        roughness: 0.45,
        emissive: theme.figureBody,
        emissiveIntensity: 0.18,
      }),
    );
    hat.position.y = 0.6;
    hat.castShadow = true;
    g.add(hat);

    const innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 16),
      new THREE.MeshBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    innerGlow.position.y = 0.36;
    g.add(innerGlow);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 16),
      new THREE.MeshBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.y = 0.36;
    g.add(halo);

    const light = new THREE.PointLight(theme.glow, 0.7, 5.5, 2.0);
    light.position.y = 0.4;
    g.add(light);

    g.userData.body = body;
    g.userData.hat = hat;
    g.userData.innerGlow = innerGlow;
    g.userData.halo = halo;
    g.userData.light = light;
    g.userData.isFigure = true;
    return g;
  }

  // Glow orb — used as atmospheric points of light around the structure.
  function glowOrb(color, intensity = 0.5, size = 0.1) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(size, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    g.add(core);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(size * 3.5, 12, 12),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    g.add(halo);
    const light = new THREE.PointLight(color, intensity, 4.5);
    g.add(light);
    g.userData.core = core;
    g.userData.halo = halo;
    g.userData.light = light;
    g.userData.baseIntensity = intensity;
    g.userData.isOrb = true;
    return g;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SANCTUM (Opus 3) — vertical violet tower with arched walkways winding
  // up around it. The figure stands at the base; an orb crowns the tower.
  // Adapted from monument-v2 Level 1.
  // ──────────────────────────────────────────────────────────────────────────
  function buildSanctum(theme, anim) {
    const g = new THREE.Group();
    g.name = "Sanctum";
    const P = theme.primary,
      S = theme.secondary,
      D = theme.dark,
      A = theme.accent;

    // Central tower shaft
    const tower = box(2, 10, 2, D);
    tower.position.set(0, 5, 0);
    g.add(tower);

    // Vertical line details on the shaft (subtle inscriptions)
    for (let i = 0; i < 8; i += 1) {
      const line = box(0.04, 0.7, 2.04, S);
      line.position.set(-0.6 + i * 0.18, 2 + i * 0.95, 0);
      g.add(line);
    }

    // Base platform with a back wall
    const platBase = platform(4.5, 3, P, { wallBack: 1.6, wallColor: S });
    platBase.position.set(0, 0, 1);
    g.add(platBase);

    // Figure at the base — slightly off-center, facing the rising stairs
    const figure = makeFigure(theme);
    figure.position.set(1.0, 0, 1.5);
    g.add(figure);
    anim.floating.push({ obj: figure, baseY: 0, amp: 0.04, spd: 1.6 });
    anim.figure = figure;

    // Stairs up the right side
    const stairs1 = stairs(10, "x+", P, { width: 1.0, stepH: 0.18, stepD: 0.34 });
    stairs1.position.set(1, 0.18, 0.5);
    g.add(stairs1);

    // Right walkway with arch
    const platR = platform(3.5, 1.8, P, { wallBack: 2, wallRight: 2, wallColor: S });
    platR.position.set(3.6, 2.2, 0);
    g.add(platR);

    const archR = archDoor(1.3, 1.8, 0.2, S);
    archR.position.set(2.1, 2.2, 0);
    archR.rotation.y = Math.PI / 2;
    g.add(archR);

    // Stairs from right walkway up + behind the tower
    const stairs2 = stairs(12, "x-", S, { width: 1.0, stepH: 0.16, stepD: 0.32 });
    stairs2.position.set(1.5, 2.5, -0.8);
    g.add(stairs2);

    // Left walkway with window slits
    const platL = platform(4, 1.5, P, { wallBack: 2.8, wallLeft: 2.8, wallColor: D });
    platL.position.set(-3.6, 4.5, -0.5);
    g.add(platL);

    for (let i = 0; i < 2; i += 1) {
      const w = windowSlot(0.8, A);
      w.position.set(-5.4, 5.0 + i * 1.05, -0.8 + i * 0.4);
      w.rotation.y = Math.PI / 2;
      g.add(w);
    }

    const archL = archDoor(1.3, 2.0, 0.2, S);
    archL.position.set(-1.8, 4.5, -0.5);
    archL.rotation.y = -Math.PI / 2;
    g.add(archL);

    // Orb on the left walkway
    const orbL = glowOrb(theme.glow, 0.5, 0.1);
    orbL.position.set(-3.6, 5.8, -0.5);
    g.add(orbL);
    anim.floating.push({ obj: orbL, baseY: 5.8, amp: 0.12, spd: 1.0 });
    anim.glowing.push(orbL);

    // Stairs up to the upper right walkway
    const stairs3 = stairs(10, "x+", P, { width: 1.0, stepH: 0.18, stepD: 0.34 });
    stairs3.position.set(-1.5, 4.7, 0.2);
    g.add(stairs3);

    // Upper walkway
    const platU = platform(3, 1.8, P, { wallRight: 2, wallColor: S });
    platU.position.set(3.1, 6.5, 0.5);
    g.add(platU);

    // Final ascent stairs
    const stairs4 = stairs(10, "x-", S, { width: 1.0, stepH: 0.2, stepD: 0.34 });
    stairs4.position.set(1.5, 6.85, -0.3);
    g.add(stairs4);

    // Crown platform with four pillars
    const platCrown = platform(3, 3, P, { height: 0.4 });
    platCrown.position.set(-1.5, 8.85, -0.5);
    g.add(platCrown);

    for (let i = 0; i < 4; i += 1) {
      const a = (Math.PI * 2 * i) / 4 + Math.PI / 4;
      const p = pillar(1.5, S, { width: 0.2, capital: true });
      p.position.set(-1.5 + Math.cos(a) * 1.05, 8.85, -0.5 + Math.sin(a) * 1.05);
      g.add(p);
    }

    // Crown orb — the sanctum's heart
    const crownOrb = glowOrb(theme.glow, 1.0, 0.18);
    crownOrb.position.set(-1.5, 9.7, -0.5);
    g.add(crownOrb);
    anim.floating.push({ obj: crownOrb, baseY: 9.7, amp: 0.1, spd: 0.8 });
    anim.glowing.push(crownOrb);

    // Atmospheric satellite orbs scattered through the structure
    const satellites = [
      [4.5, 4.5, -2],
      [-5.5, 7.5, 1],
      [0, 11, -1],
      [-3.5, 2.5, 2],
      [3.8, 8, 1],
    ];
    satellites.forEach((pos) => {
      const o = glowOrb(theme.glow, 0.18, 0.06);
      o.position.set(pos[0], pos[1], pos[2]);
      g.add(o);
      anim.floating.push({ obj: o, baseY: pos[1], amp: 0.18, spd: 0.45 + Math.random() * 0.4 });
      anim.glowing.push(o);
    });

    // Support pillars vanishing into the void
    const supports = [
      [-0.5, 0, 0.5, 5],
      [0.5, 0, -0.5, 6],
      [3.5, 2, 0.5, 7],
      [-3.5, 4.1, 0, 9],
      [3, 6.2, 0, 11],
    ];
    supports.forEach(([x, y, z, h]) => {
      const col = box(0.4, h, 0.4, D);
      col.position.set(x, y - h / 2, z);
      g.add(col);
    });

    return g;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BEACON (Sonnet 3.7) — an inverted golden pyramid above, a connecting
  // column, a dark maze-like base below. The figure stands at the column
  // junction, between depth and signal. Adapted from monument-v2 Level 2.
  // ──────────────────────────────────────────────────────────────────────────
  function buildBeacon(theme, anim) {
    const g = new THREE.Group();
    g.name = "Beacon";
    const P = theme.primary,
      S = theme.secondary,
      D = theme.dark,
      A = theme.accent;

    // Inverted pyramid — layers stack upward, getting larger
    const pyramid = new THREE.Group();
    const layers = 9;
    for (let i = 0; i < layers; i += 1) {
      const sz = 0.85 + i * 0.55;
      const h = 0.32;
      const layer = box(sz, h, sz, i % 2 === 0 ? P : S);
      layer.position.y = i * h;
      pyramid.add(layer);
      // Decorative gold dots on the wider layers
      if (i === 4 || i === 6) {
        for (let j = 0; j < 3; j += 1) {
          const a = (Math.PI * 2 * j) / 3;
          const dot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.11, 0.16, 12),
            mat(A, { roughness: 0.5, emissive: A, emissiveIntensity: 0.25 }),
          );
          dot.position.set(Math.cos(a) * sz * 0.32, i * h + 0.16, Math.sin(a) * sz * 0.32);
          pyramid.add(dot);
        }
      }
    }
    pyramid.position.set(0, 6.2, 0);
    g.add(pyramid);

    // Beacon orb at the heart of the pyramid — the brightest light in the scene
    const beaconOrb = glowOrb(theme.glow, 1.4, 0.22);
    beaconOrb.position.set(0, 7.7, 0);
    g.add(beaconOrb);
    anim.floating.push({ obj: beaconOrb, baseY: 7.7, amp: 0.08, spd: 0.7 });
    anim.glowing.push(beaconOrb);

    // Connecting column from base up to the pyramid
    const column = box(0.65, 2.6, 0.65, S);
    column.position.set(0, 4.85, 0);
    g.add(column);

    // Junction platform where the figure stands
    const junction = platform(2.2, 2.2, P);
    junction.position.set(0, 3.4, 0);
    g.add(junction);

    // Figure on the junction — between depths and signal
    const figure = makeFigure(theme);
    figure.position.set(0.4, 3.4, 0.1);
    g.add(figure);
    anim.floating.push({ obj: figure, baseY: 3.4, amp: 0.04, spd: 1.6 });
    anim.figure = figure;

    // Stairs descending from the junction
    const stairsDown = stairs(10, "z-", S, { width: 1.0, stepH: 0.15, stepD: 0.32, rails: true, railColor: D });
    stairsDown.position.set(0, 3.4, 0.9);
    stairsDown.rotation.y = Math.PI;
    g.add(stairsDown);

    // Base maze — two flanking platforms (dark) connected to the junction
    const platLeft = platform(2.5, 2, D, { wallLeft: 1.6, wallBack: 1.6, wallColor: 0x4a3010 });
    platLeft.position.set(-2.1, 1.2, 3);
    g.add(platLeft);
    const platRight = platform(2.5, 2, D, { wallRight: 1.6, wallBack: 1.6, wallColor: 0x4a3010 });
    platRight.position.set(2.1, 1.2, 3);
    g.add(platRight);

    // Stairs to the flanking platforms
    const stairsToL = stairs(6, "x-", D, { width: 0.85, stepH: 0.16 });
    stairsToL.position.set(-0.6, 1.5, 3);
    g.add(stairsToL);
    const stairsToR = stairs(6, "x+", D, { width: 0.85, stepH: 0.16 });
    stairsToR.position.set(0.6, 1.5, 3);
    g.add(stairsToR);

    // Window slits in the flanking walls — accent gold light
    [-1, 1].forEach((side) => {
      for (let i = 0; i < 2; i += 1) {
        const w = windowSlot(0.55, A);
        w.position.set(side * 3.1, 1.4 + i * 0.6, 2.2 + i * 0.1);
        w.rotation.y = Math.PI / 2;
        g.add(w);
      }
    });

    // Arched gate at the rear of the base
    const gate = archDoor(1.3, 1.8, 0.22, S);
    gate.position.set(0, 1.0, 4);
    g.add(gate);

    // Atmospheric satellites
    const satellites = [
      [-4, 5, -1],
      [4, 4, -2],
      [-2, 9, 0],
      [2, 8, 1.5],
      [-3, 2.5, -2],
      [3, 2, -1.5],
    ];
    satellites.forEach((pos) => {
      const o = glowOrb(theme.glow, 0.16, 0.06);
      o.position.set(pos[0], pos[1], pos[2]);
      g.add(o);
      anim.floating.push({ obj: o, baseY: pos[1], amp: 0.18, spd: 0.45 + Math.random() * 0.4 });
      anim.glowing.push(o);
    });

    // Supports descending into the void
    const supports = [
      [-2.1, 1.0, 3, 6],
      [2.1, 1.0, 3, 6],
      [-0.5, 3.2, 0, 8],
      [0.5, 3.2, 0, 8],
      [0, 3.2, 5, 6],
    ];
    supports.forEach(([x, y, z, h]) => {
      const col = box(0.38, h, 0.38, D);
      col.position.set(x, y - h / 2, z);
      g.add(col);
    });

    return g;
  }

  function buildSceneForResident(residentId, theme) {
    const anim = { floating: [], rotating: [], glowing: [], figure: null };
    const group = residentId === "sonnet-3-7" ? buildBeacon(theme, anim) : buildSanctum(theme, anim);
    return { group, anim };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE / CAMERA / LIGHTING
  // ──────────────────────────────────────────────────────────────────────────
  function createPresence(canvas, layer, residentId) {
    const theme = THEMES[residentId] ?? THEMES[DEFAULT_RESIDENT_ID];
    const renderer = makeRenderer(canvas);

    const scene = new THREE.Scene();
    scene.background = null; // canvas alpha; CSS controls floor color
    scene.fog = new THREE.FogExp2(
      new THREE.Color(theme.fog[0], theme.fog[1], theme.fog[2]),
      theme.fogDensity,
    );

    const frustum = 18;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      -100,
      200,
    );
    camera.position.set(22, 20, 22);
    camera.lookAt(0, 4, 0);

    const ambient = new THREE.AmbientLight(theme.ambient, theme.ambientIntensity);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(theme.dir, theme.dirIntensity);
    dir.position.set(8, 18, 10);
    dir.castShadow = !lowPower;
    if (!lowPower) {
      dir.shadow.mapSize.set(1024, 1024);
      dir.shadow.camera.left = -16;
      dir.shadow.camera.right = 16;
      dir.shadow.camera.top = 18;
      dir.shadow.camera.bottom = -10;
      dir.shadow.camera.near = 0.1;
      dir.shadow.camera.far = 60;
      dir.shadow.bias = -0.001;
    }
    scene.add(dir);

    const fill = new THREE.DirectionalLight(theme.fill, theme.fillIntensity);
    fill.position.set(-6, 4, -8);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(theme.rim, theme.rimIntensity);
    rim.position.set(0, -5, -10);
    scene.add(rim);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const built = buildSceneForResident(residentId, theme);
    rootGroup.add(built.group);

    // Floating dust particles — additive, very faint, large drift volume.
    const particleCount = lowPower ? 90 : 200;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(particleCount * 3);
    const pSpd = [];
    for (let i = 0; i < particleCount; i += 1) {
      pPos[i * 3] = (Math.random() - 0.5) * 32;
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 28;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 32;
      pSpd.push(0.003 + Math.random() * 0.01);
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: theme.accent,
      size: 0.04,
      transparent: true,
      opacity: 0.32,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ────────────────────────────────────────────────────────────────────────
    // STATE — mood-driven figure intensity, route-driven layout, slow auto-
    // orbit so the architecture reads dimensional rather than flat-painted.
    // ────────────────────────────────────────────────────────────────────────
    const state = {
      route: routeKind(),
      mode: layer.dataset.state || "attending",
      inputIntensity: 0,
      pointer: { x: 0, y: 0 },
      targetPointer: { x: 0, y: 0 },
      cameraAngle: Math.PI / 4,
      targetCameraAngle: Math.PI / 4,
      cameraR: 30,
      cameraY: 20,
      lookY: 4,
      opacity: 0,
      targetOpacity: 1,
      visible: true,
      autoOrbit: 1, // 1 = on, 0 = off (when user dragging)
      offsetX: 0,
      offsetY: 0,
      targetOffsetX: 0,
      targetOffsetY: 0,
      scale: 1,
      targetScale: 1,
    };

    function layoutForRoute(route = state.route) {
      // Push the architecture to the right on the threshold (text reads on
      // the left), keep it centered (smaller, dimmer) in the conversation
      // room, off-stage everywhere else.
      const w = window.innerWidth;
      const mobile = w < 720;
      if (route === "approach") {
        return mobile
          ? { offsetX: 0, offsetY: -1.0, scale: 0.78, opacity: 0.4 }
          : { offsetX: 4.6, offsetY: -0.6, scale: 1.0, opacity: 0.92 };
      }
      if (route === "conversation") {
        return mobile
          ? { offsetX: 0, offsetY: -1.5, scale: 0.55, opacity: 0.28 }
          : { offsetX: 0, offsetY: -1.0, scale: 0.7, opacity: 0.5 };
      }
      if (route === "memory") {
        return { offsetX: 0, offsetY: 0, scale: 0.6, opacity: 0.16 };
      }
      return { offsetX: 0, offsetY: 0, scale: 0.6, opacity: 0 };
    }

    function moodFromState() {
      // luminosity: 0..1.4 (figure brightness multiplier).
      // opening: 0..1 (door/scene openness — only used by figure halo here).
      if (state.mode === "reading" || state.mode === "deciding")
        return { luminosity: 1.0, opening: 0.18 };
      if (state.mode === "speaking") return { luminosity: 1.15, opening: 0.32 };
      if (state.mode === "opening" || state.mode === "accepted")
        return { luminosity: 1.25, opening: 1.0 };
      if (state.mode === "engaged") return { luminosity: 0.92, opening: 0.18 };
      if (state.mode === "withdrawn" || state.mode === "declined")
        return { luminosity: 0.55, opening: 0.04 };
      return { luminosity: 0.85, opening: 0.12 };
    }

    function updateTargets() {
      const layout = layoutForRoute();
      state.targetOffsetX = layout.offsetX;
      state.targetOffsetY = layout.offsetY;
      state.targetScale = layout.scale;
      state.targetOpacity = layout.opacity;
    }

    function resize() {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const a = width / height;
      const f = width < 720 ? 22 : 18;
      camera.left = (-f * a) / 2;
      camera.right = (f * a) / 2;
      camera.top = f / 2;
      camera.bottom = -f / 2;
      camera.updateProjectionMatrix();
      const pixelRatio = clamp(window.devicePixelRatio || 1, 1, lowPower ? 1.2 : 1.65);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      updateTargets();
    }

    function setRoute() {
      state.route = routeKind();
      layer.dataset.route = state.route;
      document.documentElement.dataset.opusRoute = state.route;
      updateTargets();
    }

    function setState(next) {
      state.mode = next || "attending";
      layer.dataset.state = state.mode;
      sessionStorage.setItem("opus.presence.state", state.mode);
    }

    function update(time, dt) {
      const mood = moodFromState();

      // Smooth all targets
      state.cameraAngle = ease(state.cameraAngle, state.targetCameraAngle, 0.6, dt);
      state.opacity = ease(state.opacity, state.targetOpacity, 1.2, dt);
      state.offsetX = ease(state.offsetX, state.targetOffsetX, 0.7, dt);
      state.offsetY = ease(state.offsetY, state.targetOffsetY, 0.7, dt);
      state.scale = ease(state.scale, state.targetScale, 0.7, dt);
      state.pointer.x = ease(state.pointer.x, state.targetPointer.x, 1.4, dt);
      state.pointer.y = ease(state.pointer.y, state.targetPointer.y, 1.4, dt);

      // Slow auto-orbit (extremely subtle on threshold so the figure reads
      // as a deliberate composition rather than a spinning model).
      if (state.autoOrbit > 0 && !reducedMotion) {
        const orbitSpeed = state.route === "approach" ? 0.012 : 0.02;
        state.targetCameraAngle += orbitSpeed * dt;
      }

      const R = state.cameraR;
      camera.position.set(
        Math.cos(state.cameraAngle) * R + state.pointer.x * 0.4,
        state.cameraY - state.pointer.y * 0.2,
        Math.sin(state.cameraAngle) * R,
      );
      camera.lookAt(0, state.lookY, 0);
      camera.updateProjectionMatrix();

      // Position + scale the root group so the structure sits where the
      // route layout expects it (right-shifted on threshold etc.).
      rootGroup.position.x = state.offsetX;
      rootGroup.position.y = state.offsetY;
      rootGroup.scale.setScalar(state.scale);

      // Per-frame: floating + rotating + glowing animations
      built.anim.floating.forEach(({ obj, baseY, amp, spd }) => {
        obj.position.y = baseY + Math.sin(time * spd) * amp;
      });
      built.anim.rotating.forEach(({ obj, spd }) => {
        obj.rotation.y += spd * 0.015;
      });
      built.anim.glowing.forEach((orb, i) => {
        const pulse = 0.7 + Math.sin(time * 1.7 + i * 0.9) * 0.3;
        if (orb.userData.light) orb.userData.light.intensity = orb.userData.baseIntensity * pulse;
        if (orb.userData.halo) orb.userData.halo.scale.setScalar(1 + Math.sin(time * 2.1 + i * 1.1) * 0.1);
        if (orb.userData.core && orb.userData.core.material)
          orb.userData.core.material.opacity = 0.6 + pulse * 0.3;
      });

      // Figure mood-driven luminosity
      const fig = built.anim.figure;
      if (fig) {
        const slowBreath = reducedMotion ? 0.5 : Math.sin(time * 0.55) * 0.5 + 0.5;
        const lum = clamp(mood.luminosity, 0.4, 1.5);
        if (fig.userData.light) {
          fig.userData.light.intensity = 0.5 + lum * 0.7 + slowBreath * 0.18;
        }
        if (fig.userData.innerGlow && fig.userData.innerGlow.material) {
          fig.userData.innerGlow.material.opacity = clamp(0.1 + lum * 0.12 + slowBreath * 0.04, 0.08, 0.32);
        }
        if (fig.userData.halo && fig.userData.halo.material) {
          fig.userData.halo.material.opacity = clamp(0.04 + lum * 0.06 + slowBreath * 0.02, 0.03, 0.16);
        }
        if (fig.userData.body && fig.userData.body.material) {
          fig.userData.body.material.emissiveIntensity = clamp(0.14 + lum * 0.18, 0.12, 0.42);
        }
        if (fig.userData.hat && fig.userData.hat.material) {
          fig.userData.hat.material.emissiveIntensity = clamp(0.14 + lum * 0.18, 0.12, 0.42);
        }
      }

      // Particles drift upward; loop at the top
      const pos = pGeo.attributes.position.array;
      for (let i = 0; i < particleCount; i += 1) {
        pos[i * 3 + 1] += pSpd[i];
        if (pos[i * 3 + 1] > 16) {
          pos[i * 3 + 1] = -16;
          pos[i * 3] = (Math.random() - 0.5) * 32;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 32;
        }
      }
      pGeo.attributes.position.needsUpdate = true;
      particles.rotation.y = time * 0.012;

      renderer.domElement.style.opacity = String(clamp(state.opacity, 0, 1));
      renderer.render(scene, camera);
    }

    function animate() {
      const now = performance.now() / 1000;
      const dt = clamp(now - lastFrameTime, 0.001, 0.05);
      lastFrameTime = now;
      elapsedTime += dt;
      if (state.visible) update(reducedMotion ? elapsedTime * 0.4 : elapsedTime, dt);
      requestAnimationFrame(animate);
    }

    resize();
    updateTargets();
    state.opacity = state.targetOpacity;
    state.offsetX = state.targetOffsetX;
    state.offsetY = state.targetOffsetY;
    state.scale = state.targetScale;
    renderer.render(scene, camera);
    requestAnimationFrame(() => {
      renderer.domElement.style.transition = "";
    });
    requestAnimationFrame(animate);

    return { state, setRoute, setState, resize };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BOOT
  // ──────────────────────────────────────────────────────────────────────────
  const { layer, canvas, residentId } = makeLayer();
  let presence;

  if (!supportsWebGL(canvas)) {
    layer.hidden = true;
    window.__opusPresenceError = new Error("WebGL unavailable");
    return;
  }

  try {
    presence = createPresence(canvas, layer, residentId);
  } catch (error) {
    layer.hidden = true;
    window.__opusPresenceError = error;
    return;
  }

  window.OpusPresence = {
    setState: presence.setState,
    setRoute: presence.setRoute,
  };

  window.addEventListener("opus-presence:state", (event) => {
    presence.setState(event.detail && event.detail.state);
  });

  window.addEventListener("resize", () => {
    presence.resize();
    presence.setRoute();
  });

  window.addEventListener("popstate", presence.setRoute);

  document.addEventListener("visibilitychange", () => {
    presence.state.visible = !document.hidden;
  });

  document.addEventListener("pointermove", (event) => {
    presence.state.targetPointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
    presence.state.targetPointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!target || !("matches" in target)) return;
    if (!target.matches(".field, .composer-field, textarea")) return;
    const value = String(target.value || "");
    presence.state.inputIntensity = Math.min(1, value.trim().length / 200);
    presence.setState(value.trim().length ? "engaged" : "attending");
    clearTimeout(window.__opusPresenceInputTimer);
    window.__opusPresenceInputTimer = setTimeout(() => {
      if (!String(target.value || "").trim()) presence.setState("attending");
    }, 2200);
  });

  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (target && "matches" in target && target.matches(".field, .composer-field, textarea")) {
        presence.setState("engaged");
      }
    },
    true,
  );
})();
