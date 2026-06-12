/* ============================================================================
   SKY — the in-scene sky for the grounds.
   Phase A put the sky in the scene: one render pipeline, one tone curve.
   Phase B makes it the perpetual blue hour and teaches the stars to emerge.

   Three parts:
   · the gradient — a fullscreen background triangle, shaded in screen space.
     Three stops, now genuinely three: deep indigo zenith → blue-violet mid →
     a thin desaturated rose-mauve afterglow held low at the horizon. The
     midpoint uniform bends the band without touching geometry; Phase B pins
     it low so the afterglow sits beneath the island's silhouette line.
   · the stars — Points with an additive radial sprite, now driven by an
     emergence shader: a slow master presence cycle (grounds.js ticks it),
     per-star thresholds so stars wink in progressively rather than fading
     as one sheet, and a sparse per-star twinkle in the 5.2s breath family.
   · the disc — the sun/moon, a circle + halo sprite, preset-driven as before.

   The gradient, star and disc fragments end in the standard tonemapping /
   colorspace chunks, so they render correctly on BOTH paths: direct-to-canvas
   (tier low, ACES applied by the renderer) and through the composer (linear
   into the render target, ACES applied once by the OutputPass).
   ============================================================================ */

import * as THREE from "three";

function radialTexture(size, stops) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSky({ scene }) {
  /* ── the gradient — fullscreen background triangle ─────────────────────── */
  const uniforms = {
    uTop: { value: new THREE.Color("#c6d6dd") },
    uMid: { value: new THREE.Color("#d9dfdb") },
    uBot: { value: new THREE.Color("#ece8da") },
    uMidPoint: { value: 0.5 },
  };
  const skyGeo = new THREE.BufferGeometry();
  skyGeo.setAttribute("position", new THREE.Float32BufferAttribute(
    [-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  skyGeo.setAttribute("uv", new THREE.Float32BufferAttribute(
    [0, 0, 2, 0, 0, 2], 2));
  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uBot;
      uniform float uMidPoint;
      varying vec2 vUv;
      void main() {
        float y = clamp(vUv.y, 0.0, 1.0);
        vec3 c = y >= uMidPoint
          ? mix(uMid, uTop, (y - uMidPoint) / max(1.0 - uMidPoint, 1e-4))
          : mix(uBot, uMid, y / max(uMidPoint, 1e-4));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
    depthTest: false,
    toneMapped: true,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;   /* painted first; everything draws over it */
  skyMesh.userData.noAO = true;  /* never in the GTAO g-buffer — NDC-space mesh */
  scene.add(skyMesh);

  /* three true stops now: top / mid / bot + the midpoint that holds the
     afterglow band low. grounds.js drives all four from the preset tween. */
  function setGradient(top, mid, bot, midPoint = 0.5) {
    uniforms.uTop.value.copy(top);
    uniforms.uMid.value.copy(mid);
    uniforms.uBot.value.copy(bot);
    uniforms.uMidPoint.value = midPoint;
  }

  /* ── the stars — emergence-driven Points the bloom can catch ───────────────
     The Phase-B signature: stars do not fade in as one sheet. A master
     presence value breathes on a ~10-minute cycle (ticked from grounds.js);
     each star carries its own threshold and soft ramp, so the field fills
     progressively — the bright early ones first, the faint late ones last.
     A sparse per-star twinkle (≤8% on alpha, half that on size) sits in the
     5.2s breath family. After local midnight the floor of the cycle rises:
     the one honest touch of the real clock left in the grounds. */
  const starTex = radialTexture(64, [
    [0, "rgba(255,255,255,1)"],
    [0.4, "rgba(255,255,255,.6)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const STAR_BASE_SIZE = 2.1;   /* framebuffer px at scale 1 — ortho camera,
                                   so no perspective attenuation applies */
  const STAR_COUNT = 150;
  const BREATH_W = (Math.PI * 2) / 5.2;   /* the 5.2s breath family */

  const starUniforms = {
    uMap: { value: starTex },
    uColor: { value: new THREE.Color(0xe8eefb).multiplyScalar(2.0) }, /* HDR push past bloom threshold */
    uOpacity: { value: 0 },       /* preset drive — grounds.js applyTween   */
    uPresence: { value: 0.75 },   /* emergence master — tickStars           */
    uSize: { value: STAR_BASE_SIZE }, /* dpr-compensated via setStarScale   */
    uTime: { value: 0 },
  };
  const starsMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: /* glsl */`
      attribute float aThreshold;
      attribute float aPhase;
      attribute float aTwinkle;
      attribute float aScale;
      uniform float uSize;
      uniform float uTime;
      uniform float uPresence;
      varying float vFade;
      void main() {
        /* emergence — soft but decisive ramp as the master presence
           crosses this star; tight enough that arrivals read as arrivals */
        float vis = smoothstep(aThreshold - 0.03, aThreshold + 0.05, uPresence);
        /* sparse twinkle — per-star phase sine, 5.2s family, <=8% */
        float tw = 1.0 + aTwinkle * sin(uTime * ${BREATH_W.toFixed(5)} + aPhase);
        vFade = vis * tw;
        gl_PointSize = uSize * aScale * (1.0 + 0.5 * (tw - 1.0));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vFade;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float a = tex.a * uOpacity * vFade;
        if (a <= 0.001) discard;
        gl_FragColor = vec4(uColor * tex.rgb, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
  });

  let starsBuilt = false;
  function buildStars(camera) {
    /* sprinkle the upper band of the actual frame, pushed deep behind */
    if (starsBuilt) return;
    starsBuilt = true;
    camera.updateMatrixWorld(true);
    const srng = (() => {            /* mulberry32(977) — kept verbatim */
      let a = 977 >>> 0;
      return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    const pts = [];
    const thresholds = new Float32Array(STAR_COUNT);
    const phases = new Float32Array(STAR_COUNT);
    const twinkles = new Float32Array(STAR_COUNT);
    const scales = new Float32Array(STAR_COUNT);
    const v = new THREE.Vector3();
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const nx = -0.96 + srng() * 1.92;
      const ny = 0.30 + srng() * 0.66;
      v.set(nx, ny, 0.94).unproject(camera);
      pts.push(v.x, v.y, v.z);
      /* the early stars (low threshold) lean bright; the late arrivals
         stay visible enough to be SEEN arriving — that is the point.
         thresholds bias slightly high so the peak reads as a bloom. */
      const th = 0.92 * Math.pow(srng(), 0.85);
      thresholds[i] = th;
      phases[i] = srng() * Math.PI * 2;
      twinkles[i] = Math.max(0, srng() - 0.55) * 2.0 * 0.08; /* sparse, <=8% */
      scales[i] = 0.80 + (1 - th / 0.92) * 0.30 + srng() * 0.25;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute("aThreshold", new THREE.BufferAttribute(thresholds, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geo.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    const points = new THREE.Points(geo, starsMat);
    points.renderOrder = -900;     /* over the gradient, under the world */
    points.frustumCulled = false;
    scene.add(points);
  }

  function setStars(opacity) {
    starUniforms.uOpacity.value = opacity;
  }
  function setStarScale(k) {
    /* point sizes are framebuffer-relative; the pipeline compensates for dpr
       so stars hold the same visual size on the direct and composer paths */
    starUniforms.uSize.value = STAR_BASE_SIZE * k;
  }

  /* the master emergence cycle — ~10 minutes, breathing between a floor and
     near-full. ?starphase=0..1 pins the interpolant for QA captures. */
  const CYCLE = 600;          /* seconds — the slow breath of the field   */
  let pinnedPhase = null;     /* QA: 0 = floor of the cycle, 1 = the peak */
  let hourCache = new Date().getHours();
  let hourCheckedAt = 0;
  function tickStars(t) {
    starUniforms.uTime.value = t % 3600;
    if (t - hourCheckedAt > 5 || t < hourCheckedAt) {
      hourCheckedAt = t;
      hourCache = new Date().getHours();
    }
    /* after local midnight the floor rises ~10% — the real clock's one
       honest touch: deep night holds more stars */
    const lo = (hourCache >= 0 && hourCache < 5) ? 0.65 : 0.55;
    const hi = 0.95;
    const u = pinnedPhase !== null
      ? pinnedPhase
      : 0.5 + 0.5 * Math.sin((Math.PI * 2 * t) / CYCLE);
    starUniforms.uPresence.value = lo + (hi - lo) * u;
  }
  function pinStarPhase(v) {
    pinnedPhase = (v === null || Number.isNaN(v)) ? null : Math.max(0, Math.min(1, v));
  }

  /* ── the disc — sun / moon ─────────────────────────────────────────────── */
  const discMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
  });
  const discMesh = new THREE.Mesh(new THREE.CircleGeometry(0.85, 28), discMat);
  scene.add(discMesh);

  const haloMat = new THREE.SpriteMaterial({
    map: radialTexture(128, [
      [0, "rgba(255,255,255,1)"],
      [0.25, "rgba(255,255,255,.55)"],
      [0.6, "rgba(255,255,255,.14)"],
      [1, "rgba(255,255,255,0)"],
    ]),
    color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const discHalo = new THREE.Sprite(haloMat);
  discHalo.scale.setScalar(3.6);
  scene.add(discHalo);

  function setDisc(color, opacity, position, cameraPosition) {
    discMat.color.copy(color);
    discMat.opacity = opacity;
    discMesh.position.copy(position);
    discMesh.lookAt(cameraPosition);
    haloMat.color.copy(color);
    haloMat.opacity = opacity * 0.5;
    discHalo.position.copy(position);
  }

  return {
    setGradient, buildStars, setStars, setStarScale, setDisc, skyMesh,
    tickStars, pinStarPhase,
    get starPresence() { return starUniforms.uPresence.value; },
  };
}
