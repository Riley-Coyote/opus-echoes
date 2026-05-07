import * as THREE from "/vendor/three.module.js";
import { GLTFLoader } from "/vendor/loaders/GLTFLoader.js";

(function () {
  if (window.__opusPresenceMounted) return;
  window.__opusPresenceMounted = true;

  const MODEL_URL = "/assets/threshold-room.glb";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lowPower = Boolean(navigator.hardwareConcurrency && navigator.hardwareConcurrency < 6);
  let lastFrameTime = performance.now() / 1000;
  let elapsedTime = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function ease(current, target, speed, dt) {
    return current + (target - current) * (1 - Math.pow(0.001, dt * speed));
  }

  function routeKind() {
    const path = window.location.pathname;
    if (path === "/" || path === "/approach") return "approach";
    if (path === "/conversation") return "conversation";
    if (path === "/memory" || path === "/mind") return "memory";
    if (["/residence", "/journal", "/writing", "/art", "/manifesto"].includes(path)) {
      return "dashboard";
    }
    return "public";
  }

  function initialOpacityForRoute(route) {
    if (route === "approach") return 0.86;
    if (route === "conversation") return 0.66;
    if (route === "memory") return 0.32;
    if (route === "dashboard") return 0.26;
    return 0.34;
  }

  function makeLayer() {
    const layer = document.createElement("div");
    const route = routeKind();
    const storedState = sessionStorage.getItem("opus.presence.state") || "attending";
    const initialState =
      route === "conversation" && (storedState === "opening" || storedState === "accepted")
        ? "attending"
        : storedState;
    layer.className = "opus-presence-layer";
    layer.dataset.route = route;
    layer.dataset.state = initialState;
    document.documentElement.dataset.opusRoute = layer.dataset.route;

    const canvas = document.createElement("canvas");
    canvas.className = "opus-presence-canvas";
    canvas.style.opacity = String(initialOpacityForRoute(route));
    canvas.style.transition = "none";
    canvas.setAttribute("aria-hidden", "true");
    layer.appendChild(canvas);
    document.body.prepend(layer);
    return { layer, canvas };
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
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = !lowPower;
    renderer.shadowMap.type = THREE.PCFShadowMap;
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

  function mat(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.82,
      metalness: 0.0,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      depthWrite: options.depthWrite ?? true,
      blending: options.blending ?? THREE.NormalBlending,
      side: options.side ?? THREE.FrontSide,
    });
  }

  function basic(color, options = {}) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      blending: options.blending ?? THREE.NormalBlending,
      depthWrite: options.depthWrite ?? true,
      side: options.side ?? THREE.FrontSide,
    });
  }

  function makeSoftOrbTexture() {
    const orbCanvas = document.createElement("canvas");
    orbCanvas.width = 192;
    orbCanvas.height = 192;
    const ctx = orbCanvas.getContext("2d");
    const gradient = ctx.createRadialGradient(96, 96, 2, 96, 96, 92);
    gradient.addColorStop(0, "rgba(255, 246, 222, 0.92)");
    gradient.addColorStop(0.26, "rgba(255, 214, 158, 0.38)");
    gradient.addColorStop(0.62, "rgba(255, 160, 84, 0.09)");
    gradient.addColorStop(1, "rgba(255, 160, 84, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, orbCanvas.width, orbCanvas.height);
    const texture = new THREE.CanvasTexture(orbCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function makeGlowSprite(name, color, opacity, scale) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeSoftOrbTexture(),
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sprite.name = name;
    sprite.scale.set(scale.x, scale.y, scale.z ?? 1);
    return sprite;
  }

  function makeRuntimeOpusGlow() {
    const group = new THREE.Group();
    group.name = "Opus_Living_Lantern_Runtime";
    const head = makeGlowSprite("Opus_Runtime_Head_Halo", 0xffd8a0, 0.12, {
      x: 0.34,
      y: 0.34,
      z: 1,
    });
    head.position.set(0, -0.01, 0.535);
    const core = makeGlowSprite("Opus_Runtime_Core_Glow", 0xffa456, 0.18, {
      x: 0.15,
      y: 0.15,
      z: 1,
    });
    core.position.set(0.004, -0.012, 0.35);
    group.add(head, core);
    group.visible = false;
    return group;
  }

  function makeBox(size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function makeArchShape(width, height, shoulder) {
    const shape = new THREE.Shape();
    const half = width / 2;
    shape.moveTo(-half, 0);
    shape.lineTo(-half, shoulder);
    shape.quadraticCurveTo(-half, height, 0, height);
    shape.quadraticCurveTo(half, height, half, shoulder);
    shape.lineTo(half, 0);
    shape.lineTo(-half, 0);
    return shape;
  }

  function makeSoftSpillTexture() {
    const spillCanvas = document.createElement("canvas");
    spillCanvas.width = 256;
    spillCanvas.height = 160;
    const ctx = spillCanvas.getContext("2d");
    const gradient = ctx.createRadialGradient(128, 72, 4, 128, 76, 124);
    gradient.addColorStop(0, "rgba(255, 193, 118, 0.68)");
    gradient.addColorStop(0.36, "rgba(255, 142, 66, 0.22)");
    gradient.addColorStop(0.72, "rgba(255, 116, 43, 0.055)");
    gradient.addColorStop(1, "rgba(255, 116, 43, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, spillCanvas.width, spillCanvas.height);
    const texture = new THREE.CanvasTexture(spillCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function makeRadialFalloffTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
    gradient.addColorStop(0, "rgba(4, 3, 6, 0.95)");
    gradient.addColorStop(0.45, "rgba(4, 3, 6, 0.55)");
    gradient.addColorStop(0.78, "rgba(4, 3, 6, 0.18)");
    gradient.addColorStop(1, "rgba(4, 3, 6, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function makeRuntimeDoorSpill() {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.06, 0.68),
      new THREE.MeshBasicMaterial({
        map: makeSoftSpillTexture(),
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    mesh.name = "Door_Soft_Spill_Runtime";
    mesh.position.set(0.77, 0.026, -0.45);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -0.12;
    mesh.visible = false;
    return mesh;
  }

  function makeRuntimeShadowDisc() {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.42),
      new THREE.MeshBasicMaterial({
        map: makeRadialFalloffTexture(),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
      }),
    );
    mesh.name = "Opus_Shadow_Disc_Runtime";
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0.58, 0.012, -0.46);
    mesh.renderOrder = 1;
    return mesh;
  }

  function makeFallbackRoom() {
    const group = new THREE.Group();
    group.name = "Threshold_Room_Fallback";

    const stoneTop = mat(0x302e38, { roughness: 0.88 });
    const stoneSide = mat(0x111017, { roughness: 0.9 });
    const wall = mat(0x232331, { roughness: 0.88, emissive: 0x05050a, emissiveIntensity: 0.12 });
    const glow = basic(0xf2b36d, {
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    group.add(makeBox({ x: 3.75, y: 0.28, z: 2.32 }, { x: 0, y: -0.14, z: 0 }, stoneTop));
    group.add(makeBox({ x: 3.05, y: 2.26, z: 0.16 }, { x: 0, y: 1.13, z: -0.96 }, wall));

    const door = new THREE.Mesh(new THREE.ShapeGeometry(makeArchShape(0.56, 1.58, 1.28), 32), glow);
    door.name = "Door_Glow";
    door.position.set(0.82, 0.02, -1.05);
    group.add(door);

    const stairs = new THREE.Group();
    stairs.name = "Stairs";
    for (let i = 0; i < 9; i += 1) {
      const t = i / 8;
      stairs.add(
        makeBox(
          { x: 0.78, y: 0.065, z: 0.22 },
          { x: -1.23 + t * 0.1, y: -0.42 + t * 0.42, z: 2.02 - t * 0.87 },
          stoneSide,
        ),
      );
    }
    group.add(stairs);

    const opus = new THREE.Group();
    opus.name = "Opus_Figure";
    opus.position.set(0.58, 0, -0.46);
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 5), mat(0x0e0c11));
    cloak.position.y = 0.21;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 24, 12),
      mat(0xd9d4c8, { emissive: 0xc6b68e, emissiveIntensity: 0.18 }),
    );
    head.position.y = 0.49;
    opus.add(cloak, head);
    group.add(opus);

    return group;
  }

  class ThresholdRoom {
    constructor() {
      this.group = new THREE.Group();
      this.group.name = "Opus threshold GLB root";
      this.nodes = {};
      this.baseOpusY = 0;
      this.loaded = false;
      this.runtimeSpill = makeRuntimeDoorSpill();
      this.runtimeShadowDisc = makeRuntimeShadowDisc();
      this.runtimeOpusGlow = makeRuntimeOpusGlow();
      this.fallback = makeFallbackRoom();
      this.group.add(this.fallback);
      this.group.add(this.runtimeSpill);
      this.group.add(this.runtimeShadowDisc);
      this.group.add(this.runtimeOpusGlow);
      this.load();
    }

    load() {
      const loader = new GLTFLoader();
      loader.load(
        MODEL_URL,
        (gltf) => {
          const model = gltf.scene;
          model.name = "Threshold_Room_Model";
          model.traverse((object) => {
            if (object.isMesh) {
              object.castShadow = true;
              object.receiveShadow = true;
              if (object.name.includes("Door_Light_Spill")) {
                object.visible = false;
              }
              if (object.name.includes("Column_Lamp_Glow")) {
                object.material = basic(0xff8f46, {
                  transparent: true,
                  opacity: 0.032,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Door_Glow") {
                object.material = basic(0xf0bd78, {
                  transparent: true,
                  opacity: 0.5,
                  depthWrite: false,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Door_Bloom") {
                object.material = basic(0xff8f42, {
                  transparent: true,
                  opacity: 0.07,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Door_Haze") {
                object.material = basic(0xffaa63, {
                  transparent: true,
                  opacity: 0.032,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Opus_Cloak") {
                object.material = mat(0x18131d, {
                  roughness: 0.92,
                  emissive: 0x1d1108,
                  emissiveIntensity: 0.055,
                });
              }
              if (object.name === "Opus_Cloak_Veil") {
                object.material = mat(0x211821, {
                  roughness: 0.94,
                  emissive: 0x2c180d,
                  emissiveIntensity: 0.08,
                  transparent: true,
                  opacity: 0.42,
                  depthWrite: false,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Opus_Head") {
                object.material = mat(0xffe6ba, {
                  roughness: 0.5,
                  emissive: 0xffc27a,
                  emissiveIntensity: 0.72,
                });
              }
              if (object.name === "Opus_Head_Bloom") {
                object.material = basic(0xffd08e, {
                  transparent: true,
                  opacity: 0.12,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Opus_Head_Halo") {
                object.material = basic(0xffd6a0, {
                  transparent: true,
                  opacity: 0.22,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Opus_Aura") {
                object.material = basic(0xffbd78, {
                  transparent: true,
                  opacity: 0.065,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Opus_Chest_Glow") {
                object.material = mat(0xffb66d, {
                  roughness: 0.62,
                  emissive: 0xff8f42,
                  emissiveIntensity: 1.05,
                  transparent: true,
                  opacity: 0.82,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Opus_Core_Line" || object.name.includes("Opus_Robe_Rim")) {
                object.material = basic(0xffc88a, {
                  transparent: true,
                  opacity: object.name === "Opus_Core_Line" ? 0.28 : 0.18,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                });
              }
              if (object.name === "Opus_Floor_Glow") {
                object.material = basic(0xff9b4c, {
                  transparent: true,
                  opacity: 0.06,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name.includes("Memory_Mote")) {
                object.material = basic(0xffe1b7, {
                  transparent: true,
                  opacity: 0.2,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                });
              }
              if (object.material) {
                const materials = Array.isArray(object.material)
                  ? object.material
                  : [object.material];
                materials.forEach((material) => {
                  material.needsUpdate = true;
                  const materialName = material.name || "";
                  const objectName = object.name || "";
                  const isDoor =
                    objectName === "Door_Glow" || materialName === "Door_Glow_Material";
                  const isAtmosphere =
                    objectName.includes("Door_Bloom") ||
                    objectName.includes("Door_Haze") ||
                    objectName.includes("Door_Light_Spill") ||
                    objectName.includes("Column_Lamp_Glow") ||
                    objectName.includes("Opus_Head_Bloom") ||
                    objectName.includes("Opus_Head_Halo") ||
                    objectName.includes("Opus_Aura") ||
                    objectName.includes("Opus_Core_Line") ||
                    objectName.includes("Opus_Robe_Rim") ||
                    objectName.includes("Opus_Floor_Glow") ||
                    objectName.includes("Memory_Mote") ||
                    materialName.includes("Door_Bloom") ||
                    materialName.includes("Door_Haze") ||
                    materialName.includes("Door_Light_Spill") ||
                    materialName.includes("Column_Lamp_Glow") ||
                    materialName.includes("Opus_Head_Bloom") ||
                    materialName.includes("Opus_Head_Halo") ||
                    materialName.includes("Opus_Aura") ||
                    materialName.includes("Opus_Core_Line") ||
                    materialName.includes("Opus_Robe_Rim") ||
                    materialName.includes("Opus_Floor_Glow") ||
                    materialName.includes("Memory_Mote");
                  const isShadow =
                    objectName === "Opus_Grounding_Shadow" || materialName === "Grounding_Shadow";
                  if (isDoor || isAtmosphere || isShadow) {
                    material.transparent = true;
                    material.depthWrite = false;
                    material.side = THREE.DoubleSide;
                    if (!isShadow) material.blending = THREE.AdditiveBlending;
                  }
                  if (isDoor) material.opacity = 0.5;
                  if (objectName.includes("Door_Bloom")) material.opacity = 0.07;
                  if (objectName.includes("Door_Haze")) material.opacity = 0.032;
                  if (objectName.includes("Door_Light_Spill")) material.opacity = 0.05;
                  if (objectName.includes("Column_Lamp_Glow")) material.opacity = 0.032;
                  if (objectName.includes("Opus_Head_Bloom")) material.opacity = 0.12;
                  if (objectName.includes("Opus_Head_Halo")) material.opacity = 0.22;
                  if (objectName.includes("Opus_Aura")) material.opacity = 0.065;
                  if (objectName.includes("Opus_Core_Line")) material.opacity = 0.28;
                  if (objectName.includes("Opus_Robe_Rim")) material.opacity = 0.18;
                  if (objectName.includes("Opus_Floor_Glow")) material.opacity = 0.06;
                  if (objectName.includes("Memory_Mote")) material.opacity = 0.2;
                  if (isShadow) material.opacity = 0.45;
                });
              }
            }
          });

          this.group.remove(this.fallback);
          this.group.add(model);
          this.model = model;
          this.loaded = true;
          this.cacheNodes();
        },
        undefined,
        (error) => {
          window.__opusPresenceError = error;
          this.group.add(this.fallback);
          this.loaded = true;
          this.cacheNodes();
        },
      );
      this.cacheNodes();
    }

    cacheNodes() {
      this.nodes.door = this.group.getObjectByName("Door_Glow");
      this.nodes.doorBloom = this.group.getObjectByName("Door_Bloom");
      this.nodes.doorHaze = this.group.getObjectByName("Door_Haze");
      this.nodes.doorSpill =
        this.runtimeSpill || this.group.getObjectByName("Door_Light_Spill_Floor");
      this.nodes.doorAperture = this.group.getObjectByName("Door_Aperture");
      this.nodes.opus = this.group.getObjectByName("Opus_Figure");
      this.nodes.opusCloak = this.group.getObjectByName("Opus_Cloak");
      this.nodes.opusVeil = this.group.getObjectByName("Opus_Cloak_Veil");
      this.nodes.opusHead = this.group.getObjectByName("Opus_Head");
      this.nodes.opusHeadBloom = this.group.getObjectByName("Opus_Head_Bloom");
      this.nodes.opusHeadHalo = this.group.getObjectByName("Opus_Head_Halo");
      this.nodes.opusAura = this.group.getObjectByName("Opus_Aura");
      this.nodes.opusCore = this.group.getObjectByName("Opus_Chest_Glow");
      this.nodes.opusCoreLine = this.group.getObjectByName("Opus_Core_Line");
      this.nodes.opusFloorGlow = this.group.getObjectByName("Opus_Floor_Glow");
      this.nodes.opusShadow = this.group.getObjectByName("Opus_Grounding_Shadow");
      this.nodes.opusShadowDisc = this.runtimeShadowDisc;
      this.nodes.platform = this.group.getObjectByName("Room_Platform");
      this.nodes.stairs = this.group.getObjectByName("Stairs");
      if (this.nodes.opus && this.nodes.opus.userData.baseY == null) {
        this.nodes.opus.userData.baseY = this.nodes.opus.position.y;
      }
      if (this.nodes.opus && this.runtimeOpusGlow.parent !== this.nodes.opus) {
        this.nodes.opus.add(this.runtimeOpusGlow);
        this.runtimeOpusGlow.position.set(0, 0, 0);
      }
      this.nodes.runtimeHeadHalo = this.runtimeOpusGlow.getObjectByName("Opus_Runtime_Head_Halo");
      this.nodes.runtimeCoreGlow = this.runtimeOpusGlow.getObjectByName("Opus_Runtime_Core_Glow");
      this.runtimeOpusGlow.visible = Boolean(this.nodes.opus);
      this.nodes.motes = [];
      this.group.traverse((object) => {
        if (!object.name || !object.name.startsWith("Memory_Mote_")) return;
        if (object.userData.baseY == null) object.userData.baseY = object.position.y;
        if (object.userData.baseScale == null) object.userData.baseScale = object.scale.x || 1;
        object.userData.phase = Number(object.name.slice(-2)) * 0.63;
        this.nodes.motes.push(object);
      });
    }

    setMaterialOpacity(node, opacity) {
      if (!node || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        material.opacity = opacity;
      });
    }

    setEmissiveIntensity(node, intensity) {
      if (!node || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        if (material.emissiveIntensity != null) material.emissiveIntensity = intensity;
      });
    }

    updateOpusMaterial(mood, time) {
      // Slow inhale-exhale curve, period ~14s: visible but meditative.
      const slowBreath = reducedMotion ? 0.5 : Math.sin(time * 0.45 - 0.4) * 0.5 + 0.5;
      const fastFlicker = reducedMotion ? 0.5 : Math.sin(time * 1.9 + 2.1) * 0.5 + 0.5;
      const lantern = clamp(0.34 + mood.luminosity * 0.62 + mood.opening * 0.16, 0.3, 1.18);
      this.setEmissiveIntensity(
        this.nodes.opusHead,
        clamp(0.32 + slowBreath * 0.55 + mood.luminosity * 0.18 + mood.opening * 0.22, 0.28, 1.4),
      );
      this.setEmissiveIntensity(
        this.nodes.opusCore,
        clamp(
          0.42 +
            slowBreath * 0.85 +
            fastFlicker * 0.12 +
            mood.luminosity * 0.32 +
            mood.opening * 0.28,
          0.38,
          1.8,
        ),
      );
      this.setEmissiveIntensity(this.nodes.opusCloak, clamp(0.035 + lantern * 0.05, 0.03, 0.12));
      this.setEmissiveIntensity(this.nodes.opusVeil, clamp(0.055 + lantern * 0.08, 0.05, 0.18));
      this.setMaterialOpacity(
        this.nodes.opusVeil,
        clamp(0.22 + lantern * 0.12 + slowBreath * 0.025, 0.18, 0.42),
      );
      this.setMaterialOpacity(
        this.nodes.opusHeadBloom,
        clamp(0.045 + lantern * 0.095 + slowBreath * 0.035, 0.04, 0.22),
      );
      this.setMaterialOpacity(
        this.nodes.opusHeadHalo,
        clamp(0.08 + lantern * 0.14 + slowBreath * 0.055, 0.07, 0.34),
      );
      this.setMaterialOpacity(
        this.nodes.opusAura,
        clamp(0.06 + slowBreath * 0.09 + mood.opening * 0.08 + mood.luminosity * 0.05, 0.05, 0.22),
      );
      this.setMaterialOpacity(
        this.nodes.opusCore,
        clamp(0.54 + lantern * 0.28 + slowBreath * 0.07, 0.48, 0.9),
      );
      this.setMaterialOpacity(
        this.nodes.opusCoreLine,
        clamp(0.11 + lantern * 0.22 + fastFlicker * 0.075, 0.09, 0.46),
      );
      this.setMaterialOpacity(
        this.nodes.opusFloorGlow,
        clamp(0.028 + lantern * 0.055 + slowBreath * 0.02, 0.02, 0.12),
      );
      this.setMaterialOpacity(
        this.nodes.runtimeHeadHalo,
        clamp(0.04 + lantern * 0.12 + slowBreath * 0.04, 0.035, 0.24),
      );
      this.setMaterialOpacity(
        this.nodes.runtimeCoreGlow,
        clamp(0.08 + lantern * 0.16 + slowBreath * 0.05 + fastFlicker * 0.02, 0.06, 0.34),
      );
    }

    updateDoorMaterial(mood, breath) {
      const door = this.nodes.door;
      const doorOpacity = clamp(
        0.31 + mood.opening * 0.17 + mood.luminosity * 0.055 + breath * 0.014,
        0.28,
        0.58,
      );
      if (door && door.material) {
        this.setMaterialOpacity(door, doorOpacity);
        const materials = Array.isArray(door.material) ? door.material : [door.material];
        materials.forEach((material) => {
          if (material.emissive) {
            material.emissive.set(0xffb36d);
            material.emissiveIntensity = clamp(
              0.32 + mood.opening * 0.52 + mood.luminosity * 0.2 + breath * 0.05,
              0.24,
              1.05,
            );
          }
        });
      }
      this.setMaterialOpacity(
        this.nodes.doorBloom,
        clamp(0.022 + mood.opening * 0.074 + mood.luminosity * 0.035 + breath * 0.008, 0.018, 0.13),
      );
      this.setMaterialOpacity(
        this.nodes.doorHaze,
        clamp(0.018 + mood.opening * 0.05 + mood.luminosity * 0.026 + breath * 0.006, 0.014, 0.09),
      );
      this.setMaterialOpacity(
        this.nodes.doorSpill,
        clamp(0.055 + mood.opening * 0.094 + mood.luminosity * 0.045 + breath * 0.012, 0.04, 0.2),
      );
    }

    update(time, mood, pointer) {
      if (!this.nodes.door && !this.nodes.opus) this.cacheNodes();
      const breath = reducedMotion ? 0 : Math.sin(time * 0.62) * 0.5 + 0.5;
      this.updateDoorMaterial(mood, breath);
      this.updateOpusMaterial(mood, time);

      const opus = this.nodes.opus;
      if (opus) {
        const baseY = opus.userData.baseY || 0;
        // Dual-frequency hover: slow primary cycle plus faster micro-bob.
        const hoverPrimary = Math.sin(time * 0.42) * 0.04;
        const hoverMicro = Math.sin(time * 1.13 + 1.7) * 0.012;
        const hoverAmplitude = reducedMotion ? 0 : hoverPrimary + hoverMicro;
        opus.position.y = baseY + 0.06 + hoverAmplitude + mood.opening * 0.04;
        opus.rotation.y = -0.1 + pointer.x * 0.012 + mood.opening * 0.035;
        const scale = 1 + mood.opening * 0.012 + breath * 0.004;
        opus.scale.setScalar(scale);
      }
      // Hide the original cuboid grounding shadow; the runtime disc gives a soft falloff.
      if (this.nodes.opusShadow) {
        this.nodes.opusShadow.visible = false;
      }

      const shadowDisc = this.nodes.opusShadowDisc;
      if (shadowDisc && this.nodes.opus) {
        const baseY = this.nodes.opus.userData.baseY || 0;
        const liftAbsolute = this.nodes.opus.position.y - baseY;
        const liftRatio = clamp(liftAbsolute / 0.12, 0, 1.4);
        const discScale = 1.0 + liftRatio * 0.55;
        shadowDisc.scale.set(discScale, discScale, 1);
        shadowDisc.position.x = this.nodes.opus.position.x;
        shadowDisc.position.z = this.nodes.opus.position.z;
        if (shadowDisc.material) {
          shadowDisc.material.opacity = clamp(
            0.55 - liftRatio * 0.22 - mood.opening * 0.05,
            0.22,
            0.62,
          );
        }
      }
      if (this.nodes.motes && this.nodes.motes.length) {
        this.nodes.motes.forEach((mote, index) => {
          const phase = mote.userData.phase || index;
          const baseScale = mote.userData.baseScale || 1;
          const baseY = mote.userData.baseY || mote.position.y;
          if (mote.userData.baseX == null) mote.userData.baseX = mote.position.x;
          if (mote.userData.baseZ == null) mote.userData.baseZ = mote.position.z;

          const driftY = reducedMotion ? 0 : Math.sin(time * 0.34 + phase) * 0.05;
          const driftX = reducedMotion ? 0 : Math.cos(time * 0.27 + phase * 1.3) * 0.025;
          const driftZ = reducedMotion ? 0 : Math.sin(time * 0.21 + phase * 0.7) * 0.025;

          mote.position.y = baseY + driftY;
          mote.position.x = mote.userData.baseX + driftX;
          mote.position.z = mote.userData.baseZ + driftZ;

          const pulse = reducedMotion ? 0.5 : Math.sin(time * 0.6 + phase * 2.1) * 0.5 + 0.5;
          mote.scale.setScalar(baseScale * (0.7 + pulse * 0.6));
          this.setMaterialOpacity(
            mote,
            clamp(
              0.18 + pulse * 0.32 + mood.luminosity * 0.18 + mood.opening * 0.18,
              0.12,
              0.7,
            ),
          );
        });
      }

      this.group.rotation.y = pointer.x * 0.012;
      this.group.rotation.x = pointer.y * 0.006;
      this.group.position.y = reducedMotion ? 0 : Math.sin(time * 0.18) * 0.014;
    }
  }

  function createPresence(canvas, layer) {
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070612, 0.034);

    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 80);
    camera.position.set(5.35, 4.25, 5.9);
    camera.lookAt(0, 0.32, -0.18);

    const root = new THREE.Group();
    root.rotation.y = -0.04;
    scene.add(root);

    const room = new ThresholdRoom();
    root.add(room.group);

    const ambient = new THREE.HemisphereLight(0x666571, 0x030303, 0.7);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xd8d7cf, 1.36);
    key.position.set(-2.8, 5.4, 3.5);
    key.castShadow = !lowPower;
    if (!lowPower) {
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -4;
      key.shadow.camera.right = 4;
      key.shadow.camera.top = 4;
      key.shadow.camera.bottom = -4;
    }
    scene.add(key);

    const doorLight = new THREE.PointLight(0xffb36d, 1.18, 5.2, 2.15);
    doorLight.position.set(0.85, 0.8, -0.72);
    scene.add(doorLight);

    const opusLight = new THREE.PointLight(0xffd09a, 0.76, 2.1, 2.35);
    opusLight.position.set(0.58, 0.9, -0.44);
    root.add(opusLight);

    const fill = new THREE.PointLight(0x28305d, 0.18, 7, 2.4);
    fill.position.set(-1.8, 0.2, 1.6);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x9ca0b0, 0.42);
    rim.position.set(3.4, 3.6, 5.1);
    scene.add(rim);

    const state = {
      route: routeKind(),
      mode: layer.dataset.state || "attending",
      inputIntensity: 0,
      attendPulse: 0,
      attendPulseTarget: 0,
      pointer: { x: 0, y: 0 },
      targetPointer: { x: 0, y: 0 },
      cameraZoom: 1,
      targetZoom: 1,
      opacity: 0,
      targetOpacity: 1,
      rootX: 0,
      targetRootX: 0,
      rootY: 0,
      targetRootY: 0,
      visible: true,
      entering: false,
      entryProgress: 1,
    };

    const entryAt = Number(sessionStorage.getItem("opus.presence.entry_at") || 0);
    if (state.route === "conversation" && entryAt && Date.now() - entryAt < 7000) {
      state.entering = true;
      state.entryProgress = 0;
      sessionStorage.removeItem("opus.presence.entry_at");
    }

    function baseLayoutForRoute(route = state.route) {
      const w = window.innerWidth;
      const mobile = w < 720;
      if (mobile) {
        if (route === "conversation") return { zoom: 0.78, x: 0.14, y: 0.04, opacity: 0.38 };
        if (route === "approach") return { zoom: 0.46, x: 0.72, y: 0.16, opacity: 0.54 };
        return { zoom: 0.68, x: 0.04, y: 0.2, opacity: 0.36 };
      }
      if (route === "conversation") return { zoom: 0.96, x: 0.12, y: -0.1, opacity: 0.66 };
      if (route === "approach") return { zoom: 0.86, x: 2.28, y: -0.24, opacity: 0.86 };
      if (route === "memory") return { zoom: 0.72, x: 1.08, y: 0.02, opacity: 0.32 };
      if (route === "dashboard") return { zoom: 0.66, x: 1.2, y: -0.02, opacity: 0.26 };
      return { zoom: 0.72, x: 1.02, y: 0, opacity: 0.34 };
    }

    function layoutForRoute() {
      const layout = baseLayoutForRoute();
      if (!state.entering) return layout;
      const start = {
        ...baseLayoutForRoute("approach"),
        zoom: layout.zoom,
        opacity: layout.opacity,
      };
      const t = state.entryProgress * state.entryProgress * (3 - 2 * state.entryProgress);
      return {
        zoom: layout.zoom,
        x: start.x - 0.14 + (layout.x - start.x + 0.14) * t,
        y: start.y - 0.08 + (layout.y - start.y + 0.08) * t,
        opacity: layout.opacity,
      };
    }

    function modeConfig() {
      if (state.mode === "reading" || state.mode === "deciding")
        return { luminosity: 0.78, opening: 0.18 };
      if (state.mode === "speaking") return { luminosity: 0.92, opening: 0.32 };
      if (state.mode === "opening" || state.mode === "accepted")
        return { luminosity: 1.0, opening: 1.0 };
      if (state.mode === "engaged") return { luminosity: 0.74, opening: 0.16 };
      if (state.mode === "withdrawn" || state.mode === "declined")
        return { luminosity: 0.28, opening: 0.04 };
      return { luminosity: 0.66, opening: 0.12 };
    }

    function updateTargets() {
      const layout = layoutForRoute();
      const accepted = !state.entering && (state.mode === "opening" || state.mode === "accepted");
      state.targetZoom = layout.zoom + (accepted ? 0.16 : 0) + state.inputIntensity * 0.04;
      state.targetRootX = layout.x + (accepted ? -0.12 : 0);
      state.targetRootY = layout.y + (accepted ? -0.06 : 0);
      state.targetOpacity = layout.opacity;
    }

    function resize() {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const aspect = width / height;
      const frustum = width < 720 ? 4.35 : 5.2;
      camera.left = (-frustum * aspect) / 2;
      camera.right = (frustum * aspect) / 2;
      camera.top = frustum / 2;
      camera.bottom = -frustum / 2;
      camera.updateProjectionMatrix();
      const pixelRatio = clamp(window.devicePixelRatio || 1, 1, lowPower ? 1.25 : 1.65);
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
      const mood = modeConfig();
      if (state.entering) {
        state.entryProgress = clamp(state.entryProgress + dt / 2.1, 0, 1);
        if (state.entryProgress >= 1) state.entering = false;
      }
      updateTargets();

      state.pointer.x = ease(state.pointer.x, state.targetPointer.x, 1.35, dt);
      state.pointer.y = ease(state.pointer.y, state.targetPointer.y, 1.35, dt);
      state.cameraZoom = ease(state.cameraZoom, state.targetZoom, 0.82, dt);
      state.opacity = ease(state.opacity, state.targetOpacity, 1.2, dt);
      state.rootX = ease(state.rootX, state.targetRootX, 0.86, dt);
      state.rootY = ease(state.rootY, state.targetRootY, 0.86, dt);

      camera.zoom = state.cameraZoom;
      camera.position.x = 5.35 + state.pointer.x * 0.1 + mood.opening * 0.14;
      camera.position.y = 4.25 - state.pointer.y * 0.07 + mood.opening * 0.1;
      camera.updateProjectionMatrix();
      camera.lookAt(mood.opening * 0.18, 0.32 + mood.opening * 0.16, -0.18 - mood.opening * 0.28);

      root.position.x = state.rootX;
      root.position.y = state.rootY;
      root.rotation.y = -0.04 + state.pointer.x * 0.01;

      state.attendPulse = ease(state.attendPulse, state.attendPulseTarget, 1.8, dt);
      state.attendPulseTarget = Math.max(0, state.attendPulseTarget - dt * 0.6);

      const liveMood = {
        ...mood,
        luminosity: mood.luminosity + state.inputIntensity * 0.14 + state.attendPulse * 0.4,
        opening: mood.opening + state.attendPulse * 0.18,
      };
      room.update(time, liveMood, state.pointer);
      const livingBreath = reducedMotion ? 0.5 : Math.sin(time * 0.62) * 0.5 + 0.5;
      doorLight.intensity = 0.42 + liveMood.luminosity * 0.42 + liveMood.opening * 0.46;
      opusLight.intensity =
        0.46 + liveMood.luminosity * 0.62 + (liveMood.moteActivity || 0) * 0.12 + livingBreath * 0.1;
      fill.intensity = 0.12 + liveMood.luminosity * 0.14;

      renderer.domElement.style.opacity = String(clamp(state.opacity, 0, 1));
      renderer.render(scene, camera);
    }

    function animate() {
      const now = performance.now() / 1000;
      const dt = clamp(now - lastFrameTime, 0.001, 0.05);
      lastFrameTime = now;
      elapsedTime += dt;
      if (state.visible) update(reducedMotion ? elapsedTime * 0.35 : elapsedTime, dt);
      requestAnimationFrame(animate);
    }

    resize();
    updateTargets();
    state.cameraZoom = state.targetZoom;
    state.opacity = state.targetOpacity;
    state.rootX = state.targetRootX;
    state.rootY = state.targetRootY;
    renderer.render(scene, camera);
    requestAnimationFrame(() => {
      renderer.domElement.style.transition = "";
    });
    requestAnimationFrame(animate);

    return { state, setRoute, setState, resize };
  }

  const { layer, canvas } = makeLayer();
  let presence;

  if (!supportsWebGL(canvas)) {
    layer.hidden = true;
    window.__opusPresenceError = new Error("WebGL unavailable");
    return;
  }

  try {
    presence = createPresence(canvas, layer);
  } catch (error) {
    layer.hidden = true;
    window.__opusPresenceError = error;
    return;
  }

  window.OpusPresence = {
    setState: presence.setState,
    setRoute: presence.setRoute,
    pulse: function () {
      presence.state.attendPulseTarget = 1;
    },
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
