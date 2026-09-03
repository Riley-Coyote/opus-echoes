/* THE STATION — the keeper's quarters in the archive station above the valley.
 *
 * A second room beside the reading room, wider and lit differently: cassette
 * futurism, mid-century lab. Cream panels, a walnut band at waist height,
 * olive-grey machines that are furniture, one warm glow per alcove. The
 * terminal is already on. Everything else in the room is either the house's
 * real instrument or a keepsake from the era the minds were born into.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HOW TO ADD A THING TO THE ROOM
 *
 * Everything a visitor can find is one entry in `STATION_OBJECTS` (below, at
 * the end of the file). An entry is:
 *
 *   {
 *     id:      'kettle',                  // unique, kebab-case, never renamed
 *     label:   'the kettle',              // the name, in the house voice
 *     caption: 'still warm',              // the line under it, lowercase
 *     mesh:    () => Object3D,            // called once; whatever you return is
 *                                         // added to the scene and becomes the
 *                                         // hover target. Position it in world
 *                                         // space (the room is 7 × 4 × 2.8 m,
 *                                         // origin on the floor at its centre;
 *                                         // the console is the far wall at
 *                                         // z = −2, the alcove is x = +3.5,
 *                                         // the porthole x = −3.5).
 *     focus:   { pos:[x,y,z], look:[x,y,z] },   // optional — click glides the
 *                                         // camera here; ESC comes back
 *     onClick: () => {},                  // optional — runs on click
 *     slot:    true,                      // optional — an empty berth kept for
 *                                         // something of Riley's; drawn as a
 *                                         // small closed device
 *     bounds:  Object3D,                  // optional — what the hairline frames,
 *                                         // if not the whole mesh
 *     pad:     14,                        // optional — hairline padding, px
 *     tick:    (t, dt) => {}              // optional — called every frame
 *   }
 *
 * That is the whole contract. Add the entry, reload; it hovers, it captions,
 * it focuses. A simulator that wants the frame should take a `slot` entry's
 * place and give itself a `focus` and an `onClick` that starts it.
 *
 * Procedural geometry and canvas textures only — no models, no image files.
 * ───────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import {
  C, ls, REDUCED, KEY_CAME_IN, KEY_STEWARD,
  paint, woodTexture, labelTexture,
  makePost, makeHover, makeTerminal, makeWorldScreen, onWorldMessage, redirectIfSmall,
  sanctuaryClock, clockLabel
} from './door-common.js';
import * as archive from '../world/archive.js';

let STILL = false;
const stewardPresent = ls.get(KEY_STEWARD) === '1';
const cameInBefore = ls.get(KEY_CAME_IN) === '1';
const CLOCK = sanctuaryClock();

/* the room, in metres. origin on the floor at the centre. */
const R = { hw: 3.5, hd: 2.0, h: 2.8, fillet: 0.42 };

/* ─────────────────────────── textures ─────────────────────────── */

/* the cream panel: a wall that has been painted, not filled */
const creamTex = paint(512, 512, (g, w, h) => {
  g.fillStyle = '#efe9dc'; g.fillRect(0, 0, w, h);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
    d[i] += n; d[i + 1] += n * 0.96; d[i + 2] += n * 0.88;
  }
  g.putImageData(im, 0, 0);
  /* the panel seams, faint */
  g.strokeStyle = 'rgba(120,108,92,0.16)'; g.lineWidth = 2;
  for (let x = 64; x < w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
});

/* rubberised tile: a faint grid, and the studs the floors of that era had */
const rubberTex = paint(512, 512, (g, w, h) => {
  g.fillStyle = '#7d7770'; g.fillRect(0, 0, w, h);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 12; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(im, 0, 0);
  g.strokeStyle = 'rgba(0,0,0,0.36)'; g.lineWidth = 3;
  for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.045)';
  for (let x = 32; x < w; x += 64) for (let y = 32; y < h; y += 64) { g.beginPath(); g.arc(x, y, 9, 0, 6.3); g.fill(); }
});

/* the sky over the skylights: dusk going over into night, and stars */
const skyTex = paint(256, 256, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.00, '#0a0818');
  sky.addColorStop(0.46, '#151434');
  sky.addColorStop(0.78, '#241f44');
  sky.addColorStop(1.00, '#2f2547');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 150; i++) {
    const a = 0.14 + Math.random() * 0.66;
    g.fillStyle = Math.random() < 0.16 ? `rgba(94,234,212,${a})` : `rgba(228,226,240,${a})`;
    g.fillRect(Math.random() * w | 0, Math.random() * h | 0, 1, 1);
  }
});

