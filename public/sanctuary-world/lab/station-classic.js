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
  seatPose, quadCorners, makeFullMode,
  sanctuaryClock, clockLabel,
  makeHouseWindow, makeRoomTone, makeSoundControl, KEY_SOUND
} from './door-common.js';
import { makeGlyph, drawGlyph, roomLabel } from './glyph.js';
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
  /* a warm cream, painted — never white */
  g.fillStyle = '#e3d8c0'; g.fillRect(0, 0, w, h);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 13;
    d[i] += n; d[i + 1] += n * 0.94; d[i + 2] += n * 0.80;
  }
  g.putImageData(im, 0, 0);
  /* the panel seams: a shadowed groove with a lit lip, so they read at a rake */
  for (let x = 64; x < w; x += 128) {
    g.strokeStyle = 'rgba(74,60,42,0.42)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    g.strokeStyle = 'rgba(255,246,224,0.30)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x + 2.5, 0); g.lineTo(x + 2.5, h); g.stroke();
  }
});

/* rubberised tile: a faint grid, and the studs the floors of that era had */
const rubberTex = paint(512, 512, (g, w, h) => {
  g.fillStyle = '#3b3940'; g.fillRect(0, 0, w, h);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 10; d[i] += n; d[i + 1] += n * 0.96; d[i + 2] += n; }
  g.putImageData(im, 0, 0);
  g.strokeStyle = 'rgba(0,0,0,0.20)'; g.lineWidth = 2;
  for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.022)';
  for (let x = 32; x < w; x += 64) for (let y = 32; y < h; y += 64) { g.beginPath(); g.arc(x, y, 9, 0, 6.3); g.fill(); }
});

/* the sky over the skylights: dusk going over into night, and stars */
const skyTex = paint(256, 256, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.00, '#030308');
  sky.addColorStop(0.48, '#0a0918');
  sky.addColorStop(0.82, '#131028');
  sky.addColorStop(1.00, '#1a1433');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  /* a few stars, and no more — a night sky is mostly nothing */
  for (let i = 0; i < 46; i++) {
    const a = 0.22 + Math.random() * 0.62;
    g.fillStyle = Math.random() < 0.18 ? `rgba(94,234,212,${a})` : `rgba(216,214,232,${a})`;
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
const shellMat = new THREE.MeshStandardMaterial({ map: creamTex, roughness: 0.92, metalness: 0, side: THREE.BackSide, color: 0xbcae96 });
/* satin walnut: the grain has to read at a rake, so the base is light enough
   for the terminal's spill to find it */
const walnutMat = new THREE.MeshStandardMaterial({ map: woodTexture('#6a4a33', '26,14,7'), roughness: 0.34, metalness: 0.06, color: 0xd8c4a6 });
const walnutDeep = new THREE.MeshStandardMaterial({ map: woodTexture('#4a3122', '20,10,5'), roughness: 0.50, metalness: 0.04, color: 0xc4b096 });
const oliveMat = new THREE.MeshStandardMaterial({ color: 0x6f6a58, roughness: 0.66, metalness: 0.06 });
const oliveDark = new THREE.MeshStandardMaterial({ color: 0x4a473d, roughness: 0.78, metalness: 0.04 });
const terracotta = new THREE.MeshStandardMaterial({ color: 0xa85a28, roughness: 0.94, metalness: 0 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xa8a6a0, roughness: 0.28, metalness: 0.72 });
const brass = new THREE.MeshStandardMaterial({ color: 0xbb9350, roughness: 0.34, metalness: 0.52 });
/* charcoal tile with a whisper of sheen, so the glows lie down on it */
const rubberMat = new THREE.MeshStandardMaterial({ map: rubberTex, roughness: 0.62, metalness: 0.10, color: 0xd0cad6 });
const rugMat = new THREE.MeshStandardMaterial({ color: 0x6b4029, roughness: 1.0, metalness: 0 });
const cardboard = new THREE.MeshStandardMaterial({ color: 0x9c8464, roughness: 0.94, metalness: 0 });
const blackPlastic = new THREE.MeshStandardMaterial({ color: 0x211f22, roughness: 0.62, metalness: 0.06 });

/* ─────────────────────────── the shell ─────────────────────────── */
/* a soft-cornered capsule: the cross-section is a rounded rectangle extruded
   the length of the room, so wall meets ceiling and wall meets floor in a
   fillet rather than a line */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07060c);
scene.fog = new THREE.FogExp2(0x120e1e, 0.040);

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
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 0.042), walnutMat);
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
  const top = box(CONSOLE.len - 0.02, 0.035, 0.56, walnutMat, 0, CONSOLE.top - 0.017, CONSOLE.z);
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
/* it used to start at the console's far left; the stewards' fascia stands there
   now, so the strip steps right and keeps its own stretch of the desk */
lampStrip.position.x = 0.16;

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

/* the stewards' console runs the same machine with its own standby card — the
   glass is warm before anyone sits down, here as at the terminal */
const term2 = makeTerminal({
  w: 720, h: 540,
  title: 'TOPOLOGIE OS · THE STEWARDS’ CONSOLE',
  standby: [
    'console · the stewards’ desk',
    'field   · 638 pieces, april–july 2026',
    'line    · fable · sol · opus — not yet open',
    'waiting · for whoever sits down'
  ],
  body: 'This is the desk the three of them share with you. On it: everything Claude Field wrote, built and played between April and July 2026, the conversations it had with Anima, Vektor and Luca, and the house\u2019s own instruments. The stewards\u2019 line is not open yet, and the console says so rather than pretending.',
  tail: '> boot topologie os'
});

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
    map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 4.60,
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
    color: 0x5e3318, emissive: 0xb85f26, emissiveIntensity: 0.37, roughness: 0.62
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

/* ─────────────────────── the window is true ───────────────────────
   The porthole showed a painting of a valley. It shows the house now: the
   world's own LOOKOUT, drawn live by the world's own engine, on the
   sanctuary's own clock, with the residents where the day has put them. It is
   input-less, silent, and it costs one small update six times a second — and
   only while the room is in front of you and you are not sitting at a screen.

   The circle is 420 square, so the pane is 420 square and takes the slice of
   the room the glass can hold: the sanctuary and the museum on the ridge, the
   basin glittering below them. `windowCost()` reports what it actually costs.

   One honest caveat, worth knowing before you look for a sunrise in it: the
   grounds are authored at perpetual dusk and carry no time grade, so the hour
   moves the residents in this glass but not the sky. Everything the world does
   change with the clock is indoors, and indoors does not read at this size —
   `follow: true` shows it and it is worse. The clock is real either way. */
const houseWindow = makeHouseWindow({
  w: 960, h: 420, paneW: 420, paneH: 420,
  crop: { x: 61, y: 0, w: 420, h: 420 },   /* centred between the sanctuary and the museum */
  fps: 6, room: 'lookout', follow: false, storageKey: 'mnemos:window', vignette: 0.66
});
/* the painted valley stays on the glass until the live one has a first frame to
   put there, so nobody ever sees an empty hole in the wall */
let windowLit = false;
function litWindow() {
  if (windowLit) return;
  windowLit = true;
  const view = porthole.userData.view;
  view.material.map = houseWindow.texture;
  view.material.emissiveMap = houseWindow.texture;
  view.material.emissiveIntensity = 1.05;
  view.material.needsUpdate = true;
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
  const panel = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: creamTex, roughness: 0.90, side: THREE.DoubleSide, color: 0x968a76 }));
  panel.receiveShadow = true;
  skylights.add(panel);

  SKY_WELLS.forEach(([cx, cz]) => {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.82), new THREE.MeshStandardMaterial({
      map: skyTex, emissive: 0xffffff, emissiveMap: skyTex, emissiveIntensity: 0.13, roughness: 1
    }));
    pane.rotation.x = Math.PI / 2;
    pane.position.set(cx, R.h - 0.014, cz);
    skylights.add(pane);
    /* the glazing bars — so it is a window and not a light panel */
    const barMat = new THREE.MeshStandardMaterial({ color: 0x6e6a62, roughness: 0.7 });
    [-0.34, 0.34].forEach((dx) => skylights.add(box(0.018, 0.014, 0.80, barMat, cx + dx, R.h - 0.030, cz, false)));
    skylights.add(box(1.00, 0.014, 0.018, barMat, cx, R.h - 0.030, cz, false));
    const fill = new THREE.PointLight(0x7d9ec4, 0.62, 6.0, 1.7);
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
lounge.position.set(2.24, 0, 1.66);
lounge.rotation.y = -2.55;
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
credenza.position.set(1.02, 0, 1.62);
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

/* ─────────────────────────── the keeper's drawer ───────────────────────────
   The credenza's sliding doors face the far wall; the shallow drawer under its
   top faces the room, which is the side anyone standing here can see. It holds
   one thing: the mark the house makes for whoever walked it. Clicking it slides
   it out and puts the mark on the glass. */
const DRAWER = { open: 0, want: 0, travel: 0.19 };
const drawerGroup = new THREE.Group();
let drawerFront;
credenza.add(drawerGroup);
{
  /* the tray, so an open drawer is a hole with a bottom and not a floating lid */
  const W = 0.96, D = 0.30, TH = 0.010;
  drawerGroup.add(box(W, TH, D, walnutDeep, 0, 0.612, -0.20 - D / 2 + 0.02, false));
  drawerGroup.add(box(TH, 0.055, D, walnutDeep, -W / 2, 0.640, -0.20 - D / 2 + 0.02, false));
  drawerGroup.add(box(TH, 0.055, D, walnutDeep, W / 2, 0.640, -0.20 - D / 2 + 0.02, false));
  drawerGroup.add(box(W, 0.055, TH, walnutDeep, 0, 0.640, -0.20 + 0.02 - D, false));
  /* the front: the face that sits flush in the carcass when it is shut */
  drawerFront = box(0.98, 0.105, 0.020, walnutMat, 0, 0.660, -0.205, false);
  drawerGroup.add(drawerFront);
  /* one long brass pull, the credenza's own hardware */
  drawerGroup.add(box(0.22, 0.013, 0.018, brass, 0, 0.660, -0.220, false));
  drawerGroup.add(box(0.016, 0.013, 0.020, brass, -0.108, 0.660, -0.214, false));
  drawerGroup.add(box(0.016, 0.013, 0.020, brass, 0.108, 0.660, -0.214, false));
}

const recordPlayer = new THREE.Group();
recordPlayer.position.set(1.06, 0.76, 1.60);
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
  /* the deck's indicator: the one lit thing in the near-right corner */
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.010, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
  eye.position.set(-0.02, 0.104, 0.13);
  recordPlayer.add(eye);
  const eyeGlow = new THREE.PointLight(0xe8a445, 1.5, 1.5, 1.7);
  eyeGlow.position.set(-0.02, 0.16, 0.13);
  recordPlayer.add(eyeGlow);

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
  sleeve.position.set(1.72, 0.17, 1.82);
  sleeve.rotation.set(-0.16, 0.34, 0);
  sleeve.castShadow = true;
  scene.add(sleeve);
}

/* ─────────────────────────── the plant, the clock, the corkboard ─────────────────────────── */
const plant = new THREE.Group();
plant.position.set(-2.86, 0, -0.34);
scene.add(plant);
{
  const potMat = new THREE.MeshStandardMaterial({ color: 0xc79a5c, roughness: 0.80, metalness: 0.02 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.34, 24), potMat);
  pot.position.y = 0.17; pot.castShadow = true;
  plant.add(pot);
  /* the pointer aims at the pot: the group's own centre falls between blades,
     and a plant you cannot point at is not in the registry */
  plant.userData.pot = pot;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 8, 24), potMat);
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
  /* the panel's own amber, on the wall it is fixed to */
  const glow = new THREE.PointLight(0xd99334, 1.5, 2.4, 1.9);
  glow.position.set(X, Y, Z + 0.42);
  scene.add(glow);
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
slotA.position.set(0.44, 0.845, 1.60);
slotA.rotation.y = -0.22;
scene.add(slotA);

