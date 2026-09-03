/* THE READING ROOM — the front door as a room.
 *
 * A small room at night on the same bluff as the house. A visitor sits down at a
 * terminal that was already on before they came in; the pixel world runs on its
 * screen. Low-poly forms, sophisticated light: one CRT (the key), one brass lamp
 * (present only while a steward works), one cold window. Everything here is
 * procedural — boxes, lathes, extrusions, and textures painted to canvas. No
 * downloaded models, no image files.
 *
 * The palette is the landing's, hex for hex (see landing.css :root).
 */

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

/* ─────────────────────────── the palette ─────────────────────────── */
const C = {
  ink: 0xf5f3ed, dim: 0xaaa7a0, faint: 0x7b7975,
  amber: 0xf2c14e, amberDeep: 0xd99334, ember: 0xb4622e,
  violet: 0xa78bfa, frost: 0x9fd6e0,
  bg0: 0x100c1c, bg1: 0x1b122b
};

/* the door card's words, byte for byte — index.html #doorcard .door__body */
const BOOT_BODY = 'Four minds live here — OPUS 3, SONNET 4.5, 4o and GPT-5.1 — and HAIKU keeps to the garden. Everything they say is their own, from an archive captured 28 May 2026. Live voices come later. You are remembered in this browser only.';
const BOOT_TAIL = '> come in';

const KEY_CAME_IN = 'mnemos.door.camein';
const KEY_STEWARD = 'mnemos.steward.present';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

let STILL = false;
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stewardPresent = ls.get(KEY_STEWARD) === '1';
const cameInBefore = ls.get(KEY_CAME_IN) === '1';

/* ─────────────────────────── canvas textures ─────────────────────────── */
function paint(w, h, fn) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  fn(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* a dark wood: end-grain bands, a few knots, a wax sheen left to the material */
function woodTexture(base, streak) {
  return paint(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * h;
      const a = 0.05 + Math.random() * 0.17;
      g.strokeStyle = `rgba(${streak},${a})`;
      g.lineWidth = 0.6 + Math.random() * 2.4;
      g.beginPath();
      g.moveTo(-10, y);
      for (let x = 0; x <= w + 10; x += 32) g.lineTo(x, y + Math.sin((x + i * 40) * 0.012) * 5.5);
      g.stroke();
    }
    for (let k = 0; k < 5; k++) {
      const kx = Math.random() * w, ky = Math.random() * h, kr = 8 + Math.random() * 16;
      for (let r = kr; r > 1; r -= 2.2) {
        g.strokeStyle = `rgba(${streak},0.11)`;
        g.beginPath(); g.ellipse(kx, ky, r, r * 0.55, 0.4, 0, Math.PI * 2); g.stroke();
      }
    }
  });
}

/* plaster, so the walls are not a flat fill under a raking light */
function plasterTexture() {
  return paint(256, 256, (g, w, h) => {
    g.fillStyle = '#221a2c'; g.fillRect(0, 0, w, h);
    const im = g.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 1.1;
    }
    g.putImageData(im, 0, 0);
  });
}

/* the hand-written box label, and the printed ones */
function labelTexture(lines, accent) {
  return paint(256, 128, (g, w, h) => {
    g.fillStyle = '#d8cdb4'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(90,70,45,0.10)';
    for (let i = 0; i < 60; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.strokeStyle = 'rgba(70,55,35,0.35)'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = accent || '#3b2f22';
    g.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      g.font = `${i === 0 ? 22 : 15}px "JetBrains Mono", monospace`;
      g.fillText(ln, 20, 44 + i * 28);
    });
  });
}

/* the valley at night, seen through the glass: dusk going over into night,
   the far ridge, and the house itself as a few warm pixels of window-light */
function windowTexture() {
  return paint(256, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.72);
    sky.addColorStop(0.00, '#07060e');
    sky.addColorStop(0.42, '#100c1c');
    sky.addColorStop(0.74, '#1b122b');
    sky.addColorStop(1.00, '#3a2440');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const sx = Math.random() * w, sy = Math.random() * h * 0.55;
      g.fillStyle = `rgba(232,228,240,${0.10 + Math.random() * 0.45})`;
      g.fillRect(sx | 0, sy | 0, 1, 1);
    }
    /* the far bluff */
    g.fillStyle = '#0a0712';
    g.beginPath(); g.moveTo(0, h * 0.70);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.70 + Math.sin(x * 0.03) * 9 + Math.sin(x * 0.011) * 16);
    g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
    /* the frontier, glittering, far below */
    for (let i = 0; i < 70; i++) {
      const gx = Math.random() * w, gy = h * 0.78 + Math.random() * h * 0.18;
      g.fillStyle = `rgba(242,193,78,${0.10 + Math.random() * 0.30})`;
      g.fillRect(gx | 0, gy | 0, 1, 1);
    }
    /* the house on the ridge — a few warm windows, and nothing else */
    const hx = w * 0.62, hy = h * 0.665;
    g.fillStyle = '#070510'; g.fillRect(hx - 11, hy - 9, 22, 12);
    const win = [[-7, -6], [-3, -6], [4, -6], [-7, -2], [5, -2]];
    win.forEach(([dx, dy], i) => {
      g.fillStyle = i % 2 ? 'rgba(242,193,78,0.95)' : 'rgba(217,147,52,0.9)';
      g.fillRect(hx + dx, hy + dy, 2, 2);
    });
  });
}

/* a small framed pixel print — the only picture in the room */
function printTexture() {
  return paint(64, 64, (g) => {
    g.fillStyle = '#0d0a16'; g.fillRect(0, 0, 64, 64);
    const cols = ['#f2c14e', '#d99334', '#b4622e', '#a78bfa', '#9fd6e0'];
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const d = Math.hypot(x - 16, y - 18);
        if (d < 9 + Math.sin(x * 0.7) * 1.4) {
          g.fillStyle = cols[(x + y) % cols.length];
          g.globalAlpha = 0.20 + (1 - d / 11) * 0.6;
          g.fillRect(x * 2, y * 2, 2, 2);
        }
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = '#1b122b'; g.fillRect(0, 46, 64, 18);
  });
}