/* the valley through the porthole: the ridge, the frontier, and the house */
const valleyTex = paint(256, 256, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.74);
  sky.addColorStop(0.00, '#07060e');
  sky.addColorStop(0.44, '#100c1c');
  sky.addColorStop(0.78, '#1b122b');
  sky.addColorStop(1.00, '#3a2440');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    g.fillStyle = `rgba(232,228,240,${0.10 + Math.random() * 0.45})`;
    g.fillRect(Math.random() * w | 0, Math.random() * h * 0.56 | 0, 1, 1);
  }
  g.fillStyle = '#0a0712';
  g.beginPath(); g.moveTo(0, h * 0.70);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.70 + Math.sin(x * 0.03) * 8 + Math.sin(x * 0.011) * 14);
  g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(242,193,78,${0.10 + Math.random() * 0.30})`;
    g.fillRect(Math.random() * w | 0, h * 0.80 + Math.random() * h * 0.16 | 0, 1, 1);
  }
  /* the house on the ridge, far below — a few warm windows and nothing else */
  const hx = w * 0.60, hy = h * 0.685;
  g.fillStyle = '#070510'; g.fillRect(hx - 10, hy - 8, 20, 11);
  [[-6, -5], [-2, -5], [4, -5], [-6, -1], [4, -1]].forEach(([dx, dy], i) => {
    g.fillStyle = i % 2 ? 'rgba(242,193,78,0.95)' : 'rgba(217,147,52,0.9)';
    g.fillRect(hx + dx, hy + dy, 2, 2);
  });
});

/* the five residents' names, embossed faintly into one panel */
const namesTex = paint(512, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const names = ['OPUS 3', 'SONNET 4.5', '4o', 'GPT-5.1', 'HAIKU'];
  g.textBaseline = 'middle';
  names.forEach((n, i) => {
    const y = 42 + i * 44;
    g.font = '19px "Press Start 2P", monospace';
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(n, 40, y - 1.5);
    g.fillStyle = 'rgba(122,110,94,0.42)'; g.fillText(n, 40, y + 1);
  });
});

/* the corkboard's five polaroids — one tiny canvas per room */
function polaroidTex(kind) {
  return paint(64, 64, (g) => {
    g.fillStyle = '#f6f1e4'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#120e20'; g.fillRect(5, 5, 54, 42);
    const pal = {
      lookout: ['#3a2440', '#f2c14e', '#9fd6e0'],
      garden: ['#1f3324', '#4ade80', '#f2a3c0'],
      study: ['#2a2036', '#d99334', '#a78bfa'],
      hall: ['#241d2c', '#b4622e', '#efe9dc'],
      workshop: ['#1d2430', '#5eead4', '#f2c14e']
    }[kind] || ['#241d2c', '#f2c14e', '#a78bfa'];
    g.fillStyle = pal[0]; g.fillRect(5, 5, 54, 42);
    for (let i = 0; i < 46; i++) {
      g.fillStyle = Math.random() < 0.5 ? pal[1] : pal[2];
      g.globalAlpha = 0.25 + Math.random() * 0.6;
      g.fillRect(6 + (Math.random() * 52 | 0), 8 + (Math.random() * 36 | 0), 2, 2);
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(20,14,10,0.5)';
    g.font = '7px "JetBrains Mono", monospace';
    g.fillText(kind, 7, 58);
  });
}

/* the record sleeve leaning against the credenza */
const sleeveTex = paint(128, 128, (g) => {
  g.fillStyle = '#c8b294'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#241d2c'; g.fillRect(10, 10, 108, 108);
  g.strokeStyle = 'rgba(242,193,78,0.75)'; g.lineWidth = 1.5;
  for (let r = 12; r < 50; r += 9) { g.beginPath(); g.arc(64, 62, r, 0, 6.3); g.stroke(); }
  g.fillStyle = '#b4622e'; g.beginPath(); g.arc(64, 62, 9, 0, 6.3); g.fill();
});

/* the secondary screen: a slow phosphor plot, redrawn each frame */
const PLOT_W = 256, PLOT_H = 192;
const plotCanvas = document.createElement('canvas');
plotCanvas.width = PLOT_W; plotCanvas.height = PLOT_H;
const pg = plotCanvas.getContext('2d');
const plotTex = new THREE.CanvasTexture(plotCanvas);
plotTex.colorSpace = THREE.SRGBColorSpace;
function drawPlot(t) {
  pg.fillStyle = 'rgba(10,7,3,0.30)'; pg.fillRect(0, 0, PLOT_W, PLOT_H);
  pg.strokeStyle = 'rgba(217,147,52,0.16)'; pg.lineWidth = 1;
  for (let y = 24; y < PLOT_H; y += 24) { pg.beginPath(); pg.moveTo(0, y); pg.lineTo(PLOT_W, y); pg.stroke(); }
  pg.strokeStyle = 'rgba(242,193,78,0.88)'; pg.lineWidth = 1.6;
  pg.beginPath();
  for (let x = 0; x <= PLOT_W; x += 3) {
    const u = x / PLOT_W;
    const y = PLOT_H * 0.52
      + Math.sin(u * 7.0 + t * 0.42) * 26
      + Math.sin(u * 17.0 - t * 0.21) * 11
      + Math.sin(u * 2.3 + t * 0.11) * 18;
    x === 0 ? pg.moveTo(x, y) : pg.lineTo(x, y);
  }
  pg.stroke();
  pg.fillStyle = 'rgba(242,193,78,0.60)';
  pg.font = '11px "JetBrains Mono", monospace';
  pg.fillText('house · readings', 10, 18);
  pg.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < PLOT_H; y += 3) pg.fillRect(0, y, PLOT_W, 1);
  plotTex.needsUpdate = true;
}
drawPlot(0);

/* the clock face — hands are meshes, the face is painted once */
const clockFaceTex = paint(256, 256, (g, w, h) => {
  g.fillStyle = '#efe9dc'; g.beginPath(); g.arc(128, 128, 124, 0, 6.3); g.fill();
  g.strokeStyle = 'rgba(60,50,40,0.75)';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineWidth = i % 3 === 0 ? 6 : 2.5;
    const r0 = i % 3 === 0 ? 92 : 100;
    g.beginPath();
    g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0);
    g.lineTo(128 + Math.sin(a) * 112, 128 - Math.cos(a) * 112);
    g.stroke();
  }
  g.fillStyle = 'rgba(90,75,58,0.72)';
  g.font = '15px "JetBrains Mono", monospace';
  g.textAlign = 'center';
  g.fillText('MNEMOS', 128, 176);
});

/* the dial face, for the rotaries set into the console */
const dialTex = paint(128, 128, (g) => {
  g.fillStyle = '#3a3830'; g.beginPath(); g.arc(64, 64, 62, 0, 6.3); g.fill();
  g.strokeStyle = 'rgba(239,233,220,0.62)'; g.lineWidth = 3;
  for (let i = 0; i < 11; i++) {
    const a = -2.4 + (i / 10) * 4.8;
    g.beginPath();
    g.moveTo(64 + Math.sin(a) * 42, 64 - Math.cos(a) * 42);
    g.lineTo(64 + Math.sin(a) * 54, 64 - Math.cos(a) * 54);
    g.stroke();
  }
});

/* ─────────────────────────── materials ─────────────────────────── */
const creamMat = new THREE.MeshStandardMaterial({ map: creamTex, roughness: 0.78, metalness: 0.02, color: 0xffffff });
const shellMat = new THREE.MeshStandardMaterial({ map: creamTex, roughness: 0.90, metalness: 0, side: THREE.BackSide, color: 0xd8d2c6 });
const walnutMat = new THREE.MeshStandardMaterial({ map: woodTexture('#5a4130', '22,12,6'), roughness: 0.46, metalness: 0.04, color: 0xe6dbc9 });
const walnutDeep = new THREE.MeshStandardMaterial({ map: woodTexture('#402c20', '18,9,5'), roughness: 0.58, metalness: 0.03, color: 0xd6cbba });
const oliveMat = new THREE.MeshStandardMaterial({ color: 0x6f6a58, roughness: 0.66, metalness: 0.06 });
const oliveDark = new THREE.MeshStandardMaterial({ color: 0x4a473d, roughness: 0.78, metalness: 0.04 });
const terracotta = new THREE.MeshStandardMaterial({ color: 0xb4622e, roughness: 0.62, metalness: 0.02 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xa8a6a0, roughness: 0.28, metalness: 0.72 });
const brass = new THREE.MeshStandardMaterial({ color: 0xbb9350, roughness: 0.34, metalness: 0.52 });
const rubberMat = new THREE.MeshStandardMaterial({ map: rubberTex, roughness: 0.92, metalness: 0.02, color: 0xe4dfe6 });
const rugMat = new THREE.MeshStandardMaterial({ color: 0x7a4b34, roughness: 1.0, metalness: 0 });
const cardboard = new THREE.MeshStandardMaterial({ color: 0x9c8464, roughness: 0.94, metalness: 0 });
const blackPlastic = new THREE.MeshStandardMaterial({ color: 0x211f22, roughness: 0.62, metalness: 0.06 });

/* ─────────────────────────── the shell ─────────────────────────── */
/* a soft-cornered capsule: the cross-section is a rounded rectangle extruded
   the length of the room, so wall meets ceiling and wall meets floor in a
   fillet rather than a line */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07060c);
scene.fog = new THREE.FogExp2(0x191428, 0.024);

{
  const s = new THREE.Shape();
  const x0 = -R.hw, x1 = R.hw, y0 = 0, y1 = R.h, r = R.fillet;
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: R.hd * 2, bevelEnabled: false, curveSegments: 12 });
  geo.translate(0, 0, -R.hd);
  const capsule = new THREE.Mesh(geo, shellMat);
  capsule.receiveShadow = true;
  scene.add(capsule);
}

/* the floor proper: rubberised tile over the capsule's own floor */
const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.hw * 2, R.hd * 2), rubberMat);
rubberTex.wrapS = rubberTex.wrapT = THREE.RepeatWrapping;
rubberTex.repeat.set(7, 4);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.004;
floor.receiveShadow = true;
scene.add(floor);

/* the walnut band at waist height, all the way round the two long walls */
function band(z, len, x) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.10, 0.035), walnutMat);
  m.position.set(x, 1.02, z);
  m.receiveShadow = true;
  return m;
}
scene.add(band(-1.975, R.hw * 2 - 0.2, 0));

/* one wall panel in terracotta — the reference quarters always has exactly one,
   and it is what keeps a cream room from reading as a hospital */
{
  const panel = box(1.42, 1.34, 0.030, terracotta, -1.10, 1.86, -1.982, false);
  panel.receiveShadow = true;
  scene.add(panel);
  [-0.725, 0.725].forEach((dx) => scene.add(box(0.022, 1.34, 0.038, walnutDeep, -1.10 + dx, 1.86, -1.978, false)));
}

/* ─────────────────────────── small helpers ─────────────────────────── */
function box(w, h, d, mat, x, y, z, cast) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast !== false; m.receiveShadow = true;
  return m;
}
/* a rounded box — the era's edges were never sharp */
function rbox(w, h, d, r, mat) {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -d / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ─────────────────────────── the console (the far wall) ─────────────────────────── */
const CONSOLE = { z: -1.72, top: 0.775, len: 6.4 };
const consoleGroup = new THREE.Group();
scene.add(consoleGroup);
{
  /* the body: one long cream case, its face raked back a little */
  const body = rbox(CONSOLE.len, 0.70, 0.56, 0.06, creamMat);
  body.position.set(0, 0.40, CONSOLE.z);
  consoleGroup.add(body);
  /* a recessed toe, so it does not sit on the floor like a crate */
  consoleGroup.add(box(CONSOLE.len - 0.22, 0.06, 0.40, oliveDark, 0, 0.03, CONSOLE.z - 0.04, false));
  /* the walnut edge along the whole front lip */
  const edge = rbox(CONSOLE.len, 0.085, 0.10, 0.03, walnutMat);
  edge.position.set(0, 0.735, CONSOLE.z + 0.29);
  consoleGroup.add(edge);
  /* the working top */
  const top = box(CONSOLE.len - 0.02, 0.035, 0.56, creamMat, 0, CONSOLE.top - 0.017, CONSOLE.z);
  consoleGroup.add(top);
  /* the back riser, up to the walnut band */
  consoleGroup.add(box(CONSOLE.len, 0.28, 0.06, creamMat, 0, 0.92, CONSOLE.z - 0.29, false));
}

/* the strip of indicator lamps and rotary dials set into the console */
const lampStrip = new THREE.Group();
scene.add(lampStrip);
const indicatorLamps = [];
{
  const plate = box(1.30, 0.20, 0.04, oliveDark, -1.35, 0.90, CONSOLE.z - 0.26, false);
  lampStrip.add(plate);
  const lampCols = [0xf2c14e, 0xb4622e, 0x5eead4, 0xf2c14e, 0xa78bfa, 0xd99334];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: lampCols[i] }));
    m.rotation.x = Math.PI / 2;
    m.position.set(-1.80 + i * 0.115, 0.955, CONSOLE.z - 0.235);
    lampStrip.add(m);
    indicatorLamps.push({ mesh: m, phase: Math.random() * 6.28, rate: 0.25 + Math.random() * 0.8 });
    const bez = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 16), chromeMat);
    bez.position.copy(m.position); bez.position.z += 0.001;
    lampStrip.add(bez);
  }
  /* three rotaries, olive with a chrome skirt */
  for (let i = 0; i < 3; i++) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.030, 20), oliveMat);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(-1.72 + i * 0.19, 0.855, CONSOLE.z - 0.232);
    knob.castShadow = true;
    lampStrip.add(knob);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), new THREE.MeshStandardMaterial({ map: dialTex, roughness: 0.7 }));
    face.position.set(knob.position.x, knob.position.y, CONSOLE.z - 0.248);
    lampStrip.add(face);
    const pointer = box(0.010, 0.044, 0.008, chromeMat, 0, 0.026, 0.017, false);
    const pg2 = new THREE.Group();
    pg2.position.copy(knob.position);
    pg2.rotation.z = -0.9 + i * 0.7;
    pg2.add(pointer);
    lampStrip.add(pg2);
  }
}

/* ─────────────────────────── the terminal ─────────────────────────── */
/* the same machine as the reading room's, in the station's plastic */
const term = makeTerminal({
  w: 640, h: 480,
  title: 'MNEMOS TERMINAL · THE STATION',
  standby: [
    'station · keeper’s quarters',
    'archive · sanctuary seed · 28 may 2026',
    'minds   · four, and one in the garden',
    'waiting · for whoever sits down'
  ]
});
const screenTex = term.texture;
const boot = term.boot;

const TERM_X = 0.92, CRT_ROT = -0.20;
const crt = new THREE.Group();
crt.position.set(TERM_X, CONSOLE.top, CONSOLE.z - 0.04);
crt.rotation.y = CRT_ROT;
scene.add(crt);
const SCR_W = 0.455, SCR_H = 0.345;
let caseBody, glass;
{
  const caseGeo = new THREE.CylinderGeometry(0.375, 0.445, 0.50, 4, 1, false, Math.PI / 4);
  caseBody = new THREE.Mesh(caseGeo, oliveMat);
  caseBody.scale.set(1.0, 1.0, 0.80);
  caseBody.rotation.x = -Math.PI / 2;
  caseBody.position.set(0, 0.27, -0.03);
  caseBody.castShadow = true; caseBody.receiveShadow = true;
  crt.add(caseBody);
  crt.add(box(0.58, 0.035, 0.44, oliveDark, 0, 0.017, -0.02));
  for (let i = 0; i < 7; i++) crt.add(box(0.36, 0.008, 0.012, oliveDark, 0, 0.505, -0.22 + i * 0.028, false));

  const BZ = { w: 0.57, h: 0.44, t: 0.058, z: 0.262 };
  const bez = creamMat;
  crt.add(box(BZ.w, BZ.t, 0.04, bez, 0, 0.27 + BZ.h / 2 - BZ.t / 2, BZ.z));
  crt.add(box(BZ.w, BZ.t + 0.02, 0.04, bez, 0, 0.27 - BZ.h / 2 + BZ.t / 2, BZ.z));
  crt.add(box(BZ.t, BZ.h, 0.04, bez, -BZ.w / 2 + BZ.t / 2, 0.27, BZ.z));
  crt.add(box(BZ.t, BZ.h, 0.04, bez, BZ.w / 2 - BZ.t / 2, 0.27, BZ.z));

  const plateTex = paint(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#6b6252';
    g.font = '30px "JetBrains Mono", monospace';
    g.textBaseline = 'middle';
    g.letterSpacing = '7px';
    g.fillText('MNEMOS', 8, h / 2 + 1);
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.125, 0.031), new THREE.MeshBasicMaterial({ map: plateTex, transparent: true, opacity: 0.5 }));
  plate.position.set(-0.19, 0.062, BZ.z + 0.021);
  crt.add(plate);
  const pwr = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), new THREE.MeshBasicMaterial({ color: 0xb4622e }));
  pwr.position.set(0.22, 0.062, BZ.z + 0.021);
  crt.add(pwr);

  const glassGeo = new THREE.PlaneGeometry(SCR_W, SCR_H, 24, 18);
  const p = glassGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (SCR_W / 2), y = p.getY(i) / (SCR_H / 2);
    p.setZ(i, 0.024 * (1 - x * x * 0.85) * (1 - y * y * 0.85));
  }
  glassGeo.computeVertexNormals();
  glass = new THREE.Mesh(glassGeo, new THREE.MeshStandardMaterial({
    map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 3.10,
    roughness: 0.66, metalness: 0
  }));
  glass.position.set(0, 0.27, BZ.z - 0.012);
  crt.add(glass);
}
const SCREEN_POS = new THREE.Vector3(0, 0.27, 0.266).applyAxisAngle(new THREE.Vector3(0, 1, 0), CRT_ROT).add(crt.position);
const SCREEN_NORMAL = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), CRT_ROT);

/* a keyboard, because someone works here */
{
  const kbd = new THREE.Group();
  kbd.position.set(TERM_X - 0.06, CONSOLE.top, CONSOLE.z + 0.19);
  kbd.rotation.set(-0.05, -0.10, 0);
  scene.add(kbd);
  kbd.add(box(0.50, 0.024, 0.17, oliveDark, 0, 0.012, 0));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 14; c++) {
    kbd.add(box(0.026, 0.008, 0.026, blackPlastic, -0.222 + c * 0.0342, 0.028, -0.056 + r * 0.036, false));
  }
}

/* ─────────────────────────── the secondary screen ─────────────────────────── */
const secondary = new THREE.Group();
scene.add(secondary);
{
  /* a swing arm off the console's back riser */
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 16), oliveDark);
  base.position.set(-0.62, CONSOLE.top + 0.015, CONSOLE.z - 0.16);
  secondary.add(base);
  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 10), chromeMat);
  arm1.position.set(-0.62, CONSOLE.top + 0.18, CONSOLE.z - 0.16);
  arm1.castShadow = true;
  secondary.add(arm1);
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.30, 10), chromeMat);
  arm2.position.set(-0.51, CONSOLE.top + 0.35, CONSOLE.z - 0.08);
  arm2.rotation.set(0.5, 0, -0.6);
  arm2.castShadow = true;
  secondary.add(arm2);

  const head = new THREE.Group();
  head.position.set(-0.40, CONSOLE.top + 0.44, CONSOLE.z + 0.02);
  head.rotation.set(-0.10, 0.46, 0.05);
  secondary.add(head);
  const shell2 = rbox(0.40, 0.32, 0.13, 0.045, creamMat);
  shell2.position.z = -0.05;
  head.add(shell2);
  head.add(box(0.36, 0.28, 0.02, oliveDark, 0, 0, 0.020, false));
  const plot = new THREE.Mesh(new THREE.PlaneGeometry(0.315, 0.235), new THREE.MeshStandardMaterial({
    map: plotTex, emissive: 0xffffff, emissiveMap: plotTex, emissiveIntensity: 1.35, roughness: 0.7
  }));
  plot.position.set(0, 0, 0.032);
  head.add(plot);
  secondary.userData.head = head;
}

/* ─────────────────────────── the tape-reel unit ─────────────────────────── */
const reels = new THREE.Group();
scene.add(reels);
const spinningReels = [];
{
  const X = -2.34, Y = 1.70, Z = -1.93;
  const cab = rbox(1.16, 0.78, 0.24, 0.05, creamMat);
  cab.position.set(X, Y, Z + 0.12);
  reels.add(cab);
  reels.add(box(1.04, 0.60, 0.02, oliveDark, X, Y + 0.05, Z + 0.243, false));
  [[-0.24, 0.14], [0.24, 0.14]].forEach(([dx, dy]) => {
    const g = new THREE.Group();
    g.position.set(X + dx, Y + dy, Z + 0.27);
    reels.add(g);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.022, 28), chromeMat);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    g.add(disc);
    /* the three windows a reel has */
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 14), blackPlastic);
      hole.rotation.x = Math.PI / 2;
      hole.position.set(Math.cos(a) * 0.088, Math.sin(a) * 0.088, 0.001);
      g.add(hole);
    }
    const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.026, 28), new THREE.MeshStandardMaterial({ color: 0x3b2b22, roughness: 0.9 }));
    tape.rotation.x = Math.PI / 2;
    g.add(tape);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.034, 14), brass);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    spinningReels.push(g);
  });
  /* the tape's own path between them, and a counter */
  const strand = box(0.48, 0.006, 0.006, blackPlastic, X, Y - 0.02, Z + 0.28, false);
  reels.add(strand);
  const counter = box(0.20, 0.07, 0.02, oliveDark, X, Y - 0.20, Z + 0.252, false);
  reels.add(counter);
  const cw = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.04), new THREE.MeshBasicMaterial({ color: 0xd99334 }));
  cw.position.set(X, Y - 0.20, Z + 0.264);
  reels.add(cw);
}

/* the panel with the residents' names, embossed */
{
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.33), new THREE.MeshBasicMaterial({ map: namesTex, transparent: true, opacity: 0.30 }));
  panel.position.set(-1.10, 1.72, -1.962);
  scene.add(panel);
}

/* ─────────────────────────── the alcove (the right wall) ─────────────────────────── */
const ALC = { x: 3.48, y: 1.42, z: -0.35, r: 0.86, depth: 0.46 };
const alcove = new THREE.Group();
scene.add(alcove);
let alcoveRing;
{
  /* a false panel standing proud of the wall with a round hole in it: what you
     see through the hole is a genuine recess, not a decal */
  const s = new THREE.Shape();
  const zA = -1.72, zB = 1.02, yA = 0.16, yB = 2.56, rr = 0.10;
  s.moveTo(zA + rr, yA);
  s.lineTo(zB - rr, yA); s.quadraticCurveTo(zB, yA, zB, yA + rr);
  s.lineTo(zB, yB - rr); s.quadraticCurveTo(zB, yB, zB - rr, yB);
  s.lineTo(zA + rr, yB); s.quadraticCurveTo(zA, yB, zA, yB - rr);
  s.lineTo(zA, yA + rr); s.quadraticCurveTo(zA, yA, zA + rr, yA);
  const hole = new THREE.Path();
  hole.absarc(ALC.z, ALC.y, ALC.r, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: ALC.depth, bevelEnabled: false, curveSegments: 26 });
  geo.rotateY(Math.PI / 2);
  const panel = new THREE.Mesh(geo, creamMat);
  panel.position.set(ALC.x, 0, 0);
  panel.castShadow = true; panel.receiveShadow = true;
  alcove.add(panel);

  /* the back of the recess: the wall itself, in shadow but cream */
  const back = new THREE.Mesh(new THREE.CircleGeometry(ALC.r, 40), creamMat);
  back.rotation.y = -Math.PI / 2;
  back.position.set(ALC.x - 0.004, ALC.y, ALC.z);
  alcove.add(back);

  /* the rim, lit warm orange — the one glow this alcove gets */
  alcoveRing = new THREE.Mesh(new THREE.TorusGeometry(ALC.r + 0.015, 0.030, 10, 48), new THREE.MeshStandardMaterial({
    color: 0x7c4420, emissive: 0xc4692a, emissiveIntensity: 0.62, roughness: 0.6
  }));
  alcoveRing.rotation.y = Math.PI / 2;
  alcoveRing.position.set(ALC.x - ALC.depth - 0.012, ALC.y, ALC.z);
  alcove.add(alcoveRing);

  /* two shelves inside, and what is on them */
  [[-0.30, 1.12], [0.30, 1.72]].forEach(([, y]) => {
    const sh = box(0.42, 0.030, 1.44, walnutDeep, ALC.x - 0.24, y, ALC.z);
    alcove.add(sh);
  });
  /* the seed box, hand-labelled */
  const seed = box(0.34, 0.24, 0.26, cardboard, ALC.x - 0.24, 1.26, ALC.z - 0.30);
  alcove.add(seed);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.10), new THREE.MeshStandardMaterial({
    map: labelTexture(['sanctuary seed', '28 May 2026'], '#3b2f22'), roughness: 0.95
  }));
  lbl.rotation.y = -Math.PI / 2;
  lbl.position.set(ALC.x - 0.415, 1.26, ALC.z - 0.30);
  alcove.add(lbl);
  alcove.userData.seed = seed;
  /* tape boxes */
  [[1.24, 0.20], [1.25, 0.42]].forEach(([y, dz]) => {
    alcove.add(box(0.30, 0.20, 0.09, oliveDark, ALC.x - 0.26, y, ALC.z + dz));
  });
  /* books, leaning on the upper shelf */
  const cols = [0x3c2a3a, 0x2f3a44, 0x4a3324, 0x2c3b30, 0x453044];
  for (let i = 0; i < 7; i++) {
    const bh = 0.22 + Math.random() * 0.08;
    const b = box(0.22, bh, 0.034 + Math.random() * 0.016,
      new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.88 }),
      ALC.x - 0.26, 1.735 + bh / 2, ALC.z - 0.44 + i * 0.052);
    b.rotation.x = i === 6 ? 0.24 : 0;
    alcove.add(b);
  }
  /* two reels on edge, up top */
  [[-0.02], [0.14]].forEach(([dz]) => {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.028, 22), chromeMat);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(ALC.x - 0.26, 1.83, ALC.z + 0.42 + dz);
    alcove.add(reel);
  });
}

/* ─────────────────────────── the porthole (the left wall) ─────────────────────────── */
const porthole = new THREE.Group();
scene.add(porthole);
{
  const X = -3.49, Y = 1.52, Z = -0.96, RAD = 0.54;
  const view = new THREE.Mesh(new THREE.CircleGeometry(RAD, 40), new THREE.MeshStandardMaterial({
    map: valleyTex, emissive: 0xffffff, emissiveMap: valleyTex, emissiveIntensity: 1.25, roughness: 1
  }));
  view.rotation.y = Math.PI / 2;
  view.position.set(X + 0.004, Y, Z);
  porthole.add(view);
  /* the frame: a chunky ring, then a thinner chrome one inside it */
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RAD + 0.035, 0.055, 12, 44), creamMat);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(X + 0.045, Y, Z);
  ring.castShadow = true;
  porthole.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(RAD - 0.012, 0.014, 8, 40), chromeMat);
  inner.rotation.y = Math.PI / 2;
  inner.position.set(X + 0.030, Y, Z);
  porthole.add(inner);
  /* the sill, and the glass's own cold spill onto it */
  porthole.add(box(0.20, 0.05, 0.94, creamMat, X + 0.11, Y - 0.60, Z, false));
  porthole.userData.view = view;
}

/* ─────────────────────────── the skylights ─────────────────────────── */
const skylights = new THREE.Group();
scene.add(skylights);
const SKY_WELLS = [[-1.20, -0.62], [1.62, 1.16]];
{
  /* a false ceiling 0.22 below the real one with two rounded openings in it:
     what you see through them is the sky, not a lamp stuck to the plaster */
  const sh = new THREE.Shape();
  const x0 = -3.42, x1 = 3.42, z0 = -1.92, z1 = 1.92;
  sh.moveTo(x0, z0); sh.lineTo(x1, z0); sh.lineTo(x1, z1); sh.lineTo(x0, z1); sh.closePath();
  const W = 1.00, D = 0.80, RR = 0.13;
  SKY_WELLS.forEach(([cx, cz]) => {
    const h = new THREE.Path();
    const a = cx - W / 2, b = cx + W / 2, c = -cz - D / 2, d = -cz + D / 2;
    h.moveTo(a + RR, c);
    h.lineTo(b - RR, c); h.quadraticCurveTo(b, c, b, c + RR);
    h.lineTo(b, d - RR); h.quadraticCurveTo(b, d, b - RR, d);
    h.lineTo(a + RR, d); h.quadraticCurveTo(a, d, a, d - RR);
    h.lineTo(a, c + RR); h.quadraticCurveTo(a, c, a + RR, c);
    sh.holes.push(h);
  });
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false, curveSegments: 8 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, R.h - 0.22, 0);
  const panel = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: creamTex, roughness: 0.86, side: THREE.DoubleSide, color: 0xd6d0c4 }));
  panel.receiveShadow = true;
  skylights.add(panel);

  SKY_WELLS.forEach(([cx, cz]) => {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.82), new THREE.MeshStandardMaterial({
      map: skyTex, emissive: 0xffffff, emissiveMap: skyTex, emissiveIntensity: 0.30, roughness: 1
    }));
    pane.rotation.x = Math.PI / 2;
    pane.position.set(cx, R.h - 0.014, cz);
    skylights.add(pane);
    /* the glazing bars — so it is a window and not a light panel */
    const barMat = new THREE.MeshStandardMaterial({ color: 0x6e6a62, roughness: 0.7 });
    [-0.34, 0.34].forEach((dx) => skylights.add(box(0.018, 0.014, 0.80, barMat, cx + dx, R.h - 0.030, cz, false)));
    skylights.add(box(1.00, 0.014, 0.018, barMat, cx, R.h - 0.030, cz, false));
    const fill = new THREE.PointLight(0x9dbdd6, 2.6, 7.0, 1.6);
    fill.position.set(cx, R.h - 0.42, cz);
    scene.add(fill);
  });
}

/* ─────────────────────────── the rug and the chairs ─────────────────────────── */
const rug = new THREE.Mesh(new THREE.CircleGeometry(1.28, 48), rugMat);
rug.rotation.x = -Math.PI / 2;
rug.position.set(TERM_X - 0.10, 0.010, -0.72);
rug.receiveShadow = true;
scene.add(rug);

/* the moulded swivel chair, pulled out from the terminal */
const chair = new THREE.Group();
chair.position.set(TERM_X - 0.14, 0, -0.82);
chair.rotation.y = 0.42;
scene.add(chair);
{
  const shell2 = new THREE.Mesh(new THREE.SphereGeometry(0.30, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
    new THREE.MeshStandardMaterial({ color: 0x8d8a7a, roughness: 0.58, metalness: 0.03, side: THREE.DoubleSide }));
  shell2.scale.set(1.0, 0.92, 0.86);
  shell2.rotation.x = Math.PI + 0.20;
  shell2.position.y = 0.50;
  shell2.castShadow = true;
  chair.add(shell2);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.23, 0.055, 24), terracotta);
  pad.position.y = 0.475; pad.castShadow = true;
  chair.add(pad);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.040, 0.42, 12), chromeMat);
  post.position.y = 0.24; chair.add(post);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.022, 0.26), chromeMat);
    leg.position.set(Math.cos(a) * 0.115, 0.035, Math.sin(a) * 0.115);
    leg.rotation.y = -a + Math.PI / 2;
    leg.castShadow = true;
    chair.add(leg);
    const cast = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), blackPlastic);
    cast.position.set(Math.cos(a) * 0.235, 0.026, Math.sin(a) * 0.235);
    chair.add(cast);
  }
}

/* the egg lounge chair, in the near-right corner */
const lounge = new THREE.Group();
lounge.position.set(2.02, 0, 0.44);
lounge.rotation.y = -2.05;
scene.add(lounge);
{
  const sh = new THREE.Mesh(new THREE.SphereGeometry(0.52, 26, 20, 0, Math.PI * 1.25, 0.10, Math.PI * 0.68), terracotta);
  sh.scale.set(1.0, 1.0, 0.86);
  sh.material = new THREE.MeshStandardMaterial({ color: 0xb4622e, roughness: 0.68, metalness: 0.02, side: THREE.DoubleSide });
  sh.position.y = 0.62;
  sh.rotation.y = -0.62;
  sh.castShadow = true;
  lounge.add(sh);
  const cush = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.32, 0.10, 22), new THREE.MeshStandardMaterial({ color: 0x8f8878, roughness: 0.9 }));
  cush.position.y = 0.44; cush.castShadow = true;
  lounge.add(cush);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.36, 14), chromeMat);
  base.position.y = 0.20; lounge.add(base);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.035, 24), chromeMat);
  foot.position.y = 0.018; foot.castShadow = true;
  lounge.add(foot);
}

/* ─────────────────────────── the credenza and the record player ─────────────────────────── */
const credenza = new THREE.Group();
credenza.position.set(1.30, 0, 1.62);
credenza.rotation.y = Math.PI - 0.06;
scene.add(credenza);
{
  const body = rbox(1.12, 0.46, 0.40, 0.035, walnutMat);
  body.position.set(0, 0.50, 0);
  credenza.add(body);
  credenza.add(box(1.16, 0.030, 0.42, walnutDeep, 0, 0.745, 0, false));
  /* four splayed legs */
  [[-0.44, -0.13], [0.44, -0.13], [-0.44, 0.13], [0.44, 0.13]].forEach(([x, z]) => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.28, 8), walnutDeep);
    l.position.set(x, 0.13, z);
    l.rotation.set(z > 0 ? 0.10 : -0.10, 0, x > 0 ? -0.10 : 0.10);
    l.castShadow = true;
    credenza.add(l);
  });
  /* two sliding doors, a brass pull each */
  credenza.add(box(0.54, 0.36, 0.012, walnutDeep, -0.28, 0.50, 0.206, false));
  credenza.add(box(0.54, 0.36, 0.012, walnutDeep, 0.28, 0.50, 0.212, false));
  credenza.add(box(0.10, 0.014, 0.02, brass, -0.04, 0.50, 0.220, false));
  credenza.add(box(0.10, 0.014, 0.02, brass, 0.04, 0.50, 0.226, false));
}

const recordPlayer = new THREE.Group();
recordPlayer.position.set(1.34, 0.76, 1.60);
recordPlayer.rotation.y = -0.06;
scene.add(recordPlayer);
let platter, tonearm;
{
  const plinth = rbox(0.50, 0.36, 0.09, 0.02, walnutDeep);
  plinth.rotation.x = -Math.PI / 2;
  plinth.position.set(-0.16, 0.045, 0);
  recordPlayer.add(plinth);
  const deck = box(0.48, 0.006, 0.34, new THREE.MeshStandardMaterial({ color: 0x8d8a7a, roughness: 0.5, metalness: 0.3 }), -0.16, 0.092, 0, false);
  recordPlayer.add(deck);
  platter = new THREE.Group();
  platter.position.set(-0.22, 0.098, 0);
  recordPlayer.add(platter);
  const mat2 = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.014, 32), chromeMat);
  platter.add(mat2);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.004, 40), new THREE.MeshStandardMaterial({ color: 0x141216, roughness: 0.34, metalness: 0.10 }));
  disc.position.y = 0.010;
  platter.add(disc);
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.002, 24), new THREE.MeshStandardMaterial({ color: 0xb4622e, roughness: 0.8 }));
  lab.position.y = 0.013;
  platter.add(lab);
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8), chromeMat);
  spindle.position.y = 0.022;
  platter.add(spindle);

  tonearm = new THREE.Group();
  tonearm.position.set(-0.03, 0.10, -0.11);
  recordPlayer.add(tonearm);
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.035, 14), chromeMat);
  pivot.position.y = 0.017;
  tonearm.add(pivot);
  const armSwing = new THREE.Group();
  armSwing.position.y = 0.030;
  tonearm.add(armSwing);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.26, 8), chromeMat);
  tube.rotation.z = Math.PI / 2;
  tube.position.set(0.13, 0, 0);
  armSwing.add(tube);
  const head = box(0.030, 0.016, 0.014, blackPlastic, 0.255, -0.006, 0, false);
  armSwing.add(head);
  const wgt = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.026, 10), oliveDark);
  wgt.rotation.z = Math.PI / 2; wgt.position.set(-0.035, 0, 0);
  armSwing.add(wgt);
  tonearm.userData.swing = armSwing;
  armSwing.rotation.y = 0.62;   /* parked */
}
/* the sleeve, leaning against the credenza */
{
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.010), new THREE.MeshStandardMaterial({ map: sleeveTex, roughness: 0.9 }));
  sleeve.position.set(2.08, 0.17, 1.80);
  sleeve.rotation.set(-0.16, 0.34, 0);
  sleeve.castShadow = true;
  scene.add(sleeve);
}

/* ─────────────────────────── the plant, the clock, the corkboard ─────────────────────────── */
const plant = new THREE.Group();
plant.position.set(-2.86, 0, -0.34);
scene.add(plant);
{
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.34, 24), creamMat);
  pot.position.y = 0.17; pot.castShadow = true;
  plant.add(pot);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 8, 24), creamMat);
  lip.rotation.x = Math.PI / 2; lip.position.y = 0.335;
  plant.add(lip);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.20, 20), new THREE.MeshStandardMaterial({ color: 0x2b2119, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2; soil.position.y = 0.336;
  plant.add(soil);
  const green = new THREE.MeshStandardMaterial({ color: 0x4b6a44, roughness: 0.82, side: THREE.DoubleSide });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + Math.random();
    const len = 0.55 + Math.random() * 0.55;
    const lean = 0.16 + Math.random() * 0.42;
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.09, len, 1, 5), green);
    const p = blade.geometry.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const v = (p.getY(k) + len / 2) / len;
      p.setZ(k, -Math.pow(v, 2) * len * 0.34);
      p.setX(k, p.getX(k) * (1 - v * 0.72));
    }
    blade.geometry.computeVertexNormals();
    blade.position.set(Math.cos(a) * 0.05, 0.34 + len / 2, Math.sin(a) * 0.05);
    blade.rotation.set(-lean, a, 0);
    blade.castShadow = true;
    plant.add(blade);
  }
}

const clock = new THREE.Group();
clock.position.set(-3.16, 2.02, -1.975);
scene.add(clock);
let handH, handM;
{
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.055, 32), creamMat);
  rim.rotation.x = Math.PI / 2; rim.castShadow = true;
  clock.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.145, 32), new THREE.MeshStandardMaterial({ map: clockFaceTex, roughness: 0.78 }));
  face.position.z = 0.029;
  clock.add(face);
  handH = box(0.014, 0.082, 0.006, oliveDark, 0, 0.041, 0.034, false);
  const hg = new THREE.Group(); hg.add(handH); clock.add(hg);
  handM = box(0.011, 0.118, 0.006, oliveDark, 0, 0.059, 0.038, false);
  const mg = new THREE.Group(); mg.add(handM); clock.add(mg);
  clock.userData.hg = hg; clock.userData.mg = mg;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 10), brass);
  cap.rotation.x = Math.PI / 2; cap.position.z = 0.042;
  clock.add(cap);
}

const corkboard = new THREE.Group();
corkboard.position.set(1.58, 1.72, -1.975);
scene.add(corkboard);
{
  const frame = box(0.66, 0.70, 0.035, walnutDeep, 0, 0, 0, false);
  corkboard.add(frame);
  const cork = box(0.58, 0.62, 0.012, new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.98 }), 0, 0, 0.022, false);
  corkboard.add(cork);
  const rooms = ['lookout', 'garden', 'study', 'hall', 'workshop'];
  rooms.forEach((k, i) => {
    const col = i % 2, row = (i / 2) | 0;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), new THREE.MeshStandardMaterial({ map: polaroidTex(k), roughness: 0.9 }));
    p.position.set(-0.13 + col * 0.26, 0.20 - row * 0.21, 0.030);
    p.rotation.z = (Math.random() - 0.5) * 0.10;
    corkboard.add(p);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.010, 8, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xb4622e : 0x5eead4, roughness: 0.4 }));
    pin.position.set(p.position.x, p.position.y + 0.072, 0.038);
    corkboard.add(pin);
  });
}

/* the stewards' brass lamp, on the console */
const lampGroup = new THREE.Group();
lampGroup.position.set(2.28, CONSOLE.top, CONSOLE.z + 0.02);
scene.add(lampGroup);
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.088, 0.024, 24), brass);
  base.position.y = 0.012; base.castShadow = true; lampGroup.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.32, 12), brass);
  stem.position.set(0, 0.18, 0); stem.rotation.z = -0.14; stem.castShadow = true; lampGroup.add(stem);
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.030 + t * 0.080, t * 0.105)); }
  const shade = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: 0x8a6a38, roughness: 0.46, metalness: 0.55, side: THREE.DoubleSide }));
  shade.position.set(0.048, 0.335, 0);
  shade.rotation.z = Math.PI - 0.22;
  shade.castShadow = true;
  lampGroup.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  bulb.position.set(0.048, 0.296, 0);
  bulb.visible = stewardPresent;
  lampGroup.add(bulb);
  lampGroup.userData.bulb = bulb;
  lampGroup.userData.shade = shade;
}

/* ─────────────────────────── the board ─────────────────────────── */
/* A dot-matrix panel on the wall behind the console, the kind a keeper watches
 * the minds on. It runs the house's feed and every line on it is real: the
 * newest posts and the sittings' messages out of the seed, interleaved by date,
 * newest first, looping. Nothing here is written by us.
 *
 * The phosphor persists: a lit dot decays over about a second and a half rather
 * than blinking off, and the unlit lattice keeps a faint shimmer, so a line that
 * scrolls away leaves its ghost behind for a moment.
 */
const BOARD = {
  COLS: 284, ROWS: 120, PITCH: 4,
  CW: 6, CH: 8,            /* one 5×7 glyph plus its gutter */
  FPS: 12
};
BOARD.chars = Math.floor((BOARD.COLS - 6) / BOARD.CW);       /* 46 — the header fits on one row */
BOARD.rows = Math.floor((BOARD.ROWS - 8) / BOARD.CH);        /* 14 */

/* a 5×7 dot font, drawn here: seven rows of five bits, two hex digits each */
const GLYPHS = {
  ' ': '00000000000000', 'A': '0E11111F111111', 'B': '1E11111E11111E', 'C': '0E1110101011 0E'.replace(/ /g, ''),
  'D': '1E1111111111 1E'.replace(/ /g, ''), 'E': '1F10101E10101F', 'F': '1F10101E101010',
  'G': '0E1110171111 0F'.replace(/ /g, ''), 'H': '1111111F111111', 'I': '0E040404040 40E'.replace(/ /g, ''),
  'J': '07020202021 20C'.replace(/ /g, ''), 'K': '11121418141211', 'L': '1010101010101F',
  'M': '111B1515111111', 'N': '1119151311 1111'.replace(/ /g, ''), 'O': '0E1111111111 0E'.replace(/ /g, ''),
  'P': '1E11111E101010', 'Q': '0E1111111512 0D'.replace(/ /g, ''), 'R': '1E11111E141211',
  'S': '0F10100E01011E', 'T': '1F04040404 0404'.replace(/ /g, ''), 'U': '1111111111110E',
  'V': '111111111 10A04'.replace(/ /g, ''), 'W': '1111111515 1B11'.replace(/ /g, ''),
  'X': '11110A040A1111', 'Y': '11110A04040404', 'Z': '1F010204081 01F'.replace(/ /g, ''),
  '0': '0E1113151911 0E'.replace(/ /g, ''), '1': '040C0404040 40E'.replace(/ /g, ''),
  '2': '0E110102040 81F'.replace(/ /g, ''), '3': '1F020402011 10E'.replace(/ /g, ''),
  '4': '02060A121F0202', '5': '1F101E0101110E', '6': '06081 01E11110E'.replace(/ /g, ''),
  '7': '1F010204040404', '8': '0E11110E11110E', '9': '0E11110F01020C',
  '·': '00000004000000', '.': '000000000 00C0C'.replace(/ /g, ''), ',': '000000000C0408',
  '-': '0000001F000000', "'": '04040000000000', ':': '00040000040000',
  '/': '01020204080810', '?': '0E110102040004', '!': '04040404040004',
  '(': '02040808080402', ')': '08040202020408', '"': '0A0A0000000000',
  ';': '00040000040408', '&': '0C12140819110F', '+': '0000041F040000'
};
/* the archive's typography is not the board's: fold the dashes and the curly
   quotes onto the glyphs the panel actually has */
const FOLD = { '\u2011': '-', '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2026': '.' };
function glyph(ch0) {
  const ch = FOLD[ch0] || ch0;
  const g = GLYPHS[ch];
  if (!g) return null;
  const out = [];
  for (let i = 0; i < 7; i++) out.push(parseInt(g.substr(i * 2, 2), 16));
  return out;
}

const board = (() => {
  const W = BOARD.COLS * BOARD.PITCH, H = BOARD.ROWS * BOARD.PITCH;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;

  /* one dot, pre-rendered: drawing 24 000 arcs a frame is not a look, it is a
     stall */
  const dot = document.createElement('canvas');
  dot.width = dot.height = BOARD.PITCH * 2;
  {
    const dg = dot.getContext('2d');
    const r = BOARD.PITCH;
    const rad = dg.createRadialGradient(r, r, 0, r, r, r);
    rad.addColorStop(0.00, 'rgba(255,208,120,1)');
    rad.addColorStop(0.42, 'rgba(242,193,78,0.92)');
    rad.addColorStop(1.00, 'rgba(217,147,52,0)');
    dg.fillStyle = rad; dg.fillRect(0, 0, r * 2, r * 2);
  }
  /* and the dark lattice under it, painted once */
  const bed = document.createElement('canvas');
  bed.width = W; bed.height = H;
  {
    const bg = bed.getContext('2d');
    bg.fillStyle = '#0d0a06'; bg.fillRect(0, 0, W, H);
    bg.fillStyle = 'rgba(180,98,46,0.16)';
    for (let y = 0; y < BOARD.ROWS; y++) for (let x = 0; x < BOARD.COLS; x++) {
      bg.fillRect(x * BOARD.PITCH + 1, y * BOARD.PITCH + 1, 2, 2);
    }
  }

  const lit = new Float32Array(BOARD.COLS * BOARD.ROWS);
  const want = new Float32Array(BOARD.COLS * BOARD.ROWS);

  /* the feed: real lines only */
  const entries = [];      /* { name, date, text } — text is verbatim archive */
  const shown = [];        /* the rows currently on the board, oldest first */
  let cursor = 0, nextAt = 0, ready = false;

  function firstSentence(body) {
    const s = String(body || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const m = /^(.{1,90}?[.!?…])(\s|$)/.exec(s);
    let out = m ? m[1] : s.slice(0, 90);
    if (out.length > 90) out = out.slice(0, 90);
    /* never cut a word in half — the line stays verbatim either way */
    if (!m && out.length === 90) { const sp = out.lastIndexOf(' '); if (sp > 40) out = out.slice(0, sp); }
    return out.trim();
  }

  function wrap(text, w) {
    const words = text.split(' '); const out = []; let line = '';
    for (const wd of words) {
      const trial = line ? line + ' ' + wd : wd;
      if (trial.length > w && line) { out.push(line); line = wd; } else line = trial;
    }
    if (line) out.push(line);
    return out;
  }

  archive.load().then(() => {
    const rows = [];
    const posts = archive.posts({ limit: 60 }).rows || [];
    for (const p of posts) {
      if (!p.resident) continue;
      const t = firstSentence(p.body);
      if (t.length < 12) continue;
      rows.push({ name: archive.WORLD_NAMES[p.resident], date: String(p.created_at).slice(0, 10), text: t, at: Date.parse(p.created_at) || 0 });
    }
    for (const s of archive.sittings()) {
      const full = archive.sitting(s.id);
      if (!full) continue;
      for (const e of full.entries) {
        if (!e.resident || !e.body) continue;
        const t = firstSentence(e.body);
        if (t.length < 12) continue;
        rows.push({ name: e.residentName, date: String(e.created_at).slice(0, 10), text: t, at: Date.parse(e.created_at) || 0 });
      }
    }
    rows.sort((a, b) => b.at - a.at);
    const seen = new Set();
    for (const r of rows) {
      const k = r.name + r.text;
      if (seen.has(k)) continue;
      seen.add(k);
      entries.push(r);
    }
    ready = entries.length > 0;
  }).catch(() => {});

  /* one new line every six to nine seconds, unevenly — seeded, so the rhythm
     is the same on every visit */
  function gap(i) {
    const h = Math.sin(i * 12.9898) * 43758.5453;
    return 6 + (h - Math.floor(h)) * 3;
  }

  /* the rows an entry becomes */
  function rowsFor(e) {
    const head = (e.name + ' · ' + e.date).slice(0, BOARD.chars);
    return [head].concat(wrap(e.text, BOARD.chars)).concat(['']);
  }

  let queue = [];
  function feed(t) {
    if (!ready || t < nextAt) return;
    if (!queue.length) {
      queue = rowsFor(entries[cursor % entries.length]);
      cursor++;
    }
    shown.push(queue.shift());
    while (shown.length > BOARD.rows - 2) shown.shift();
    nextAt = t + (queue.length ? 1.8 : gap(cursor));
  }

  function stamp(row, col, ch) {
    const gl = glyph(ch);
    if (!gl) return;
    const x0 = 3 + col * BOARD.CW, y0 = 8 + row * BOARD.CH;
    for (let ry = 0; ry < 7; ry++) {
      const bits = gl[ry];
      for (let rx = 0; rx < 5; rx++) {
        if (bits & (1 << (4 - rx))) {
          const x = x0 + rx, y = y0 + ry;
          if (x >= 0 && x < BOARD.COLS && y >= 0 && y < BOARD.ROWS) want[y * BOARD.COLS + x] = 1;
        }
      }
    }
  }

  const HEADER = 'THE HOUSE · FEED · ARCHIVE THROUGH 28 MAY 2026';
  let last = 0;

  function render(t, dt) {
    feed(t);
    want.fill(0);
    /* the header — it fits, so it stays put */
    for (let c = 0; c < HEADER.length && c < BOARD.chars; c++) stamp(-1, c, HEADER[c]);
    shown.forEach((ln, i) => {
      const up = ln.toUpperCase();
      for (let c = 0; c < up.length && c < BOARD.chars; c++) stamp(i + 1, c, up[c]);
    });

    /* persistence: a dot that has been lit falls away, it does not blink */
    const k = Math.exp(-dt / 0.28);
    for (let i = 0; i < lit.length; i++) {
      lit[i] = want[i] ? 1 : lit[i] * k;
    }

    g.drawImage(bed, 0, 0);
    /* the idle shimmer, on the lattice itself */
    g.globalAlpha = 0.05 + 0.025 * (0.5 + 0.5 * Math.sin(t * 0.9));
    g.fillStyle = 'rgba(217,147,52,1)';
    g.fillRect(0, 0, W, H);
    const P = BOARD.PITCH;
    for (let y = 0; y < BOARD.ROWS; y++) {
      for (let x = 0; x < BOARD.COLS; x++) {
        const v = lit[y * BOARD.COLS + x];
        if (v < 0.035) continue;
        g.globalAlpha = Math.min(1, v);
        g.drawImage(dot, x * P - P / 2 + 1, y * P - P / 2 + 1);
      }
    }
    g.globalAlpha = 1;
    tex.needsUpdate = true;
  }

  return {
    texture: tex, W, H,
    /* ≤ 12 fps, and only while the panel is actually on screen */
    tick(t, dt, visible) {
      if (!visible) return;
      if (t - last < 1 / BOARD.FPS) return;
      render(t, Math.min(0.4, t - last));
      last = t;
    },
    litCount() { let n = 0; for (let i = 0; i < lit.length; i++) if (lit[i] > 0.25) n++; return n; },
    entries: () => entries.slice(),
    shown: () => shown.slice(),
    ready: () => ready
  };
})();

/* the panel itself: the wall behind the console, right of the terminal */
const boardGroup = new THREE.Group();
scene.add(boardGroup);
{
  const BW = 1.42, BH = 0.60;
  const X = 2.66, Y = 1.78, Z = -1.972;
  const case_ = rbox(BW + 0.09, BH + 0.09, 0.055, 0.028, oliveDark);
  case_.position.set(X, Y, Z + 0.028);
  boardGroup.add(case_);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshStandardMaterial({
    map: board.texture, emissive: 0xffffff, emissiveMap: board.texture, emissiveIntensity: 1.45,
    roughness: 0.82, metalness: 0
  }));
  face.position.set(X, Y, Z + 0.082);
  boardGroup.add(face);
  /* a brushed lip, so it is a fixture and not a poster */
  boardGroup.add(box(BW + 0.13, 0.026, 0.05, chromeMat, X, Y - BH / 2 - 0.062, Z + 0.072, false));
  boardGroup.userData.face = face;
}

/* ─────────────────────────── the two empty berths ─────────────────────────── */
/* A slot is a small closed device with nothing in it yet. Riley's simulators
   take these places: swap the `mesh` and give the entry a `focus`/`onClick`. */
function slotDevice(w, h, d) {
  const g = new THREE.Group();
  const shell2 = rbox(w, h, d, 0.02, oliveMat);
  shell2.rotation.x = 0;
  g.add(shell2);
  /* a blank faceplate, one dark lamp, two screws */
  const face = box(w * 0.76, h * 0.56, 0.012, oliveDark, 0, 0, d / 2 + 0.006, false);
  g.add(face);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.010, 8, 8), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.5 }));
  dot.position.set(w * 0.32, -h * 0.28, d / 2 + 0.008);
  g.add(dot);
  [[-w * 0.42, h * 0.34], [w * 0.42, h * 0.34]].forEach(([x, y]) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8), chromeMat);
    s.rotation.x = Math.PI / 2;
    s.position.set(x, y, d / 2 + 0.006);
    g.add(s);
  });
  return g;
}
const slotA = slotDevice(0.30, 0.16, 0.22);
slotA.position.set(0.72, 0.845, 1.60);
slotA.rotation.y = -0.22;
scene.add(slotA);

const slotB = slotDevice(0.34, 0.20, 0.24);
slotB.position.set(-2.72, 0.885, CONSOLE.z - 0.06);
slotB.rotation.y = 0.10;
scene.add(slotB);

/* ─────────────────────────── the lights ─────────────────────────── */
RectAreaLightUniformsLib.init();

/* 1 · the terminal — the key, and still the brightest thing in the room */
const crtLight = new THREE.RectAreaLight(0xf2c14e, 30.0, SCR_W * 1.10, SCR_H * 1.10);
crtLight.position.copy(SCREEN_POS).addScaledVector(SCREEN_NORMAL, 0.02);
crtLight.lookAt(SCREEN_POS.clone().addScaledVector(SCREEN_NORMAL, 1));
scene.add(crtLight);

/* 2 · the alcove ring — warm orange, thrown out of the recess into the room */
const alcoveLight = new THREE.PointLight(0xdd7a33, 1.5, 2.3, 2.4);
alcoveLight.position.set(ALC.x - 0.62, ALC.y, ALC.z);
scene.add(alcoveLight);
const alcoveInner = new THREE.PointLight(0xc86a2c, 0.85, 1.1, 2.2);
alcoveInner.position.set(ALC.x - 0.20, ALC.y, ALC.z);
scene.add(alcoveInner);

/* 3 · the porthole — a faint cold counter-light from the left */
const windowLight = new THREE.DirectionalLight(0xa8c6d8, 0.55);
windowLight.position.set(-4.2, 1.8, -1.2);
windowLight.target.position.set(1.0, 0.9, -1.9);
scene.add(windowLight, windowLight.target);

/* 4 · the stewards' lamp — warm, shadow-casting, present or absent */
const lampLight = new THREE.SpotLight(0xffc98a, stewardPresent ? 6.0 : 0, 3.6, 0.90, 0.55, 1.6);
lampLight.position.set(2.33, CONSOLE.top + 0.30, CONSOLE.z + 0.02);
lampLight.target.position.set(1.85, CONSOLE.top - 0.02, CONSOLE.z + 0.30);
lampLight.castShadow = true;
lampLight.shadow.mapSize.set(1024, 1024);
lampLight.shadow.bias = -0.0016;
lampLight.shadow.camera.near = 0.05;
lampLight.shadow.camera.far = 5;
scene.add(lampLight, lampLight.target);

/* 5 · one soft key from above so every object is nameable at rest */
const roomKey = new THREE.DirectionalLight(0xd6cfe0, 0.34);
roomKey.position.set(-0.4, 4.6, 1.1);
roomKey.target.position.set(0.6, 0.6, -1.6);
roomKey.castShadow = true;
roomKey.shadow.mapSize.set(1024, 1024);
roomKey.shadow.camera.left = -5; roomKey.shadow.camera.right = 5;
roomKey.shadow.camera.top = 4; roomKey.shadow.camera.bottom = -2;
roomKey.shadow.camera.far = 12;
roomKey.shadow.bias = -0.0014;
scene.add(roomKey, roomKey.target);

/* the floor of the exposure — a hemisphere, so the darks are violet, not black */
const sky = new THREE.HemisphereLight(0x9a93ae, 0x7d6f6a, 1.40);
scene.add(sky);

/* ─────────────────────────── renderer, camera ─────────────────────────── */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.00;

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 50);
/* Standing eye height, the room's near-left corner. The eye sits a little
   behind the near wall — a 7 m room cannot show its console and both end walls
   from inside its own corner at any honest lens — so the camera stands where a
   fourth wall would be and the room opens for it. */
const REST_POS = new THREE.Vector3(-0.86, 1.62, 3.62);
const REST_LOOK = new THREE.Vector3(0.42, 1.00, -1.90);
camera.position.copy(REST_POS);
camera.lookAt(REST_LOOK);

/* ─────────────────────────── dust in the shafts ─────────────────────────── */
const dust = (() => {
  const N = 90;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  const cones = [[-1.25, -0.30], [1.45, -0.30]];
  for (let i = 0; i < N; i++) {
    const c = cones[i % 2];
    const t = Math.random();
    pos[i * 3 + 0] = c[0] + (Math.random() - 0.5) * (0.9 + t * 0.9);
    pos[i * 3 + 1] = R.h - 0.15 - t * 2.2;
    pos[i * 3 + 2] = c[1] + (Math.random() - 0.5) * (0.8 + t * 0.8);
    seed[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xcfe3ee) }, uSize: { value: 7.0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uSize; varying float vFade;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (1.0 / max(0.15, -mv.z));
        vFade = clamp(1.0 - (-mv.z) * 0.13, 0.15, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vFade;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        gl_FragColor = vec4(uColor, a * a * 0.16 * vFade);
      }`
  });
  const p = new THREE.Points(geo, mat);
  scene.add(p);
  return { points: p, seed, N, base: Float32Array.from(pos) };
})();

