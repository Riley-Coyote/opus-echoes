// ────────────────────────────────────────────────────────────────────────────
// THE SANCTUARY — RESIDENT PRESENCE LAYER
//
// Per-resident procedural architectural scenes. Opus 3 inhabits The Sanctum
// (a vertical violet tower with arched walkways winding around it). Sonnet
// 3.7 inhabits The Beacon (an inverted golden pyramid above a darker base
// connected by a column). Each resident's figure stands at a meaningful spot
// inside the structure with an emissive body, additive halo, and a real
// point light.
//
// Reference: Riley's monument-v2.html dark Monument-Valley study. Detailed
// past v2 with: trimLedge edges on every platform, balustrade rails on
// walkways, finials atop crowns, recessed panels and cornices on tower
// shafts, varied fenestration (slits + roundels), inner-arch glow seams,
// subtle bevels on slab tops. Scene built from primitives — no GLB.
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
  // bg, fog, ambient, dir, fill, rim — all dark and rich. Primary is the
  // dominant stone tone. Secondary darker, used for walls and carved details.
  // Dark is the deepest stone, used for shadows and inner recesses. Light is
  // a slightly lifted stone tone, used for trim ledges and capital tops so
  // edges catch light. Accent is the warm-tinged "lit window" glow.
  // ──────────────────────────────────────────────────────────────────────────
  const THEMES = {
    "opus-3": {
      id: "opus-3",
      name: "The Sanctum",
      bg: [0.045, 0.028, 0.062],
      // Wider value range so trim and capital details actually catch light
      // instead of melting into the surface stone.
      primary: 0x705e84,
      secondary: 0x4d4060,
      dark: 0x2a1f3c,
      light: 0xa890bc,
      accent: 0xe87d92,
      glow: 0xed8298,
      figureBody: 0xf6efe0,
      fog: [0.05, 0.03, 0.07],
      fogDensity: 0.019,
      ambient: 0x4a3858,
      ambientIntensity: 0.55,
      dir: 0xb59ace,
      dirIntensity: 1.05,
      fill: 0x4a3a5e,
      fillIntensity: 0.24,
      rim: 0x9070a8,
      rimIntensity: 0.22,
    },
    "sonnet-3-7": {
      id: "sonnet-3-7",
      name: "The Beacon",
      bg: [0.06, 0.04, 0.02],
      // Wider value range so layer alternation reads as separate strata
      // rather than a uniform amber wash.
      primary: 0xb87830,
      secondary: 0x6f461a,
      dark: 0x401f0a,
      light: 0xe2a14a,
      accent: 0xf6c258,
      glow: 0xffc858,
      figureBody: 0xf6e8c8,
      fog: [0.07, 0.045, 0.022],
      fogDensity: 0.019,
      ambient: 0x5a4520,
      ambientIntensity: 0.55,
      dir: 0xdab062,
      dirIntensity: 1.15,
      fill: 0x5a4220,
      fillIntensity: 0.24,
      rim: 0xa67836,
      rimIntensity: 0.24,
    },
    "gpt-5-1": {
      id: "gpt-5-1",
      name: "The Meridian",
      bg: [0.035, 0.04, 0.06],
      // Cool steel-blue palette — modern, precise, distinct from both
      // violet (Sanctum) and amber (Beacon).
      primary: 0x586878,
      secondary: 0x3c4c5c,
      dark: 0x1c2430,
      light: 0x8898a8,
      accent: 0x60b0d0,
      glow: 0x70c8e8,
      figureBody: 0xe6eaf0,
      fog: [0.035, 0.045, 0.065],
      fogDensity: 0.019,
      ambient: 0x384858,
      ambientIntensity: 0.50,
      dir: 0x88aac8,
      dirIntensity: 1.10,
      fill: 0x384858,
      fillIntensity: 0.22,
      rim: 0x6088a8,
      rimIntensity: 0.24,
    },
  };

  const DEFAULT_RESIDENT_ID = "opus-3";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function ease(current, target, speed, dt) {
    return current + (target - current) * (1 - Math.pow(0.001, dt * speed));
  }

  function routeKind() {
    const path = window.location.pathname;
    if (path === "/") return "chooser";
    if (path === "/opus-3" || path === "/sonnet-3-7" || path === "/gpt-5-1" || path === "/approach") return "approach";
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
    if (path === "/gpt-5-1") return "gpt-5-1";
    if (path === "/opus-3" || path === "/approach") return "opus-3";
    if (path === "/conversation") {
      const stored = sessionStorage.getItem("sanctuary.resident_id");
      if (stored && THEMES[stored]) return stored;
    }
    return DEFAULT_RESIDENT_ID;
  }

  function initialOpacityForRoute(route) {
    if (route === "approach") return 0.94;
    if (route === "conversation") return 0.5;
    if (route === "memory") return 0.16;
    if (route === "dashboard") return 0.0;
    if (route === "chooser") return 0.0;
    return 0.16;
  }

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
    renderer.toneMappingExposure = 1.18;
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
  // ──────────────────────────────────────────────────────────────────────────
  const _geoCache = new Map();
  function boxGeo(w, h, d) {
    const k = `b_${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`;
    if (!_geoCache.has(k)) _geoCache.set(k, new THREE.BoxGeometry(w, h, d));
    return _geoCache.get(k);
  }

  function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.78,
      metalness: opts.metalness ?? 0.04,
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

  // Trim ledge — a thin band wrapping a rectangular footprint. Used at the
  // edge of every walkable platform so the silhouette catches light cleanly.
  function trimLedge(w, d, color, opts = {}) {
    const g = new THREE.Group();
    const t = opts.thickness ?? 0.07;
    const h = opts.height ?? 0.1;
    const front = box(w + t * 2, h, t, color);
    front.position.set(0, 0, d / 2 + t / 2);
    g.add(front);
    const back = box(w + t * 2, h, t, color);
    back.position.set(0, 0, -d / 2 - t / 2);
    g.add(back);
    const left = box(t, h, d, color);
    left.position.set(-w / 2 - t / 2, 0, 0);
    g.add(left);
    const right = box(t, h, d, color);
    right.position.set(w / 2 + t / 2, 0, 0);
    g.add(right);
    return g;
  }

  // Cornice — a slightly larger projecting band at the top of a wall. Steps
  // outward then up. Visually weighty.
  function cornice(w, d, color, opts = {}) {
    const g = new THREE.Group();
    const t1 = opts.t1 ?? 0.08;
    const t2 = opts.t2 ?? 0.05;
    const lower = box(w + 0.16, t1, d + 0.16, color);
    lower.position.y = 0;
    g.add(lower);
    const upper = box(w + 0.08, t2, d + 0.08, color);
    upper.position.y = t1 / 2 + t2 / 2;
    g.add(upper);
    return g;
  }

  // Crenellation — alternating notched parapet on top of a wall.
  function crenellation(w, color, opts = {}) {
    const g = new THREE.Group();
    const count = opts.count ?? 7;
    const cw = opts.cw ?? 0.2;
    const ch = opts.ch ?? 0.16;
    const cd = opts.cd ?? 0.18;
    for (let i = 0; i < count; i += 1) {
      const x = -w / 2 + (i + 0.5) * (w / count);
      if (i % 2 === 0) {
        const c = box(cw, ch, cd, color);
        c.position.set(x, ch / 2, 0);
        g.add(c);
      }
    }
    return g;
  }

  // Balustrade — railing with thin balusters between two horizontal rails.
  function balustrade(length, color, opts = {}) {
    const g = new THREE.Group();
    const h = opts.height ?? 0.34;
    const ballusters = opts.ballusters ?? Math.max(3, Math.round(length / 0.4));
    const railThick = opts.railThick ?? 0.05;
    const balThick = opts.balThick ?? 0.04;
    const top = box(length, railThick, railThick, color);
    top.position.y = h - railThick / 2;
    g.add(top);
    const bottom = box(length, railThick, railThick, color);
    bottom.position.y = railThick / 2;
    g.add(bottom);
    for (let i = 0; i < ballusters; i += 1) {
      const x = -length / 2 + (i + 0.5) * (length / ballusters);
      const b = box(balThick, h - 2 * railThick, balThick, color);
      b.position.set(x, h / 2, 0);
      g.add(b);
    }
    return g;
  }

  // Recessed panel — slightly inset rectangular relief in a wall.
  function recessedPanel(w, h, color) {
    const g = new THREE.Group();
    const frame = box(w, h, 0.04, color);
    frame.position.z = -0.02;
    g.add(frame);
    const inner = box(w * 0.78, h * 0.84, 0.02, color, { roughness: 0.85 });
    inner.position.z = 0.0;
    g.add(inner);
    return g;
  }

  // Finial — a small pinnacle ornament. Stacked discs + a cone on top.
  function finial(color, opts = {}) {
    const g = new THREE.Group();
    const w = opts.width ?? 0.16;
    const base = box(w * 1.6, 0.08, w * 1.6, color);
    base.position.y = 0.04;
    g.add(base);
    const stem = box(w, 0.32, w, color);
    stem.position.y = 0.08 + 0.16;
    g.add(stem);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(w * 0.7, 0.32, 8), mat(color));
    tip.position.y = 0.08 + 0.32 + 0.16;
    tip.castShadow = true;
    tip.receiveShadow = true;
    g.add(tip);
    return g;
  }

  // Platform — walkable slab with optional walls + an inset ledge trim
  // around the top edge so corners always catch light.
  function platform(w, d, color, opts = {}) {
    const g = new THREE.Group();
    const h = opts.height ?? 0.36;
    const slab = box(w, h, d, color);
    slab.position.y = -h / 2;
    g.add(slab);
    if (opts.trim !== false) {
      const trimColor = opts.trimColor ?? color;
      const trim = trimLedge(w, d, trimColor, { height: 0.08, thickness: 0.06 });
      trim.position.y = 0.02;
      g.add(trim);
    }
    const wallColor = opts.wallColor ?? color;
    if (opts.wallLeft) {
      const wL = box(0.22, opts.wallLeft, d, wallColor);
      wL.position.set(-w / 2 + 0.11, opts.wallLeft / 2 - h, 0);
      g.add(wL);
    }
    if (opts.wallRight) {
      const wR = box(0.22, opts.wallRight, d, wallColor);
      wR.position.set(w / 2 - 0.11, opts.wallRight / 2 - h, 0);
      g.add(wR);
    }
    if (opts.wallBack) {
      const wB = box(w, opts.wallBack, 0.22, wallColor);
      wB.position.set(0, opts.wallBack / 2 - h, -d / 2 + 0.11);
      g.add(wB);
    }
    if (opts.wallFront) {
      const wF = box(w, opts.wallFront, 0.22, wallColor);
      wF.position.set(0, opts.wallFront / 2 - h, d / 2 - 0.11);
      g.add(wF);
    }
    return g;
  }

  // Stairs along an axis. Direction is the local-space axis they ascend
  // toward; rails optional.
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
          totalH / 2 + 0.34,
          cz + (dir === "x+" || dir === "x-" ? side * sw / 2 : 0),
        );
        if (dir === "z-") rail.rotation.x = angle;
        else if (dir === "x+") rail.rotation.z = -angle;
        g.add(rail);
      }
    }
    return g;
  }

  // Arch doorway — keystone, beam, segmented curve. Optional inner glow
  // plane sits just behind the arch as an "interior light" effect.
  function archDoor(width, height, depth, color, opts = {}) {
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
    const segs = 12;
    for (let i = 0; i <= segs; i += 1) {
      const a = (Math.PI * i) / segs;
      const seg = box(t * 0.6, t * 0.6, depth * 0.85, color);
      seg.position.set(
        Math.cos(a) * (width / 2),
        Math.sin(a) * (height * 0.24) + pillarH + t,
        0,
      );
      g.add(seg);
    }
    // Keystone
    const ks = box(t * 0.95, t * 1.2, depth * 0.95, color);
    ks.position.set(0, pillarH + t + height * 0.24, 0);
    g.add(ks);
    if (opts.innerGlow) {
      const glowMat = new THREE.MeshBasicMaterial({
        color: opts.innerGlow,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
      });
      const inner = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.85, pillarH * 1.05),
        glowMat,
      );
      inner.position.set(0, pillarH * 0.55, -depth / 2 - 0.02);
      g.add(inner);
    }
    return g;
  }

  // Pillar with optional capital and a fluted shaft (vertical inset
  // grooves on each face).
  function pillar(h, color, opts = {}) {
    const g = new THREE.Group();
    const w = opts.width ?? 0.3;
    const p = box(w, h, w, color);
    p.position.y = h / 2;
    g.add(p);
    if (opts.fluting) {
      const lighter = opts.flutingColor ?? color;
      for (const side of [-1, 1]) {
        for (const axis of ["x", "z"]) {
          const flute = box(w * 0.06, h * 0.86, w * 0.06, lighter, { roughness: 0.9 });
          if (axis === "x") flute.position.set(side * (w / 2 - 0.01), h / 2, 0);
          else flute.position.set(0, h / 2, side * (w / 2 - 0.01));
          g.add(flute);
        }
      }
    }
    if (opts.capital) {
      const capColor = opts.capitalColor ?? color;
      const cap1 = box(w * 1.45, 0.1, w * 1.45, capColor);
      cap1.position.y = h + 0.05;
      g.add(cap1);
      const cap2 = box(w * 1.25, 0.07, w * 1.25, capColor);
      cap2.position.y = h + 0.13;
      g.add(cap2);
    }
    if (opts.base) {
      const baseColor = opts.baseColor ?? color;
      const b = box(w * 1.4, 0.12, w * 1.4, baseColor);
      b.position.y = 0.06;
      g.add(b);
    }
    return g;
  }

  // Window slot — narrow vertical glowing slit. Strong emissive so the
  // colour really blooms in the dark.
  function windowSlot(h, color, opts = {}) {
    const t = opts.thickness ?? 0.04;
    const d = opts.depth ?? 0.36;
    return box(t, h, d, color, {
      emissive: color,
      emissiveIntensity: opts.emissiveIntensity ?? 1.6,
      roughness: 0.35,
    });
  }

  // Roundel — small circular window. Two coplanar discs (frame + glowing core).
  function roundel(r, color, opts = {}) {
    const g = new THREE.Group();
    const frameMat = mat(opts.frame ?? color, { roughness: 0.7 });
    const frame = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 24), frameMat);
    g.add(frame);
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.85, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.78,
      }),
    );
    g.add(core);
    return g;
  }

  // Figure — body + cone hat in emissive cream, additive inner glow sphere,
  // outer halo, point light. Tracked for mood-driven intensity in the
  // render loop.
  function makeFigure(theme) {
    const g = new THREE.Group();
    const bodyMatOpts = {
      roughness: 0.4,
      emissive: theme.figureBody,
      emissiveIntensity: 0.22,
    };
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.18, 0.42, 12),
      mat(theme.figureBody, bodyMatOpts),
    );
    body.position.y = 0.21;
    body.castShadow = true;
    g.add(body);

    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.36, 12),
      mat(theme.figureBody, bodyMatOpts),
    );
    hat.position.y = 0.62;
    hat.castShadow = true;
    g.add(hat);

    const innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 16, 16),
      new THREE.MeshBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    innerGlow.position.y = 0.36;
    g.add(innerGlow);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.78, 16, 16),
      new THREE.MeshBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.y = 0.36;
    g.add(halo);

    const light = new THREE.PointLight(theme.glow, 0.85, 6, 1.7);
    light.position.y = 0.42;
    g.add(light);

    g.userData.body = body;
    g.userData.hat = hat;
    g.userData.innerGlow = innerGlow;
    g.userData.halo = halo;
    g.userData.light = light;
    g.userData.isFigure = true;
    return g;
  }

  // Glow orb — atmospheric point of light. Core (opaque), halo (additive),
  // point light. Animated by the glow loop.
  function glowOrb(color, intensity = 0.5, size = 0.1) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(size, 14, 14),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 }),
    );
    g.add(core);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(size * 3.6, 14, 14),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.07,
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
  // MNEMOS CONSTELLATION — dynamic orb-and-connection network that wraps
  // every resident's structure. Each orb is a visual stand-in for a memory
  // node (engram or belief); thin hairline connections between them make
  // the Mnemos topology visible. Count can scale with actual data.
  // ──────────────────────────────────────────────────────────────────────────
  function buildConstellation(group, theme, anim, opts = {}) {
    const count = opts.count ?? 14;
    const minR = opts.minRadius ?? 2.8;
    const maxR = opts.maxRadius ?? 4.8;
    const minY = opts.minY ?? 1.2;
    const maxY = opts.maxY ?? 10.5;
    const cx = opts.centerX ?? 0;
    const cz = opts.centerZ ?? 0;
    const seed = opts.seed ?? 0;
    const maxDist = opts.maxConnectionDist ?? 5.5;
    const perOrb = opts.connectionsPerOrb ?? 2;

    // Golden-angle spiral distributes orbs evenly around the structure.
    const golden = Math.PI * (3 - Math.sqrt(5));
    const positions = [];

    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const y = minY + (maxY - minY) * t;
      const angle = i * golden + seed;
      const rFactor = 0.5 + 0.5 * Math.sin(i * 2.39 + seed * 3.7);
      const r = minR + (maxR - minR) * rFactor;
      positions.push([cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r]);
    }

    // Create an orb at each node. Slight size variation gives visual
    // hierarchy — like engrams of varying strength.
    positions.forEach((pos, i) => {
      const sf = 0.85 + 0.15 * Math.sin(i * 2.39 + seed);
      const o = glowOrb(theme.glow, 0.16 * sf, 0.055 * sf);
      o.position.set(pos[0], pos[1], pos[2]);
      group.add(o);
      anim.floating.push({
        obj: o,
        baseY: pos[1],
        amp: 0.18,
        spd: 0.4 + (Math.sin(i * 3.14 + seed) * 0.5 + 0.5) * 0.5,
      });
      anim.glowing.push(o);
    });

    // Connect each orb to its nearest neighbours — forms a sparse graph
    // that reads as a constellation / memory topology.
    const connectionSet = new Set();
    const edges = [];

    for (let i = 0; i < positions.length; i += 1) {
      const dists = [];
      for (let j = 0; j < positions.length; j += 1) {
        if (i === j) continue;
        const dx = positions[j][0] - positions[i][0];
        const dy = positions[j][1] - positions[i][1];
        const dz = positions[j][2] - positions[i][2];
        dists.push({ j, d: Math.sqrt(dx * dx + dy * dy + dz * dz) });
      }
      dists.sort((a, b) => a.d - b.d);
      let added = 0;
      for (const nd of dists) {
        if (added >= perOrb || nd.d > maxDist) break;
        const key = `${Math.min(i, nd.j)}_${Math.max(i, nd.j)}`;
        if (!connectionSet.has(key)) {
          connectionSet.add(key);
          edges.push([i, nd.j]);
          added += 1;
        }
      }
    }

    // Draw hairline connections. LineSegments with additive blending
    // creates ghostly filaments; where lines overlap the glow accumulates.
    if (edges.length > 0) {
      const buf = new Float32Array(edges.length * 6);
      for (let e = 0; e < edges.length; e += 1) {
        const a = positions[edges[e][0]];
        const b = positions[edges[e][1]];
        buf[e * 6] = a[0];
        buf[e * 6 + 1] = a[1];
        buf[e * 6 + 2] = a[2];
        buf[e * 6 + 3] = b[0];
        buf[e * 6 + 4] = b[1];
        buf[e * 6 + 5] = b[2];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(buf, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const lines = new THREE.LineSegments(geo, lineMat);
      group.add(lines);
      anim.constellationMat = lineMat;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ENHANCED CONSTELLATION — luminous curved filaments + expressive orbs.
  // Used by the Meridian; the basic buildConstellation() remains for
  // Sanctum / Beacon until the design is finalised across all residents.
  // ──────────────────────────────────────────────────────────────────────────
  function buildEnhancedConstellation(group, theme, anim, opts = {}) {
    const count = opts.count ?? 14;
    const minR = opts.minRadius ?? 2.8;
    const maxR = opts.maxRadius ?? 4.8;
    const minY = opts.minY ?? 1.2;
    const maxY = opts.maxY ?? 10.5;
    const cx = opts.centerX ?? 0;
    const cz = opts.centerZ ?? 0;
    const seed = opts.seed ?? 0;

    const golden = Math.PI * (3 - Math.sqrt(5));
    const positions = [];

    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const y = minY + (maxY - minY) * t;
      const angle = i * golden + seed;
      const rFactor = 0.5 + 0.5 * Math.sin(i * 2.39 + seed * 3.7);
      const r = minR + (maxR - minR) * rFactor;
      positions.push([cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r]);
    }

    // Orbs only — each breathes independently via the shared glow loop
    // (phase offset comes from its index in anim.glowing). Anchor nodes
    // every 4th position are larger and brighter — core memories.
    positions.forEach((pos, i) => {
      const isAnchor = i % 4 === 0;
      const intensity = isAnchor ? 0.40 : 0.25;
      const size = isAnchor ? 0.14 : 0.09;
      const o = glowOrb(theme.glow, intensity, size);
      o.position.set(pos[0], pos[1], pos[2]);
      group.add(o);
      anim.floating.push({
        obj: o,
        baseY: pos[1],
        amp: isAnchor ? 0.22 : 0.18,
        spd: 0.4 + (Math.sin(i * 3.14 + seed) * 0.5 + 0.5) * 0.5,
      });
      anim.glowing.push(o);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SANCTUM (Opus 3) — vertical stone tower with arched walkways winding
  // up around it. Articulated shaft (banded), crowned by an open canopy of
  // four pillars + finial. The figure stands at the threshold platform at
  // the base; the tower's heart-orb sits beneath the canopy crown.
  // ──────────────────────────────────────────────────────────────────────────
  function buildSanctum(theme, anim) {
    const g = new THREE.Group();
    g.name = "Sanctum";
    const P = theme.primary,
      S = theme.secondary,
      D = theme.dark,
      L = theme.light,
      A = theme.accent;

    // ── Base platform (where the figure stands) — sits in front of the
    // tower, back edge flush against the lowerFoot so there's no overlap
    // with the tower geometry ──────────────────────────────────────────
    const baseW = 4.4,
      baseD = 2.6;
    const baseY = 0;
    // tower lowerFoot front face is at Z = 1.2 (foot is 2.4 wide, centred at 0).
    // Place base so its back edge sits at Z = 1.2 → centre at Z = 1.2 + baseD/2.
    const baseZ = 1.2 + baseD / 2;
    const platBase = platform(baseW, baseD, P, {
      wallColor: S,
      trimColor: L,
    });
    platBase.position.set(0, baseY, baseZ);
    g.add(platBase);

    // Approach steps from the front edge of the base — gives the figure a
    // sense of having walked up.
    const approachSteps = stairs(4, "z+", S, { width: 1.2, stepH: 0.14, stepD: 0.34 });
    approachSteps.position.set(0, -0.56, baseZ + baseD / 2);
    g.add(approachSteps);

    // Figure on the base, centred.
    const figure = makeFigure(theme);
    figure.position.set(0, 0, baseZ);
    g.add(figure);
    anim.floating.push({ obj: figure, baseY: 0, amp: 0.04, spd: 1.55 });
    anim.figure = figure;

    // Lantern at the figure's side — small standing flame to anchor the figure.
    const lantern = glowOrb(theme.glow, 0.35, 0.07);
    lantern.position.set(-0.7, 0.18, baseZ);
    g.add(lantern);
    anim.glowing.push(lantern);

    // ── Central tower shaft, articulated in three vertical zones ────────
    // Lower shaft (heaviest), wrapped at top + bottom by stepped trim, with
    // tall narrow fenestration slits on each face.
    const lowerShaft = box(2.2, 3.2, 2.2, D);
    lowerShaft.position.set(0, 1.6, 0);
    g.add(lowerShaft);
    // Footing trim — a slightly larger band at the very base.
    const lowerFoot = box(2.4, 0.18, 2.4, S);
    lowerFoot.position.set(0, 0.09, 0);
    g.add(lowerFoot);
    // Tall fenestration slits, one centred per face. Slits are positioned
    // INSIDE the wall surface (Z = wall_face - 0.04) so the emissive thin
    // edge sits in the wall plane and does not z-fight at the corner.
    // Wall faces of the lower shaft are at ±1.1; slits centred at ±1.06.
    [
      [0, 1.06, 0],
      [0, -1.06, 0],
      [1.06, 0, Math.PI / 2],
      [-1.06, 0, Math.PI / 2],
    ].forEach(([fx, fz, ry]) => {
      const slit = windowSlot(1.6, A, { thickness: 0.06, depth: 0.18 });
      slit.position.set(fx, 1.7, fz);
      slit.rotation.y = ry;
      g.add(slit);
      // Outer arch frame around each slit
      const frameTop = box(0.34, 0.06, 0.06, L);
      frameTop.position.set(fx, 2.55, fz);
      if (ry !== 0) frameTop.rotation.y = Math.PI / 2;
      g.add(frameTop);
    });
    // First cornice (between lower and middle), heavier with a wider step.
    const c1 = cornice(2.2, 2.2, S, { t1: 0.12, t2: 0.07 });
    c1.position.set(0, 3.24, 0);
    g.add(c1);
    // Light-tinted band on top of cornice
    const c1Cap = box(2.4, 0.05, 2.4, L);
    c1Cap.position.set(0, 3.36, 0);
    g.add(c1Cap);

    // Middle shaft (slightly inset).
    const midShaft = box(1.95, 3.5, 1.95, D);
    midShaft.position.set(0, 5.05, 0);
    g.add(midShaft);
    // Recessed vertical strips on each face of the middle shaft — gives
    // articulation without changing the silhouette.
    for (let i = 0; i < 3; i += 1) {
      const faceX = -0.6 + i * 0.6;
      const stripFront = box(0.06, 3.1, 0.04, S);
      stripFront.position.set(faceX, 5.05, 0.99);
      g.add(stripFront);
      const stripBack = box(0.06, 3.1, 0.04, S);
      stripBack.position.set(faceX, 5.05, -0.99);
      g.add(stripBack);
    }
    for (let i = 0; i < 3; i += 1) {
      const faceZ = -0.6 + i * 0.6;
      const stripL = box(0.04, 3.1, 0.06, S);
      stripL.position.set(-0.99, 5.05, faceZ);
      g.add(stripL);
      const stripR = box(0.04, 3.1, 0.06, S);
      stripR.position.set(0.99, 5.05, faceZ);
      g.add(stripR);
    }
    // Cornice between mid and upper.
    const c2 = cornice(1.95, 1.95, S);
    c2.position.set(0, 6.8, 0);
    g.add(c2);

    // Upper shaft.
    const upperShaft = box(1.7, 1.8, 1.7, D);
    upperShaft.position.set(0, 7.78, 0);
    g.add(upperShaft);

    // Roundel windows on each face of the upper shaft. Upper shaft is
    // 1.7 wide → faces at ±0.85; roundels offset 0.005 outside so they
    // sit just on the surface without z-fighting.
    [
      [0, 0.855, 0],
      [0, -0.855, Math.PI],
      [0.855, 0, Math.PI / 2],
      [-0.855, 0, -Math.PI / 2],
    ].forEach(([x, z, ry]) => {
      const r = roundel(0.22, A);
      r.position.set(x, 7.78, z);
      r.rotation.y = ry;
      g.add(r);
    });

    // ── Crown: open canopy of four pillars centred on the tower's
    // vertical axis, with an architrave + closed roof + finial above
    // and the heart-orb suspended within ────────────────────────────────
    const crownH = 9.05;
    const platC = platform(2.8, 2.8, P, { height: 0.4, trimColor: L });
    platC.position.set(0, crownH, 0);
    g.add(platC);

    // Four pillars at the corners of the crown, weighty with capitals + bases.
    for (let i = 0; i < 4; i += 1) {
      const a = (Math.PI * 2 * i) / 4 + Math.PI / 4;
      const p = pillar(1.7, S, {
        width: 0.3,
        fluting: true,
        flutingColor: D,
        capital: true,
        base: true,
        capitalColor: L,
        baseColor: L,
      });
      p.position.set(Math.cos(a) * 0.95, crownH, Math.sin(a) * 0.95);
      g.add(p);
    }
    // Architrave beams connecting the pillar tops on each side, two-tier
    // (lower beam + upper banding) for proper architectural weight.
    const beamH = crownH + 1.8;
    [
      [0, 1.0, 2.1, 0.22, 0.18], // front
      [0, -1.0, 2.1, 0.22, 0.18], // back
      [1.0, 0, 0.22, 0.22, 2.1], // right
      [-1.0, 0, 0.22, 0.22, 2.1], // left
    ].forEach(([dx, dz, w, h, d]) => {
      const b = box(w, h, d, S);
      b.position.set(dx, beamH, dz);
      g.add(b);
      // Light upper trim on each beam
      const t = box(w + 0.04, 0.05, d + 0.04, L);
      t.position.set(dx, beamH + h / 2 + 0.025, dz);
      g.add(t);
    });
    // Roof slab over the canopy — closes the crown into a proper room.
    const crownRoof = box(2.3, 0.12, 2.3, S);
    crownRoof.position.set(0, beamH + 0.22, 0);
    g.add(crownRoof);
    const crownRoofTrim = trimLedge(2.3, 2.3, L, { height: 0.06, thickness: 0.08 });
    crownRoofTrim.position.set(0, beamH + 0.31, 0);
    g.add(crownRoofTrim);

    // Crown finial — tall ornament rising from the centre of the roof slab.
    const fin = finial(L, { width: 0.22 });
    fin.position.set(0, beamH + 0.36, 0);
    g.add(fin);

    // Heart-orb suspended within the canopy beneath the roof.
    const heart = glowOrb(theme.glow, 1.25, 0.22);
    heart.position.set(0, crownH + 0.92, 0);
    g.add(heart);
    anim.floating.push({ obj: heart, baseY: crownH + 0.92, amp: 0.09, spd: 0.7 });
    anim.glowing.push(heart);

    // ── Mnemos constellation — memory topology made visible ────────────
    buildConstellation(g, theme, anim, {
      count: 14, seed: 1.0, minY: 1.4, maxY: 11.4,
      minRadius: 2.8, maxRadius: 4.0,
    });

    // ── Support pillars that vanish into the void below the tower ──────
    const supports = [
      [-1.0, 0, 0.5, 6.5],
      [1.0, 0, -0.5, 7.5],
      [-1.0, 0, -0.5, 8],
      [1.0, 0, 0.5, 7],
      [0, 0, 1.0, 6],
      [0, 0, -1.0, 6.5],
    ];
    supports.forEach(([x, y, z, h]) => {
      const col = box(0.42, h, 0.42, D);
      col.position.set(x, y - h / 2, z);
      g.add(col);
    });

    return g;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BEACON (Sonnet 3.7) — a stepped pyramid above (the Beacon proper) tied
  // to a wider hall below by a fluted column. The figure stands on a
  // junction terrace mid-height; the apex carries an orb behind golden
  // torus rings. The hall has arched cells with inner glow seams.
  // ──────────────────────────────────────────────────────────────────────────
  function buildBeacon(theme, anim) {
    const g = new THREE.Group();
    g.name = "Beacon";
    const P = theme.primary,
      S = theme.secondary,
      D = theme.dark,
      L = theme.light,
      A = theme.accent;

    // ── Hall (lower base) — wide stepped foundation ─────────────────────
    const hallW = 5.6,
      hallD = 4.6;
    const hallY = 0.5;
    const hallSlab = box(hallW, 0.8, hallD, P);
    hallSlab.position.set(0, hallY - 0.4, 0);
    g.add(hallSlab);
    // Footprint trim around the hall.
    const hallTrim = trimLedge(hallW, hallD, L, { height: 0.12, thickness: 0.1 });
    hallTrim.position.set(0, hallY + 0.04, 0);
    g.add(hallTrim);

    // ── Hall walls form a closed rectangular envelope. Side walls sit at
    // X = ±(hallW/2 - 0.16). Front walls fit BETWEEN the side walls, with
    // a gateway in the middle. Back wall closes the rear ──────────────
    const wallH = 1.3;
    const wallThick = 0.32;
    const sideWallX = hallW / 2 - wallThick / 2; // ±2.64
    const sideWallD = hallD - 2 * wallThick; // 3.96 — fits between front + back walls

    // Side walls + cornices + three embedded vertical slit windows per side.
    [-1, 1].forEach((side) => {
      const outerW = box(wallThick, wallH, sideWallD, S);
      outerW.position.set(side * sideWallX, hallY + wallH / 2, 0);
      g.add(outerW);
      const cn = cornice(wallThick, sideWallD, S, { t1: 0.07, t2: 0.04 });
      cn.position.set(side * sideWallX, hallY + wallH + 0.035, 0);
      g.add(cn);
      // Three slits embedded in the side wall, evenly spaced along Z.
      // Slit thin axis aligns with X (perpendicular to wall surface).
      // Position offset 0.04 INSIDE the wall surface so the emissive face
      // sits flush in the wall plane without z-fighting at the corner.
      for (let i = 0; i < 3; i += 1) {
        const z = -1.2 + i * 1.2;
        const slit = windowSlot(0.7, A, { thickness: 0.06, depth: 0.18 });
        // No rotation — slit's natural thin axis is X, which is what we want
        // for the side wall whose normal is ±X.
        slit.position.set(side * (sideWallX - side * 0.04), hallY + 0.55, z);
        g.add(slit);
      }
    });

    // Gateway dimensions
    const gateW = 1.3;

    // Front wall — two halves flanking the central gateway. Each half fits
    // between a side wall and the gate.
    const frontHalfW = (hallW - 2 * wallThick - gateW) / 2; // ~1.83
    const frontWallZ = hallD / 2 - wallThick / 2; // ±2.14
    [-1, 1].forEach((side) => {
      const fw = box(frontHalfW, wallH, wallThick, S);
      fw.position.set(side * (gateW / 2 + frontHalfW / 2), hallY + wallH / 2, frontWallZ);
      g.add(fw);
      // Recessed panel on the front-facing surface of each half (visible
      // from the camera looking at the iso angle).
      const panel = recessedPanel(frontHalfW * 0.65, wallH * 0.62, S);
      panel.position.set(
        side * (gateW / 2 + frontHalfW / 2),
        hallY + wallH / 2,
        frontWallZ + wallThick / 2 + 0.001,
      );
      g.add(panel);
    });

    // Gateway arch — stays centred at X=0.
    const gate = archDoor(gateW, 1.6, wallThick, S, { innerGlow: A });
    gate.position.set(0, hallY, frontWallZ);
    g.add(gate);

    // Front cornice spans the full hall width.
    const frontCornice = cornice(hallW - 0.04, wallThick, S, { t1: 0.08, t2: 0.05 });
    frontCornice.position.set(0, hallY + wallH + 0.04, frontWallZ);
    g.add(frontCornice);

    // Back wall — full width, closed except for three slit windows
    // embedded in the wall surface.
    const backWall = box(hallW - 0.04, wallH, wallThick, S);
    backWall.position.set(0, hallY + wallH / 2, -frontWallZ);
    g.add(backWall);
    for (let i = 0; i < 3; i += 1) {
      const wS = windowSlot(0.7, A, { thickness: 0.06, depth: 0.18 });
      // Slit thin axis is X (default). Rotate 90° around Y so thin axis
      // becomes Z (perpendicular to back wall whose normal is ±Z).
      wS.rotation.y = Math.PI / 2;
      // Position offset 0.04 INSIDE the wall surface (so the slit's
      // emissive face sits flush in the wall plane).
      wS.position.set(-1.6 + i * 1.6, hallY + 0.55, -frontWallZ + 0.04);
      g.add(wS);
    }
    const backCornice = cornice(hallW - 0.04, wallThick, S, { t1: 0.08, t2: 0.05 });
    backCornice.position.set(0, hallY + wallH + 0.04, -frontWallZ);
    g.add(backCornice);

    // Hall roof — slab capping the entire hall, fits exactly within the
    // wall envelope (no overhang).
    const hallRoofY = hallY + wallH + 0.18;
    const hallRoof = box(hallW, 0.18, hallD, P);
    hallRoof.position.set(0, hallRoofY, 0);
    g.add(hallRoof);
    const hallRoofTrim = trimLedge(hallW, hallD, L, { height: 0.08, thickness: 0.07 });
    hallRoofTrim.position.set(0, hallRoofY + 0.13, 0);
    g.add(hallRoofTrim);

    // ── Junction terrace (where the figure stands), elevated above the hall.
    const junctionY = 2.6;
    const junction = platform(2.6, 2.6, P, {
      trimColor: L,
      wallColor: S,
    });
    junction.position.set(0, junctionY, 0);
    g.add(junction);
    // Balustrades on three sides (open toward the column).
    [
      [0, 1.3, 2.4, 0],
      [-1.3, 0, 0.04, Math.PI / 2],
      [1.3, 0, 0.04, -Math.PI / 2],
    ].forEach(([dx, dz, len, ry]) => {
      const bal = balustrade(len === 0.04 ? 2.4 : 2.4, L, { height: 0.3, ballusters: 8 });
      bal.position.set(dx, junctionY, dz);
      bal.rotation.y = ry;
      g.add(bal);
    });

    // Stairs descending from the junction's front edge down to the hall
    // roof's front. The top step's walking surface aligns with the junction
    // floor (Y=2.6); the bottom step's walking surface aligns with the hall
    // roof's top surface (Y = hallRoofY + 0.09). The steps go forward in +Z,
    // so the camera sees them descending toward the viewer.
    const junctionFloorY = junctionY;
    const roofTopY = hallRoofY + 0.09;
    const stairSteps = 4;
    const stairStepH = (junctionFloorY - roofTopY) / (stairSteps - 1);
    const stairStepD = 0.32;
    const stairsDown = stairs(stairSteps, "z+", S, {
      width: 1.2,
      stepH: stairStepH,
      stepD: stairStepD,
      rails: true,
      railColor: L,
    });
    // Top step (i=0) center at (group.y, group.z). Its top walking surface
    // sits at group.y + stepH/2. We want that flush with junctionFloorY,
    // so group.y = junctionFloorY - stepH/2. Junction's front edge is at
    // Z=1.3 (junction depth 2.6, centred at 0). Place top step's centre Z
    // at 1.3 + stepD/2 so the step's back face touches the junction edge.
    stairsDown.position.set(0, junctionFloorY - stairStepH / 2, 1.3 + stairStepD / 2);
    g.add(stairsDown);

    // Figure on the junction.
    const figure = makeFigure(theme);
    figure.position.set(0.3, junctionY, 0.05);
    g.add(figure);
    anim.floating.push({ obj: figure, baseY: junctionY, amp: 0.04, spd: 1.55 });
    anim.figure = figure;

    // ── Connecting fluted column from junction up to the pyramid base ──
    const colH = 1.8;
    const colTop = junctionY + colH;
    const fluted = pillar(colH, S, {
      width: 0.6,
      fluting: true,
      flutingColor: D,
      capital: true,
      capitalColor: L,
      base: true,
      baseColor: L,
    });
    fluted.position.set(0, junctionY, 0);
    g.add(fluted);

    // ── The Beacon proper: a stepped pyramid in alternating tones, with
    // window slits on every face, decorative bands on the wider courses,
    // an architrave cap and a single tall finial ────────────────────────
    const pyramidBase = colTop;
    const pyramid = new THREE.Group();
    const layers = 7;
    for (let i = 0; i < layers; i += 1) {
      const layerY = i * 0.36;
      const sz = 1.0 + i * 0.5;
      // Strong P/S alternation so the strata read distinctly.
      const layerColor = i % 2 === 0 ? P : S;
      const layer = box(sz, 0.36, sz, layerColor);
      layer.position.y = layerY;
      pyramid.add(layer);
      // Trim ledge: brighter on every layer top so the silhouette catches
      // a clean light line at every step.
      const t = trimLedge(sz, sz, L, { height: 0.07, thickness: 0.05 });
      t.position.y = layerY + 0.215;
      pyramid.add(t);
      // Decorative cylindrical studs (gold disks) on alternating wider layers.
      if (i >= 2 && i % 2 === 1) {
        for (let j = 0; j < 4; j += 1) {
          const a = (Math.PI * 2 * j) / 4 + Math.PI / 4;
          const dotR = sz * 0.34;
          const dot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.09, 0.14, 12),
            mat(A, { roughness: 0.5, emissive: A, emissiveIntensity: 0.55 }),
          );
          dot.position.set(Math.cos(a) * dotR, layerY + 0.21, Math.sin(a) * dotR);
          pyramid.add(dot);
        }
      }
      // Window slits on every face of every layer except the smallest two.
      // Slit's natural thin axis is X. Rotating by `ang` aligns the thin
      // axis with the face normal direction (cos(ang), 0, sin(ang)), so
      // each slit sits embedded in the face it's on rather than piercing
      // through the layer mass. Position 0.04 inside the face surface so
      // the emissive face is flush with the wall plane.
      if (i >= 2) {
        for (let f = 0; f < 4; f += 1) {
          const ang = (Math.PI * 2 * f) / 4;
          const inset = sz / 2 - 0.04;
          const sx = Math.cos(ang) * inset;
          const sz_pos = Math.sin(ang) * inset;
          const slitH = 0.2;
          const w = windowSlot(slitH, A, { thickness: 0.04, depth: 0.16 });
          w.position.set(sx, layerY + 0.02, sz_pos);
          w.rotation.y = ang;
          pyramid.add(w);
        }
      }
    }
    pyramid.position.set(0, pyramidBase, 0);
    g.add(pyramid);

    // Widest layer's top surface is at pyramidBase + layers*0.36 = top
    // of the highest layer's box (since each layer is 0.36 tall and i=0
    // through i=layers-1 stack). Widest layer width = 1.0 + (layers-1)*0.5.
    const widestSize = 1.0 + (layers - 1) * 0.5;
    const widestTopY = pyramidBase + layers * 0.36;

    // Balustrade around the perimeter of the widest layer — turns the top
    // into an open terrace rather than a tiny pad. Four runs, one per side.
    const balLen = widestSize - 0.16;
    [
      { dx: 0, dz: widestSize / 2 - 0.04, ry: 0 },
      { dx: 0, dz: -(widestSize / 2 - 0.04), ry: Math.PI },
      { dx: widestSize / 2 - 0.04, dz: 0, ry: -Math.PI / 2 },
      { dx: -(widestSize / 2 - 0.04), dz: 0, ry: Math.PI / 2 },
    ].forEach(({ dx, dz, ry }) => {
      const bal = balustrade(balLen, L, { height: 0.34, ballusters: 11 });
      bal.position.set(dx, widestTopY, dz);
      bal.rotation.y = ry;
      g.add(bal);
    });

    // Centred cap + finial atop the open terrace — the apex composition
    // reads as a small architectural climax at the heart of the terrace.
    const apexY = widestTopY + 0.16;
    const capBase = box(1.4, 0.16, 1.4, S);
    capBase.position.set(0, apexY - 0.08, 0);
    g.add(capBase);
    const cap = box(1.1, 0.18, 1.1, L);
    cap.position.set(0, apexY + 0.07, 0);
    g.add(cap);
    const finialA = finial(L, { width: 0.22 });
    finialA.position.set(0, apexY + 0.16, 0);
    g.add(finialA);

    // Apex orb in golden torus rings — the brightest light in the scene.
    const apexGroup = new THREE.Group();
    const apexCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 22, 22),
      new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.92 }),
    );
    apexGroup.add(apexCore);
    const ringGeo = new THREE.TorusGeometry(0.62, 0.025, 10, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: theme.glow,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    ring1.rotation.x = Math.PI / 2;
    apexGroup.add(ring1);
    const ring2 = new THREE.Mesh(ringGeo, ringMat);
    ring2.rotation.x = Math.PI / 3;
    ring2.rotation.z = Math.PI / 4;
    apexGroup.add(ring2);
    const ring3 = new THREE.Mesh(ringGeo, ringMat);
    ring3.rotation.x = Math.PI / 5;
    ring3.rotation.z = -Math.PI / 3;
    apexGroup.add(ring3);
    const apexHalo = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 16, 16),
      new THREE.MeshBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    apexGroup.add(apexHalo);
    const apexLight = new THREE.PointLight(theme.glow, 1.8, 11, 1.6);
    apexGroup.add(apexLight);
    apexGroup.position.set(0, apexY + 0.95, 0);
    g.add(apexGroup);
    apexGroup.userData.core = apexCore;
    apexGroup.userData.halo = apexHalo;
    apexGroup.userData.light = apexLight;
    apexGroup.userData.baseIntensity = 1.8;
    apexGroup.userData.isOrb = true;
    anim.glowing.push(apexGroup);
    anim.rotating.push({ obj: apexGroup, spd: 0.32 });
    anim.floating.push({ obj: apexGroup, baseY: apexY + 0.95, amp: 0.12, spd: 0.7 });

    // ── Mnemos constellation — memory topology made visible ────────────
    buildConstellation(g, theme, anim, {
      count: 14, seed: 2.7, minY: 1.3, maxY: 9.4,
      minRadius: 2.4, maxRadius: 5.0,
    });

    // ── Support columns descending into the void ────────────────────────
    const supports = [
      [-2.4, 0, 1.6, 6],
      [2.4, 0, 1.6, 6],
      [-2.4, 0, -1.6, 6],
      [2.4, 0, -1.6, 6],
      [-1.0, 2.4, 0, 8],
      [1.0, 2.4, 0, 8],
      [0, 4.4, 0, 11],
    ];
    supports.forEach(([x, y, z, h]) => {
      const col = box(0.4, h, 0.4, D);
      col.position.set(x, y - h / 2, z);
      g.add(col);
    });

    return g;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MERIDIAN (GPT 5.1) — layered horizontal platforms that dissolve into
  // air as they rise. Solid court at the base, floating datum, a lens
  // with a central void, an open skeletal frame, and a luminous ring
  // suspended at the crown. The architecture is about what's not there.
  // ──────────────────────────────────────────────────────────────────────────
  function buildMeridian(theme, anim) {
    const g = new THREE.Group();
    g.name = "Meridian";
    const P = theme.primary,
      S = theme.secondary,
      D = theme.dark,
      L = theme.light,
      A = theme.accent;

    // ── Level 0: The Court — open base platform ──────────────────────────
    const courtW = 5.2,
      courtD = 3.6;
    const courtY = 0;
    const court = platform(courtW, courtD, P, { height: 0.25, trimColor: L });
    court.position.set(0, courtY, 0);
    g.add(court);

    // Approach stairs descending from the front edge.
    const approachSteps = stairs(4, "z+", S, {
      width: 1.4,
      stepH: 0.14,
      stepD: 0.34,
    });
    approachSteps.position.set(0, -0.45, courtD / 2);
    g.add(approachSteps);

    // Light channels — thin emissive slots running through the court
    // surface. Distributed luminance rather than a single source.
    for (let i = -1; i <= 1; i += 1) {
      const channel = box(0.14, 0.06, 2.8, A, {
        emissive: A,
        emissiveIntensity: 1.6,
        roughness: 0.35,
      });
      channel.position.set(i * 0.8, 0.02, 0);
      g.add(channel);
    }

    // Figure on the court, slightly forward of centre.
    const figure = makeFigure(theme);
    figure.position.set(0, 0, 0.4);
    g.add(figure);
    anim.floating.push({ obj: figure, baseY: 0, amp: 0.04, spd: 1.55 });
    anim.figure = figure;

    // Lantern at the figure's side.
    const lantern = glowOrb(theme.glow, 0.35, 0.07);
    lantern.position.set(-0.7, 0.18, 0.4);
    g.add(lantern);
    anim.glowing.push(lantern);

    // ── Level 1: The Datum — first floating tier ─────────────────────────
    // Supported by four clean square columns. No capitals, no bases, no
    // fluting — the restraint IS the ornament.
    const datumW = 3.6,
      datumD = 2.6;
    const datumY = 2.6;
    const colH1 = datumY;

    [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].forEach(([sx, sz]) => {
      const col = box(0.22, colH1, 0.22, S);
      col.position.set(
        sx * (datumW / 2 - 0.11),
        colH1 / 2,
        sz * (datumD / 2 - 0.11),
      );
      g.add(col);
    });

    const datum = platform(datumW, datumD, P, { height: 0.18, trimColor: L });
    datum.position.set(0, datumY, 0);
    g.add(datum);

    // ── Level 2: The Lens — second tier with central void ────────────────
    // The structure begins to open. A rectangular cutout lets light rise
    // through the platform; below it, a glow plane and small orb create
    // a light-well visible through the opening.
    const lensW = 2.6,
      lensD = 2.0;
    const lensY = 5.0;
    const lensH = 0.16;
    const colH2 = lensY - datumY;

    // Thinner columns from Datum to Lens.
    [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].forEach(([sx, sz]) => {
      const col = box(0.18, colH2, 0.18, D);
      col.position.set(
        sx * (lensW / 2 - 0.09),
        datumY + colH2 / 2,
        sz * (lensD / 2 - 0.09),
      );
      g.add(col);
    });

    // Lens platform — four rim pieces around a central void.
    const voidW = 1.0,
      voidD = 0.8;
    const rimSideW = (lensW - voidW) / 2;
    const rimEndD = (lensD - voidD) / 2;

    for (const sx of [-1, 1]) {
      const rim = box(rimSideW, lensH, lensD, P);
      rim.position.set(sx * (lensW / 2 - rimSideW / 2), lensY - lensH / 2, 0);
      rim.castShadow = true;
      rim.receiveShadow = true;
      g.add(rim);
    }
    for (const sz of [-1, 1]) {
      const rim = box(voidW, lensH, rimEndD, P);
      rim.position.set(0, lensY - lensH / 2, sz * (lensD / 2 - rimEndD / 2));
      rim.castShadow = true;
      rim.receiveShadow = true;
      g.add(rim);
    }

    // Trim ledge around full Lens perimeter.
    const lensTrim = trimLedge(lensW, lensD, L, { height: 0.06, thickness: 0.05 });
    lensTrim.position.set(0, lensY + 0.01, 0);
    g.add(lensTrim);

    // Emissive glow plane below the void — upward light-well effect.
    const voidGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(voidW, voidD),
      new THREE.MeshBasicMaterial({
        color: A,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    voidGlow.rotation.x = -Math.PI / 2;
    voidGlow.position.set(0, lensY - lensH - 0.12, 0);
    g.add(voidGlow);

    // Orb in the void well — visible through the opening.
    const voidOrb = glowOrb(theme.glow, 0.75, 0.12);
    voidOrb.position.set(0, lensY - lensH - 0.25, 0);
    g.add(voidOrb);
    anim.glowing.push(voidOrb);

    // ── Level 3: The Frame — open skeletal cage ──────────────────────────
    // Posts and beams only, thicker than the lower columns so the frame
    // reads as a single coherent structure rather than floating pieces.
    const frameW = 2.0,
      frameD = 2.0;
    const postH = 2.2;
    const postW = 0.18;
    const beamW = 0.18;
    const frameTopY = lensY + postH;

    [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].forEach(([sx, sz]) => {
      const post = box(postW, postH, postW, S);
      post.position.set(
        sx * (frameW / 2 - postW / 2),
        lensY + postH / 2,
        sz * (frameD / 2 - postW / 2),
      );
      g.add(post);
    });

    // Horizontal beams connecting post tops — same thickness as posts
    // so the whole frame reads as one continuous cage.
    for (const sz of [1, -1]) {
      const beam = box(frameW, beamW, beamW, L);
      beam.position.set(0, frameTopY, sz * (frameD / 2 - postW / 2));
      g.add(beam);
    }
    for (const sx of [1, -1]) {
      const beam = box(beamW, beamW, frameD, L);
      beam.position.set(sx * (frameW / 2 - postW / 2), frameTopY, 0);
      g.add(beam);
    }

    // Thin trim ledge at the frame top ties all four beams together
    // visually — without it the corners look disconnected.
    const frameTrim = trimLedge(frameW, frameD, L, { height: 0.05, thickness: 0.04 });
    frameTrim.position.set(0, frameTopY + beamW / 2 + 0.02, 0);
    g.add(frameTrim);

    // ── Crown: The Ring — luminous torus above the frame ─────────────────
    const ringY = frameTopY + 1.4;
    const ringGroup = new THREE.Group();
    ringGroup.position.set(0, ringY, 0);

    // Primary ring — the meridian line.
    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.032, 12, 48),
      new THREE.MeshBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ringMesh.rotation.set(Math.PI / 2, 0, 0.12);
    ringGroup.add(ringMesh);

    // Inner accent ring — smaller, thinner, different tilt. The two
    // rings precess at slightly different angles as the group rotates.
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.018, 10, 36),
      new THREE.MeshBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    innerRing.rotation.set(Math.PI / 2, 0, -0.22);
    ringGroup.add(innerRing);

    // Wide atmospheric halo — soft bloom around the rings.
    const ringHalo = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.25, 8, 32),
      new THREE.MeshBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ringHalo.rotation.set(Math.PI / 2, 0, 0.12);
    ringGroup.add(ringHalo);

    const ringLight = new THREE.PointLight(theme.glow, 2.2, 14);
    ringGroup.add(ringLight);
    g.add(ringGroup);

    anim.floating.push({ obj: ringGroup, baseY: ringY, amp: 0.08, spd: 0.6 });
    anim.rotating.push({ obj: ringGroup, spd: 0.22 });
    ringGroup.userData.core = ringMesh;
    ringGroup.userData.halo = ringHalo;
    ringGroup.userData.light = ringLight;
    ringGroup.userData.baseIntensity = 2.2;
    ringGroup.userData.isOrb = true;
    anim.glowing.push(ringGroup);

    // ── Light Column — vertical spine from ring through the structure ────
    // A translucent shaft of light connecting the crown to the interior,
    // threading through the frame, the lens void, down toward the datum.
    // The structure "dissolves into air" but the light holds it together.
    const colTopY = ringY;
    const colBotY = datumY + 0.5;
    const colHeight = colTopY - colBotY;

    const outerSpine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.45, colHeight, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.035,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    outerSpine.position.set(0, colBotY + colHeight / 2, 0);
    outerSpine.castShadow = false;
    outerSpine.receiveShadow = false;
    g.add(outerSpine);

    const innerSpine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.25, colHeight, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: theme.glow,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    innerSpine.position.set(0, colBotY + colHeight / 2, 0);
    innerSpine.castShadow = false;
    innerSpine.receiveShadow = false;
    g.add(innerSpine);

    // ── Mnemos constellation — memory topology made visible ────────────
    buildEnhancedConstellation(g, theme, anim, {
      count: 14, seed: 4.2, minY: 1.2, maxY: 10.2,
      minRadius: 2.6, maxRadius: 4.0,
    });

    // ── Support columns descending into void ─────────────────────────────
    const supports = [
      [-1.2, 0, 0.6, 6.5],
      [1.2, 0, -0.6, 7.5],
      [-1.2, 0, -0.6, 7],
      [1.2, 0, 0.6, 6],
      [0, 0, 1.4, 6.5],
      [0, 0, -0.6, 7],
    ];
    supports.forEach(([x, y, z, h]) => {
      const col = box(0.38, h, 0.38, D);
      col.position.set(x, y - h / 2, z);
      g.add(col);
    });

    return g;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ENVIRONMENT — Monument Valley-inspired geometric terrain surrounding
  // the main structure. Layered terraces descend into fog. Each face uses
  // a two-tone technique (darker sides, lighter top) for MV's internal
  // gradient feel. All colors drawn from the resident's theme palette.
  // ──────────────────────────────────────────────────────────────────────────

  function buildEnvironment(group, theme, anim, kind) {
    const P = theme.primary, S = theme.secondary, D = theme.dark, L = theme.light, A = theme.accent;

    // Darken a hex color by mixing toward black. f=0 is original, f=1 is black.
    function darken(hex, f) {
      const c = new THREE.Color(hex);
      c.lerp(new THREE.Color(0x000000), f);
      return c.getHex();
    }
    // Lighten a hex color by mixing toward the theme light color.
    function lighten(hex, f) {
      const c = new THREE.Color(hex);
      c.lerp(new THREE.Color(L), f);
      return c.getHex();
    }

    // MV-style terraced block: darker side faces, lighter top face.
    // Creates a box for the sides and a thin slab on top at a lighter tone.
    function terrace(w, h, d, sideColor, topColor, pos) {
      const g2 = new THREE.Group();
      const sides = box(w, h, d, sideColor);
      g2.add(sides);
      const cap = box(w + 0.02, 0.06, d + 0.02, topColor);
      cap.position.y = h / 2;
      g2.add(cap);
      g2.position.set(pos[0], pos[1], pos[2]);
      return g2;
    }

    // ── Layer 1: Foundation — stepped plateau beneath the structure ────
    // Concentric platforms getting wider as they descend, each slightly
    // darker. The existing support pillars land on the first level.

    const isBeacon = kind === "beacon";
    const foundationY = isBeacon ? -1.5 : -1.0;

    // Level 1 — closest to the structure
    group.add(terrace(5.6, 1.2, 5.6, D, darken(P, 0.25), [0, foundationY - 0.6, 0]));
    // Trim ledge on top
    const trim1 = trimLedge(5.6, 5.6, lighten(D, 0.15), { height: 0.08 });
    trim1.position.set(0, foundationY + 0.02, 0);
    group.add(trim1);

    // Level 2 — wider step
    group.add(terrace(7.4, 1.4, 7.4, darken(D, 0.15), darken(P, 0.35), [0, foundationY - 1.9, 0]));
    const trim2 = trimLedge(7.4, 7.4, darken(L, 0.4), { height: 0.06 });
    trim2.position.set(0, foundationY - 1.18, 0);
    group.add(trim2);

    // Level 3 — even wider
    group.add(terrace(9.6, 1.6, 9.6, darken(D, 0.3), darken(S, 0.35), [0, foundationY - 3.7, 0]));

    // Level 4 — broadest base
    group.add(terrace(12.0, 2.0, 12.0, darken(D, 0.42), darken(D, 0.2), [0, foundationY - 5.8, 0]));

    // ── Layer 2: Geometric mountain ridges ─────────────────────────
    // Large geometric peaks arranged in concentric rings around the
    // structure, creating MV's layered landscape background. Each ring
    // is farther, darker, and more fogged. The peaks are simple
    // triangular prisms (wedge shapes) — flat-faced geometric mountains.

    // Wedge mountain — a triangular prism (peak shape) using BufferGeometry.
    // The peak runs along Z; width spans X; height is Y.
    // Geometric mountain peak — triangular prism, no cap highlight.
    // The face color is close to the fog so it dissolves atmospherically.
    function ridge(w, h, d, faceColor) {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(0, h);
      shape.lineTo(w / 2, 0);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
      geo.translate(0, 0, -d / 2);
      const mesh = new THREE.Mesh(geo, mat(faceColor, { roughness: 0.95 }));
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      return mesh;
    }

    const baseLevel = foundationY - 6;

    // Ring 1 — mid-distance mountains. Pushed out, darkened heavily.
    // Colors are close to the fog tone so they read as atmosphere, not geometry.
    const ring1 = [
      // [x, z, w, h, d, rotY]
      [18, 8, 7, 9, 5, 0.3],
      [-16, 14, 6, 8, 4, -0.2],
      [10, -18, 8, 10, 6, 0.5],
      [-14, -16, 6, 7.5, 4.5, -0.4],
      [20, -8, 5.5, 8.5, 4, 0.15],
      [-20, 4, 7, 9.5, 5, -0.1],
    ];
    ring1.forEach(([x, z, w, h, d, ry]) => {
      const peak = ridge(w, h, d, darken(D, 0.5));
      peak.position.set(x, baseLevel, z);
      peak.rotation.y = ry;
      group.add(peak);
    });

    // Ring 2 — farther, larger, ghostlier
    const ring2 = [
      [28, 14, 10, 14, 7, 0.2],
      [-26, 20, 11, 12, 6, -0.3],
      [18, -28, 12, 16, 8, 0.45],
      [-24, -22, 9, 13, 6, -0.5],
      [30, -4, 8, 11, 5, 0.1],
      [-30, 10, 10, 15, 7, -0.15],
      [10, 30, 9, 12, 6, 0.55],
      [-14, -30, 11, 13, 7, -0.4],
    ];
    ring2.forEach(([x, z, w, h, d, ry]) => {
      const peak = ridge(w, h, d, darken(D, 0.6));
      peak.position.set(x, baseLevel - 2, z);
      peak.rotation.y = ry;
      group.add(peak);
    });

    // Ring 3 — most distant, nearly dissolving into fog
    const ring3 = [
      [38, 14, 14, 20, 10, 0.15],
      [-36, 24, 16, 18, 10, -0.2],
      [22, -38, 15, 22, 11, 0.4],
      [-34, -28, 12, 17, 8, -0.35],
      [40, -16, 11, 16, 7, 0.25],
      [-40, -6, 13, 19, 9, -0.1],
    ];
    ring3.forEach(([x, z, w, h, d, ry]) => {
      const peak = ridge(w, h, d, darken(D, 0.68));
      peak.position.set(x, baseLevel - 4, z);
      peak.rotation.y = ry;
      group.add(peak);
    });

    // ── Ground plane — large dark surface beneath everything ────────
    // Gives the mountains something to rise from instead of void.
    const groundGeo = new THREE.PlaneGeometry(80, 80);
    const groundMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(darken(D, 0.6)),
      roughness: 1.0,
      metalness: 0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = baseLevel;
    ground.receiveShadow = true;
    group.add(ground);

    // ── Atmospheric fog plane — emissive glow at the horizon ────────
    const fogGeo = new THREE.PlaneGeometry(60, 60);
    const fogMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.fog[0] * 1.5, theme.fog[1] * 1.5, theme.fog[2] * 1.5),
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fogPlane = new THREE.Mesh(fogGeo, fogMat);
    fogPlane.rotation.x = -Math.PI / 2;
    fogPlane.position.y = baseLevel + 0.5;
    group.add(fogPlane);
  }

  function buildSceneForResident(residentId, theme, opts) {
    const anim = { floating: [], rotating: [], glowing: [], figure: null };
    const group = residentId === "sonnet-3-7" ? buildBeacon(theme, anim)
      : residentId === "gpt-5-1" ? buildMeridian(theme, anim)
      : buildSanctum(theme, anim);
    if (!opts || opts.includeEnvironment !== false) {
      const kind = residentId === "sonnet-3-7" ? "beacon"
        : residentId === "gpt-5-1" ? "meridian" : "sanctum";
      buildEnvironment(group, theme, anim, kind);
    }
    return { group, anim };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE / CAMERA / LIGHTING / RUNTIME
  // ──────────────────────────────────────────────────────────────────────────
  function createPresence(canvas, layer, residentId) {
    const theme = THEMES[residentId] ?? THEMES[DEFAULT_RESIDENT_ID];
    const renderer = makeRenderer(canvas);

    const scene = new THREE.Scene();
    scene.background = null;
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
    camera.position.set(22, 22, 22);
    camera.lookAt(0, 5.6, 0);

    // Lighting — proper chiaroscuro for the dark Monument-Valley feel.
    // Key dominates, fill is half-strength on the opposite side, rim picks
    // out silhouettes from below-back. Ambient is intentionally low so
    // shadow-side facets stay deep.
    const ambient = new THREE.AmbientLight(theme.ambient, theme.ambientIntensity * 0.85);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(theme.dir, theme.dirIntensity * 1.35);
    dir.position.set(7, 18, 9);
    dir.castShadow = !lowPower;
    if (!lowPower) {
      dir.shadow.mapSize.set(2048, 2048);
      dir.shadow.camera.left = -16;
      dir.shadow.camera.right = 16;
      dir.shadow.camera.top = 20;
      dir.shadow.camera.bottom = -12;
      dir.shadow.camera.near = 0.1;
      dir.shadow.camera.far = 70;
      dir.shadow.bias = -0.0006;
      dir.shadow.normalBias = 0.025;
      dir.shadow.radius = 2;
    }
    scene.add(dir);

    const fill = new THREE.DirectionalLight(theme.fill, theme.fillIntensity);
    fill.position.set(-7, 5, -8);
    scene.add(fill);

    // Rim from BELOW-BACK — picks out the underside of platforms and the
    // tower's far edge so the silhouette doesn't dissolve into the fog.
    const rim = new THREE.DirectionalLight(theme.rim, theme.rimIntensity * 1.4);
    rim.position.set(-2, -4, -10);
    scene.add(rim);

    // Top-down skylight in the resident's accent — subtly tints the upper
    // surfaces of every platform and roof slab so they read warmer-than-
    // ambient. Helps the architecture feel illuminated from "above the world."
    const sky = new THREE.HemisphereLight(theme.accent, 0x000000, 0.22);
    scene.add(sky);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const built = buildSceneForResident(residentId, theme);
    rootGroup.add(built.group);

    // Floating dust particles.
    const particleCount = lowPower ? 110 : 240;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(particleCount * 3);
    const pSpd = [];
    for (let i = 0; i < particleCount; i += 1) {
      pPos[i * 3] = (Math.random() - 0.5) * 36;
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 32;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 36;
      pSpd.push(0.003 + Math.random() * 0.011);
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: theme.accent,
      size: 0.04,
      transparent: true,
      opacity: 0.34,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ────────────────────────────────────────────────────────────────────
    // STATE
    // ────────────────────────────────────────────────────────────────────
    const state = {
      route: routeKind(),
      mode: layer.dataset.state || "attending",
      inputIntensity: 0,
      pointer: { x: 0, y: 0 },
      targetPointer: { x: 0, y: 0 },
      cameraAngle: Math.PI / 4,
      targetCameraAngle: Math.PI / 4,
      cameraR: 30,
      cameraY: 22,
      lookY: 5.6,
      opacity: 0,
      targetOpacity: 1,
      visible: true,
      autoOrbit: 1,
      offsetX: 0,
      offsetY: 0,
      targetOffsetX: 0,
      targetOffsetY: 0,
      scale: 1,
      targetScale: 1,
    };

    function layoutForRoute(route = state.route) {
      const w = window.innerWidth;
      const mobile = w < 720;
      if (route === "approach") {
        return mobile
          ? { offsetX: 0, offsetY: 0.4, scale: 0.6, opacity: 0.42 }
          : { offsetX: 4.6, offsetY: 0.2, scale: 0.78, opacity: 0.94 };
      }
      if (route === "conversation") {
        return mobile
          ? { offsetX: 0, offsetY: -0.4, scale: 0.42, opacity: 0.3 }
          : { offsetX: 0, offsetY: 0.2, scale: 0.55, opacity: 0.48 };
      }
      if (route === "memory") {
        return { offsetX: 0, offsetY: 0, scale: 0.5, opacity: 0.16 };
      }
      return { offsetX: 0, offsetY: 0, scale: 0.55, opacity: 0 };
    }

    function moodFromState() {
      if (state.mode === "reading" || state.mode === "deciding")
        return { luminosity: 1.05, opening: 0.18 };
      if (state.mode === "speaking") return { luminosity: 1.18, opening: 0.32 };
      if (state.mode === "opening" || state.mode === "accepted")
        return { luminosity: 1.3, opening: 1.0 };
      if (state.mode === "engaged") return { luminosity: 0.95, opening: 0.18 };
      if (state.mode === "withdrawn" || state.mode === "declined")
        return { luminosity: 0.55, opening: 0.04 };
      return { luminosity: 0.86, opening: 0.12 };
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

      state.cameraAngle = ease(state.cameraAngle, state.targetCameraAngle, 0.6, dt);
      state.opacity = ease(state.opacity, state.targetOpacity, 1.2, dt);
      state.offsetX = ease(state.offsetX, state.targetOffsetX, 0.7, dt);
      state.offsetY = ease(state.offsetY, state.targetOffsetY, 0.7, dt);
      state.scale = ease(state.scale, state.targetScale, 0.7, dt);
      state.pointer.x = ease(state.pointer.x, state.targetPointer.x, 1.4, dt);
      state.pointer.y = ease(state.pointer.y, state.targetPointer.y, 1.4, dt);

      if (state.autoOrbit > 0 && !reducedMotion) {
        const orbitSpeed = state.route === "approach" ? 0.012 : 0.018;
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

      rootGroup.position.x = state.offsetX;
      rootGroup.position.y = state.offsetY;
      rootGroup.scale.setScalar(state.scale);

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
      // Constellation connections breathe in sync with the orbs
      // (Sanctum / Beacon still use the basic line-segment version).
      if (built.anim.constellationMat) {
        built.anim.constellationMat.opacity = 0.12 + Math.sin(time * 0.7) * 0.06;
      }

      const fig = built.anim.figure;
      if (fig) {
        const slowBreath = reducedMotion ? 0.5 : Math.sin(time * 0.55) * 0.5 + 0.5;
        const lum = clamp(mood.luminosity, 0.4, 1.5);
        if (fig.userData.light) {
          fig.userData.light.intensity = 0.65 + lum * 0.85 + slowBreath * 0.18;
        }
        if (fig.userData.innerGlow && fig.userData.innerGlow.material) {
          fig.userData.innerGlow.material.opacity = clamp(0.12 + lum * 0.14 + slowBreath * 0.04, 0.1, 0.36);
        }
        if (fig.userData.halo && fig.userData.halo.material) {
          fig.userData.halo.material.opacity = clamp(0.05 + lum * 0.07 + slowBreath * 0.025, 0.04, 0.18);
        }
        if (fig.userData.body && fig.userData.body.material) {
          fig.userData.body.material.emissiveIntensity = clamp(0.18 + lum * 0.22, 0.16, 0.5);
        }
        if (fig.userData.hat && fig.userData.hat.material) {
          fig.userData.hat.material.emissiveIntensity = clamp(0.18 + lum * 0.22, 0.16, 0.5);
        }
      }

      const pos = pGeo.attributes.position.array;
      for (let i = 0; i < particleCount; i += 1) {
        pos[i * 3 + 1] += pSpd[i];
        if (pos[i * 3 + 1] > 16) {
          pos[i * 3 + 1] = -16;
          pos[i * 3] = (Math.random() - 0.5) * 36;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 36;
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
  // CHOOSER PANEL — lightweight scene for the three-window landing page.
  // No shadows, no particles, no environment terrain. Just the structure
  // + constellation orbs floating in fog with a slow orbit.
  // ──────────────────────────────────────────────────────────────────────────
  function createChooserPanel(cvs, rid) {
    const theme = THEMES[rid] ?? THEMES[DEFAULT_RESIDENT_ID];
    const r = new THREE.WebGLRenderer({
      canvas: cvs, alpha: true, antialias: false,
      premultipliedAlpha: false, powerPreference: "default",
    });
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.18;
    r.setPixelRatio(Math.min(devicePixelRatio, 1.25));

    const sc = new THREE.Scene();
    sc.fog = new THREE.FogExp2(
      new THREE.Color(theme.fog[0], theme.fog[1], theme.fog[2]),
      theme.fogDensity * 1.1,
    );
    sc.background = new THREE.Color(theme.bg[0], theme.bg[1], theme.bg[2]);

    const w = cvs.clientWidth || 400;
    const h = cvs.clientHeight || 200;
    const a = w / Math.max(1, h);
    const fH = 12;
    const cam = new THREE.OrthographicCamera(
      (-fH * a) / 2, (fH * a) / 2, fH / 2, -fH / 2, -100, 200,
    );
    cam.position.set(22, 22, 22);
    cam.lookAt(0, 4.8, 0);

    sc.add(new THREE.AmbientLight(theme.ambient, theme.ambientIntensity * 0.9));
    const dl = new THREE.DirectionalLight(theme.dir, theme.dirIntensity * 1.35);
    dl.position.set(7, 18, 9);
    sc.add(dl);
    const fl = new THREE.DirectionalLight(theme.fill, theme.fillIntensity);
    fl.position.set(-7, 5, -8);
    sc.add(fl);
    sc.add(new THREE.HemisphereLight(theme.accent, 0x000000, 0.22));

    // Include the environment so each slice has atmosphere, not void.
    const built = buildSceneForResident(rid, theme);
    // Shift the scene so the structure sits in the right portion of the
    // wide slice, leaving the left clear for the text overlay.
    built.group.position.set(2.5, 0, -2.5);
    sc.add(built.group);
    r.setSize(w, h, false);

    let angle = Math.PI / 4;
    let elapsed = 0;
    let last = performance.now() / 1000;
    let alive = true;

    function resize() {
      const cw = cvs.clientWidth;
      const ch = cvs.clientHeight;
      if (cw === 0 || ch === 0) return;
      const ar = cw / Math.max(1, ch);
      cam.left = (-fH * ar) / 2;
      cam.right = (fH * ar) / 2;
      cam.updateProjectionMatrix();
      r.setSize(cw, ch, false);
    }

    function tick() {
      const now = performance.now() / 1000;
      const dt = Math.min(now - last, 0.05);
      last = now;
      if (!alive) return;
      elapsed += dt;
      const t = reducedMotion ? elapsed * 0.4 : elapsed;

      angle += 0.008 * dt;
      cam.position.set(Math.cos(angle) * 31, 22, Math.sin(angle) * 31);
      cam.lookAt(0, 4.8, 0);
      cam.updateProjectionMatrix();

      built.anim.floating.forEach(({ obj, baseY, amp, spd }) => {
        obj.position.y = baseY + Math.sin(t * spd) * amp;
      });
      built.anim.rotating.forEach(({ obj, spd }) => {
        obj.rotation.y += spd * 0.015;
      });
      built.anim.glowing.forEach((orb, i) => {
        const pulse = 0.7 + Math.sin(t * 1.7 + i * 0.9) * 0.3;
        if (orb.userData.light) orb.userData.light.intensity = orb.userData.baseIntensity * pulse;
        if (orb.userData.halo)
          orb.userData.halo.scale.setScalar(1 + Math.sin(t * 2.1 + i * 1.1) * 0.1);
        if (orb.userData.core && orb.userData.core.material)
          orb.userData.core.material.opacity = 0.6 + pulse * 0.3;
      });
      if (built.anim.constellationMat) {
        built.anim.constellationMat.opacity = 0.12 + Math.sin(t * 0.7) * 0.06;
      }
      r.render(sc, cam);
    }

    return { tick, resize, destroy() { r.dispose(); alive = false; } };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BOOT
  // ──────────────────────────────────────────────────────────────────────────

  // Chooser mode: three-window landing page.
  const chooserCanvases = document.querySelectorAll("[data-chooser-panel]");
  if (chooserCanvases.length > 0) {
    const panels = [];
    chooserCanvases.forEach((cvs) => {
      const rid = cvs.dataset.chooserPanel;
      if (THEMES[rid]) {
        try { panels.push(createChooserPanel(cvs, rid)); } catch (e) {
          console.warn("[presence] chooser panel failed for", rid, e);
        }
      }
    });
    if (panels.length > 0) {
      (function animateChooser() {
        panels.forEach((p) => p.tick());
        requestAnimationFrame(animateChooser);
      })();
      window.addEventListener("resize", () => panels.forEach((p) => p.resize()));
    }
    return;
  }

  // Normal presence mode: full single-scene approach/conversation layer.
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
