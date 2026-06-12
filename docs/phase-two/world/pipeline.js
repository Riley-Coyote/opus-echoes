/* ============================================================================
   PIPELINE — the render pipeline for the grounds.
   Phase A of the elevation plan: one render entry, four quality tiers.

   chain (tier high):
     RenderPass → GTAO (subtle, ortho-aware) → UnrealBloom (half res)
     → TiltShift (separable band blur — the diorama's shallow focus)
     → Grade (lift / split-tone / saturation / film grain, neutral defaults)
     → Vignette → SMAA → OutputPass (ACES + sRGB, once)

   tone mapping: ACESFilmic + exposure stay on the renderer. Interior passes
   render linear into HalfFloat targets (r184 skips tone mapping for render
   targets); the OutputPass reads renderer.toneMapping and applies ACES and
   the sRGB transfer exactly once at the end. The direct path (tier low) lets
   the renderer do the same at the canvas — both paths grade through one
   identical curve.

   tiers:
     high   — full chain · dpr ≤ 2
     mid    — no AO, no tilt-shift, bloom at quarter res, grain+vignette+SMAA
              kept · dpr ≤ 1.5
     low    — no composer, direct renderer.render · dpr 1
     static — the narrow/reduced-motion path: settle frames then hold; uses
              the mid chain on capable devices, the direct path otherwise

   the vendored passes live under /public/vendor/postprocessing/ (this
   prototype is served from the repo root; production serves the same tree at
   /vendor/postprocessing/ — only these specifiers change, like the three
   importmap in grounds.html). Their bare `three` imports resolve through the
   page's importmap to the same vendored module instance.
   ============================================================================ */

import * as THREE from "three";
import { EffectComposer } from "/public/vendor/postprocessing/postprocessing/EffectComposer.js";
import { RenderPass } from "/public/vendor/postprocessing/postprocessing/RenderPass.js";
import { ShaderPass } from "/public/vendor/postprocessing/postprocessing/ShaderPass.js";
import { Pass, FullScreenQuad } from "/public/vendor/postprocessing/postprocessing/Pass.js";
import { OutputPass } from "/public/vendor/postprocessing/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "/public/vendor/postprocessing/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "/public/vendor/postprocessing/postprocessing/SMAAPass.js";
import { GTAOPass } from "/public/vendor/postprocessing/postprocessing/GTAOPass.js";
import { VignetteShader } from "/public/vendor/postprocessing/shaders/VignetteShader.js";