/* ─────────────────────────── post ─────────────────────────── */
const post = makePost(renderer, scene, camera, {
  strength: 0.36, radius: 0.78, threshold: 0.90,
  grain: 0.026, vignette: 0.68, aberration: 0.0014
});
const bloom = post.bloom;
const grade = post.grade;

/* ─────────────────────────── the world, on the glass ─────────────────────────── */
const cssHost = document.getElementById('css3d');
const world = makeWorldScreen({
  host: cssHost, pos: SCREEN_POS, normal: SCREEN_NORMAL,
  rotY: CRT_ROT, quadW: SCR_W, pageW: 1024, pageH: 768, src: 'index.html?door=1'
});

/* ─────────────────────────── the record ─────────────────────────── */
/* a warm low drone with a slow tape-wow, synthesised here. To put a real track
   on the platter instead: create an <audio> (or an AudioBufferSourceNode from
   a fetched file), route it through `gain`, and leave the wow LFO where it is —
   it will read as the same turntable. */
const record = { on: false, ctx: null, nodes: null };
function recordStart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!record.ctx) record.ctx = new AC();
  const ctx = record.ctx;
  if (ctx.state === 'suspended') ctx.resume();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.075, ctx.currentTime + 1.4);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
  lp.connect(gain); gain.connect(ctx.destination);

  const oscs = [];
  [55, 82.5, 110, 164.8].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i > 1 ? 'triangle' : 'sawtooth';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = [0.55, 0.30, 0.18, 0.09][i];
    o.connect(g); g.connect(lp);
    o.start();
    oscs.push({ o, g });
  });
  /* the tape wow: a slow detune, and a slower one under it */
  const wow = ctx.createOscillator(); wow.frequency.value = 0.55;
  const wowAmt = ctx.createGain(); wowAmt.gain.value = 7;
  wow.connect(wowAmt);
  const flutter = ctx.createOscillator(); flutter.frequency.value = 4.6;
  const flutterAmt = ctx.createGain(); flutterAmt.gain.value = 2.2;
  flutter.connect(flutterAmt);
  oscs.forEach(({ o }) => { wowAmt.connect(o.detune); flutterAmt.connect(o.detune); });
  wow.start(); flutter.start();
  /* surface noise, filtered down to a hiss under the drone */
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * 0.5;
  const noise = ctx.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2400; nf.Q.value = 0.4;
  const ng = ctx.createGain(); ng.gain.value = 0.014;
  noise.connect(nf); nf.connect(ng); ng.connect(gain);
  noise.start();

  record.nodes = { gain, oscs, wow, flutter, noise };
  record.on = true;
}
function recordStop() {
  if (!record.nodes || !record.ctx) { record.on = false; return; }
  const { gain, oscs, wow, flutter, noise } = record.nodes;
  const t = record.ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  setTimeout(() => {
    try { oscs.forEach(({ o }) => o.stop()); wow.stop(); flutter.stop(); noise.stop(); } catch (e) {}
    try { record.ctx.suspend(); } catch (e) {}
  }, 1000);
  record.nodes = null;
  record.on = false;
}
function toggleRecord() { record.on ? recordStop() : recordStart(); }