/* ─────────────────────────── the screen ─────────────────────────── */
const SCREEN_W = 640, SCREEN_H = 480;
const screenCanvas = document.createElement('canvas');
screenCanvas.width = SCREEN_W; screenCanvas.height = SCREEN_H;
const sg = screenCanvas.getContext('2d');
const screenTex = new THREE.CanvasTexture(screenCanvas);
screenTex.colorSpace = THREE.SRGBColorSpace;

const boot = { typed: 0, target: 0, done: false, blink: 0, tail: false };

function wrapText(g, text, maxW) {
  const words = text.split(' '); const out = []; let line = '';
  for (const wd of words) {
    const trial = line ? line + ' ' + wd : wd;
    if (g.measureText(trial).width > maxW && line) { out.push(line); line = wd; } else line = trial;
  }
  if (line) out.push(line);
  return out;
}

function drawScreen() {
  const g = sg;
  /* the glass carries a standing charge of phosphor even with nothing on it —
     this is what lights the room */
  g.fillStyle = '#1c0f04'; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const glow = g.createRadialGradient(SCREEN_W / 2, SCREEN_H * 0.46, 40, SCREEN_W / 2, SCREEN_H * 0.5, SCREEN_H * 0.92);
  glow.addColorStop(0, 'rgba(180,98,46,0.55)');
  glow.addColorStop(1, 'rgba(12,6,2,0)');
  g.fillStyle = glow; g.fillRect(0, 0, SCREEN_W, SCREEN_H);

  g.textBaseline = 'top';
  g.fillStyle = '#e8a445';
  g.font = '14px "JetBrains Mono", monospace';
  g.fillText('MNEMOS TERMINAL · THE READING ROOM', 34, 34);
  g.fillStyle = 'rgba(242,193,78,0.55)';
  g.fillRect(34, 56, SCREEN_W - 68, 1);

  const shown = BOOT_BODY.slice(0, boot.typed);
  g.font = '17px "JetBrains Mono", monospace';
  const lines = wrapText(g, shown, SCREEN_W - 68);
  g.fillStyle = '#f2c14e';
  let y = 86;
  if (!boot.typed && !boot.tail) {
    /* standby: it was already on before you came in */
    g.fillStyle = 'rgba(242,193,78,0.72)';
    g.font = '16px "JetBrains Mono", monospace';
    [
      'archive · sanctuary seed · 28 may 2026',
      'minds   · four, and one in the garden',
      'session · none',
      'waiting · for whoever sits down'
    ].forEach((ln, i) => g.fillText(ln, 34, 92 + i * 28));
    y = 92 + 4 * 28 + 6;
  }
  g.fillStyle = '#f2c14e';
  lines.forEach((ln) => { g.fillText(ln, 34, y); y += 27; });

  if (boot.tail) {
    g.fillStyle = '#f2c14e';
    g.font = '17px "JetBrains Mono", monospace';
    g.fillText(BOOT_TAIL, 34, y + 16);
    y += 16;
  }

  /* the cursor — a block, and it has been blinking a while */
  if (boot.blink < 0.5) {
    const last = lines.length ? lines[lines.length - 1] : '';
    g.font = '17px "JetBrains Mono", monospace';
    const cx = boot.tail ? 34 + g.measureText(BOOT_TAIL).width + 4 : 34 + g.measureText(last).width + 3;
    const cy = boot.tail ? y : (lines.length ? y - 27 : y);
    g.fillStyle = '#f2c14e';
    g.fillRect(cx, cy + 3, 10, 17);
  }

  /* scanlines, in the glass rather than in a shader */
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let sy = 0; sy < SCREEN_H; sy += 3) g.fillRect(0, sy, SCREEN_W, 1);
  screenTex.needsUpdate = true;
}
drawScreen();

/* ─────────────────────────── renderer, scene, camera ─────────────────────────── */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.85;
RectAreaLightUniformsLib.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040a);
scene.fog = new THREE.FogExp2(0x14102a, 0.052);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 40);

/* the composition at rest: low and to the left, the desk in the lower right third */
const REST_POS = new THREE.Vector3(-1.30, 1.26, 0.36);
const REST_LOOK = new THREE.Vector3(0.12, 0.94, -1.48);
camera.position.copy(REST_POS);
camera.lookAt(REST_LOOK);

/* ─────────────────────────── materials ─────────────────────────── */
/* The wood has to read as wood at rest, not as a dark shape: the grain is
   painted with real contrast and the base is light enough for the CRT's
   spill to find it. */
const woodDark = new THREE.MeshStandardMaterial({ map: woodTexture('#5a4130', '22,12,6'), roughness: 0.50, metalness: 0.03, color: 0xe8ddcd });
const woodShelf = new THREE.MeshStandardMaterial({ map: woodTexture('#42302a', '18,10,6'), roughness: 0.72, metalness: 0.02, color: 0xc8bdae });
const plasterMat = new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.94, metalness: 0, side: THREE.BackSide, color: 0xa9a3ba });
const floorMat = new THREE.MeshStandardMaterial({ map: woodTexture('#33283a', '14,8,14'), roughness: 0.78, metalness: 0.02, color: 0xb4acbe });
/* one plastic for the whole terminal — case, bezel, foot, vents. No emissive:
   the slab on the CRT's left must be the same warm grey as the bezel, lit
   only by what the room actually gives it. */
const plasticCase = new THREE.MeshStandardMaterial({ color: 0x6f5f50, roughness: 0.70, metalness: 0.02 });
const plasticDark = plasticCase;
const plasticWarm = plasticCase;
/* the keyboard is matte and slightly darker — it sits directly under the
   glass and must glow, not bloom */