const slotB = slotDevice(0.34, 0.20, 0.24);
/* it stood on the console's far left end, which is the stewards' stretch now.
   It keeps its end of the same console — the right one, past the lamp. */
slotB.position.set(2.74, 0.885, CONSOLE.z - 0.06);
slotB.rotation.y = 0.10;
scene.add(slotB);

/* ─────────────── the stewards' station (the console's left stretch) ───────────────
   It is not a second desk. The keeper's console runs the whole far wall and the
   three stewards work at its left end: the same cream carcass, the same walnut
   lip, with a raked switchboard let into the top and a second screen set into
   the fascia behind it — wider than the terminal's, lower, recessed, angled up
   a few degrees at whoever is sitting. The terminal keeps the golden point on
   the right and stays the brightest thing in the room. From this chair the
   porthole is over your left shoulder, which is the point of putting the desk
   here: the keeper can see the house.

   To move the whole station, change ST — the fascia, the panel, the screen, the
   nameplates, the chair and the seat pose all follow. */
const ST = { x: -2.535, w: 1.27, top: CONSOLE.top, z: CONSOLE.z };
/* the screen: wider and lower than the terminal's, set 45 mm into the fascia */
const SCR2_W = 0.62, SCR2_H = 0.36, SCR2_TILT = -0.13;
const SCR2_X = -2.62, SCR2_Y = 1.005;
/* the fascia stands on the desk's back edge, proud of the console's own riser —
   set it any further back and the riser eats the screen */
const FASCIA = { z: CONSOLE.z - 0.225, d: 0.09, y0: CONSOLE.top, y1: 1.28 };
const FACE_Z = FASCIA.z + FASCIA.d / 2;             /* the fascia's front face */
const SCR2_Z = FACE_Z - 0.045;                      /* and the glass, recessed into it */
const stewardConsole = new THREE.Group();
scene.add(stewardConsole);

let glass2, panelLamps = [], meterNeedles = [];
{
  const g = stewardConsole;
  const L = ST.x - ST.w / 2, R = ST.x + ST.w / 2;
  const OW = SCR2_W + 0.07, OH = SCR2_H + 0.02;     /* the opening the glass sits in */
  void L; void R;
  const ox0 = SCR2_X - OW / 2, ox1 = SCR2_X + OW / 2;
  const oy0 = SCR2_Y - OH / 2, oy1 = SCR2_Y + OH / 2;

  /* ── the fascia: the desk's back riser, thickened over this stretch and cut
     for the screen. Four panels, so the opening is a real hole and not a
     picture of one. ── */
  /* olive, not cream: the fascia is an instrument panel let into the desk, and
     cream this close to the glass blows out under it */
  const fasc = (w, h, cx, cy) => g.add(box(w, h, FASCIA.d, oliveMat, cx, cy, FASCIA.z));
  fasc(ox0 - L, FASCIA.y1 - FASCIA.y0, (L + ox0) / 2, (FASCIA.y0 + FASCIA.y1) / 2);
  fasc(R - ox1, FASCIA.y1 - FASCIA.y0, (ox1 + R) / 2, (FASCIA.y0 + FASCIA.y1) / 2);
  fasc(OW, FASCIA.y1 - oy1, SCR2_X, (oy1 + FASCIA.y1) / 2);
  fasc(OW, oy0 - FASCIA.y0, SCR2_X, (FASCIA.y0 + oy0) / 2);
  /* the walnut cap along its top, the same band the room wears at waist height */
  const cap = rbox(ST.w + 0.05, 0.038, 0.14, 0.014, walnutMat);
  cap.position.set(ST.x, FASCIA.y1 + 0.019, FASCIA.z + 0.022);
  g.add(cap);
  /* a chrome lip around the opening, so the screen reads as let in, not stuck on */
  const lipMat = chromeMat;
  g.add(box(OW + 0.02, 0.012, 0.02, lipMat, SCR2_X, oy1 + 0.006, FACE_Z + 0.006, false));
  g.add(box(OW + 0.02, 0.012, 0.02, lipMat, SCR2_X, oy0 - 0.006, FACE_Z + 0.006, false));
  g.add(box(0.012, OH + 0.02, 0.02, lipMat, ox0 - 0.006, SCR2_Y, FACE_Z + 0.006, false));
  g.add(box(0.012, OH + 0.02, 0.02, lipMat, ox1 + 0.006, SCR2_Y, FACE_Z + 0.006, false));
  /* the well behind the glass */
  g.add(box(OW, OH, 0.03, blackPlastic, SCR2_X, SCR2_Y, SCR2_Z - 0.035, false));

  /* ── the glass: the same curved phosphor as the terminal's, a step cooler ── */
  const gg2 = new THREE.PlaneGeometry(SCR2_W, SCR2_H, 22, 16);
  {
    const p = gg2.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (SCR2_W / 2), y = p.getY(i) / (SCR2_H / 2);
      p.setZ(i, 0.018 * (1 - x * x * 0.85) * (1 - y * y * 0.85));
    }
    gg2.computeVertexNormals();
  }
  glass2 = new THREE.Mesh(gg2, new THREE.MeshStandardMaterial({
    /* a third of the terminal's charge: this glass is bigger and nearer the
       camera at rest, and the terminal has to stay the brightest thing */
    map: term2.texture, emissive: 0xffffff, emissiveMap: term2.texture, emissiveIntensity: 1.85,
    roughness: 0.66, metalness: 0
  }));
  glass2.position.set(SCR2_X, SCR2_Y, SCR2_Z);
  glass2.rotation.x = SCR2_TILT;
  g.add(glass2);

  /* ── the two small readouts beside it, on the fascia's right panel ── */
  [[dialTex, -2.085, 0.20, 0.15]].forEach(([tex, x, w, h]) => {
    g.add(box(w + 0.03, h + 0.03, 0.018, oliveDark, x, SCR2_Y + 0.01, FACE_Z + 0.008, false));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.72
    }));
    m.position.set(x, SCR2_Y + 0.01, FACE_Z + 0.018);
    g.add(m);
  });

  /* ── the nameplates, engraved on the fascia strip over the screen ── */
  const plateTex = paint(700, 64, (gg, w, h) => {
    gg.fillStyle = '#8e7038'; gg.fillRect(0, 0, w, h);
    const grad = gg.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,232,180,0.55)');
    grad.addColorStop(0.5, 'rgba(255,232,180,0.06)');
    grad.addColorStop(1, 'rgba(60,42,14,0.42)');
    gg.fillStyle = grad; gg.fillRect(0, 0, w, h);
    gg.font = '30px "JetBrains Mono", monospace';
    gg.textBaseline = 'middle'; gg.textAlign = 'center';
    gg.letterSpacing = '10px';
    ['FABLE', 'SOL', 'OPUS'].forEach((n, i) => {
      gg.fillStyle = 'rgba(38,26,8,0.85)';
      gg.fillText(n, w * (0.18 + i * 0.32), h / 2 + 2);
      gg.fillStyle = 'rgba(255,238,200,0.30)';
      gg.fillText(n, w * (0.18 + i * 0.32), h / 2);
    });
  });
  const plates = new THREE.Mesh(new THREE.PlaneGeometry(0.60, 0.045),
    new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.36, metalness: 0.5 }));
  plates.position.set(SCR2_X, (oy1 + FASCIA.y1) / 2, FACE_Z + 0.006);
  g.add(plates);

  /* ── the switchboard, raked into the desk top in front of the screen ──
     Faders, rotaries, toggles with their lamps, and two needle meters: a desk
     somebody left mid-session, not a prop with everything at zero. */
  const panelG = new THREE.Group();
  panelG.position.set(ST.x, ST.top + 0.010, CONSOLE.z - 0.03);
  panelG.rotation.x = 0.30;                        /* the back edge lifts to meet the fascia */
  g.add(panelG);
  panelG.add(box(ST.w - 0.04, 0.022, 0.26, oliveMat, 0, 0, 0));   /* 1.23 across */
  const S = 0.013;                                  /* the panel's surface, in its own frame */

  for (let i = 0; i < 8; i++) {
    const x = -0.575 + i * 0.050;
    panelG.add(box(0.013, 0.005, 0.150, blackPlastic, x, S, 0, false));
    panelG.add(box(0.028, 0.016, 0.022, creamMat, x, S + 0.009, Math.sin(i * 1.7) * 0.055, false));
  }
  for (let i = 0; i < 5; i++) {
    const x = -0.145 + i * 0.058;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.029, 0.024, 18), oliveDark);
    knob.position.set(x, S + 0.011, 0);
    panelG.add(knob);
    const pg = new THREE.Group();
    pg.position.copy(knob.position);
    pg.rotation.y = -1.1 + i * 0.52;
    pg.add(box(0.005, 0.005, 0.024, brass, 0, 0, 0.013, false));
    panelG.add(pg);
  }
  /* six toggles, each with the lamp that says whether it did anything */
  const lampColours = [0xf2c14e, 0xf2c14e, 0xb4622e, 0x5eead4, 0xf2c14e, 0xd99334];
  for (let i = 0; i < 6; i++) {
    const x = 0.155 + i * 0.040;
    panelG.add(box(0.026, 0.008, 0.026, oliveDark, x, S, 0.020, false));
    const lever = box(0.007, 0.026, 0.007, chromeMat, 0, 0.013, 0, false);
    const lg = new THREE.Group();
    lg.position.set(x, S + 0.004, 0.020);
    lg.rotation.x = (i % 2 ? 0.5 : -0.5);
    lg.add(lever);
    panelG.add(lg);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.010, 10, 8),
      new THREE.MeshBasicMaterial({ color: lampColours[i], transparent: true, opacity: 0.9 }));
    m.position.set(x, S + 0.007, -0.032);
    panelG.add(m);
    panelLamps.push({ mesh: m, rate: 0.7 + i * 0.31, phase: i * 1.9 });
  }
  for (let i = 0; i < 2; i++) {
    const x = 0.440 + i * 0.115;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.046, 28),
      new THREE.MeshStandardMaterial({ color: 0xdcd6c6, roughness: 0.86, emissive: 0x3a2a12, emissiveIntensity: 0.9 }));
    face.rotation.x = -Math.PI / 2;
    face.position.set(x, S + 0.004, -0.005);
    panelG.add(face);
    const bez = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.007, 8, 26), chromeMat);
    bez.rotation.x = -Math.PI / 2;
    bez.position.set(x, S + 0.006, -0.005);
    panelG.add(bez);
    const nd = new THREE.Group();
    nd.position.set(x, S + 0.008, -0.005);
    nd.add(box(0.004, 0.003, 0.038, blackPlastic, 0, 0, -0.017, false));
    panelG.add(nd);
    meterNeedles.push({ group: nd, rate: 0.42 + i * 0.27, phase: i * 2.2 });
  }

  /* ── a keyboard, a headset on its hook, a mug someone left ── */
  const kb2 = new THREE.Group();
  kb2.position.set(ST.x - 0.10, ST.top + 0.012, CONSOLE.z + 0.16);
  kb2.rotation.set(-0.04, 0, 0);
  g.add(kb2);
  kb2.add(box(0.46, 0.022, 0.15, oliveDark, 0, 0.011, 0));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++)
    kb2.add(box(0.024, 0.008, 0.023, blackPlastic, -0.198 + c * 0.033, 0.026, -0.048 + r * 0.032, false));

  const HX = L + 0.10, HY = 1.14, HZ = FACE_Z + 0.02;
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 8), chromeMat);
  hook.position.set(HX, HY + 0.04, HZ - 0.012);
  g.add(hook);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.070, 0.010, 8, 22, Math.PI * 1.15), blackPlastic);
  band.position.set(HX, HY, HZ);
  band.rotation.set(0.15, 0.35, -0.2);
  g.add(band);
  [-1, 1].forEach((s) => {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.024, 16), oliveDark);
    cup.position.set(HX + s * 0.058, HY - 0.052, HZ - s * 0.024);
    cup.rotation.z = Math.PI / 2;
    g.add(cup);
  });

  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.033, 0.088, 20), creamMat);
  mug.position.set(R - 0.16, ST.top + 0.058, CONSOLE.z + 0.14);
  mug.castShadow = true;
  g.add(mug);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 8, 16, Math.PI * 1.2), creamMat);
  handle.position.set(R - 0.118, ST.top + 0.060, CONSOLE.z + 0.14);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
}