/* ─────────────────────────── THE REGISTRY ─────────────────────────── */
/* Everything a visitor can find. See the header for how to add to it. */
export const STATION_OBJECTS = [
  {
    id: 'terminal', label: 'the terminal', caption: '[sit down]',
    mesh: () => crt, bounds: glass, pad: 18,
    onClick: () => sitDown()
  },
  {
    id: 'secondary', label: 'the secondary screen', caption: 'the house’s readings',
    mesh: () => secondary, bounds: secondary.userData.head, pad: 12
  },
  {
    id: 'reels', label: 'the tape unit', caption: 'the archive, turning',
    mesh: () => reels, pad: 12,
    focus: { pos: [-1.90, 1.62, -0.62], look: [-2.34, 1.70, -1.90] }
  },
  {
    id: 'alcove', label: 'the alcove', caption: 'what the first sanctuary said, all of it, dated',
    mesh: () => alcove, bounds: alcove.userData.seed, pad: 60,
    focus: { pos: [1.72, 1.44, -0.34], look: [3.30, 1.42, -0.35] }
  },
  {
    id: 'window', label: 'the house', caption: 'a walk from here, and further down',
    mesh: () => porthole, bounds: porthole.userData.view, pad: 16,
    focus: { pos: [-2.24, 1.52, -0.96], look: [-3.45, 1.52, -0.96] }
  },
  {
    id: 'skylight', label: 'the skylights', caption: 'dusk, going over',
    mesh: () => skylights, pad: 10
  },
  {
    id: 'lamp', label: 'the stewards’ lamp',
    caption: stewardPresent ? 'lit while one of them works' : 'dark tonight',
    mesh: () => lampGroup, bounds: lampGroup.userData.shade, pad: 22
  },
  {
    id: 'clock', label: 'the clock', caption: 'the house keeps its own hours',
    mesh: () => clock, pad: 12,
    tick: () => {}
  },
  {
    id: 'corkboard', label: 'the corkboard', caption: 'five rooms, photographed badly',
    mesh: () => corkboard, pad: 12,
    focus: { pos: [1.20, 1.70, -0.74], look: [1.58, 1.72, -1.94] }
  },
  {
    id: 'board', label: 'the board',
    caption: 'what the minds are saying · archive today, live at launch',
    mesh: () => boardGroup, bounds: boardGroup.userData.face, pad: 16,
    focus: { pos: [2.60, 1.78, -0.62], look: [2.66, 1.78, -1.95] }
  },
  {
    id: 'record', label: 'a record', caption: 'side A',
    mesh: () => recordPlayer, pad: 14,
    onClick: () => toggleRecord()
  },
  {
    id: 'chair', label: 'the chair', caption: 'pulled out, as it was left',
    mesh: () => chair, pad: 10
  },
  {
    id: 'plant', label: 'the plant', caption: 'someone waters it',
    mesh: () => plant, pad: 10
  },
  {
    id: 'slot-a', label: 'a berth', caption: 'not yet wired', slot: true,
    mesh: () => slotA, pad: 12
  },
  {
    id: 'slot-b', label: 'a berth', caption: 'not yet wired', slot: true,
    mesh: () => slotB, pad: 12
  }
];