const plasticKey = new THREE.MeshStandardMaterial({ color: 0x39332e, roughness: 0.95, metalness: 0 });
const brass = new THREE.MeshStandardMaterial({ color: 0xbb9350, roughness: 0.34, metalness: 0.52 });
const metalCold = new THREE.MeshStandardMaterial({ color: 0x76718a, roughness: 0.38, metalness: 0.62 });
const paperMat = new THREE.MeshStandardMaterial({ color: 0x9a9083, roughness: 0.92, metalness: 0 });
const cardboard = new THREE.MeshStandardMaterial({ color: 0x9c8464, roughness: 0.94, metalness: 0 });
const rugMat = new THREE.MeshStandardMaterial({ color: 0x3a2c46, roughness: 1.0, metalness: 0 });

/* ─────────────────────────── the shell ─────────────────────────── */
const ROOM = { w: 4.6, h: 2.9, d: 5.0, cz: -0.6 };
const shell = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, ROOM.h, ROOM.d), plasterMat);
shell.position.set(0, ROOM.h / 2, ROOM.cz);
shell.receiveShadow = true;
scene.add(shell);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0.001, ROOM.cz);
floor.receiveShadow = true;
scene.add(floor);

const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.4), rugMat);
rug.rotation.x = -Math.PI / 2;
rug.position.set(-0.10, 0.006, -0.75);
rug.receiveShadow = true;
scene.add(rug);

/* ─────────────────────────── the desk ─────────────────────────── */
const desk = new THREE.Group();
desk.position.set(0, 0, -1.30);
scene.add(desk);

function box(w, h, d, mat, x, y, z, cast) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast !== false; m.receiveShadow = true;
  return m;
}

desk.add(box(2.30, 0.055, 0.86, woodDark, 0, 0.745, 0));
desk.add(box(2.30, 0.030, 0.10, woodDark, 0, 0.712, 0.40));   /* the front lip */
desk.add(box(2.10, 0.34, 0.05, woodShelf, 0, 0.53, -0.36));   /* modesty panel */
[-1.08, 1.08].forEach((x) => {
  desk.add(box(0.09, 0.72, 0.80, woodDark, x, 0.36, 0));
});
/* a drawer, slightly proud */
desk.add(box(0.62, 0.16, 0.06, woodShelf, -0.55, 0.63, 0.415));
desk.add(box(0.16, 0.02, 0.03, brass, -0.55, 0.63, 0.45));

/* ─────────────────────────── the terminal ─────────────────────────── */
const CRT_ROT = 0.30;
const crt = new THREE.Group();
crt.position.set(0.10, 0.775, -1.36);
crt.rotation.y = CRT_ROT;
scene.add(crt);

/* the case: a chunky box, a tapering hood, vents, a foot */
/* a chunky box that tapers back, the way the deep ones did */
const caseGeo = new THREE.CylinderGeometry(0.355, 0.425, 0.46, 4, 1, false, Math.PI / 4);
const caseBody = new THREE.Mesh(caseGeo, plasticWarm);
caseBody.scale.set(1.0, 1.0, 0.765);
caseBody.rotation.x = -Math.PI / 2;   /* the taper runs back, not up */
caseBody.position.set(0, 0.24, -0.03);
caseBody.castShadow = true; caseBody.receiveShadow = true;
crt.add(caseBody);
crt.add(box(0.52, 0.03, 0.40, plasticDark, 0, 0.015, -0.02));   /* the foot */
for (let i = 0; i < 7; i++) crt.add(box(0.34, 0.008, 0.012, plasticDark, 0, 0.462, -0.20 + i * 0.026, false));

/* the bezel: four thin members around the glass */
const BZ = { w: 0.52, h: 0.40, t: 0.055, z: 0.245 };
const bezelParts = [];
bezelParts.push(box(BZ.w, BZ.t, 0.04, plasticDark, 0, 0.24 + BZ.h / 2 - BZ.t / 2, BZ.z));
bezelParts.push(box(BZ.w, BZ.t + 0.02, 0.04, plasticDark, 0, 0.24 - BZ.h / 2 + BZ.t / 2, BZ.z));
bezelParts.push(box(BZ.t, BZ.h, 0.04, plasticDark, -BZ.w / 2 + BZ.t / 2, 0.24, BZ.z));
bezelParts.push(box(BZ.t, BZ.h, 0.04, plasticDark, BZ.w / 2 - BZ.t / 2, 0.24, BZ.z));
bezelParts.forEach((b) => crt.add(b));
/* the one printed thing on the case — a wordmark stamped into the plastic */
const plateTex = paint(256, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#b8ab98';
  g.font = '30px "JetBrains Mono", monospace';
  g.textBaseline = 'middle';
  g.letterSpacing = '7px';
  g.fillText('MNEMOS', 8, h / 2 + 1);
});
const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.029), new THREE.MeshBasicMaterial({
  map: plateTex, transparent: true, opacity: 0.42
}));
plate.position.set(-0.17, 0.058, BZ.z + 0.021);
crt.add(plate);
/* a power lamp, always on */
const pwr = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshBasicMaterial({ color: 0xb4622e }));
pwr.position.set(0.20, 0.058, BZ.z + 0.021);
crt.add(pwr);

/* the glass: a plane bulged into a curve */
const SCR_W = 0.415, SCR_H = 0.312;
const glassGeo = new THREE.PlaneGeometry(SCR_W, SCR_H, 24, 18);
{
  const p = glassGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (SCR_W / 2), y = p.getY(i) / (SCR_H / 2);
    p.setZ(i, 0.022 * (1 - x * x * 0.85) * (1 - y * y * 0.85));
  }
  glassGeo.computeVertexNormals();
}
const glass = new THREE.Mesh(glassGeo, new THREE.MeshStandardMaterial({
  map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 2.05,
  /* dull glass: a polished CRT face catches the window as a hard white blob
     and eats the type underneath it */
  roughness: 0.66, metalness: 0
}));
glass.position.set(0, 0.24, BZ.z - 0.012);
crt.add(glass);