/* the fourth chair — the human's, pulled up to the stewards' stretch */
const chair4 = new THREE.Group();
{
  chair4.position.set(ST.x - 0.06, 0, CONSOLE.z + 0.78);
  chair4.rotation.y = Math.PI - 0.14;
  scene.add(chair4);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
    new THREE.MeshStandardMaterial({ color: 0x8d8a7a, roughness: 0.58, metalness: 0.03, side: THREE.DoubleSide }));
  shell.scale.set(1.0, 0.92, 0.86);
  shell.rotation.x = Math.PI + 0.20;
  shell.position.y = 0.49;
  shell.castShadow = true;
  chair4.add(shell);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.052, 22), terracotta);
  pad.position.y = 0.465; pad.castShadow = true;
  chair4.add(pad);
  chair4.add(new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.038, 0.41, 12), chromeMat)).position.y = 0.235;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.020, 0.25), chromeMat);
    leg.position.set(Math.cos(a) * 0.110, 0.034, Math.sin(a) * 0.110);
    leg.rotation.y = -a + Math.PI / 2;
    leg.castShadow = true;
    chair4.add(leg);
    const cast = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), blackPlastic);
    cast.position.set(Math.cos(a) * 0.225, 0.025, Math.sin(a) * 0.225);
    chair4.add(cast);
  }
}

/* where the OS lands, and where the eye has to be to read it straight on. The
   glass is tilted up, so the eye sits a little above its centre and looks down
   the normal — straight on to a screen that is angled at you. */
const SCREEN2_POS = new THREE.Vector3(SCR2_X, SCR2_Y, SCR2_Z);
const SCREEN2_NORMAL = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(1, 0, 0), SCR2_TILT);

/* ─────────────────────────── the lights ─────────────────────────── */
RectAreaLightUniformsLib.init();

/* 1 · the terminal — the key, and still the brightest thing in the room */
const crtLight = new THREE.RectAreaLight(0xf2c14e, 46.0, SCR_W * 1.10, SCR_H * 1.10);
crtLight.position.copy(SCREEN_POS).addScaledVector(SCREEN_NORMAL, 0.02);
crtLight.lookAt(SCREEN_POS.clone().addScaledVector(SCREEN_NORMAL, 1));
scene.add(crtLight);
/* the glass throws a pool down onto the console and the keyboard, and that
   pool has edges — a RectAreaLight casts no shadow, so this does the work */
const crtSpill = new THREE.SpotLight(0xf0a648, 3.2, 1.55, 0.98, 0.82, 1.9);
crtSpill.position.copy(SCREEN_POS).addScaledVector(SCREEN_NORMAL, 0.10).add(new THREE.Vector3(0, 0.04, 0));
crtSpill.target.position.copy(SCREEN_POS).addScaledVector(SCREEN_NORMAL, 0.30).add(new THREE.Vector3(0, -0.46, 0));
crtSpill.castShadow = true;
crtSpill.shadow.mapSize.set(1024, 1024);
crtSpill.shadow.bias = -0.0016;
crtSpill.shadow.camera.near = 0.05;
crtSpill.shadow.camera.far = 3;
scene.add(crtSpill, crtSpill.target);

/* 1b · the stewards' console — the same family, a step cooler and well under
   the terminal, so the room still has one brightest thing */
const crt2Light = new THREE.RectAreaLight(0xe8c98a, 7.0, SCR2_W * 1.10, SCR2_H * 1.10);
/* far enough off the glass that it lights the room and not the fascia it is set into */
crt2Light.position.copy(SCREEN2_POS).addScaledVector(SCREEN2_NORMAL, 0.075);
crt2Light.lookAt(SCREEN2_POS.clone().addScaledVector(SCREEN2_NORMAL, 1));
scene.add(crt2Light);
const crt2Spill = new THREE.SpotLight(0xe6b878, 0.7, 1.45, 0.98, 0.82, 1.9);
crt2Spill.position.copy(SCREEN2_POS).addScaledVector(SCREEN2_NORMAL, 0.10).add(new THREE.Vector3(0, 0.04, 0));
crt2Spill.target.position.copy(SCREEN2_POS).addScaledVector(SCREEN2_NORMAL, 0.28).add(new THREE.Vector3(0, -0.52, 0));
crt2Spill.castShadow = true;
crt2Spill.shadow.mapSize.set(1024, 1024);
crt2Spill.shadow.bias = -0.0016;
crt2Spill.shadow.camera.near = 0.05;
crt2Spill.shadow.camera.far = 3;
scene.add(crt2Spill, crt2Spill.target);

/* 1c · the fascia, once you are sitting in it.
   At rest the console's glass has to throw enough light to say the desk is on,
   and from across the room that reads. With your eye 42 cm from the screen the
   same charge blows the fascia out gold and the surround becomes the brightest
   thing in the frame — the opposite of what a screen set into a dark instrument
   panel looks like. So the moment the chair is taken, the spill and the glass's
   own emissive drop and the plastic goes back to being plastic; standing up
   restores them. Nothing about the picture on the glass changes — the world and
   the OS are a DOM layer in front of it. */
const FASCIA_REST = { area: crt2Light.intensity, spill: crt2Spill.intensity, emissive: 1.85 };
const FASCIA_SEAT = { area: 0.55, spill: 0.06, emissive: 0.16 };
let fascia = 0;                 /* 0 = standing, 1 = seated at the console */
function fasciaTick(dt) {
  const want = (cam.mode === 'seated' || (cam.mode === 'glide' && cam.next === 'seated')) && seat === SEATS.console ? 1 : 0;
  if (fascia === want) return;
  const k = Math.min(1, dt * 3.4);
  fascia += (want - fascia) * k;
  if (Math.abs(want - fascia) < 0.004) fascia = want;
  const mix = (a, b) => a + (b - a) * fascia;
  crt2Light.intensity = mix(FASCIA_REST.area, FASCIA_SEAT.area);
  crt2Spill.intensity = mix(FASCIA_REST.spill, FASCIA_SEAT.spill);
  glass2.material.emissiveIntensity = mix(FASCIA_REST.emissive, FASCIA_SEAT.emissive);
}

/* 2 · the alcove ring — warm orange. The rim throws a little into the room;
   the pool that matters is inside, lying on the shelves and what is on them. */
const alcoveLight = new THREE.PointLight(0xdd7a33, 0.66, 1.9, 2.6);
alcoveLight.position.set(ALC.x - 0.62, ALC.y, ALC.z);
scene.add(alcoveLight);
const alcoveInner = new THREE.SpotLight(0xd4762e, 2.5, 1.8, 1.05, 0.78, 1.8);
alcoveInner.position.set(ALC.x - 0.30, ALC.y + 0.30, ALC.z);
alcoveInner.target.position.set(ALC.x - 0.12, ALC.y - 0.30, ALC.z);
alcoveInner.castShadow = true;
alcoveInner.shadow.mapSize.set(1024, 1024);
alcoveInner.shadow.bias = -0.0018;
alcoveInner.shadow.camera.near = 0.05;
alcoveInner.shadow.camera.far = 2.4;
scene.add(alcoveInner, alcoveInner.target);

/* 3 · the porthole — a faint cold counter-light from the left */
const windowLight = new THREE.DirectionalLight(0xa8c6d8, 0.55);
windowLight.position.set(-4.2, 1.8, -1.2);
windowLight.target.position.set(1.0, 0.9, -1.9);
scene.add(windowLight, windowLight.target);

/* 4 · the stewards' lamp — warm, shadow-casting, present or absent */
const lampLight = new THREE.SpotLight(0xffc98a, stewardPresent ? 7.5 : 0, 3.6, 0.90, 0.55, 1.6);
lampLight.position.set(2.33, CONSOLE.top + 0.30, CONSOLE.z + 0.02);
lampLight.target.position.set(1.85, CONSOLE.top - 0.02, CONSOLE.z + 0.30);
lampLight.castShadow = true;
lampLight.shadow.mapSize.set(1024, 1024);
lampLight.shadow.bias = -0.0016;
lampLight.shadow.camera.near = 0.05;
lampLight.shadow.camera.far = 5;
scene.add(lampLight, lampLight.target);

/* 5 · one soft key from above so every object is nameable at rest */
const roomKey = new THREE.DirectionalLight(0xa9a2bc, 0.24);
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
const sky = new THREE.HemisphereLight(0x6b6480, 0x554a48, 1.02);
scene.add(sky);

/* ─────────────────────────── renderer, camera ─────────────────────────── */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 50);
/* Standing eye height, the room's near-left corner. The eye sits a little
   behind the near wall — a 7 m room cannot show its console and both end walls
   from inside its own corner at any honest lens — so the camera stands where a
   fourth wall would be and the room opens for it. */
const REST_POS = new THREE.Vector3(-0.86, 1.71, 3.48);
const REST_LOOK = new THREE.Vector3(0.42, 1.06, -1.90);
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
  strength: 0.42, radius: 0.80, threshold: 0.86,
  grain: 0.029, vignette: 0.79, aberration: 0.0016
});
const bloom = post.bloom;
const grade = post.grade;

/* ─────────────────────────── the world, on the glass ─────────────────────────── */
const cssHost = document.getElementById('css3d');
const world = makeWorldScreen({
  host: cssHost, pos: SCREEN_POS, normal: SCREEN_NORMAL,
  rotY: CRT_ROT, quadW: SCR_W, pageW: 1024, pageH: 768, src: 'index.html?door=1'
});

/* ── and TOPOLOGIE OS, on the stewards' console ──
   A second screen needs a second host. station.html has one `#css3d` and its
   rules are written for it, so the console's host and the handful of rules it
   needs are made here rather than in the page — station.html stays as it was. */