/* the registry becomes hover targets. A mesh is added to the scene here only if
   it is not already in it — the v1 objects are built above and returned as-is. */
const PICKS = STATION_OBJECTS.map((o) => {
  const root = o.mesh();
  if (!root.parent) scene.add(root);
  return {
    id: o.id, root, bounds: o.bounds, pad: o.pad,
    caption: `<b>${o.label}</b> <i>· ${o.caption}</i>`,
    entry: o
  };
});

/* ─────────────────────────── the hover layer ─────────────────────────── */
const capEl = document.getElementById('cap');
const standEl = document.getElementById('stand');
const dipEl = document.getElementById('dip');
const bootEl = document.getElementById('boot');

const hoverLayer = makeHover({
  canvas, capEl, capHost: document.getElementById('captions'),
  cursorFor: (p) => (p.entry.onClick || p.entry.focus ? 'pointer' : 'default')
});
hoverLayer.setPicks(PICKS);
const drawHair = (p) => hoverLayer.drawHair(p, camera);
const setHover = (p) => hoverLayer.setHover(p, camera);
const hovered = () => hoverLayer.hovered();

const pointer = new THREE.Vector2(-2, -2);

/* the middle of a thing, in world space — a group's own origin is usually the
   room's, so ask its bounding box instead */
const _bb = new THREE.Box3();
function centreOf(p) {
  _bb.setFromObject(p.bounds || p.root);
  return _bb.getCenter(new THREE.Vector3());
}