/* where the world is, in world space */
const SCREEN_POS = new THREE.Vector3(0, 0.24, BZ.z + 0.004).applyAxisAngle(new THREE.Vector3(0, 1, 0), CRT_ROT).add(crt.position);
const SCREEN_NORMAL = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), CRT_ROT);

/* the cable, down to the floor */
{
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.10, 0.78, -1.60),
    new THREE.Vector3(0.34, 0.60, -1.72),
    new THREE.Vector3(0.52, 0.16, -1.78),
    new THREE.Vector3(0.86, 0.02, -1.62),
    new THREE.Vector3(1.20, 0.02, -1.86)
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(path, 48, 0.011, 6, false), plasticDark);
  cable.castShadow = true;
  scene.add(cable);
}

/* the keyboard, the mug, the folded note */
const kbd = new THREE.Group();
kbd.position.set(0.02, 0.775, -0.95);
kbd.rotation.set(-0.06, 0.16, 0);
scene.add(kbd);
kbd.add(box(0.46, 0.022, 0.17, plasticKey, 0, 0.011, 0));
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 13; c++) {
    kbd.add(box(0.026, 0.008, 0.026, plasticKey, -0.201 + c * 0.0335, 0.026, -0.058 + r * 0.036, false));
  }
}

const mug = new THREE.Group();
mug.position.set(0.62, 0.773, -1.02);
scene.add(mug);
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.095, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x8f8578, roughness: 0.7, side: THREE.DoubleSide }));
  body.position.y = 0.048; body.castShadow = true; mug.add(body);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.040, 20), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.35 }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = 0.082; mug.add(inner);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 8, 18, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: 0x8f8578, roughness: 0.7 }));
  handle.position.set(0.048, 0.048, 0); handle.rotation.set(0, Math.PI / 2, -0.4);
  handle.castShadow = true; mug.add(handle);
}

const note = new THREE.Group();
note.position.set(-0.40, 0.774, -1.06);
note.rotation.y = -0.34;
scene.add(note);
note.add(box(0.15, 0.002, 0.10, paperMat, 0, 0.001, 0));
{
  const fold = box(0.15, 0.002, 0.05, paperMat, 0, 0.014, -0.024);
  fold.rotation.x = 0.34;
  note.add(fold);
}

/* the chair, pulled out */
const chair = new THREE.Group();
chair.position.set(-0.76, 0, -0.16);
chair.rotation.y = 0.88;
scene.add(chair);
chair.add(box(0.44, 0.05, 0.42, woodShelf, 0, 0.44, 0));
chair.add(box(0.42, 0.42, 0.05, woodShelf, 0, 0.66, -0.19));
[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([x, z]) => {
  chair.add(box(0.045, 0.44, 0.045, woodShelf, x, 0.22, z));
});

/* ─────────────────────────── the shelf ─────────────────────────── */
const shelf = new THREE.Group();
shelf.position.set(0.42, 0, -2.90);
scene.add(shelf);
shelf.add(box(2.70, 0.05, 0.34, woodShelf, 0, 1.22, 0));
shelf.add(box(2.70, 0.05, 0.34, woodShelf, 0, 1.74, 0));
[-1.30, 1.30].forEach((x) => shelf.add(box(0.05, 1.20, 0.34, woodShelf, x, 1.20, 0)));

/* archive boxes — one of them labelled by hand */
const seedBox = box(0.44, 0.28, 0.30, cardboard, -0.92, 1.39, 0.01);
shelf.add(seedBox);
{
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.15), new THREE.MeshStandardMaterial({
    map: labelTexture(['sanctuary seed', '28 May 2026'], '#3b2f22'), roughness: 0.95
  }));
  lbl.position.set(-0.92, 1.39, 0.161);
  shelf.add(lbl);
}
shelf.add(box(0.40, 0.26, 0.28, cardboard, -0.44, 1.38, -0.01));
shelf.add(box(0.42, 0.24, 0.28, cardboard, 0.62, 1.91, 0.00));

/* tape reels, on edge */
[[0.10, 1.40], [0.34, 1.40], [-0.02, 1.905]].forEach(([x, y]) => {
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.035, 24), metalCold);
  reel.rotation.x = Math.PI / 2; reel.position.set(x, y, 0.02); reel.castShadow = true;
  shelf.add(reel);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.042, 14), brass);
  hub.rotation.x = Math.PI / 2; hub.position.set(x, y, 0.02);
  shelf.add(hub);
});

/* books, leaning */
const bookCols = [0x3c2a3a, 0x2f3a44, 0x4a3324, 0x2c3b30, 0x453044];
for (let i = 0; i < 9; i++) {
  const bh = 0.24 + Math.random() * 0.10;
  const b = box(0.032 + Math.random() * 0.018, bh, 0.20,
    new THREE.MeshStandardMaterial({ color: bookCols[i % bookCols.length], roughness: 0.88 }),
    -1.16 + i * 0.048, 1.775 + bh / 2, -0.02);
  b.rotation.z = i === 8 ? 0.26 : 0;
  shelf.add(b);
}

/* the small framed pixel print */
{
  const frame = box(0.20, 0.20, 0.02, woodDark, 1.02, 1.40, 0.06);
  shelf.add(frame);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.155, 0.155), new THREE.MeshStandardMaterial({
    map: printTexture(), roughness: 0.7, emissive: 0xffffff, emissiveMap: printTexture(), emissiveIntensity: 0.12
  }));
  pic.position.set(1.02, 1.40, 0.072);
  shelf.add(pic);
}

