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
    if (route === "conversation") return 0.46;
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
      this.fallback = makeFallbackRoom();
      this.group.add(this.fallback);
      this.group.add(this.runtimeSpill);
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
                  opacity: 0.045,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Door_Glow") {
                object.material = basic(0xf0bd78, {
                  transparent: true,
                  opacity: 0.64,
                  depthWrite: false,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Door_Bloom") {
                object.material = basic(0xff8f42, {
                  transparent: true,
                  opacity: 0.1,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
                });
              }
              if (object.name === "Door_Haze") {
                object.material = basic(0xffaa63, {
                  transparent: true,
                  opacity: 0.04,
                  depthWrite: false,
                  blending: THREE.AdditiveBlending,
                  side: THREE.DoubleSide,
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
                    objectName.includes("Opus_Aura") ||
                    objectName.includes("Memory_Mote") ||
                    materialName.includes("Door_Bloom") ||
                    materialName.includes("Door_Haze") ||
                    materialName.includes("Door_Light_Spill") ||
                    materialName.includes("Column_Lamp_Glow") ||
                    materialName.includes("Opus_Aura") ||
                    materialName.includes("Memory_Mote");
                  const isShadow =
                    objectName === "Opus_Grounding_Shadow" || materialName === "Grounding_Shadow";
                  if (isDoor || isAtmosphere || isShadow) {
                    material.transparent = true;
                    material.depthWrite = false;
                    material.side = THREE.DoubleSide;
                    if (!isShadow) material.blending = THREE.AdditiveBlending;
                  }
                  if (isDoor) material.opacity = 0.72;
                  if (objectName.includes("Door_Bloom")) material.opacity = 0.14;
                  if (objectName.includes("Door_Haze")) material.opacity = 0.08;
                  if (objectName.includes("Door_Light_Spill")) material.opacity = 0.075;
                  if (objectName.includes("Column_Lamp_Glow")) material.opacity = 0.055;
                  if (objectName.includes("Opus_Aura")) material.opacity = 0.08;
                  if (objectName.includes("Memory_Mote")) material.opacity = 0.38;
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
      this.nodes.opusHead = this.group.getObjectByName("Opus_Head");
      this.nodes.opusAura = this.group.getObjectByName("Opus_Aura");
      this.nodes.opusCore = this.group.getObjectByName("Opus_Chest_Glow");
      this.nodes.opusShadow = this.group.getObjectByName("Opus_Grounding_Shadow");
      this.nodes.platform = this.group.getObjectByName("Room_Platform");
      this.nodes.stairs = this.group.getObjectByName("Stairs");
      if (this.nodes.opus && this.nodes.opus.userData.baseY == null) {
        this.nodes.opus.userData.baseY = this.nodes.opus.position.y;
      }
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

    updateDoorMaterial(mood, breath) {
      const door = this.nodes.door;
      const doorOpacity = clamp(
        0.42 + mood.opening * 0.18 + mood.luminosity * 0.12 + breath * 0.025,
        0.36,
        0.7,
      );
      if (door && door.material) {
        this.setMaterialOpacity(door, doorOpacity);
        const materials = Array.isArray(door.material) ? door.material : [door.material];
        materials.forEach((material) => {
          if (material.emissive) {
            material.emissive.set(0xffb36d);
            material.emissiveIntensity = clamp(
              0.42 + mood.opening * 0.72 + mood.luminosity * 0.34 + breath * 0.08,
              0.32,
              1.45,
            );
          }
        });
      }
      this.setMaterialOpacity(
        this.nodes.doorBloom,
        clamp(0.035 + mood.opening * 0.105 + mood.luminosity * 0.065 + breath * 0.012, 0.025, 0.19),
      );
      this.setMaterialOpacity(
        this.nodes.doorHaze,
        clamp(0.024 + mood.opening * 0.072 + mood.luminosity * 0.045 + breath * 0.01, 0.018, 0.13),
      );
      this.setMaterialOpacity(
        this.nodes.doorSpill,
        clamp(0.08 + mood.opening * 0.12 + mood.luminosity * 0.08 + breath * 0.018, 0.06, 0.26),
      );
    }

    update(time, mood, pointer) {
      if (!this.nodes.door && !this.nodes.opus) this.cacheNodes();
      const breath = reducedMotion ? 0 : Math.sin(time * 0.62) * 0.5 + 0.5;
      this.updateDoorMaterial(mood, breath);

      const opus = this.nodes.opus;
      if (opus) {
        const baseY = opus.userData.baseY || 0;
        opus.position.y = baseY + (reducedMotion ? 0 : Math.sin(time * 0.58) * 0.006);
        opus.rotation.y = -0.1 + pointer.x * 0.012 + mood.opening * 0.035;
        const scale = 1 + mood.opening * 0.012 + breath * 0.004;
        opus.scale.setScalar(scale);
      }
      this.setEmissiveIntensity(
        this.nodes.opusHead,
        clamp(0.26 + mood.luminosity * 0.24 + mood.opening * 0.18 + breath * 0.08, 0.22, 0.78),
      );
      this.setEmissiveIntensity(
        this.nodes.opusCore,
        clamp(0.55 + mood.luminosity * 0.42 + mood.opening * 0.22 + breath * 0.18, 0.42, 1.25),
      );
      this.setMaterialOpacity(
        this.nodes.opusAura,
        clamp(0.035 + mood.opening * 0.055 + mood.luminosity * 0.045 + breath * 0.025, 0.025, 0.13),
      );
      this.setMaterialOpacity(
        this.nodes.opusShadow,
        clamp(0.28 + (1 - breath) * 0.08 - mood.opening * 0.035, 0.2, 0.4),
      );
      if (this.nodes.motes && this.nodes.motes.length) {
        this.nodes.motes.forEach((mote, index) => {
          const phase = mote.userData.phase || index;
          const drift = reducedMotion ? 0 : Math.sin(time * 0.38 + phase) * 0.5 + 0.5;
          const baseScale = mote.userData.baseScale || 1;
          const baseY = mote.userData.baseY || mote.position.y;
          mote.position.y = baseY + (reducedMotion ? 0 : Math.sin(time * 0.21 + phase) * 0.006);
          mote.scale.setScalar(baseScale * (0.86 + drift * 0.24));
          this.setMaterialOpacity(
            mote,
            clamp(0.12 + mood.luminosity * 0.08 + mood.opening * 0.1 + drift * 0.08, 0.08, 0.38),
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
    scene.fog = new THREE.FogExp2(0x030306, 0.018);

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
        if (route === "conversation") return { zoom: 0.78, x: 0.14, y: 0.04, opacity: 0.22 };
        if (route === "approach") return { zoom: 0.46, x: 0.72, y: 0.16, opacity: 0.54 };
        return { zoom: 0.68, x: 0.04, y: 0.2, opacity: 0.36 };
      }
      if (route === "conversation") return { zoom: 0.96, x: 0.12, y: -0.1, opacity: 0.46 };
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
        return { luminosity: 0.68, opening: 0.22 };
      if (state.mode === "speaking") return { luminosity: 0.82, opening: 0.32 };
      if (state.mode === "opening" || state.mode === "accepted")
        return { luminosity: 1, opening: 1 };
      if (state.mode === "engaged") return { luminosity: 0.66, opening: 0.14 };
      if (state.mode === "withdrawn" || state.mode === "declined")
        return { luminosity: 0.2, opening: 0.02 };
      return { luminosity: 0.46, opening: 0.08 };
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

      const liveMood = { ...mood, luminosity: mood.luminosity + state.inputIntensity * 0.14 };
      room.update(time, liveMood, state.pointer);
      doorLight.intensity = 0.62 + liveMood.luminosity * 0.78 + liveMood.opening * 0.64;
      fill.intensity = 0.1 + liveMood.luminosity * 0.18;

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