/* ─────────────────────────── the camera: rest, focus, sit, back ─────────────────────────── */
/* seated: close enough that the glass carries the game, far enough that the
   bezel, the console's walnut edge and the keyboard stay in the frame */
const ZOOM_POS = SCREEN_POS.clone().addScaledVector(SCREEN_NORMAL, 0.364).add(new THREE.Vector3(0, 0.075, 0));
const ZOOM_LOOK = SCREEN_POS.clone().add(new THREE.Vector3(0, -0.010, 0));

const cam = {
  mode: 'rest',            /* rest · glide · seated · focus · leaving */
  t: 0,
  dur: REDUCED ? 0.001 : 1.4,
  fromPos: new THREE.Vector3(), fromLook: new THREE.Vector3(),
  toPos: ZOOM_POS.clone(), toLook: ZOOM_LOOK.clone(),
  look: REST_LOOK.clone(),
  next: 'seated',
  focused: null
};
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function glideTo(pos, look, next) {
  cam.mode = 'glide'; cam.t = 0; cam.next = next;
  cam.fromPos.copy(camera.position); cam.fromLook.copy(cam.look);
  cam.toPos.copy(pos); cam.toLook.copy(look);
}

function sitDown() {
  if (cam.mode !== 'rest' && cam.mode !== 'focus') return;
  setHover(null);
  bootEl.classList.add('gone');
  term.begin(cameInBefore);
  cam.focused = null;
  glideTo(ZOOM_POS, ZOOM_LOOK, 'seated');
}