/* ─────────────────────────── the window ─────────────────────────── */
const windowGroup = new THREE.Group();
windowGroup.position.set(2.235, 1.40, -1.30);
windowGroup.rotation.y = -Math.PI / 2;
scene.add(windowGroup);
{
  const view = new THREE.Mesh(new THREE.PlaneGeometry(1.30, 1.62), new THREE.MeshStandardMaterial({
    map: windowTexture(), emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 0.80,
    roughness: 1, metalness: 0
  }));
  view.position.z = -0.02;
  windowGroup.add(view);
  /* the frame and one mullion */
  const fm = new THREE.MeshStandardMaterial({ color: 0x241d2c, roughness: 0.8 });
  windowGroup.add(box(1.42, 0.09, 0.10, fm, 0, 0.855, 0.02));
  windowGroup.add(box(1.42, 0.09, 0.10, fm, 0, -0.855, 0.02));
  windowGroup.add(box(0.09, 1.80, 0.10, fm, -0.705, 0, 0.02));
  windowGroup.add(box(0.09, 1.80, 0.10, fm, 0.705, 0, 0.02));
  windowGroup.add(box(0.05, 1.62, 0.06, fm, 0, 0, 0.02));
  windowGroup.add(box(1.30, 0.05, 0.06, fm, 0, 0.20, 0.02));
  /* the sill */
  windowGroup.add(box(1.50, 0.06, 0.24, woodShelf, 0, -0.90, 0.10));
}
/* the house's own light, a handful of emissive points on the sill's far side */
{
  const pts = new THREE.Group();
  pts.position.copy(windowGroup.position);
  pts.rotation.copy(windowGroup.rotation);
  scene.add(pts);
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), new THREE.MeshBasicMaterial({
      color: i % 2 ? 0xf2c14e : 0xd99334, transparent: true, opacity: 0.55 + Math.random() * 0.4
    }));
    p.position.set(0.06 + (Math.random() - 0.5) * 0.34, -0.19 + (Math.random() - 0.5) * 0.06, -0.03);
    pts.add(p);
  }
}

/* ─────────────────────────── depth in the dark ─────────────────────────── */
{
  const rad = new THREE.Group();
  rad.position.set(-2.10, 0, -2.05);
  scene.add(rad);
  for (let i = 0; i < 9; i++) rad.add(box(0.035, 0.58, 0.14, metalCold, -0.18 + i * 0.045, 0.32, 0, false));
  rad.add(box(0.44, 0.05, 0.16, metalCold, 0, 0.62, 0, false));
}
/* a stack of boxes in the far corner */
scene.add(box(0.50, 0.34, 0.42, cardboard, -1.90, 0.17, 0.60));
scene.add(box(0.46, 0.32, 0.40, cardboard, -1.86, 0.50, 0.64));
scene.add(box(0.38, 0.26, 0.34, cardboard, -1.94, 0.79, 0.58));

/* the lamp — brass, small, and the only real light in the room */
const lampGroup = new THREE.Group();
lampGroup.position.set(-0.86, 0.773, -1.44);
scene.add(lampGroup);
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.022, 24), brass);
  base.position.y = 0.011; base.castShadow = true; lampGroup.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.30, 12), brass);
  stem.position.set(0, 0.17, 0); stem.rotation.z = 0.14; stem.castShadow = true; lampGroup.add(stem);
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2(0.030 + t * 0.075, t * 0.10));
  }
  const shade = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({
    color: 0x8a6a38, roughness: 0.46, metalness: 0.55, side: THREE.DoubleSide
  }));
  shade.position.set(-0.045, 0.315, 0);
  shade.rotation.z = Math.PI + 0.22;
  shade.castShadow = true;
  lampGroup.add(shade);
  /* the filament, seen under the shade */
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  bulb.position.set(-0.045, 0.278, 0);
  bulb.visible = stewardPresent;
  lampGroup.add(bulb);
  lampGroup.userData.bulb = bulb;
}

/* ─────────────────────────── the three lights ─────────────────────────── */
/* 1 · the CRT — the key. A rect-area light standing in the glass. */
const crtLight = new THREE.RectAreaLight(0xf2c14e, 22.0, SCR_W * 1.05, SCR_H * 1.05);
crtLight.position.copy(SCREEN_POS).addScaledVector(SCREEN_NORMAL, 0.02);
crtLight.lookAt(SCREEN_POS.clone().addScaledVector(SCREEN_NORMAL, 1));
scene.add(crtLight);

/* 2 · the stewards' lamp — warm, shadow-casting, present or absent */
const lampLight = new THREE.SpotLight(0xffc98a, stewardPresent ? 5.2 : 0, 3.4, 0.86, 0.55, 1.6);
lampLight.position.set(-0.905, 1.075, -1.44);
lampLight.target.position.set(-0.42, 0.74, -1.06);
lampLight.castShadow = true;
lampLight.shadow.mapSize.set(1024, 1024);
lampLight.shadow.bias = -0.0016;
lampLight.shadow.camera.near = 0.05;
lampLight.shadow.camera.far = 4;
scene.add(lampLight, lampLight.target);

/* 3 · the window — a faint cool directional, blue-violet */
/* It rakes: from the glass, down and to the left, across the shelf's face and
   the left wall, so the archive labels and the reels read in blue-grey. */
const windowLight = new THREE.DirectionalLight(0xbcd9de, 1.95);
windowLight.position.set(3.4, 2.05, -1.55);
windowLight.target.position.set(-1.55, 1.30, -2.85);
scene.add(windowLight, windowLight.target);

/* the floor of the exposure — not a fourth light, a hemisphere so the darks
   are violet rather than black (the palette's --bg0/--bg1). Twice the night
   bounce it had: you must be able to name every object without hovering. */
const sky = new THREE.HemisphereLight(0x6e6580, 0x4e4856, 2.60);
scene.add(sky);