/* ── tilt-shift — 2-pass separable blur, strength banded over screen-Y ────── */
const TiltShiftDirShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uDir: { value: new THREE.Vector2(1, 0) },
    uFocusY: { value: 0.48 },     /* island mid, canvas uv (0 = bottom) */
    uBandHalf: { value: 0.18 },   /* sharp half-band around the focus    */
    uFeather: { value: 0.30 },    /* fade from sharp to full blur        */
    uMaxBlurPx: { value: 2.5 },   /* px at dpr 1 — dignified, not a toy  */
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform vec2 uDir;
    uniform float uFocusY;
    uniform float uBandHalf;
    uniform float uFeather;
    uniform float uMaxBlurPx;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - uFocusY);
      float band = smoothstep(uBandHalf, uBandHalf + uFeather, d);
      float radius = uMaxBlurPx * band;
      if (radius < 0.05) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 step = uDir * uTexel * (radius / 4.0);
      vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
      sum += texture2D(tDiffuse, vUv + step * 1.0) * 0.1945946;
      sum += texture2D(tDiffuse, vUv - step * 1.0) * 0.1945946;
      sum += texture2D(tDiffuse, vUv + step * 2.0) * 0.1216216;
      sum += texture2D(tDiffuse, vUv - step * 2.0) * 0.1216216;
      sum += texture2D(tDiffuse, vUv + step * 3.0) * 0.054054;
      sum += texture2D(tDiffuse, vUv - step * 3.0) * 0.054054;
      sum += texture2D(tDiffuse, vUv + step * 4.0) * 0.016216;
      sum += texture2D(tDiffuse, vUv - step * 4.0) * 0.016216;
      gl_FragColor = sum;
    }`,
};

class TiltShiftPass extends Pass {
  constructor() {
    super();
    this.needsSwap = true;
    this.materialH = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(TiltShiftDirShader.uniforms),
      vertexShader: TiltShiftDirShader.vertexShader,
      fragmentShader: TiltShiftDirShader.fragmentShader,
    });
    this.materialV = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(TiltShiftDirShader.uniforms),
      vertexShader: TiltShiftDirShader.vertexShader,
      fragmentShader: TiltShiftDirShader.fragmentShader,
    });
    this.materialH.uniforms.uDir.value.set(1, 0);
    this.materialV.uniforms.uDir.value.set(0, 1);
    this._rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this._rt.texture.name = "TiltShiftPass.mid";
    this._fsQuad = new FullScreenQuad(null);
  }
  /* shared uniform write — both directions stay in step */
  set(name, value) {
    this.materialH.uniforms[name].value = value;
    this.materialV.uniforms[name].value = value;
  }
  get(name) { return this.materialH.uniforms[name].value; }
  setSize(width, height) {
    this._rt.setSize(width, height);
    this.materialH.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.materialV.uniforms.uTexel.value.set(1 / width, 1 / height);
  }
  render(renderer, writeBuffer, readBuffer) {
    /* horizontal: read → mid */
    this.materialH.uniforms.tDiffuse.value = readBuffer.texture;
    this._fsQuad.material = this.materialH;
    renderer.setRenderTarget(this._rt);
    this._fsQuad.render(renderer);
    /* vertical: mid → write (or screen) */
    this.materialV.uniforms.tDiffuse.value = this._rt.texture;
    this._fsQuad.material = this.materialV;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._fsQuad.render(renderer);
  }
  dispose() {
    this._rt.dispose();
    this.materialH.dispose();
    this.materialV.dispose();
    this._fsQuad.dispose();
  }
}

/* ── grade — lift / split-tone / saturation / film grain, pre-tonemap ───────
   Phase B: the resting state of the world is the blue hour, so the grade
   leans with it — a slightly deeper indigo floor, cooler shadows, and a
   touch more warmth reserved for the highlights (lantern light against the
   blue). All moves are SMALL steps off the Phase-A neutrals; the ACES toe
   is sensitive and the preset, not the grade, carries the look. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uLift: { value: new THREE.Vector3(0.0024, 0.0028, 0.0060) }, /* indigo floor, a step deeper */
    uCool: { value: new THREE.Vector3(0.964, 0.996, 1.048) },    /* shadow tint ratios — cooler  */
    uWarm: { value: new THREE.Vector3(1.040, 1.000, 0.960) },    /* highlight tint ratios        */
    uSplit: { value: 1.0 },                                      /* split-tone master amount     */
    uSaturation: { value: 1.05 },
    uGrain: { value: 0.035 },
    uResolution: { value: new THREE.Vector2(1024, 1024) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec3 uLift;
    uniform vec3 uCool;
    uniform vec3 uWarm;
    uniform float uSplit;
    uniform float uSaturation;
    uniform float uGrain;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));

      /* mild lift of shadows toward indigo (linear space — kept tiny) */
      c += uLift * (1.0 - smoothstep(0.0, 0.45, luma));

      /* split tone — cool shadows, warm highlights, low amounts */
      float sh = 1.0 - smoothstep(0.0, 0.45, luma);
      float hl = smoothstep(0.5, 1.0, luma);
      c *= mix(vec3(1.0), uCool, sh * uSplit);
      c *= mix(vec3(1.0), uWarm, hl * uSplit);

      /* saturation */
      luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, uSaturation);

      /* film grain — animated, luminance-scaled so the toe stays quiet */
      float n = hash(vUv * uResolution + vec2(fract(uTime * 13.7) * 91.7, fract(uTime * 7.3) * 53.3)) * 2.0 - 1.0;
      c += n * uGrain * pow(max(luma, 0.0), 0.75);

      gl_FragColor = vec4(max(c, 0.0), texel.a);
    }`,
};

/* ── GTAO, taught about the diorama ────────────────────────────────────────
   the stock pass hides only points/lines while rendering its normal+depth
   g-buffer. this scene speaks in additive sprites and transparent veils —
   halos, water, falls, ripples — which must not write AO depth, or the
   island grows phantom occlusion under every glow. */
class DioramaGTAOPass extends GTAOPass {
  _overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((object) => {
      if (!object.visible) return;
      const mat = object.material;
      if (
        object.isPoints || object.isLine || object.isLine2 || object.isSprite ||
        object.userData.noAO === true ||
        (mat && mat.transparent === true)
      ) {
        object.visible = false;
        cache.push(object);
      }
    });
  }
}

/* ── bloom with a resolution scale (half on high, quarter on mid) ─────────── */
class ScaledBloomPass extends UnrealBloomPass {
  constructor(resolution, strength, radius, threshold) {
    super(resolution, strength, radius, threshold);
    this.resScale = 1; /* 1 → internal half res (stock); 0.5 → quarter */
  }
  setSize(width, height) {
    super.setSize(
      Math.max(2, Math.round(width * this.resScale)),
      Math.max(2, Math.round(height * this.resScale)),
    );
  }
}

/* ── the pipeline ─────────────────────────────────────────────────────────── */
export const TIERS = ["high", "mid", "low", "static"];