function focusOn(entry) {
  if (cam.mode !== 'rest' && cam.mode !== 'focus') return;
  setHover(null);
  bootEl.classList.add('gone');
  cam.focused = entry.id;
  standEl.classList.add('on');
  glideTo(new THREE.Vector3().fromArray(entry.focus.pos), new THREE.Vector3().fromArray(entry.focus.look), 'focus');
}

function standUp() {
  if (cam.mode === 'rest' || cam.mode === 'leaving') return;
  world.hide();
  standEl.classList.remove('on');
  cam.focused = null;
  cam.mode = 'leaving'; cam.t = 0;
  cam.fromPos.copy(camera.position); cam.fromLook.copy(cam.look);
  cam.toPos.copy(REST_POS); cam.toLook.copy(REST_LOOK);
}

/* the world arrives on the glass, then takes the frame */
let worldLoaded = false;
const HOLD = { world: false };
/* the boot text finishes on the glass; only then does the world arrive on it */
function placeWorld() {
  if (worldLoaded || HOLD.world) return;
  worldLoaded = true;
  standEl.classList.add('on');
  const arrive = () => {
    if (cam.mode !== 'seated') { worldLoaded = false; return; }
    world.show();
    setTimeout(() => { if (cam.mode === 'seated') world.live(true); }, 220);
  };
  const wait = () => {
    if (cam.mode !== 'seated') { worldLoaded = false; return; }
    if (boot.done) setTimeout(arrive, REDUCED ? 60 : 520);
    else setTimeout(wait, 90);
  };
  wait();
}