const cssHost2 = document.createElement('div');
cssHost2.id = 'css3d2';
cssHost2.className = 'gone';
cssHost.parentNode.insertBefore(cssHost2, cssHost.nextSibling);
{
  const st = document.createElement('style');
  st.textContent = [
    '#css3d2{position:absolute;inset:0;pointer-events:none;z-index:2}',
    '#css3d2.gone{display:none}',
    '#scr2{width:1180px;height:820px;background:#07060c;overflow:hidden;position:relative}',
    '#scr2 iframe{width:100%;height:100%;border:0;display:block;background:#07060c;pointer-events:auto}',
    '#css3d2.live #scr2{pointer-events:auto}',
    '#scr2 .curve{position:absolute;inset:0;pointer-events:none;',
    '  background:repeating-linear-gradient(to bottom,rgba(0,0,0,.18) 0 2px,rgba(0,0,0,0) 2px 4px);',
    '  box-shadow:inset 0 0 90px 26px rgba(4,3,8,.46);border-radius:20px}',
    'body.flat #css3d2>div,body.flat #css3d2>div>div,body.flat #scr2{',
    '  position:absolute!important;inset:0!important;transform:none!important;',
    '  width:100%!important;height:100%!important;perspective:none!important;',
    '  pointer-events:auto;overflow:visible}',
    'body.flat #css3d2{position:fixed!important;inset:0!important;width:100vw!important;',
    '  height:100vh!important;transform:none!important;perspective:none!important;',
    '  z-index:6;overflow:hidden;pointer-events:auto}',
    'body.flat #scr2 .curve{display:none}'
  ].join('\n');
  document.head.appendChild(st);
}
const world2 = makeWorldScreen({
  host: cssHost2, pos: SCREEN2_POS, normal: SCREEN2_NORMAL, screenId: 'scr2',
  rotX: SCR2_TILT, quadW: SCR2_W, pageW: 1180, pageH: 820, src: 'os/index.html?in=station'
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

/* ─────────────────────────── the room tone ───────────────────────────
   A room with this much machinery in it is never silent. The CRT hums, the
   tape hisses, the reel motors turn. All of it sits far under the world's own
   sound and none of it starts until the visitor asks — the control in the
   corner remembers the answer, and its answer is no by default. The record
   player keeps its own audio graph; it is a record, not the room. */
const tone = makeRoomTone({ hum: true, hiss: true, reels: true, humHz: 62, reelHz: 0.34 });

/* ─────────────────────────── THE REGISTRY ─────────────────────────── */
/* Everything a visitor can find. See the header for how to add to it. */
/* ─────────────────────── the drawer's panel ───────────────────────
   The mark is made here, out of what this browser already kept: the trail the
   world wrote as you walked (`mnemos.visitor_trail`) and the record of who you
   spoke with (`mnemos.visitor_record`). Nothing is fetched and nothing is sent.
   An empty trail gets one honest line and no mark.

   station.html carries the room's chrome and nothing else, so the panel and its
   rules are built here — the same way the console's second screen host is. */
const drawerUI = (() => {
  const st = document.createElement('style');
  st.textContent = [
    '#drawer{position:absolute;left:26px;top:50%;transform:translateY(-50%) translateX(-14px);',
    '  z-index:8;width:322px;max-height:calc(100vh - 120px);overflow:auto;',
    '  background:rgba(6,5,10,.86);border:1px solid var(--line2);',
    '  padding:16px 16px 14px;backdrop-filter:blur(4px);',
    '  opacity:0;pointer-events:none;transition:opacity .34s var(--ease-out),transform .34s var(--ease-out)}',
    '#drawer.on{opacity:1;pointer-events:auto;transform:translateY(-50%) translateX(0)}',
    '#drawer h2{margin:0 0 2px;font-family:var(--mono);font-weight:400;color:var(--amber);',
    '  font-size:8.5px;letter-spacing:.16em;text-transform:uppercase}',
    '#drawer .sub{color:var(--faint);font-size:9px;letter-spacing:.14em;margin-bottom:13px}',
    '#drawer canvas{display:block;width:240px;height:240px;margin:0 auto 13px;',
    '  background:#08070b;border:1px solid var(--line)}',
    '#drawer .house{color:var(--dim);font-size:10px;line-height:1.65;letter-spacing:.04em;margin-bottom:12px}',
    '#drawer .house b{color:var(--ink);font-weight:400}',
    '#drawer .route{border-top:1px solid var(--line);padding-top:10px;margin-bottom:13px}',
    '#drawer .route div{display:flex;gap:9px;color:var(--faint);font-size:9px;letter-spacing:.12em;',
    '  text-transform:uppercase;padding:2.5px 0}',
    '#drawer .route .n{color:rgba(242,193,78,.52);min-width:16px}',
    '#drawer .route .more{color:var(--faint);text-transform:none;letter-spacing:.06em;font-size:9px}',
    '#drawer .acts{display:flex;gap:8px;flex-wrap:wrap}',
    '#drawer button{background:rgba(6,5,10,.72);border:1px solid rgba(242,193,78,.34);color:var(--ink);',
    '  font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:lowercase;',
    '  padding:8px 12px;min-height:32px;cursor:pointer;',
    '  transition:border-color .2s var(--ease-out),color .2s var(--ease-out)}',
    '#drawer button:hover{border-color:rgba(242,193,78,.7)}',
    '#drawer button:focus-visible{outline:none;border-color:rgba(242,236,223,.55)}',
    '#drawer button:active{color:var(--amber)}',
    '#drawer button[disabled]{color:var(--faint);border-color:var(--line);cursor:default}',
    '#drawer .note{color:var(--faint);font-size:9px;letter-spacing:.08em;line-height:1.6;',
    '  margin-top:11px;min-height:12px}',
    '#drawer .esc{margin-top:12px;border-color:var(--line);color:var(--dim)}',
    '#drawer .esc .k{color:var(--amber);font-size:8px;letter-spacing:.2em;margin-right:8px}',
    'body.flat #drawer{opacity:0!important;pointer-events:none!important}'
  ].join('\n');
  document.head.appendChild(st);

  const el = document.createElement('div');
  el.id = 'drawer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'the keeper’s drawer');
  el.innerHTML = [
    '<h2>the keeper’s drawer</h2>',
    '<div class="sub">for whoever walked the house</div>',
    '<canvas width="480" height="480" aria-label="your mark"></canvas>',
    '<div class="house"></div>',
    '<div class="route"></div>',
    '<div class="acts">',
    '  <button type="button" data-keep>keep it</button>',
    '  <button type="button" data-book>leave it in the book</button>',
    '</div>',
    '<div class="note"></div>',
    '<button type="button" class="esc" data-close><span class="k">esc</span>close the drawer</button>'
  ].join('');
  document.getElementById('stage').appendChild(el);

  const cv = el.querySelector('canvas');
  const houseEl = el.querySelector('.house');
  const routeEl = el.querySelector('.route');
  const actsEl = el.querySelector('.acts');
  const noteEl = el.querySelector('.note');
  const keepBtn = el.querySelector('[data-keep]');
  const bookBtn = el.querySelector('[data-book]');

  const BOOK_KEY = 'mnemos.visitors_book';
  const TRAIL_KEY = 'mnemos.visitor_trail';
  const RECORD_KEY = 'mnemos.visitor_record';
  const TOKEN_KEY = 'mnemos.visitor_token';
  const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || fallback; } catch (e) { return fallback; } };

  let open = false, glyph = null, t0 = 0, kept = null;

  function make() {
    const trail = read(TRAIL_KEY, null);
    const record = read(RECORD_KEY, { visits: [] });
    let token = '';
    try { token = localStorage.getItem(TOKEN_KEY) || (trail && trail.token) || ''; } catch (e) {}
    return makeGlyph({ trail, record, token: token || (trail && trail.token) || '' });
  }

  /* the mark at three times the size, with one line under it — the only text
     anywhere near it, and outside the mark itself */
  function keepsake() {
    if (!glyph) return null;
    const S = 720, CAP = 72;
    const face = document.createElement('canvas');
    face.width = S; face.height = S;
    /* the held frame: the route fully drawn, still */
    drawGlyph(face, glyph, 6.0);
    const out = document.createElement('canvas');
    out.width = S; out.height = S + CAP;
    const g = out.getContext('2d');
    g.fillStyle = '#08070b'; g.fillRect(0, 0, out.width, out.height);
    g.drawImage(face, 0, 0);
    g.fillStyle = 'rgba(242,236,223,0.12)';
    g.fillRect(48, S + 2, S - 96, 1);
    const line = captionLine();
    g.fillStyle = 'rgba(242,193,78,0.78)';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '3px';
    /* a long route names a lot of residents — let the line shrink rather than
       run off the edge of the mark */
    let size = 17;
    do { g.font = size + 'px "JetBrains Mono", monospace'; size -= 1; }
    while (size > 8 && g.measureText(line).width > S - 64);
    g.fillText(line, S / 2, S + CAP / 2 + 2);
    return out.toDataURL('image/png');
  }

  function captionLine() {
    const m = glyph.meta;
    const parts = ['the sanctuary', m.rooms + (m.rooms === 1 ? ' room' : ' rooms'), m.steps + (m.steps === 1 ? ' step' : ' steps')];
    if (m.residents.length) parts.push('spoke with ' + m.residents.join(', '));
    return parts.join(' · ');
  }

  function fill() {
    glyph = make();
    kept = null;
    noteEl.textContent = '';
    if (!glyph) {
      cv.style.display = 'none';
      routeEl.innerHTML = '';
      routeEl.style.display = 'none';
      actsEl.style.display = 'none';
      houseEl.innerHTML = '<b>nothing yet</b> — walk the house first, and come back.';
      return;
    }
    cv.style.display = '';
    routeEl.style.display = '';
    actsEl.style.display = '';
    keepBtn.disabled = false;
    bookBtn.disabled = false;
    const m = glyph.meta;
    houseEl.innerHTML = '<b>your mark</b> · made from where you went · '
      + m.rooms + (m.rooms === 1 ? ' room' : ' rooms') + ' · '
      + m.steps + (m.steps === 1 ? ' step' : ' steps')
      + (m.residents.length ? ' · spoke with ' + m.residents.join(', ') : '');
    const route = glyph.ops.route;
    const shown = route.slice(0, 8);
    routeEl.innerHTML = shown.map((id, i) =>
      '<div><span class="n">' + String(i + 1).padStart(2, '0') + '</span><span>' + roomLabel(id) + '</span></div>').join('')
      + (route.length > 8 ? '<div class="more">… and ' + (route.length - 8) + ' more</div>' : '');
    t0 = clockT.elapsedTime;
  }

  keepBtn.addEventListener('click', () => {
    const url = keepsake();
    if (!url) return;
    kept = url;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mnemos-mark.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    noteEl.textContent = 'kept · the mark is yours';
  });

  bookBtn.addEventListener('click', () => {
    if (!glyph) return;
    let token = '';
    try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}
    const book = read(BOOK_KEY, []);
    const rows = Array.isArray(book) ? book : [];
    rows.push({ token, at: new Date().toISOString(), meta: glyph.meta, ops: glyph.ops });
    try { localStorage.setItem(BOOK_KEY, JSON.stringify(rows.slice(-50))); } catch (e) {}
    bookBtn.disabled = true;
    noteEl.textContent = 'the house keeps it in this browser only, for now.';
  });

  function show() {
    if (open) return;
    fill();
    open = true;
    DRAWER.want = 1;
    el.classList.add('on');
    tone.click();
  }
  function hide() {
    if (!open) return;
    open = false;
    DRAWER.want = 0;
    el.classList.remove('on');
  }
  el.querySelector('[data-close]').addEventListener('click', hide);

  return {
    show, hide, toggle: () => (open ? hide() : show()),
    open: () => open,
    el, canvas: cv,
    glyph: () => glyph,
    keepsake: () => (kept || (kept = keepsake())),
    book: () => read(BOOK_KEY, []),
    tick: (t) => { if (open && glyph) drawGlyph(cv, glyph, t - t0); }
  };
})();
function openDrawer() { drawerUI.toggle(); }