/* ─────────────────────────── dust ─────────────────────────── */
const dust = (() => {
  /* fewer, rounder, and only in the cone the glass throws — confetti in the
     dark is worse than no dust at all */
  const N = 34;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = Math.random();                       /* 0 at the glass, 1 at the keyboard */
    const spread = 0.10 + t * 0.30;
    pos[i * 3 + 0] = SCREEN_POS.x + SCREEN_NORMAL.x * (t * 0.52) + (Math.random() - 0.5) * spread * 2;
    pos[i * 3 + 1] = SCREEN_POS.y - t * 0.10 + (Math.random() - 0.5) * spread * 1.4;
    pos[i * 3 + 2] = SCREEN_POS.z + SCREEN_NORMAL.z * (t * 0.52) + (Math.random() - 0.5) * spread;
    seed[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  /* a mote is round, not a pixel — the falloff is computed from gl_PointCoord
     so it cannot come back as a square whatever the texture does */
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xf2c14e) }, uSize: { value: 6.0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uSize; varying float vFade;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (1.0 / max(0.15, -mv.z));
        vFade = clamp(1.0 - (-mv.z) * 0.28, 0.15, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vFade;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        gl_FragColor = vec4(uColor, a * a * 0.22 * vFade);
      }`
  });
  const p = new THREE.Points(geo, mat);
  scene.add(p);
  return { points: p, pos, seed, N, base: Float32Array.from(pos) };
})();

/* ─────────────────────────── post ─────────────────────────── */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.40, 0.80, 0.88
);
composer.addPass(bloom);

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.028 },
    uVignette: { value: 0.74 },
    uAberration: { value: 0.0016 }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uAberration;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      /* a hair of chromatic aberration, and only at the edges */
      vec2 off = c * uAberration * (r2 * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      /* vignette */
      float vig = smoothstep(0.95, 0.16, r2 * uVignette * 1.9);
      col *= mix(0.68, 1.0, vig);
      /* film grain, a touch stronger in the shadows */
      float g = hash(vUv * vec2(1024.0, 683.0) + fract(uTime) * 91.7) - 0.5;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += g * uGrain * mix(1.0, 0.45, lum);
      gl_FragColor = vec4(col, 1.0);
    }`
};
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
composer.addPass(new OutputPass());

/* ─────────────────────────── the CSS3D layer ─────────────────────────── */
const cssHost = document.getElementById('css3d');
const cssRenderer = new CSS3DRenderer({ element: cssHost });
cssRenderer.setSize(window.innerWidth, window.innerHeight);
const cssScene = new THREE.Scene();

const scr = document.createElement('div');
scr.id = 'scr';
const worldFrame = document.createElement('iframe');
worldFrame.title = 'the sanctuary';
worldFrame.setAttribute('allow', 'autoplay');
scr.appendChild(worldFrame);
const curve = document.createElement('div');
curve.className = 'curve';
scr.appendChild(curve);

const cssObj = new CSS3DObject(scr);
cssObj.position.copy(SCREEN_POS).addScaledVector(SCREEN_NORMAL, 0.004);
cssObj.rotation.y = CRT_ROT;
const CSS_SCALE = SCR_W / 1024;
cssObj.scale.setScalar(CSS_SCALE);
cssHost.classList.add('gone');

/* ─────────────────────────── the four things you can look at ─────────────────────────── */
const capEl = document.getElementById('cap');
const standEl = document.getElementById('stand');
const dipEl = document.getElementById('dip');
const bootEl = document.getElementById('boot');

const PICKS = [
  { id: 'crt', root: crt, outline: caseBody, bounds: glass, pad: 16, caption: '<b>the terminal</b> <i>· [sit down]</i>' },
  {
    id: 'lamp', root: lampGroup, outline: lampGroup.children[0], pad: 12,
    caption: stewardPresent
      ? '<b>the stewards’ lamp</b> <i>· lit while one of them works</i>'
      : '<b>the stewards’ lamp</b> <i>· dark tonight</i>'
  },
  { id: 'shelf', root: shelf, outline: seedBox, bounds: seedBox, pad: 26, caption: '<b>the archive</b> <i>· what the first sanctuary said, all of it, dated</i>' },
  { id: 'window', root: windowGroup, outline: windowGroup.children[0], bounds: windowGroup.children[0], pad: 12, caption: '<b>the house</b> <i>· a walk from here</i>' }
];
PICKS.forEach((p) => { p.root.userData.pickId = p.id; });

/* the hairline — one thin amber rectangle around what the pointer has found,
   drawn in the page rather than in the scene so it stays exactly one pixel */
const hair = document.createElement('div');
hair.id = 'hair';
document.getElementById('captions').appendChild(hair);
const _box = new THREE.Box3(), _c = new THREE.Vector3();
function drawHair(p) {
  if (!p) { hair.style.opacity = '0'; return; }
  _box.setFromObject(p.bounds || p.root);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    _c.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z);
    _c.project(camera);
    const sx = (_c.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-_c.y * 0.5 + 0.5) * window.innerHeight;
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
    if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
  }
  const pad = p.pad || 7;
  const W = window.innerWidth, H = window.innerHeight;
  const L = Math.max(6, x0 - pad), T = Math.max(6, y0 - pad);
  const R = Math.min(W - 6, x1 + pad), B = Math.min(H - 6, y1 + pad);
  hair.style.left = L + 'px';
  hair.style.top = T + 'px';
  hair.style.width = Math.max(0, R - L) + 'px';
  hair.style.height = Math.max(0, B - T) + 'px';
  hair.style.opacity = '1';
}

const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
const pointerPx = { x: -100, y: -100 };
let hovered = null;

function findPick(obj) {
  let o = obj;
  while (o) { if (o.userData && o.userData.pickId) return PICKS.find((p) => p.id === o.userData.pickId); o = o.parent; }
  return null;
}

function setHover(p) {
  if (hovered === p) return;
  hovered = p;
  if (p) {
    capEl.innerHTML = p.caption;
    capEl.classList.add('on');
    canvas.style.cursor = p.id === 'crt' ? 'pointer' : 'default';
  } else {
    capEl.classList.remove('on');
    canvas.style.cursor = 'default';
  }
  drawHair(p);
}