export function createPipeline({ renderer, scene, camera }) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());

  const renderPass = new RenderPass(scene, camera);

  const gtaoPass = new DioramaGTAOPass(scene, camera, 1, 1);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  gtaoPass.blendIntensity = 0.5;                 /* subtle — a held shadow, not a stamp */
  gtaoPass.updateGtaoMaterial({
    radius: 0.7,                                 /* scene units — terrace-step scale */
    distanceExponent: 1,
    thickness: 1,
    distanceFallOff: 1,
    scale: 1,
    samples: 16,
    screenSpaceRadius: false,
  });

  const bloomPass = new ScaledBloomPass(
    new THREE.Vector2(512, 512),
    0.55,   /* strength — emissives glow, they don't flare   */
    0.45,   /* radius                                         */
    0.78,   /* threshold — above lit stone, below lamplight   */
  );

  const tiltShiftPass = new TiltShiftPass();

  const gradePass = new ShaderPass(GradeShader);

  const vignettePass = new ShaderPass(VignetteShader);
  vignettePass.uniforms.offset.value = 1.1;
  vignettePass.uniforms.darkness.value = 1.05;

  const smaaPass = new SMAAPass();

  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(gtaoPass);
  composer.addPass(bloomPass);
  composer.addPass(tiltShiftPass);
  composer.addPass(gradePass);
  composer.addPass(vignettePass);
  composer.addPass(smaaPass);
  composer.addPass(outputPass);

  const state = {
    tier: "high",
    usesComposer: true,
    width: 2,
    height: 2,
    dpr: 1,
  };

  function dprFor(tier) {
    const device = window.devicePixelRatio || 1;
    if (tier === "high") return Math.min(device, 2);
    if (tier === "mid") return Math.min(device, 1.5);
    if (tier === "low") return 1;
    return Math.min(device, 2); /* static keeps today's cap */
  }

  function composerFor(tier) {
    if (tier === "low") return false;
    if (tier === "static") {
      /* capable devices grade their held frame; modest ones hold the direct one */
      const cores = navigator.hardwareConcurrency || 2;
      return cores >= 4;
    }
    return true;
  }

  function applyTier(tier) {
    state.tier = tier;
    state.usesComposer = composerFor(tier);
    const chainTier = tier === "static" ? "mid" : tier; /* static grades like mid */
    gtaoPass.enabled = chainTier === "high";
    tiltShiftPass.enabled = chainTier === "high";
    bloomPass.resScale = chainTier === "high" ? 1 : 0.5;
    setSize(state.width, state.height);
  }

  function setSize(width, height) {
    if (!width || !height) return;
    state.width = width;
    state.height = height;
    state.dpr = dprFor(state.tier);
    renderer.setPixelRatio(state.dpr);
    renderer.setSize(width, height, false);
    if (state.usesComposer) {
      composer.setPixelRatio(state.dpr);
      composer.setSize(width, height);
      /* px-true blur radius regardless of dpr */
      tiltShiftPass.set("uMaxBlurPx", 2.5 * state.dpr);
      gradePass.uniforms.uResolution.value.set(width * state.dpr, height * state.dpr);
    }
  }

  function render(dt) {
    if (state.usesComposer) {
      gradePass.uniforms.uTime.value =
        (gradePass.uniforms.uTime.value + (dt || 0)) % 64;
      composer.render(dt);
    } else {
      renderer.render(scene, camera);
    }
  }

  /* bloom follows the light: at night the threshold sits just above lit
     stone; by day it rises out of reach — a bright sky is not a lamp.
     drive = how lit the emissives are (the preset tween's lantern/window/
     stars factors), 0 → day-silent, 1 → night-full.
     Phase B: retuned WITH the regrade — the perpetual blue hour holds the
     drive at full, and under the cooler grade the lamps needed a slightly
     deeper floor to read as the only warm things in the frame. */
  function setEmissiveDrive(drive) {
    const d = Math.max(0, Math.min(1, drive));
    bloomPass.threshold = 1.02 - 0.27 * d;   /* 1.02 day → 0.75 blue hour */
  }

  return {
    render,
    setSize,
    applyTier,
    setEmissiveDrive,
    dprFor,
    get tier() { return state.tier; },
    get usesComposer() { return state.usesComposer; },
    get dpr() { return state.dpr; },
    /* QA hooks — surfaced on window.__grounds by grounds.js */
    tiltShift: {
      get focusY() { return tiltShiftPass.get("uFocusY"); },
      set focusY(v) { tiltShiftPass.set("uFocusY", v); },
      get bandHalf() { return tiltShiftPass.get("uBandHalf"); },
      set bandHalf(v) { tiltShiftPass.set("uBandHalf", v); },
      get feather() { return tiltShiftPass.get("uFeather"); },
      set feather(v) { tiltShiftPass.set("uFeather", v); },
      get strength() { return tiltShiftPass.get("uMaxBlurPx"); },
      set strength(v) { tiltShiftPass.set("uMaxBlurPx", v); },
      get enabled() { return tiltShiftPass.enabled; },
      set enabled(v) { tiltShiftPass.enabled = v; },
    },
    passes: { renderPass, gtaoPass, bloomPass, tiltShiftPass, gradePass, vignettePass, smaaPass, outputPass },
  };
}