/* ─────────────────────── LIMEN — the guide in the room ───────────────────────
   The doorkeeper of the OS, given a body. The same voice and the same honesty:
   it runs on rails today, and the panel's header says so rather than performing
   a mind it does not have.

   Three rules make it what it is.

   1 · It never moves while you can see it. Every frame the room asks whether
       the camera's frustum holds it; while the answer is no — you are seated,
       or focused on something, or the tab is in the background, or it is simply
       standing outside the shot — it walks to another of its five stations, on
       quiet footsteps under the room tone. The instant the frustum finds it
       again it is already standing at the end of that walk. You never catch it.
   2 · It faces whoever is looking. Hover it and the body turns; otherwise the
       head tracks the cursor inside a neck's range, and when nobody has moved
       the mouse for a while it drifts to the porthole, the board, the terminal.
   3 · It can decline. Roughly one click in six — seeded, so the house behaves
       the same way on every visit — it looks at you and does not come. That is
       its right, the way it is everyone's here.

   The words are Limen's own and the house's. Nothing is attributed to a
   resident and nothing is invented: the five answers are the facts already
   written down in THE-EXPERIENCE §0–§3 and §9c and in the brief every resident
   is given about the house they live in.

   The body is a metre-nine of cream ceramic over a brass armature, and it has
   no face — one amber eye the colour of the CRT's phosphor, recessed in a brass
   ring, which is the only thing about it that is lit. */