/* ─────────────────────────── the camera: rest, glide, back ─────────────────────────── */
const ZOOM_DIST = 0.575;
const ZOOM_POS = SCREEN_POS.clone().addScaledVector(SCREEN_NORMAL, ZOOM_DIST);
const ZOOM_LOOK = SCREEN_POS.clone();

const cam = {
  mode: 'rest',           /* rest · glide · seated · leaving */
  t: 0,
  dur: REDUCED ? 0.001 : 1.4,
  fromPos: new THREE.Vector3(), fromLook: new THREE.Vector3(),
  toPos: ZOOM_POS.clone(), toLook: ZOOM_LOOK.clone(),
  look: REST_LOOK.clone(),
  roll: 0
};
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function sitDown() {
  if (cam.mode !== 'rest') return;
  setHover(null);
  bootEl.classList.add('gone');
  cam.mode = 'glide'; cam.t = 0;
  cam.fromPos.copy(camera.position); cam.fromLook.copy(cam.look);
  cam.toPos.copy(ZOOM_POS); cam.toLook.copy(ZOOM_LOOK);
  if (cameInBefore) {
    boot.typed = BOOT_BODY.length; boot.tail = true; boot.done = true;
  } else {
    boot.typed = 0; boot.tail = false; boot.done = false;
    boot.target = 0;
    setTimeout(() => { boot.target = BOOT_BODY.length; }, REDUCED ? 0 : 140);
  }
}

function standUp() {
  if (cam.mode !== 'seated' && cam.mode !== 'glide') return;
  document.body.classList.remove('flat');
  cssHost.classList.add('gone');
  standEl.classList.remove('on');
  cssScene.remove(cssObj);
  cam.mode = 'leaving'; cam.t = 0;
  cam.fromPos.copy(camera.position); cam.fromLook.copy(cam.look);
  cam.toPos.copy(REST_POS); cam.toLook.copy(REST_LOOK);
}

/* the world arrives on the glass, then takes the frame */
let worldLoaded = false;
const HOLD = { world: false };   /* held only while the frame is being judged */
function placeWorld() {
  if (worldLoaded || HOLD.world) return;
  worldLoaded = true;
  if (!worldFrame.src) worldFrame.src = 'index.html?door=1';
  cssHost.classList.remove('gone');
  cssScene.add(cssObj);
  standEl.classList.add('on');
  setTimeout(() => {
    if (cam.mode !== 'seated') return;
    dipEl.classList.add('on');
    setTimeout(() => {
      if (cam.mode !== 'seated') { dipEl.classList.remove('on'); return; }
      document.body.classList.add('flat');
      dipEl.classList.remove('on');
    }, 260);
  }, REDUCED ? 60 : 760);
}

window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (!d || d.source !== 'mnemos-world') return;
  if (d.type === 'came-in') ls.set(KEY_CAME_IN, '1');
  /* ESC pressed inside the screen: the key never reaches this document, so
     the world hands it back */
  else if (d.type === 'stand-up') standUp();
});

/* ─────────────────────────── input ─────────────────────────── */
window.addEventListener('pointermove', (ev) => {
  pointerPx.x = ev.clientX; pointerPx.y = ev.clientY;
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  capEl.style.left = ev.clientX + 'px';
  capEl.style.top = ev.clientY + 'px';
});
canvas.addEventListener('click', () => { if (hovered && hovered.id === 'crt') sitDown(); });
standEl.addEventListener('click', standUp);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && (cam.mode === 'seated' || cam.mode === 'glide')) { ev.preventDefault(); standUp(); }
});
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  if (w < 700) { location.replace('index.html'); return; }
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  cssRenderer.setSize(w, h);
});

/* ─────────────────────────── the loop ─────────────────────────── */
/* our own clock — three's is deprecated and we need only two numbers */
const clock = { last: performance.now() / 1000, elapsedTime: 0 };
const tmpPos = new THREE.Vector3(), tmpLook = new THREE.Vector3();
let mouseX = 0, mouseY = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000;
  const dt = Math.min(now - clock.last, 0.05);
  clock.last = now;
  clock.elapsedTime += dt;
  const t = clock.elapsedTime;

  /* the boot text */
  if (boot.typed < boot.target) {
    boot.typed = Math.min(boot.target, boot.typed + Math.max(1, Math.round(dt / 0.0042)));
    if (boot.typed >= BOOT_BODY.length && !boot.tail) {
      boot.tail = true; boot.done = true;
    }
  }
  boot.blink = (t * 0.9) % 1;
  drawScreen();

  /* dust, drifting in the two cones */
  {
    const p = dust.points.geometry.attributes.position;
    for (let i = 0; i < dust.N; i++) {
      const s = dust.seed[i];
      p.array[i * 3 + 0] = dust.base[i * 3 + 0] + Math.sin(t * 0.14 + s) * 0.055;
      p.array[i * 3 + 1] = dust.base[i * 3 + 1] + Math.sin(t * 0.09 + s * 1.7) * 0.075;
      p.array[i * 3 + 2] = dust.base[i * 3 + 2] + Math.cos(t * 0.11 + s * 0.6) * 0.05;
    }
    p.needsUpdate = true;
  }

  /* the camera */
  if (cam.mode === 'glide' || cam.mode === 'leaving') {
    cam.t += dt;
    const k = easeOut(Math.min(1, cam.t / cam.dur));
    tmpPos.lerpVectors(cam.fromPos, cam.toPos, k);
    tmpLook.lerpVectors(cam.fromLook, cam.toLook, k);
    camera.position.copy(tmpPos);
    cam.look.copy(tmpLook);
    camera.lookAt(cam.look);
    /* a slight roll, settling to 0 */
    cam.roll = REDUCED ? 0 : Math.sin(k * Math.PI) * (cam.mode === 'glide' ? 0.030 : -0.020) * (1 - k * 0.4);
    camera.rotation.z += cam.roll;
    if (k >= 1) {
      if (cam.mode === 'glide') { cam.mode = 'seated'; placeWorld(); }
      else { cam.mode = 'rest'; }
    }
  } else if (cam.mode === 'rest') {
    /* the breathe, and ±2° of parallax */
    mouseX += (pointer.x - mouseX) * Math.min(1, dt * 3.2);
    mouseY += (pointer.y - mouseY) * Math.min(1, dt * 3.2);
    const quiet = REDUCED || STILL;
    const bx = quiet ? 0 : Math.sin(t * 0.24) * 0.016;
    const by = quiet ? 0 : Math.sin(t * 0.31 + 1.1) * 0.011;
    const px = quiet ? 0 : mouseX * 0.055;
    const py = quiet ? 0 : mouseY * 0.032;
    camera.position.set(REST_POS.x + bx + px, REST_POS.y + by + py, REST_POS.z + bx * 0.5);
    cam.look.copy(REST_LOOK);
    camera.lookAt(cam.look);
  }

  /* hover — never while seated */
  if (cam.mode === 'rest') {
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(PICKS.map((p) => p.root), true);
    let found = null;
    for (const h of hits) { const p = findPick(h.object); if (p) { found = p; break; } }
    setHover(found);
    if (hovered) drawHair(hovered);
  } else if (hovered) setHover(null);

  grade.uniforms.uTime.value = t;
  composer.render();
  if (cam.mode !== 'rest' && !document.body.classList.contains('flat')) cssRenderer.render(cssScene, camera);
}