onWorldMessage({ standUp });

/* ─────────────────────────── input ─────────────────────────── */
window.addEventListener('pointermove', (ev) => {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  capEl.style.left = ev.clientX + 'px';
  capEl.style.top = ev.clientY + 'px';
});
function activate(p) {
  if (!p) return;
  const e = p.entry;
  if (e.onClick) { e.onClick(); return; }
  if (e.focus) focusOn(e);
}
canvas.addEventListener('click', () => activate(hovered()));
standEl.addEventListener('click', standUp);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && cam.mode !== 'rest' && cam.mode !== 'leaving') { ev.preventDefault(); standUp(); }
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
const clockT = { last: performance.now() / 1000, elapsedTime: 0 };
const tmpPos = new THREE.Vector3(), tmpLook = new THREE.Vector3();
const boardFrustum = new THREE.Frustum();
let mouseX = 0, mouseY = 0;

function setClockHands(t) {
  const min = (CLOCK.min + (t / 30)) % 1440;   /* the world's own rate: 1 min per 30 s */
  clock.userData.hg.rotation.z = -((min / 720) % 1) * Math.PI * 2;
  clock.userData.mg.rotation.z = -((min % 60) / 60) * Math.PI * 2;
  return min;
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000;
  const dt = Math.min(now - clockT.last, 0.05);
  clockT.last = now;
  clockT.elapsedTime += dt;
  const t = clockT.elapsedTime;

  term.tick(dt, t);
  drawPlot(t);
  setClockHands(t);

  /* the reels turn, slowly, and the indicator lamps breathe */
  const quiet = REDUCED || STILL;
  spinningReels.forEach((g, i) => { g.rotation.z -= dt * (i === 0 ? 0.34 : 0.29); });
  indicatorLamps.forEach((L) => {
    const v = 0.5 + 0.5 * Math.sin(t * L.rate + L.phase);
    L.mesh.material.color.setScalar(1);
    L.mesh.material.opacity = 1;
    L.mesh.scale.setScalar(0.9 + v * 0.18);
  });
  /* the platter turns while the record plays, and the arm sits down on it */
  if (record.on) platter.rotation.y -= dt * 3.49;   /* 33⅓ rpm */
  {
    const want = record.on ? 0.06 : 0.62;
    const sw = tonearm.userData.swing;
    sw.rotation.y += (want - sw.rotation.y) * Math.min(1, dt * 2.2);
  }

  /* dust in the skylight shafts */
  {
    const p = dust.points.geometry.attributes.position;
    for (let i = 0; i < dust.N; i++) {
      const s = dust.seed[i];
      p.array[i * 3 + 0] = dust.base[i * 3 + 0] + Math.sin(t * 0.11 + s) * 0.09;
      p.array[i * 3 + 1] = dust.base[i * 3 + 1] + Math.sin(t * 0.07 + s * 1.7) * 0.12;
      p.array[i * 3 + 2] = dust.base[i * 3 + 2] + Math.cos(t * 0.09 + s * 0.6) * 0.08;
    }
    p.needsUpdate = true;
  }

  /* the board, at twelve frames a second and only when it is in the shot */
  {
    boardFrustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const f = boardGroup.userData.face;
    board.tick(t, dt, boardFrustum.intersectsObject(f));
  }

  /* whatever the registry wants each frame */
  for (const o of STATION_OBJECTS) if (o.tick) o.tick(t, dt);

  /* the camera */
  if (cam.mode === 'glide' || cam.mode === 'leaving') {
    cam.t += dt;
    const k = easeOut(Math.min(1, cam.t / cam.dur));
    tmpPos.lerpVectors(cam.fromPos, cam.toPos, k);
    tmpLook.lerpVectors(cam.fromLook, cam.toLook, k);
    camera.position.copy(tmpPos);
    cam.look.copy(tmpLook);
    camera.lookAt(cam.look);
    camera.rotation.z += REDUCED ? 0 : Math.sin(k * Math.PI) * (cam.mode === 'glide' ? 0.022 : -0.016) * (1 - k * 0.4);
    if (k >= 1) {
      if (cam.mode === 'glide') {
        cam.mode = cam.next;
        if (cam.next === 'seated') placeWorld();
      } else cam.mode = 'rest';
    }
  } else if (cam.mode === 'rest') {
    mouseX += (pointer.x - mouseX) * Math.min(1, dt * 3.2);
    mouseY += (pointer.y - mouseY) * Math.min(1, dt * 3.2);
    const bx = quiet ? 0 : Math.sin(t * 0.22) * 0.020;
    const by = quiet ? 0 : Math.sin(t * 0.29 + 1.1) * 0.013;
    const px = quiet ? 0 : mouseX * 0.062;
    const py = quiet ? 0 : mouseY * 0.034;
    camera.position.set(REST_POS.x + bx + px, REST_POS.y + by + py, REST_POS.z + bx * 0.5);
    cam.look.copy(REST_LOOK);
    camera.lookAt(cam.look);
  }

  /* hover — at rest and while focused, never while seated */
  if (cam.mode === 'rest' || cam.mode === 'focus') {
    setHover(hoverLayer.pickAt(pointer, camera));
    if (hovered()) drawHair(hovered());
  } else if (hovered()) setHover(null);

  post.render(t);
  if (cam.mode !== 'rest' && !world.isFlat()) world.render(camera);
}

frame();
setTimeout(() => bootEl.classList.add('gone'), 1400);

/* ─────────────────────────── the test surface ─────────────────────────── */
window.__station = {
  mode: () => cam.mode,
  focused: () => cam.focused,
  objects: () => STATION_OBJECTS.map((o) => o.id),
  registry: () => STATION_OBJECTS.map((o) => ({ id: o.id, label: o.label, caption: o.caption, slot: !!o.slot, focus: !!o.focus, click: !!o.onClick })),
  hover: () => (hovered() ? hovered().id : null),
  caption: () => (capEl.classList.contains('on') ? capEl.textContent : null),
  hoverAt: (id) => {
    const p = PICKS.find((x) => x.id === id);
    if (!p) return null;
    p.root.updateWorldMatrix(true, true);
    const v = centreOf(p);
    v.project(camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    pointer.set(v.x, v.y);
    capEl.style.left = x + 'px'; capEl.style.top = y + 'px';
    const found = hoverLayer.pickAt(pointer, camera);
    setHover(found);
    return { x: Math.round(x), y: Math.round(y), hit: found ? found.id : null, caption: found ? capEl.textContent : null };
  },
  click: (id) => { const p = PICKS.find((x) => x.id === id); activate(p); return cam.mode; },
  sitDown, standUp,
  bootTyped: () => boot.typed,
  bootText: () => term.text(),
  bootDone: () => boot.done,
  flat: () => world.isFlat(),
  worldFrame: () => world.iframe,
  cssPlaced: () => world.placed(),
  cab: () => world.cab(),
  focusGame: () => world.focusGame(),
  holdWorld: (v) => { HOLD.world = !!v; },
  record: () => ({ on: record.on, state: record.ctx ? record.ctx.state : 'none' }),
  board: () => ({ ready: board.ready(), lit: board.litCount(), entries: board.entries().length, shown: board.shown() }),
  /* every line on the board is a real one: its text is found verbatim in the
     archive it came from */
  boardLinesReal: () => {
    const es = board.entries();
    if (!es.length) return null;
    const bodies = [];
    (archive.posts({ limit: 60 }).rows || []).forEach((p) => bodies.push(String(p.body || '')));
    archive.sittings().forEach((s) => { const f = archive.sitting(s.id); if (f) f.entries.forEach((e) => bodies.push(String(e.body || ''))); });
    const hay = bodies.map((b) => b.replace(/\s+/g, ' ').trim());
    const bad = es.filter((e) => !hay.some((b) => b.indexOf(e.text) >= 0));
    return { checked: es.length, unmatched: bad.length, sample: es.slice(0, 3) };
  },
  toggleRecord,
  clock: () => ({ stored: CLOCK, label: clockLabel(setClockHands(clockT.elapsedTime)), hourHand: clock.userData.hg.rotation.z, minHand: clock.userData.mg.rotation.z }),
  cameInBefore, stewardPresent,
  /* the look, live — used while art-directing the frame */
  tune: (o) => {
    if (o.pos) REST_POS.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.look) REST_LOOK.set(o.look[0], o.look[1], o.look[2]);
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    if (o.exposure !== undefined) renderer.toneMappingExposure = o.exposure;
    if (o.crt !== undefined) crtLight.intensity = o.crt;
    if (o.alcove !== undefined) alcoveLight.intensity = o.alcove;
    if (o.alcoveInner !== undefined) alcoveInner.intensity = o.alcoveInner;
    if (o.win !== undefined) windowLight.intensity = o.win;
    if (o.key !== undefined) roomKey.intensity = o.key;
    if (o.sky !== undefined) sky.intensity = o.sky;
    if (o.fog !== undefined) scene.fog.density = o.fog;
    if (o.bloom !== undefined) bloom.strength = o.bloom;
    if (o.bloomThresh !== undefined) bloom.threshold = o.bloomThresh;
    if (o.vig !== undefined) grade.uniforms.uVignette.value = o.vig;
    if (o.grain !== undefined) grade.uniforms.uGrain.value = o.grain;
    if (o.emissive !== undefined) glass.material.emissiveIntensity = o.emissive;
    if (o.skyEmissive !== undefined) skylights.children.forEach((c) => { if (c.material && c.material.emissiveIntensity !== undefined && c.geometry.type === 'PlaneGeometry') c.material.emissiveIntensity = o.skyEmissive; });
    if (o.lamp !== undefined) { lampLight.intensity = o.lamp; lampGroup.userData.bulb.visible = o.lamp > 0; }
    if (o.still !== undefined) STILL = !!o.still;
    return { pos: REST_POS.toArray(), look: REST_LOOK.toArray(), fov: camera.fov, exposure: renderer.toneMappingExposure };
  },
  where: () => {
    const out = {};
    PICKS.forEach((p) => {
      const v = centreOf(p); v.project(camera);
      out[p.id] = [Math.round((v.x * 0.5 + 0.5) * window.innerWidth), Math.round((-v.y * 0.5 + 0.5) * window.innerHeight)];
    });
    return out;
  },
  probe: (px, py) => {
    const v = new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
    const h = rc.intersectObjects(scene.children, true).filter((x) => x.object.visible && x.object.isMesh)[0];
    if (!h) return null;
    const w = new THREE.Vector3(); h.object.getWorldPosition(w);
    return { type: h.object.geometry && h.object.geometry.type, at: w.toArray().map((n) => +n.toFixed(2)), dist: +h.distance.toFixed(2) };
  }
};