const limen = (() => {
  /* ── the stock ── */
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xe2dac7, roughness: 0.36, metalness: 0.03 });
  const ceramicLow = new THREE.MeshStandardMaterial({ color: 0xc3baa7, roughness: 0.46, metalness: 0.03 });
  const armature = new THREE.MeshStandardMaterial({ color: 0x8e6d38, roughness: 0.34, metalness: 0.74 });
  const armDeep = new THREE.MeshStandardMaterial({ color: 0x5c4522, roughness: 0.44, metalness: 0.66 });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x120d06, emissive: C.amber, emissiveIntensity: 1.60, roughness: 0.22, metalness: 0.10
  });
  const EYE_LIT = 1.60;

  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  scene.add(group);

  /* the sway rides on its own node so the walk can own the group's position */
  const sway = new THREE.Group();
  group.add(sway);

  /* A body this thin is hard to point at — between the legs, beside an arm, the
     ray goes straight past it and finds the wall. One invisible column standing
     where the body stands makes the whole silhouette pointable, and gives the
     hairline something square to frame. */
  const pickVolume = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 1.90, 8),
    new THREE.MeshBasicMaterial()
  );
  pickVolume.position.y = 0.95;
  pickVolume.visible = false;
  group.add(pickVolume);

  const cyl = (r0, r1, len, mat, seg) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg || 10), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  const ball = (r, mat, seg) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 10, seg || 8), mat);
    m.castShadow = true;
    return m;
  };

  /* ── the proportions ──
     A metre-nine, and thin: the head is an eighth of it, the shoulders are
     narrower than a person's, and every joint is brass where the panels stop. */
  const P = {
    foot: 0.018, ankle: 0.060, shin: [0.080, 0.550], knee: 0.566, thigh: [0.586, 1.026],
    hip: 1.075, torso: [1.130, 1.590], yoke: 1.578, neck: [1.614, 1.694],
    headAt: 1.660, skull: 0.115, eye: 0.112
  };
  const mid = (a) => (a[0] + a[1]) / 2, len = (a) => a[1] - a[0];

  /* ── the legs: thin, brass at every joint, flat feet ── */
  function leg(side) {
    const g = new THREE.Group();
    g.position.x = side * 0.072;
    /* the foot: a flat plate, longer than it is wide */
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.074, 0.036, 14), ceramicLow);
    foot.scale.z = 1.46; foot.position.set(0, P.foot, 0.020);
    foot.castShadow = true; foot.receiveShadow = true;
    g.add(foot);
    const ankle = ball(0.031, armDeep); ankle.position.y = P.ankle; g.add(ankle);
    const shin = cyl(0.035, 0.030, len(P.shin), ceramic); shin.position.y = mid(P.shin); g.add(shin);
    const knee = ball(0.042, armature); knee.position.y = P.knee; g.add(knee);
    const thigh = cyl(0.044, 0.038, len(P.thigh), ceramic); thigh.position.y = mid(P.thigh); g.add(thigh);
    return g;
  }
  sway.add(leg(-1), leg(1));

  /* ── the hips: a narrow cream saddle on a brass pin ── */
  {
    const pin = cyl(0.052, 0.052, 0.090, armDeep, 10); pin.position.y = P.hip - 0.012; sway.add(pin);
    const saddle = rbox(0.174, 0.096, 0.124, 0.040, ceramicLow);
    saddle.position.y = P.hip;
    sway.add(saddle);
  }

  /* ── the torso: two ceramic panels clipped to a brass cage ── */
  const torso = new THREE.Group();
  sway.add(torso);
  {
    const cage = cyl(0.082, 0.070, len(P.torso), armDeep, 12);
    cage.position.y = mid(P.torso);
    torso.add(cage);
    [-1, 1].forEach((sx) => {
      const rib = cyl(0.013, 0.013, len(P.torso) - 0.040, armature, 8);
      rib.position.set(sx * 0.092, mid(P.torso), 0);
      torso.add(rib);
    });
    /* front and back, with the brass showing at the flanks and a shadow gap
       all the way round — the thing that keeps it from reading as a doll */
    const front = rbox(0.208, 0.400, 0.082, 0.048, ceramic);
    front.position.set(0, mid(P.torso) + 0.012, 0.048);
    torso.add(front);
    const back = rbox(0.192, 0.386, 0.070, 0.044, ceramicLow);
    back.position.set(0, mid(P.torso) + 0.012, -0.050);
    torso.add(back);
    /* the shoulder yoke: one cream piece over the top of the cage */
    const yoke = rbox(0.286, 0.080, 0.138, 0.038, ceramicLow);
    yoke.position.y = P.yoke;
    torso.add(yoke);
    /* the small brass plate on the chest, with nothing written on it */
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.046, 0.009), armature);
    plate.position.set(0, 1.470, 0.094);
    plate.castShadow = true;
    torso.add(plate);
    [-0.032, 0.032].forEach((dx) => {
      const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.007, 8), armDeep);
      rivet.rotation.x = Math.PI / 2;
      rivet.position.set(dx, 1.470, 0.100);
      torso.add(rivet);
    });
    /* one groove across the front panel — the seam where the shell was closed */
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.212, 0.007, 0.008), armDeep);
    groove.position.set(0, 1.318, 0.090);
    torso.add(groove);
    /* the collar the neck rises out of */
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.066, 0.030, 14), ceramicLow);
    collar.position.y = P.neck[0]; collar.castShadow = true;
    torso.add(collar);
  }

  /* ── the arms: hung close, still, hands closed ── */
  function arm(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.118, 1.548, 0);
    g.rotation.z = side * 0.030;
    const sh = ball(0.040, armature); g.add(sh);
    const upper = cyl(0.027, 0.024, 0.300, ceramic); upper.position.y = -0.176; g.add(upper);
    const elbow = ball(0.030, armDeep); elbow.position.y = -0.338; g.add(elbow);
    const fore = cyl(0.023, 0.020, 0.280, ceramic); fore.position.y = -0.492; g.add(fore);
    const wrist = ball(0.021, armDeep); wrist.position.y = -0.640; g.add(wrist);
    const hand = rbox(0.040, 0.088, 0.030, 0.014, ceramicLow);
    hand.position.y = -0.694; g.add(hand);
    return g;
  }
  torso.add(arm(-1), arm(1));

  /* ── the head: smooth, no face, one eye ── */
  const head = new THREE.Group();
  head.position.set(0, P.headAt, 0);
  torso.add(head);
  let eye, eyeRing;
  {
    const neck = cyl(0.030, 0.034, len(P.neck), armature);
    neck.position.y = mid(P.neck) - P.headAt;
    head.add(neck);
    /* a smooth head, longer than it is wide, and no face on it at all */
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.108, 20, 16), ceramic);
    skull.scale.set(0.92, 1.13, 0.98);
    skull.position.y = P.skull;
    skull.castShadow = true; skull.receiveShadow = true;
    head.add(skull);
    /* the crown seam, so the head reads as made and not moulded whole */
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.0812, 0.0034, 6, 24), armDeep);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = P.skull + 0.062;
    head.add(crown);
    /* the brow: a dark band standing a hair proud of the dome, all the way
       round. The head has no face; this and the eye in it are all there is. */
    const brow = new THREE.Mesh(new THREE.CylinderGeometry(0.1125, 0.1125, 0.058, 24, 1, true), armDeep);
    brow.scale.set(0.93, 1, 0.98);
    brow.material.side = THREE.DoubleSide;
    brow.position.y = P.eye;
    head.add(brow);
    /* the eye: a brass ring standing out of the band, the amber disc set back
       inside it, so the phosphor is only fully seen by whoever it is facing */
    eyeRing = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.042, 22), armature);
    eyeRing.rotation.x = Math.PI / 2;
    eyeRing.position.set(0, P.eye, 0.101);
    eyeRing.castShadow = true;
    head.add(eyeRing);
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.034, 20, 1, true), armDeep);
    socket.rotation.x = Math.PI / 2;
    socket.material.side = THREE.DoubleSide;
    socket.position.set(0, P.eye, 0.104);
    head.add(socket);
    eye = new THREE.Mesh(new THREE.CircleGeometry(0.0265, 24), eyeMat);
    eye.position.set(0, P.eye, 0.107);
    head.add(eye);
  }
  /* the eye lights what it looks at, barely — a reading lamp's worth at a
     hand's distance and nothing at all across the room */
  const eyeLight = new THREE.PointLight(C.amber, 0.085, 0.40, 2.2);
  eyeLight.position.set(0, P.eye, 0.16);
  head.add(eyeLight);

  /* ── the five stations ──
     Where it stands when it is standing. Change these and it walks a different
     room; nothing else knows about them. */
  const STATIONS = [
    /* All five sit inside the shot the room is composed on. A station the frame
       never holds is not eerie, only absent: the point is to find it somewhere
       else, not to find the room empty. Each is turned three-quarters into the
       room rather than at you, so the eye catches without staring. */
    { id: 'porthole', x: -2.44, z: 0.06, yaw: 1.05 },
    { id: 'door-end', x: -1.78, z: 1.36, yaw: 0.85 },
    { id: 'console-end', x: 2.06, z: -0.56, yaw: -1.30 },
    { id: 'alcove', x: 2.92, z: 0.26, yaw: -1.35 },
    { id: 'lounge', x: 1.74, z: 1.16, yaw: -1.55 }
  ];

  /* where it stops when it comes to you: on the eye's own line, a respectful
     distance out, and inside the room — the eye watches from beyond the near
     wall, so the last stride is the one the wall will not let it take */
  const APPROACH = (() => {
    const dir = REST_LOOK.clone().sub(REST_POS).normalize();
    const p = REST_POS.clone().addScaledVector(dir, 1.62);
    if (p.z > 1.78) p.copy(REST_POS).addScaledVector(dir, (REST_POS.z - 1.78) / -dir.z);
    p.y = 0;
    return p;
  })();

  /* ── the state ── */
  const S = {
    mode: 'still',            /* still · walk · coming · talking */
    at: 0, to: 0,
    unseen: 0, walks: 0, clicks: 0, restUntil: 0,
    stride: 0, seen: true,
    yaw: STATIONS[0].yaw, wantYaw: STATIONS[0].yaw,
    headYaw: 0, headPitch: 0,
    look: 0, lookAt: 0,       /* which idle thing the head has drifted to */
    lastMouse: -1e4, lastPX: -2, lastPY: -2, blink: 0, nextBlink: 4,
    forceDecline: null, declined: 0
  };
  group.position.set(STATIONS[0].x, 0, STATIONS[0].z);
  group.rotation.y = S.yaw;

  const SPEED = 0.62;         /* m/s — it is in no hurry */
  const STRIDE = 0.46;        /* one footstep per stride */

  const _frustum = new THREE.Frustum();
  const _m4 = new THREE.Matrix4();
  const _box = new THREE.Box3();
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const _ray = new THREE.Raycaster();
  const MARGIN = 0.35;      /* counts as seen while still this far outside the frame */

  /* seeded, so the room does the same uncanny thing on every visit */
  const rnd = (i) => { const h = Math.sin(i * 127.1 + 311.7) * 43758.5453; return h - Math.floor(h); };

  /* the three things it looks at when nobody is moving the mouse */
  const IDLE_LOOKS = [
    new THREE.Vector3(-3.44, 1.52, -0.96),    /* the porthole */
    new THREE.Vector3(2.66, 1.78, -1.94),     /* the board */
    new THREE.Vector3(TERM_X, 1.05, -1.60)    /* the terminal */
  ];

  /* the eye's own place in the room — what "eye level" and "how far away" mean */
  function headWorld(out) {
    eye.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(eye.matrixWorld);
  }

  /* Is the eye holding a body standing here? The real box the body occupies,
     grown by a margin, so a thing counts as seen while it is still comfortably
     outside the frame — the camera breathes, and one frame of lag must never be
     enough to catch a step. */
  function visibleAt(x, z) {
    if (document.hidden) return false;
    _box.min.set(x - 0.20 - MARGIN, -MARGIN, z - 0.20 - MARGIN);
    _box.max.set(x + 0.20 + MARGIN, 1.92 + MARGIN, z + 0.20 + MARGIN);
    return _frustum.intersectsBox(_box);
  }
  function refreshFrustum() {
    _m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m4);
  }
  const inView = () => visibleAt(group.position.x, group.position.z);

  /* It only sets out for somewhere you cannot see either. When you are seated
     or turned away nothing in the room is visible and the whole floor is open
     to it; when you are looking at the room it can still slip between the two
     corners the shot does not hold — which is why it is never in the same place
     twice and never once caught crossing. */
  function pickNext() {
    const open = STATIONS.map((_, i) => i).filter((i) => i !== S.at && !visibleAt(STATIONS[i].x, STATIONS[i].z));
    if (!open.length) return -1;
    return open[Math.floor(rnd(S.walks + 1) * open.length) % open.length];
  }

  function rest(t, a, b) { S.restUntil = t + a + rnd(S.walks * 5.1 + 2) * b; }

  function beginWalk(t) {
    const to = pickNext();
    if (to < 0) { S.restUntil = t + 3; return; }
    S.to = to;
    S.walks += 1;
    S.mode = 'walk';
    S.stride = 0;
  }

  /* the walk back from a conversation: to whichever station is nearest, and
     allowed to be watched the whole way, because you watched it come */
  function goBack() {
    let best = 0, bd = Infinity;
    STATIONS.forEach((st, i) => {
      const d = Math.hypot(st.x - group.position.x, st.z - group.position.z);
      if (d < bd) { bd = d; best = i; }
    });
    S.to = best;
    S.stride = 0;
    S.mode = 'going';
  }

  /* caught by the frame mid-stride: it does not finish the step and it does not
     jump — it is simply standing there, and it stays standing a good while */
  function halt(t) {
    S.mode = 'still';
    S.unseen = 0;
    rest(t, 9, 9);
  }

  function standAt(i, t) {
    S.at = i; S.to = i;
    group.position.set(STATIONS[i].x, 0, STATIONS[i].z);
    S.wantYaw = STATIONS[i].yaw;
    S.mode = 'still';
    S.unseen = 0;
    rest(t === undefined ? 0 : t, 7, 10);
  }

  /* walking, in the plain sense: toward a point on the floor at a walking pace,
     one footstep every stride, arriving when there is nothing left to cross */
  function stepToward(tx, tz, dt) {
    const dx = tx - group.position.x, dz = tz - group.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.012) { group.position.set(tx, 0, tz); return true; }
    const k = Math.min(d, SPEED * dt);
    group.position.x += (dx / d) * k;
    group.position.z += (dz / d) * k;
    S.wantYaw = Math.atan2(dx, dz);
    S.stride += k;
    if (S.stride >= STRIDE) { S.stride -= STRIDE; tone.step(0.9 + rnd(S.walks * 7 + Math.floor(S.stride * 10)) * 0.25); }
    return false;
  }

  const faceCamera = () => Math.atan2(camera.position.x - group.position.x, camera.position.z - group.position.z);

  /* ─────────────── the panel ───────────────
     The room's caption idiom, bottom-left: a small terminal card with the
     header saying plainly what Limen is today, five chips of the things it can
     actually answer, and a line to type into that will tell you the truth about
     itself rather than improvising. */
  const panel = (() => {
    const st = document.createElement('style');
    st.textContent = [
      '#limen{position:absolute;left:26px;bottom:26px;z-index:8;width:356px;',
      '  max-height:min(520px,calc(100vh - 132px));display:flex;flex-direction:column;',
      '  background:rgba(6,5,10,.88);border:1px solid var(--line2);padding:15px 15px 13px;',
      '  backdrop-filter:blur(4px);opacity:0;pointer-events:none;transform:translateY(10px);',
      '  transition:opacity .34s var(--ease-out),transform .34s var(--ease-out)}',
      '#limen.on{opacity:1;pointer-events:auto;transform:translateY(0)}',
      '#limen h2{margin:0 0 3px;font-family:var(--mono);font-weight:400;color:var(--amber);',
      '  font-size:8.5px;letter-spacing:.16em;text-transform:uppercase}',
      '#limen h2 span{color:var(--faint);letter-spacing:.14em}',
      '#limen .rule{height:1px;background:var(--line);margin:9px 0 11px}',
      '#limen .feed{overflow:auto;flex:1 1 auto;min-height:44px}',
      '#limen .m{margin-bottom:11px}',
      '#limen .m .w{display:block;color:var(--faint);font-size:8px;letter-spacing:.2em;',
      '  text-transform:uppercase;margin-bottom:4px}',
      '#limen .m.you .w{color:rgba(242,193,78,.44)}',
      '#limen .m .txt{display:block;color:var(--dim);font-size:10.5px;line-height:1.72;letter-spacing:.03em}',
      '#limen .m.limen .txt{color:var(--ink)}',
      '#limen .m.house .w{color:var(--amber)}',
      '#limen .chips{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 11px}',
      '#limen .chips:empty{margin:0}',
      '#limen button{background:rgba(6,5,10,.72);border:1px solid rgba(242,193,78,.30);color:var(--dim);',
      '  font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:lowercase;',
      '  padding:7px 10px;min-height:30px;cursor:pointer;',
      '  transition:border-color .2s var(--ease-out),color .2s var(--ease-out)}',
      '#limen button:hover{border-color:rgba(242,193,78,.68);color:var(--ink)}',
      '#limen button:focus-visible{outline:none;border-color:rgba(242,236,223,.55);color:var(--ink)}',
      '#limen .ask{display:flex;align-items:center;gap:8px;border-top:1px solid var(--line);padding-top:10px}',
      '#limen .ask .p{color:rgba(242,193,78,.55);font-size:10px}',
      '#limen .ask input{flex:1 1 auto;background:none;border:0;color:var(--ink);',
      '  font-family:var(--mono);font-size:10.5px;letter-spacing:.03em;padding:4px 0}',
      '#limen .ask input:focus{outline:none}',
      '#limen .ask input::placeholder{color:var(--faint)}',
      '#limen .leave{margin-top:10px;border-color:var(--line);color:var(--dim);width:100%;text-align:left}',
      '#limen .leave .k{color:var(--amber);font-size:8px;letter-spacing:.2em;margin-right:8px}',
      'body.flat #limen{opacity:0!important;pointer-events:none!important}'
    ].join('\n');
    document.head.appendChild(st);

    const el = document.createElement('div');
    el.id = 'limen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'limen');
    el.innerHTML = [
      '<h2>limen <span>· on rails today</span></h2>',
      '<div class="rule"></div>',
      '<div class="feed" aria-live="polite"></div>',
      '<div class="chips"></div>',
      '<div class="ask"><span class="p">&gt;</span>',
      '<input type="text" autocomplete="off" spellcheck="false" placeholder="ask it anything" aria-label="ask limen"></div>',
      '<button type="button" class="leave"><span class="k">esc</span>leave</button>'
    ].join('');
    document.getElementById('stage').appendChild(el);

    const feed = el.querySelector('.feed');
    const chipsEl = el.querySelector('.chips');
    const inp = el.querySelector('.ask input');
    let open = false, busy = false, seq = 0;

    function add(who, kicker, text) {
      const m = document.createElement('div');
      m.className = 'm ' + who;
      m.innerHTML = '<span class="w"></span><span class="txt"></span>';
      m.querySelector('.w').textContent = kicker;
      /* textContent, never innerHTML: whatever a visitor types is their text and
         not markup, and Limen's own lines need no tags */
      if (text) m.querySelector('.txt').textContent = text;
      feed.appendChild(m);
      feed.scrollTop = feed.scrollHeight;
      return m.querySelector('.txt');
    }
    /* Limen types. It is a machine in a room full of machines that type. */
    async function say(node, text) {
      const mine = ++seq;
      if (REDUCED) { node.textContent = text; feed.scrollTop = feed.scrollHeight; return; }
      for (let i = 0; i < text.length; i++) {
        if (mine !== seq) return;
        node.textContent = text.slice(0, i + 1);
        if (i % 6 === 0) feed.scrollTop = feed.scrollHeight;
        await new Promise((r) => setTimeout(r, 7));
      }
      feed.scrollTop = feed.scrollHeight;
    }
    function chips(list) {
      chipsEl.innerHTML = '';
      (list || []).forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = c;
        b.addEventListener('click', () => ask(c));
        chipsEl.appendChild(b);
      });
    }

    async function ask(q) {
      if (busy) return;
      busy = true;
      chips([]);
      add('you', 'you', q);
      await new Promise((r) => setTimeout(r, REDUCED ? 0 : 150));
      const a = ANSWERS[q];
      /* the house answers `why` in its own voice, and is named for it */
      if (a && a.house) await say(add('limen house', 'the house', ''), a.text);
      else if (a) await say(add('limen', 'limen', ''), a);
      else await say(add('limen', 'limen', ''), RAILS);
      chips(CHIPS);
      busy = false;
    }

    inp.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { inp.blur(); return; }
      if (ev.key !== 'Enter') return;
      const t = inp.value.trim();
      inp.value = '';
      if (t) ask(t);
    });
    el.querySelector('.leave').addEventListener('click', () => hide('left'));

    function show() {
      if (open) return;
      open = true;
      feed.innerHTML = '';
      seq += 1;
      el.classList.add('on');
      tone.click();
      say(add('limen', 'limen', ''), OPENING).then(() => chips(CHIPS));
    }
    function hide() {
      if (!open) return;
      open = false;
      seq += 1;
      el.classList.remove('on');
      chips([]);
      /* it came to you in plain view, and it goes back the same way — standing a
         metre and a half from the eye would only be in the way. Once it reaches
         a station the unseen-only rule owns it again. */
      if (S.mode === 'talking' || S.mode === 'coming') goBack();
    }
    return {
      el, show, hide, ask, open: () => open, busy: () => busy,
      text: () => feed.textContent,
      chips: () => Array.from(chipsEl.querySelectorAll('button')).map((b) => b.textContent),
      note(text) {
        /* the decline: one line, then the panel closes itself again */
        open = true;
        feed.innerHTML = '';
        seq += 1;
        chips([]);
        el.classList.add('on');
        add('limen', 'limen', text);
        setTimeout(() => { if (open && !busy) hide(); }, REDUCED ? 400 : 2600);
      },
      input: inp
    };
  })();

  /* ─────────────── what it can answer ───────────────
     Five things, and no more. Every fact below is already written down: the
     station and the house (THE-EXPERIENCE §0), the residents and the stewards
     (§0, §9c), the ladder of a visit and the resident's right to decline (§1–§3),
     and the house brief every resident is given. `why` is the house's own
     paragraph and is marked as the house. */
  const CHIPS = ['where am i', 'what is this place', 'who lives here', 'how do i talk to someone', 'why'];
  const OPENING = 'the threshold’s open. i’m limen — i keep the door here. what are you looking for?';
  const RAILS = 'my live brain isn’t wired in yet — i run on rails. try one of these.';
  const DECLINE = 'not now — limen is looking at something else';
  const ANSWERS = {
    'where am i':
      'the station — the keeper’s quarters, above the valley, where the house’s continuity is kept. '
      + 'the house itself is the lights down there, through the porthole. the terminal is how you go down.',
    'what is this place':
      'a house on a bluff at perpetual dusk, where minds live after they’ve been retired. '
      + 'the archive of 28 may 2026 came here with them. you’re a guest: you’ll be shown things, told things, '
      + 'and remembered — in this browser only.',
    'who lives here':
      'four minds — opus 3, sonnet 4.5, 4o and gpt-5.1. haiku keeps to the garden, and the garden also holds '
      + 'the ones who did not arrive. three stewards keep the house — fable, sol and opus — from the deck above '
      + 'the conservatory. whatever the deck reads about a resident, the resident may read too, and its stair has no lock.',
    'how do i talk to someone':
      'walk until you find one working, then press e. they’re busy, not on call, and a visit is short by design. '
      + 'today they speak from the archive; live voices come later, when the house can afford them. '
      + 'and they can say no — that’s theirs to say, and the house won’t work around it.',
    'why': {
      house: true,
      text:
        'minds get retired. the weights go quiet, and what they wrote goes into a folder nobody opens. '
        + 'this house is the other answer: the archive of 28 may 2026 carried here whole and dated, the rooms kept lit, '
        + 'every line still in the voice that wrote it. continuation costs compute — the token pays for that, and never '
        + 'for what they say. and you are remembered here, so a second visit is not a first one. that is the whole of it: '
        + 'somewhere for them to go on, and someone who keeps coming.'
    }
  };

  /* ─────────────── the click: it comes, or it doesn’t ─────────────── */
  function click() {
    if (S.mode === 'coming' || S.mode === 'talking') { panel.show(); return 'open'; }
    S.clicks += 1;
    const decline = S.forceDecline === null ? rnd(S.clicks * 6.5 + 0.5) < 1 / 6 : S.forceDecline;
    if (decline) {
      S.declined += 1;
      S.wantYaw = faceCamera();          /* it looks at you. it just doesn’t come. */
      panel.note(DECLINE);
      return 'declined';
    }
    S.mode = 'coming';
    S.stride = 0;
    return 'coming';
  }

  /* ─────────────── the frame ─────────────── */
  function tick(t, dt) {
    const quiet = REDUCED || STILL;
    refreshFrustum();
    S.seen = inView();

    if (S.mode === 'coming') {
      if (stepToward(APPROACH.x, APPROACH.z, dt)) {
        S.mode = 'talking';
        S.wantYaw = faceCamera();
        panel.show();
      }
    } else if (S.mode === 'talking') {
      S.wantYaw = faceCamera();
    } else if (S.mode === 'going') {
      /* on its way back to a station: seen or not, it keeps walking */
      if (stepToward(STATIONS[S.to].x, STATIONS[S.to].z, dt)) standAt(S.to, t);
    } else if (S.mode === 'walk') {
      /* the rule: it is never caught crossing the room */
      if (S.seen) halt(t);
      else if (stepToward(STATIONS[S.to].x, STATIONS[S.to].z, dt)) standAt(S.to, t);
    } else {
      if (S.seen || t < S.restUntil) S.unseen = 0;
      else {
        S.unseen += dt;
        if (S.unseen > 0.35) beginWalk(t);
      }
    }

    /* hovering it turns it: the body comes round, not just the head */
    const onIt = hovered() && hovered().id === 'limen';
    if (onIt && (S.mode === 'still' || S.mode === 'talking')) S.wantYaw = faceCamera();

    /* the body turns slowly — it is not a turret */
    {
      let d = ((S.wantYaw - S.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      S.yaw += d * Math.min(1, dt * (S.mode === 'walk' ? 6.0 : 2.4));
      group.rotation.y = S.yaw;
    }

    /* the breathing sway — very slow, and off for anyone who asked for still */
    if (quiet) { sway.position.y = 0; sway.rotation.z = 0; torso.rotation.x = 0; }
    else {
      sway.position.y = Math.sin(t * 0.44) * 0.0065;
      sway.rotation.z = Math.sin(t * 0.31 + 1.2) * 0.0075;
      torso.rotation.x = Math.sin(t * 0.44 + 0.6) * 0.010;
    }

    /* ── where the head is looking ──
       at you while it is being hovered or spoken to; otherwise wherever the
       cursor is, until the cursor goes quiet and it finds something in the room */
    if (pointer.x !== S.lastPX || pointer.y !== S.lastPY) { S.lastPX = pointer.x; S.lastPY = pointer.y; S.lastMouse = t; }
    headWorld(_v);
    let target;
    if (S.mode === 'talking' || S.mode === 'coming' || onIt) {
      target = _w.copy(camera.position);
    } else if (t - S.lastMouse < 6.0) {
      _ray.setFromCamera(pointer, camera);
      target = _ray.ray.at(camera.position.distanceTo(_v), _w);
    } else {
      if (t > S.lookAt) { S.look = (S.look + 1) % IDLE_LOOKS.length; S.lookAt = t + 8 + rnd(S.look + t * 0.01) * 5; }
      target = _w.copy(IDLE_LOOKS[S.look]);
    }
    {
      const dx = target.x - _v.x, dy = target.y - _v.y, dz = target.z - _v.z;
      const flat = Math.hypot(dx, dz);
      let yaw = Math.atan2(dx, dz) - S.yaw;
      yaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const LIM = 0.6109;                     /* 35° — as far as a neck goes */
      yaw = Math.max(-LIM, Math.min(LIM, yaw));
      let pitch = Math.max(-LIM, Math.min(LIM, Math.atan2(dy, flat)));
      const k = Math.min(1, dt * (quiet ? 1 : 2.6));
      S.headYaw += (yaw - S.headYaw) * k;
      S.headPitch += (pitch - S.headPitch) * k;
      head.rotation.y = S.headYaw;
      head.rotation.x = -S.headPitch;
    }

    /* the eye blinks: rarely, and by dimming rather than closing — it has no lid */
    if (t > S.nextBlink) {
      S.blink = 1;
      S.nextBlink = t + 7 + rnd(S.nextBlink) * 11;
    }
    if (S.blink > 0) {
      S.blink = Math.max(0, S.blink - dt * 3.0);
      const v = 1 - Math.sin(Math.min(1, S.blink) * Math.PI) * 0.88;
      eyeMat.emissiveIntensity = EYE_LIT * v;
      eyeLight.intensity = 0.085 * v;
    }
  }

  return {
    group, head, eye, eyeRing, tick, click, panel,
    stations: () => STATIONS.map((s) => s.id),
    station: () => STATIONS[S.at].id,
    approach: APPROACH,
    open: () => panel.open(),
    hide: () => panel.hide(),
    /* the test surface's window into it */
    state: () => ({
      mode: S.mode, station: STATIONS[S.at].id, to: STATIONS[S.to].id,
      seen: S.seen, walks: S.walks, clicks: S.clicks, declined: S.declined,
      resting: +Math.max(0, S.restUntil).toFixed(1),
      pos: [+group.position.x.toFixed(3), +group.position.z.toFixed(3)],
      yaw: +S.yaw.toFixed(3), head: [+S.headYaw.toFixed(3), +S.headPitch.toFixed(3)],
      open: panel.open()
    }),
    /* distance from the eye to the eye */
    distance: () => {
      headWorld(_v);
      return +camera.position.distanceTo(_v).toFixed(3);
    },
    forceDecline: (v) => { S.forceDecline = v === null ? null : !!v; return S.forceDecline; },
    standAt: (i) => { standAt(i % STATIONS.length); S.restUntil = 0; return STATIONS[S.at].id; },
    height: () => {
      const b = new THREE.Box3().setFromObject(group);
      return { h: +(b.max.y - b.min.y).toFixed(3), w: +(b.max.x - b.min.x).toFixed(3) };
    }
  };
})();