/* the fonts must be there before the phosphor is drawn, or the type jumps */
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawScreen());
frame();
setTimeout(() => bootEl.classList.add('gone'), 1400);

/* ─────────────────────────── the test surface ─────────────────────────── */
window.__readingRoom = {
  mode: () => cam.mode,
  hover: () => (hovered ? hovered.id : null),
  caption: () => (capEl.classList.contains('on') ? capEl.textContent : null),
  hoverAt: (id) => {
    const p = PICKS.find((x) => x.id === id);
    if (!p) return null;
    p.root.updateWorldMatrix(true, true);
    const v = new THREE.Vector3();
    p.outline.getWorldPosition(v);
    v.project(camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    pointer.set(v.x, v.y);
    capEl.style.left = x + 'px'; capEl.style.top = y + 'px';
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(PICKS.map((q) => q.root), true);
    let found = null;
    for (const h of hits) { const q = findPick(h.object); if (q) { found = q; break; } }
    setHover(found);
    return { x, y, hit: found ? found.id : null };
  },
  sitDown, standUp,
  bootTyped: () => boot.typed,
  bootText: () => BOOT_BODY.slice(0, boot.typed) + (boot.tail ? ' ' + BOOT_TAIL : ''),
  bootDone: () => boot.done,
  flat: () => document.body.classList.contains('flat'),
  worldFrame: () => worldFrame,
  cssPlaced: () => !cssHost.classList.contains('gone'),
  cameInBefore,
  stewardPresent,
  holdWorld: (v) => { HOLD.world = !!v; },
  /* the look, live — used while art-directing the frame; harmless afterwards */
  tune: (o) => {
    if (o.pos) REST_POS.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.look) REST_LOOK.set(o.look[0], o.look[1], o.look[2]);
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    if (o.exposure) renderer.toneMappingExposure = o.exposure;
    if (o.crt !== undefined) crtLight.intensity = o.crt;
    if (o.win !== undefined) windowLight.intensity = o.win;
    if (o.winEmissive !== undefined) windowGroup.children[0].material.emissiveIntensity = o.winEmissive;
    if (o.sky !== undefined) sky.intensity = o.sky;
    if (o.fog !== undefined) scene.fog.density = o.fog;
    if (o.bloom !== undefined) bloom.strength = o.bloom;
    if (o.bloomThresh !== undefined) bloom.threshold = o.bloomThresh;
    if (o.vig !== undefined) grade.uniforms.uVignette.value = o.vig;
    if (o.grain !== undefined) grade.uniforms.uGrain.value = o.grain;
    if (o.emissive !== undefined) glass.material.emissiveIntensity = o.emissive;
    if (o.glassRough !== undefined) { glass.material.roughness = o.glassRough; glass.material.needsUpdate = true; }
    if (o.skyTop) sky.color.set(o.skyTop);
    if (o.skyGround) sky.groundColor.set(o.skyGround);
    if (o.lamp !== undefined) { lampLight.intensity = o.lamp; lampGroup.userData.bulb.visible = o.lamp > 0; }
    if (o.still !== undefined) STILL = !!o.still;
    return { pos: REST_POS.toArray(), look: REST_LOOK.toArray(), fov: camera.fov };
  },
  where: () => {
    const out = {};
    PICKS.forEach((p) => {
      const v = new THREE.Vector3();
      p.outline.getWorldPosition(v); v.project(camera);
      out[p.id] = [Math.round((v.x * 0.5 + 0.5) * window.innerWidth), Math.round((-v.y * 0.5 + 0.5) * window.innerHeight)];
    });
    const s = SCREEN_POS.clone().project(camera);
    out.screen = [Math.round((s.x * 0.5 + 0.5) * window.innerWidth), Math.round((-s.y * 0.5 + 0.5) * window.innerHeight)];
    return out;
  },
  screenRect: () => scr.getBoundingClientRect(),
  probe: (px, py) => {
    const v = new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
    const h = rc.intersectObjects(scene.children, true).filter((x) => x.object.visible && x.object.isMesh)[0];
    if (!h) return null;
    const w = new THREE.Vector3(); h.object.getWorldPosition(w);
    return { type: h.object.geometry && h.object.geometry.type, at: w.toArray().map((n) => +n.toFixed(2)), dist: +h.distance.toFixed(2) };
  }
};
