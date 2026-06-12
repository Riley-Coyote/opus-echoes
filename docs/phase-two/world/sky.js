/* ============================================================================
   SKY — the in-scene sky for the grounds.
   Phase A of the elevation plan: the sky leaves CSS and enters the scene, so
   the whole frame — island, light, void — passes through one render pipeline
   and one tone curve.

   Three parts:
   · the gradient — a fullscreen background triangle, shaded in screen space
     (zenith → mid → horizon). Screen-space on purpose: it reproduces the old
     CSS `linear-gradient(to bottom, skyA, skyB)` exactly, so the island
     silhouettes against the same colors it always did. Three stops so the
     twilight regrade (Phase B) can bend the band without touching geometry.
   · the stars — Points with an additive radial sprite, size-attenuated,
     bright enough in the linear buffer for the bloom pass to catch.
   · the disc — the sun/moon, a circle + halo sprite, preset-driven as before.

   The gradient and disc fragments end in the standard tonemapping/colorspace
   chunks, so they render correctly on BOTH paths: direct-to-canvas (tier low,
   ACES applied by the renderer) and through the composer (linear into the
   render target, ACES applied once by the OutputPass).
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

  function setGradient(a, b) {
    uniforms.uTop.value.copy(a);
    uniforms.uBot.value.copy(b);
    uniforms.uMid.value.lerpColors(a, b, 0.5);  /* neutral mid pre-Phase-B */
  }

  /* ── the stars — in-scene Points the bloom can catch ───────────────────── */
  const starTex = radialTexture(64, [
    [0, "rgba(255,255,255,1)"],
    [0.4, "rgba(255,255,255,.6)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const STAR_BASE_SIZE = 2.1;    /* world units — size-attenuated */
  const starsMat = new THREE.PointsMaterial({
    color: new THREE.Color(0xe8eefb).multiplyScalar(2.0), /* HDR push past bloom threshold */
    size: STAR_BASE_SIZE,
    sizeAttenuation: true,
    map: starTex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  let starsBuilt = false;
  function buildStars(camera) {
    /* sprinkle the upper band of the actual frame, pushed deep behind */
    if (starsBuilt) return;
    starsBuilt = true;
    camera.updateMatrixWorld(true);
    const pts = [];
    const srng = (() => {            /* mulberry32(977) — kept verbatim */
      let a = 977 >>> 0;
      return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    const v = new THREE.Vector3();
    for (let i = 0; i < 90; i += 1) {
      const nx = -0.96 + srng() * 1.92;
      const ny = 0.30 + srng() * 0.66;
      v.set(nx, ny, 0.94).unproject(camera);
      pts.push(v.x, v.y, v.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const points = new THREE.Points(geo, starsMat);
    points.renderOrder = -900;     /* over the gradient, under the world */
    scene.add(points);
  }
  function setStars(opacity) {
    starsMat.opacity = opacity;
  }
  function setStarScale(k) {
    /* point sizes are framebuffer-relative; the pipeline compensates for dpr
       so stars hold the same visual size on the direct and composer paths */
    starsMat.size = STAR_BASE_SIZE * k;
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

  return { setGradient, buildStars, setStars, setStarScale, setDisc, skyMesh };
}