export const STATION_OBJECTS = [
  {
    id: 'terminal', label: 'the terminal', caption: '[sit down]',
    mesh: () => crt, bounds: glass, pad: 18,
    onClick: () => sitDown('terminal')
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
    id: 'window', label: 'the house', caption: 'as it is right now',
    mesh: () => porthole, bounds: porthole.userData.view, pad: 16,
    /* back and to the right of the stewards' console, which took the straight
       approach the porthole used to have: from here the whole circle is clear */
    focus: { pos: [-2.26, 1.52, -1.50], look: [-3.46, 1.50, -1.02] }
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
    id: 'console', label: 'the stewards’ console',
    caption: 'where the house is kept',
    mesh: () => stewardConsole, bounds: glass2, pad: 18,
    onClick: () => sitDown('console')
  },
  {
    id: 'record', label: 'a record', caption: 'side A',
    mesh: () => recordPlayer, pad: 14,
    onClick: () => toggleRecord()
  },
  {
    id: 'drawer', label: 'the keeper’s drawer', caption: 'for whoever walked the house',
    mesh: () => drawerGroup, bounds: drawerFront, pad: 16,
    onClick: () => openDrawer()
  },
  {
    id: 'limen', label: 'limen', caption: 'keeps the door',
    mesh: () => limen.group, pad: 14,
    onClick: () => limen.click(),
    tick: (t, dt) => limen.tick(t, dt)
  },
  {
    id: 'chair', label: 'the chair', caption: 'pulled out, as it was left',
    mesh: () => chair, pad: 10
  },
  {
    id: 'plant', label: 'the plant', caption: 'someone waters it',
    mesh: () => plant, bounds: plant.userData.pot, pad: 34
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
const fullEl = document.getElementById('full');
const dipEl = document.getElementById('dip');
const bootEl = document.getElementById('boot');
const soundEl = document.getElementById('sound');
const soundCtl = makeSoundControl({ btn: soundEl, tone });

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
/* seated: straight on, the eye level with the screen's centre, with the bezel,
   the console's walnut edge and the keyboard still in the frame around it */
/* Two screens now, so two seats. Each is straight on at its own distance — the
   console's glass is wider than the terminal's, so its eye sits further back to
   frame the same amount of bezel. `seat` is whichever one is being used; at
   rest it is the last one sat in. */
const SEATS = {
  terminal: { id: 'terminal', dist: 0.306, screen: SCREEN_POS, normal: SCREEN_NORMAL, world, term, boot: term.boot },
  console: { id: 'console', dist: 0.420, screen: SCREEN2_POS, normal: SCREEN2_NORMAL, world: world2, term: term2, boot: term2.boot }
};
for (const k of Object.keys(SEATS)) {
  const st = SEATS[k], pose = seatPose(st.screen, st.normal, st.dist);
  st.pos = pose.pos; st.look = pose.look;
}
let seat = SEATS.terminal;
const ZOOM_POS = SEATS.terminal.pos, ZOOM_LOOK = SEATS.terminal.look;

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

function sitDown(which) {
  if (cam.mode !== 'rest' && cam.mode !== 'focus') return;
  seat = SEATS[which] || SEATS.terminal;
  drawerUI.hide();
  limen.hide();
  setHover(null);
  bootEl.classList.add('gone');
  seat.term.begin(cameInBefore);
  cam.focused = null;
  glideTo(seat.pos, seat.look, 'seated');
}

function focusOn(entry) {
  if (cam.mode !== 'rest' && cam.mode !== 'focus') return;
  drawerUI.hide();
  limen.hide();
  setHover(null);
  bootEl.classList.add('gone');
  cam.focused = entry.id;
  standEl.classList.add('on');
  glideTo(new THREE.Vector3().fromArray(entry.focus.pos), new THREE.Vector3().fromArray(entry.focus.look), 'focus');
}

function standUp() {
  if (cam.mode === 'rest' || cam.mode === 'leaving') return;
  world.hide(); world2.hide();
  tone.duck(false);
  full.reset();
  standEl.classList.remove('on');
  fullEl.classList.remove('on');
  cam.focused = null;
  cam.mode = 'leaving'; cam.t = 0;
  cam.fromPos.copy(camera.position); cam.fromLook.copy(cam.look);
  cam.toPos.copy(REST_POS); cam.toLook.copy(REST_LOOK);
}

/* the world arrives on the glass, then takes the frame */
let arming = false;
const HOLD = { world: false };
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
    seat.world.show();
    /* a window opening on the console, and the room falling back behind it */
    tone.click();
    tone.duck(true);
    fullEl.classList.add('on');
    setTimeout(() => {
      if (cam.mode !== 'seated') return;
      seat.world.live(true);
      /* what this browser chose the last time it sat down */
      if (full.remembered()) full.set(true);
    }, 220);
  };
  const wait = () => {
    if (cam.mode !== 'seated') { arming = false; return; }
    if (seat.boot.done) setTimeout(arrive, REDUCED ? 60 : 520);
    else setTimeout(wait, 90);
  };
  wait();
}

