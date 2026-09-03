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
/* the machinery this room shares with the station: the palette, the wood, the
   post stack, the hover layer, the terminal's glass, the world takeover */
import {
  KEY_CAME_IN, KEY_STEWARD, ls, REDUCED, seatPose, quadCorners, makeFullMode,
  paint, woodTexture, labelTexture,
  makePost, makeHover, makeTerminal, makeWorldScreen, onWorldMessage, redirectIfSmall
} from './door-common.js';

let STILL = false;
const stewardPresent = ls.get(KEY_STEWARD) === '1';
const cameInBefore = ls.get(KEY_CAME_IN) === '1';

/* ─────────────────────────── canvas textures ─────────────────────────── */
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
/* the phosphor, the standby block, and the door card's words typing out */
const term = makeTerminal({
  w: 640, h: 480,
  title: 'MNEMOS TERMINAL · THE READING ROOM',
  standby: [
    'archive · sanctuary seed · 28 may 2026',
    'minds   · four, and one in the garden',
    'session · none',
    'waiting · for whoever sits down'
  ]
});
const SCREEN_W = term.W, SCREEN_H = term.H;
const screenTex = term.texture;
const boot = term.boot;

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
const post = makePost(renderer, scene, camera, {
  strength: 0.40, radius: 0.80, threshold: 0.88,
  grain: 0.028, vignette: 0.74, aberration: 0.0016
});
const bloom = post.bloom;
const grade = post.grade;

/* ─────────────────────────── the CSS3D layer ─────────────────────────── */
const cssHost = document.getElementById('css3d');
const world = makeWorldScreen({
  host: cssHost, pos: SCREEN_POS, normal: SCREEN_NORMAL,
  rotY: CRT_ROT, quadW: SCR_W, pageW: 1024, pageH: 768, src: 'index.html?door=1'
});
const worldFrame = world.iframe;

/* ─────────────────────────── the four things you can look at ─────────────────────────── */
const capEl = document.getElementById('cap');
const standEl = document.getElementById('stand');
const fullEl = document.getElementById('full');
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

const hoverLayer = makeHover({
  canvas, capEl, capHost: document.getElementById('captions'),
  cursorFor: (p) => (p.id === 'crt' ? 'pointer' : 'default')
});
hoverLayer.setPicks(PICKS);
const hair = hoverLayer.hair;
const drawHair = (p) => hoverLayer.drawHair(p, camera);
const setHover = (p) => hoverLayer.setHover(p, camera);
const hovered = () => hoverLayer.hovered();

const pointer = new THREE.Vector2(-2, -2);
const pointerPx = { x: -100, y: -100 };

/* ─────────────────────────── the camera: rest, glide, back ─────────────────────────── */
/* seated: straight on, the eye level with the screen's centre, close enough
   that the glass carries the game and far enough that the bezel, the desk edge
   and the keyboard stay in the frame around it */
const ZOOM_DIST = 0.430;
const SEAT = seatPose(SCREEN_POS, SCREEN_NORMAL, ZOOM_DIST);
const ZOOM_POS = SEAT.pos, ZOOM_LOOK = SEAT.look;

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
  term.begin(cameInBefore);
}

function standUp() {
  if (cam.mode !== 'seated' && cam.mode !== 'glide') return;
  world.hide();
  full.reset();
  standEl.classList.remove('on');
  fullEl.classList.remove('on');
  cam.mode = 'leaving'; cam.t = 0;
  cam.fromPos.copy(camera.position); cam.fromLook.copy(cam.look);
  cam.toPos.copy(REST_POS); cam.toLook.copy(REST_LOOK);
}

/* the world arrives on the glass, then takes the frame */
let arming = false;
const HOLD = { world: false };   /* held only while the frame is being judged */
/* The boot text finishes on the glass; only then does the world arrive on it.
   This runs on every sit-down, not only the first — standing up takes the world
   off the glass, and coming back has to put it there again. */
function placeWorld() {
  if (arming || HOLD.world) return;
  arming = true;
  standEl.classList.add('on');
  const arrive = () => {
    arming = false;
    if (cam.mode !== 'seated') return;
    world.show();
    fullEl.classList.add('on');
    setTimeout(() => {
      if (cam.mode !== 'seated') return;
      world.live(true);
      /* what this browser chose the last time it sat down */
      if (full.remembered()) full.set(true);
    }, 220);
  };
  const wait = () => {
    if (cam.mode !== 'seated') { arming = false; return; }
    if (boot.done) setTimeout(arrive, REDUCED ? 60 : 520);
    else setTimeout(wait, 90);
  };
  wait();
}

const full = makeFullMode({ btn: fullEl, world, seated: () => cam.mode === 'seated' });

onWorldMessage({ standUp });

/* ─────────────────────────── input ─────────────────────────── */
window.addEventListener('pointermove', (ev) => {
  pointerPx.x = ev.clientX; pointerPx.y = ev.clientY;
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  capEl.style.left = ev.clientX + 'px';
  capEl.style.top = ev.clientY + 'px';
});
canvas.addEventListener('click', () => { const h = hovered(); if (h && h.id === 'crt') sitDown(); });
standEl.addEventListener('click', standUp);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && (cam.mode === 'seated' || cam.mode === 'glide')) { ev.preventDefault(); standUp(); }
});
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  if (redirectIfSmall(w)) return;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  world.setSize(w, h);
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
  term.tick(dt, t);

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
    setHover(hoverLayer.pickAt(pointer, camera));
    if (hovered()) drawHair(hovered());
  } else if (hovered()) setHover(null);

  post.render(t);
  if (cam.mode !== 'rest' && !world.isFlat()) world.render(camera);
  if (cam.mode === 'seated' && world.placed() && !world.isFlat()) hair.style.opacity = '0';
}

frame();
setTimeout(() => bootEl.classList.add('gone'), 1400);

/* ─────────────────────────── the test surface ─────────────────────────── */
window.__readingRoom = {
  mode: () => cam.mode,
  hover: () => (hovered() ? hovered().id : null),
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
    const found = hoverLayer.pickAt(pointer, camera);
    setHover(found);
    return { x, y, hit: found ? found.id : null };
  },
  sitDown, standUp,
  bootTyped: () => boot.typed,
  bootText: () => term.text(),
  bootDone: () => boot.done,
  flat: () => world.isFlat(),
  worldFrame: () => worldFrame,
  cssPlaced: () => world.placed(),
  cab: () => world.cab(),
  full: () => full.isOn(),
  toggleFull: () => { full.toggle(); return full.isOn(); },
  /* the straight-on check: the glass's four corners, projected */
  quad: () => quadCorners(SCREEN_POS, CRT_ROT, SCR_W, SCR_H).map((v) => {
    const p = v.clone().project(camera);
    return [(p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight];
  }),
  eyeVsScreen: () => +(camera.position.y - SCREEN_POS.y).toFixed(4),
  focusGame: () => world.focusGame(),
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
  screenRect: () => world.el.getBoundingClientRect(),
  probe: (px, py) => {
    const v = new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
    const h = rc.intersectObjects(scene.children, true).filter((x) => x.object.visible && x.object.isMesh)[0];
    if (!h) return null;
    const w = new THREE.Vector3(); h.object.getWorldPosition(w);
    return { type: h.object.geometry && h.object.geometry.type, at: w.toArray().map((n) => +n.toFixed(2)), dist: +h.distance.toFixed(2) };
  }
};