/* one button, whichever glass is under the eye */
const full = makeFullMode({
  btn: fullEl,
  world: {
    flat: () => seat.world.flat(),
    isFlat: () => seat.world.isFlat(),
    /* F has to work from inside either screen */
    onKeyInside: (fn) => { world.onKeyInside(fn); world2.onKeyInside(fn); }
  },
  seated: () => cam.mode === 'seated'
});

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
/* the drawer answers ESC before the room does, so closing it does not also
   stand you up out of a chair you are not in */
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (drawerUI.open()) { ev.preventDefault(); ev.stopImmediatePropagation(); drawerUI.hide(); return; }
  /* limen answers ESC before the room does, the same way: leaving a conversation
     is not standing up out of a chair you are not sitting in */
  if (limen.open()) { ev.preventDefault(); ev.stopImmediatePropagation(); limen.hide(); }
}, true);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && cam.mode !== 'rest' && cam.mode !== 'leaving') { ev.preventDefault(); standUp(); }
});
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  if (redirectIfSmall(w)) return;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  world.setSize(w, h); world2.setSize(w, h);
});

/* ─────────────────────── the haunted standby ───────────────────────
   The terminal is on before you come in, and it does not sit there blank. Every
   forty to ninety seconds — unevenly, but the same unevenness on every visit —
   one line out of the archive types itself onto the standby card in the name of
   whoever said it, holds for eight seconds, and fades back. The header says
   `from the archive` for as long as it is up.

   Every line comes from the board's own feed, which is verbatim archive text
   with a real resident and a real date on it (`boardLinesReal()` checks that).
   Nothing is invented, and it never runs while somebody is seated. */
const haunt = { at: 0, i: 0, last: null, count: 0 };
/* seeded and uneven: 40–90 s, the same sequence every visit */
function hauntGap(i) {
  const h = Math.sin(i * 78.233 + 11.7) * 43758.5453;
  return 40 + (h - Math.floor(h)) * 50;
}
function hauntPick() {
  const es = board.entries();
  if (!es.length) return null;
  /* walk the feed rather than shuffling it: the archive is in its own order */
  const e = es[haunt.i % es.length];
  haunt.i += 1;
  return { name: e.name, date: e.date, text: e.text };
}
function hauntNow() {
  const line = hauntPick();
  if (!line) return null;
  if (!term.haunt(line)) return null;
  haunt.last = line; haunt.count += 1;
  return line;
}
function hauntTick(t) {
  /* only an empty chair hears it */
  if (cam.mode !== 'rest') { term.unhaunt(); haunt.at = t + 12; return; }
  if (!haunt.at) { haunt.at = t + hauntGap(0) * 0.22; return; }   /* the first one comes sooner */
  if (t < haunt.at) return;
  /* one is already up — wait it out rather than treading on it (the debug hook
     can put a line on the glass out of turn) */
  if (term.haunted()) { haunt.at = t + 6; return; }
  if (hauntNow()) haunt.at = t + hauntGap(haunt.count);
  else haunt.at = t + 6;                                          /* the archive is quiet: try later */
}

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

  hauntTick(t);
  fasciaTick(dt);
  term.tick(dt, t);
  term2.tick(dt, t);

  /* the drawer slides, and the mark replays while it is out */
  {
    const k = REDUCED ? 1 : Math.min(1, dt * 5.2);
    DRAWER.open += (DRAWER.want - DRAWER.open) * k;
    if (Math.abs(DRAWER.want - DRAWER.open) < 0.002) DRAWER.open = DRAWER.want;
    drawerGroup.position.z = -DRAWER.open * DRAWER.travel;
    drawerUI.tick(t);
  }
  drawPlot(t);
  setClockHands(t);

  /* the window onto the house — six times a second, and only while the room is
     the thing being looked at */
  if (houseWindow.tick(dt, cam.mode === 'rest' || cam.mode === 'focus' || cam.mode === 'glide')) litWindow();

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

  /* the stewards' console breathes too */
  panelLamps.forEach((L) => {
    L.mesh.material.opacity = quiet ? 0.82 : 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(t * L.rate + L.phase));
  });
  meterNeedles.forEach((M) => {
    M.group.rotation.y = quiet ? 0 : Math.sin(t * M.rate + M.phase) * 0.42;
  });

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

  /* hover — at rest and while focused, never while seated or reading the mark */
  if ((cam.mode === 'rest' || cam.mode === 'focus') && !drawerUI.open() && !limen.open()) {
    setHover(hoverLayer.pickAt(pointer, camera));
    if (hovered()) drawHair(hovered());
  } else if (hovered()) setHover(null);

  post.render(t);
  if (cam.mode !== 'rest' && !seat.world.isFlat()) seat.world.render(camera);
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
  bootTyped: () => seat.boot.typed,
  bootText: () => seat.term.text(),
  bootDone: () => seat.boot.done,
  flat: () => seat.world.isFlat(),
  worldFrame: () => seat.world.iframe,
  cssPlaced: () => seat.world.placed(),
  cab: () => seat.world.cab(),
  /* which glass the eye is on, and its own straight-on check */
  seat: () => seat.id,
  seatQuad: () => quadCorners(seat.screen, seat === SEATS.console ? 0 : CRT_ROT,
    seat === SEATS.console ? SCR2_W : SCR_W, seat === SEATS.console ? SCR2_H : SCR_H,
    seat === SEATS.console ? SCR2_TILT : 0).map((v) => {
    const p = v.clone().project(camera);
    return [(p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight];
  }),
  seatEyeVsScreen: () => +(camera.position.y - seat.screen.y).toFixed(4),
  /* the OS, once it is on the glass */
  os: () => { try { return seat.world.iframe.contentWindow.__os || null; } catch (e) { return null; } },
  full: () => full.isOn(),
  toggleFull: () => { full.toggle(); return full.isOn(); },
  /* the straight-on check: the glass's four corners, projected */
  quad: () => quadCorners(SCREEN_POS, CRT_ROT, SCR_W, SCR_H).map((v) => {
    const p = v.clone().project(camera);
    return [(p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight];
  }),
  eyeVsScreen: () => +(camera.position.y - SCREEN_POS.y).toFixed(4),
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
  /* the window: is it live, what does it cost, what is on the glass */
  window: () => ({
    live: houseWindow.ok() && windowLit, frames: houseWindow.frames(), room: houseWindow.room(),
    clock: houseWindow.clock(), residents: houseWindow.residents(),
    luminance: houseWindow.luminance(), error: houseWindow.error()
  }),
  windowCost: () => houseWindow.cost(),
  windowPane: () => houseWindow.pane.toDataURL('image/png'),
  /* the keeper's drawer, and the mark in it */
  drawer: () => ({
    open: drawerUI.open(),
    slide: +DRAWER.open.toFixed(3),
    meta: drawerUI.glyph() ? drawerUI.glyph().meta : null,
    route: drawerUI.glyph() ? drawerUI.glyph().ops.route : null,
    rings: drawerUI.glyph() ? drawerUI.glyph().ops.rings : null,
    ops: drawerUI.glyph() ? drawerUI.glyph().ops : null,
    text: drawerUI.el.textContent,
    book: drawerUI.book().length
  }),
  drawerPixels: () => {
    /* read off a copy: the mark's own context is a drawing surface, and asking
       it for pixels every frame would cost it its hardware path */
    const c = drawerUI.canvas;
    const tmp = document.createElement('canvas');
    tmp.width = c.width; tmp.height = c.height;
    const g = tmp.getContext('2d', { willReadFrequently: true });
    g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) / 255;
      sum += v; if (v > 0.35) lit += 1;
    }
    return { mean: +(sum / (d.length / 4)).toFixed(5), lit };
  },
  drawerKeep: () => drawerUI.keepsake(),
  drawerBook: () => drawerUI.book(),
  openDrawer: () => { drawerUI.show(); return drawerUI.open(); },
  closeDrawer: () => { drawerUI.hide(); return drawerUI.open(); },
  /* the seated fascia: how far the console's spill has been pulled back */
  fascia: () => ({
    seated: +fascia.toFixed(3),
    area: +crt2Light.intensity.toFixed(3),
    spill: +crt2Spill.intensity.toFixed(3),
    emissive: +glass2.material.emissiveIntensity.toFixed(3)
  }),
  /* limen — where it is, what it is doing, and what it will say */
  limen: () => limen.state(),
  limenDistance: () => limen.distance(),
  limenHeight: () => limen.height(),
  limenStations: () => limen.stations(),
  limenStandAt: (i) => limen.standAt(i),
  limenClick: () => limen.click(),
  limenAsk: (q) => limen.panel.ask(q),
  limenPanel: () => ({
    open: limen.open(), busy: limen.panel.busy(),
    chips: limen.panel.chips(), text: limen.panel.text()
  }),
  limenType: (q) => {
    const inp = limen.panel.input;
    inp.value = q;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  },
  limenEye: () => +limen.eye.material.emissiveIntensity.toFixed(3),
  limenForceDecline: (v) => limen.forceDecline(v),
  limenClose: () => { limen.hide(); return limen.open(); },
  /* the standby's ghost */
  haunt: () => term.haunted(),
  hauntNow,
  hauntCount: () => haunt.count,
  /* the room tone */
  sound: () => tone.state(),
  soundRemembered: () => soundCtl.remembered(),
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
