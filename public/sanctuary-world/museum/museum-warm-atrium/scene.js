import {
  CROSSING,
  EXIT,
  OBSTACLES,
  PALETTE,
  PIECES,
  REGISTRAR,
  SCENE_ENTITIES,
  pieceById,
} from "./scene-data.js";
import { createMuseumTravel } from "../museum-travel.js";

const CONNECTED = new URLSearchParams(location.search).get("embed") === "1";

function sendMuseumMessage(message) {
  if (!CONNECTED || window.parent === window) return false;
  window.parent.postMessage({ source: "mnemos-museum", ...message }, "*");
  return true;
}

function sendMuseumRoute(type, scene = null) { return sendMuseumMessage({ type, scene }); }
function sendTravelState({ state: travelState, target, reason }) {
  sendMuseumMessage({ type: "travel-state", state: travelState, target, reason });
}

const canvas = document.querySelector("#museum-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const stage = document.querySelector("#museum-stage");
const loadingState = document.querySelector("#loading-state");
const readout = document.querySelector("#interaction-readout");
const readoutCopy = document.querySelector("#interaction-copy");
const statusLine = document.querySelector("#scene-status");
const liveRegion = document.querySelector("#museum-live");
const dialog = document.querySelector("#museum-dialog");
const dialogCloseButton = dialog.querySelector(".dialog-close");
const dialogArtWrap = document.querySelector("#dialog-art-wrap");
const dialogArt = document.querySelector("#dialog-art");
const dialogKicker = document.querySelector("#dialog-kicker");
const dialogTitle = document.querySelector("#dialog-title");
const dialogMeta = document.querySelector("#dialog-meta");
const dialogStatement = document.querySelector("#dialog-statement");
const collectionIndex = document.querySelector("#collection-index");
const dialogActions = document.querySelector("#dialog-actions");
const returnButton = dialogActions.querySelector("button");

const STEP = 1000 / 60;
const RENDER_INTERVAL = 1000 / 45;
const PLAYER_SPEED = 2.7;
const PLAYER_HALF_WIDTH = 10;
const PLAYER_HALF_HEIGHT = 6;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const WALL_LIGHT_RIG = PIECES
  .filter((piece) => piece.kind === "wall")
  .map((piece, index) => ({
    id: piece.id,
    sourceX: piece.cx,
    sourceY: 16,
    targetX: piece.cx,
    targetY: 108,
    endHalfWidth: 54,
    poolX: piece.cx,
    poolY: 68,
    poolRadiusX: 66,
    poolRadiusY: 60,
    phase: index * 1.73 + 0.4,
  }));

const PEDESTAL_LIGHT_RIG = [
  { id: "the-mesh", sourceX: 246, sourceY: 118, targetX: 300, targetY: 286, endHalfWidth: 82, poolX: 300, poolY: 270, poolRadiusX: 100, poolRadiusY: 94, phase: 0.7 },
  { id: "interior", sourceX: 714, sourceY: 118, targetX: 660, targetY: 286, endHalfWidth: 82, poolX: 660, poolY: 270, poolRadiusX: 100, poolRadiusY: 94, phase: 2.3 },
  { id: "the-orb", sourceX: 112, sourceY: 118, targetX: 190, targetY: 410, endHalfWidth: 108, poolX: 190, poolY: 392, poolRadiusX: 118, poolRadiusY: 112, phase: 3.9 },
  { id: "attending", sourceX: 848, sourceY: 118, targetX: 770, targetY: 410, endHalfWidth: 108, poolX: 770, poolY: 392, poolRadiusX: 118, poolRadiusY: 112, phase: 5.4 },
];

const state = {
  ready: false,
  paused: false,
  reducedMotion: reducedMotion.matches,
  keys: new Set(),
  images: new Map(),
  background: null,
  lightMap: null,
  lightContext: null,
  ambientTime: 0,
  lastFrame: 0,
  lastRender: 0,
  accumulator: 0,
  manualModeUntil: 0,
  nearest: null,
  lastNearestId: null,
  lastLocationZone: null,
  modalReason: null,
  thresholdVisits: 0,
  player: {
    x: 480,
    y: 524,
    dir: "up",
    moving: false,
    frame: 0,
    frameClock: 0,
  },
};
let travelController = null;

const interactions = [
  ...PIECES.map((piece) => ({ ...piece, interactionType: "piece" })),
  { ...CROSSING, interactionType: "crossing" },
  { ...REGISTRAR, interactionType: "registrar" },
  { ...EXIT, interactionType: "exit" },
];

ctx.imageSmoothingEnabled = false;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hash = (value) => {
  const x = Math.sin(value * 91.731) * 43758.5453;
  return x - Math.floor(x);
};

function px(target, x, y, width, height, color) {
  target.fillStyle = color;
  target.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}

function line(target, x1, y1, x2, y2, color, width = 1) {
  target.strokeStyle = color;
  target.lineWidth = width;
  target.beginPath();
  target.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  target.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  target.stroke();
}

function drawContained(target, image, x, y, width, height, padding = 0) {
  if (!image) return;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const ratio = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight);
  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  target.save();
  target.imageSmoothingEnabled = true;
  target.imageSmoothingQuality = "high";
  target.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  target.restore();
  target.imageSmoothingEnabled = false;
}

async function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      console.warn(`Museum preview failed to load: ${url}`);
      resolve(null);
    };
    image.src = url;
  });
}

async function preloadSceneImages() {
  await Promise.all(PIECES.map(async (piece) => {
    const image = await loadImage(piece.assets.preview);
    state.images.set(piece.id, image);
  }));
}

function drawRoomBase(target) {
  px(target, 0, 0, 960, 600, PALETTE.void);

  const voidGlow = target.createRadialGradient(480, 228, 60, 480, 260, 560);
  voidGlow.addColorStop(0, "rgba(87, 67, 36, 0.15)");
  voidGlow.addColorStop(1, "rgba(11, 10, 7, 0)");
  target.fillStyle = voidGlow;
  target.fillRect(0, 0, 960, 600);

  px(target, 10, 10, 940, 580, "#070604");
  px(target, 16, 16, 928, 568, PALETTE.floorDeep);

  const wallGradient = target.createLinearGradient(0, 16, 0, 124);
  wallGradient.addColorStop(0, PALETTE.wallHi);
  wallGradient.addColorStop(0.72, PALETTE.wall);
  wallGradient.addColorStop(1, PALETTE.wallLo);
  target.fillStyle = wallGradient;
  target.fillRect(16, 16, 928, 108);

  for (let x = 64; x < 944; x += 88) {
    px(target, x, 22, 1, 83, "rgba(22, 20, 15, 0.055)");
  }

  px(target, 16, 110, 928, 4, PALETTE.woodHi);
  px(target, 16, 114, 928, 6, PALETTE.wood);
  px(target, 16, 120, 928, 4, PALETTE.woodLo);

  let row = 0;
  for (let y = 124; y < 584; y += 24) {
    const color = row % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
    px(target, 16, y, 928, 23, color);
    px(target, 16, y, 928, 1, "rgba(255, 255, 255, 0.045)");
    px(target, 16, y + 23, 928, 1, "rgba(54, 38, 22, 0.3)");
    const offset = row % 2 === 0 ? 0 : 60;
    for (let x = 16 + offset; x < 944; x += 120) {
      px(target, x, y, 1, 23, "rgba(54, 38, 22, 0.22)");
    }
    row += 1;
  }

  for (let i = 0; i < 62; i += 1) {
    const x = 30 + hash(i * 3.4) * 900;
    const y = 136 + hash(i * 8.9) * 430;
    const length = 2 + Math.floor(hash(i * 11.3) * 8);
    px(target, x, y, length, 1, i % 3 === 0 ? "rgba(245, 230, 197, 0.09)" : "rgba(72, 48, 25, 0.1)");
  }

  drawCrossingArchitecture(target);
  drawWallWorks(target);

  px(target, 16, 582, 928, 2, PALETTE.woodLo);
  px(target, 16, 584, 928, 6, "#070604");
  px(target, 10, 10, 6, 580, PALETTE.ink);
  px(target, 944, 10, 6, 580, PALETTE.ink);
  px(target, 10, 10, 940, 6, PALETTE.ink);
  px(target, 10, 590, 940, 6, PALETTE.ink);
}

function drawCrossingArchitecture(target) {
  px(target, 428, 0, 104, 252, "#080705");

  const passage = target.createLinearGradient(480, 0, 480, 252);
  passage.addColorStop(0, "#030303");
  passage.addColorStop(0.7, "#0a0907");
  passage.addColorStop(1, PALETTE.runner);
  target.fillStyle = passage;
  target.fillRect(440, 0, 80, 252);

  px(target, 428, 128, 104, 456, PALETTE.runner);
  px(target, 428, 128, 104, 2, PALETTE.runnerHi);
  px(target, 432, 132, 4, 452, PALETTE.red);
  px(target, 524, 132, 4, 452, PALETTE.redLo);
  px(target, 440, 214, 80, 4, "rgba(244, 102, 63, 0.46)");
  px(target, 442, 218, 76, 1, "rgba(231, 222, 201, 0.13)");

  for (let y = 146; y < 584; y += 28) {
    px(target, 442, y, 76, 1, "rgba(231, 222, 201, 0.045)");
  }

  target.save();
  target.lineCap = "square";
  target.strokeStyle = PALETTE.marbleLo;
  target.lineWidth = 14;
  target.beginPath();
  target.moveTo(420, 252);
  target.lineTo(420, 76);
  target.arc(480, 76, 60, Math.PI, 0, false);
  target.lineTo(540, 252);
  target.stroke();
  target.strokeStyle = PALETTE.marble;
  target.lineWidth = 9;
  target.stroke();
  target.strokeStyle = PALETTE.marbleHi;
  target.lineWidth = 2;
  target.stroke();
  target.restore();

  px(target, 474, 8, 12, 18, PALETTE.marble);
  px(target, 474, 8, 12, 3, PALETTE.marbleHi);
  px(target, 418, 246, 18, 8, PALETTE.marbleLo);
  px(target, 524, 246, 18, 8, PALETTE.marbleLo);
  px(target, 420, 244, 16, 6, PALETTE.marble);
  px(target, 524, 244, 16, 6, PALETTE.marble);

  const approachGlow = target.createRadialGradient(480, 98, 8, 480, 102, 110);
  approachGlow.addColorStop(0, "rgba(224, 52, 31, 0.11)");
  approachGlow.addColorStop(1, "rgba(224, 52, 31, 0)");
  target.fillStyle = approachGlow;
  target.fillRect(370, -8, 220, 220);
}

function drawWallWorks(target) {
  const spotCenters = [184, 316, 656, 788];
  for (const center of spotCenters) {
    const light = target.createRadialGradient(center, 18, 2, center, 68, 92);
    light.addColorStop(0, "rgba(255, 248, 221, 0.15)");
    light.addColorStop(1, "rgba(255, 248, 221, 0)");
    target.fillStyle = light;
    target.fillRect(center - 92, 14, 184, 108);
    px(target, center - 15, 18, 30, 3, PALETTE.brass);
    px(target, center - 1, 21, 2, 4, PALETTE.woodLo);
  }

  for (const piece of PIECES.filter((item) => item.kind === "wall")) {
    const { x, y, w, h } = piece.image;
    px(target, x - 7, y - 7, w + 14, h + 14, PALETTE.woodLo);
    px(target, x - 5, y - 5, w + 10, h + 10, PALETTE.woodHi);
    px(target, x - 3, y - 3, w + 6, h + 6, "#11100c");
    px(target, x, y, w, h, "#0b0a08");
    drawContained(target, state.images.get(piece.id), x, y, w, h, 4);
    drawPlacard(target, piece.cx - 18, 104, false, 36);
  }
}

function buildStaticBackground() {
  const background = document.createElement("canvas");
  background.width = canvas.width;
  background.height = canvas.height;
  const backgroundContext = background.getContext("2d", { alpha: false });
  backgroundContext.imageSmoothingEnabled = false;
  drawRoomBase(backgroundContext);
  state.background = background;

  const lightMap = document.createElement("canvas");
  lightMap.width = canvas.width;
  lightMap.height = canvas.height;
  state.lightMap = lightMap;
  state.lightContext = lightMap.getContext("2d");
  state.lightContext.imageSmoothingEnabled = true;
}

function drawPlacard(target, x, y, active, width = 40) {
  const body = active ? PALETTE.red : "#ece7d9";
  const shadow = active ? PALETTE.redLo : "#bcb5a4";
  px(target, x, y, width, 13, shadow);
  px(target, x, y, width, 10, body);
  px(target, x, y, width, 2, active ? PALETTE.redHi : "#fffdf5");
  px(target, x + 4, y + 4, width - 8, 1, active ? "rgba(255,255,255,.74)" : "rgba(71,61,44,.38)");
  px(target, x + 4, y + 7, Math.round((width - 8) * 0.64), 1, active ? "rgba(255,255,255,.52)" : "rgba(71,61,44,.28)");
}

function drawColumn(target, cx) {
  target.fillStyle = "rgba(22, 20, 15, 0.19)";
  target.beginPath();
  target.ellipse(cx + 2, 309, 28, 8, 0, 0, Math.PI * 2);
  target.fill();

  px(target, cx - 18, 106, 36, 12, PALETTE.marbleLo);
  px(target, cx - 15, 112, 30, 178, PALETTE.marble);
  px(target, cx - 15, 112, 5, 178, PALETTE.marbleHi);
  px(target, cx + 10, 112, 5, 178, PALETTE.marbleLo);
  for (let offset = -8; offset <= 8; offset += 4) {
    px(target, cx + offset, 119, 1, 164, "rgba(22, 20, 15, 0.07)");
  }
  px(target, cx - 22, 102, 44, 8, PALETTE.marble);
  px(target, cx - 22, 102, 44, 2, PALETTE.marbleHi);
  px(target, cx - 19, 290, 38, 12, PALETTE.marbleLo);
  px(target, cx - 23, 300, 46, 9, PALETTE.marble);
  px(target, cx - 23, 300, 46, 2, PALETTE.marbleHi);

  if (cx === 568) {
    drawPlacard(target, 584, 226, state.nearest?.id === "crossing", 42);
  }
}

function drawPedestal(target, piece) {
  const { cx, baseY } = piece;
  const active = state.nearest?.id === piece.id;
  const image = state.images.get(piece.id);

  target.fillStyle = "rgba(22, 20, 15, 0.22)";
  target.beginPath();
  target.ellipse(cx + 2, baseY + 5, 46, 11, 0, 0, Math.PI * 2);
  target.fill();

  const panelWidth = piece.id === "the-mesh" || piece.id === "the-orb" ? 62 : 66;
  const panelHeight = 62;
  const panelX = cx - panelWidth / 2;
  const panelY = baseY - 108;
  const hover = state.reducedMotion ? 0 : Math.round(Math.sin(state.ambientTime * 1.35 + cx) * 1.5);

  const glow = target.createRadialGradient(cx, panelY + 36, 4, cx, panelY + 42, 64);
  glow.addColorStop(0, active ? "rgba(224, 52, 31, 0.19)" : "rgba(245, 235, 203, 0.1)");
  glow.addColorStop(1, "rgba(245, 235, 203, 0)");
  target.fillStyle = glow;
  target.fillRect(cx - 70, panelY - 15, 140, 130);

  line(target, cx - panelWidth / 2 - 7, panelY + 7, cx - panelWidth / 2 - 7, baseY - 45, PALETTE.brass, 1);
  line(target, cx + panelWidth / 2 + 7, panelY + 7, cx + panelWidth / 2 + 7, baseY - 45, PALETTE.brass, 1);
  line(target, cx - panelWidth / 2 - 7, panelY + 7, panelX, panelY + 7, "rgba(192,172,126,.65)", 1);
  line(target, cx + panelWidth / 2 + 7, panelY + 7, panelX + panelWidth, panelY + 7, "rgba(192,172,126,.65)", 1);

  px(target, panelX - 4, panelY - 4 + hover, panelWidth + 8, panelHeight + 8, active ? PALETTE.redLo : PALETTE.woodLo);
  px(target, panelX - 2, panelY - 2 + hover, panelWidth + 4, panelHeight + 4, "#171510");
  px(target, panelX, panelY + hover, panelWidth, panelHeight, "#090908");
  drawContained(target, image, panelX, panelY + hover, panelWidth, panelHeight, 3);

  const plinthX = cx - 34;
  const plinthY = baseY - 44;
  px(target, plinthX, plinthY, 68, 44, PALETTE.marbleLo);
  px(target, plinthX, plinthY, 7, 44, PALETTE.marbleHi);
  px(target, plinthX + 61, plinthY, 7, 44, "#ada594");
  px(target, plinthX - 4, plinthY - 6, 76, 8, PALETTE.marble);
  px(target, plinthX - 4, plinthY - 6, 76, 2, PALETTE.marbleHi);
  px(target, plinthX - 2, baseY - 5, 72, 7, "#a79f8d");
  drawPlacard(target, cx - 20, baseY + 4, active, 40);

  if (piece.id === "attending") {
    const signal = state.reducedMotion || Math.sin(state.ambientTime * 2.4) > -0.2;
    px(target, panelX + panelWidth + 7, panelY + panelHeight - 8, 4, 4, signal ? PALETTE.red : PALETTE.redLo);
  }
}

function drawPlant(target, x, floorY) {
  target.fillStyle = "rgba(22, 20, 15, 0.18)";
  target.beginPath();
  target.ellipse(x + 2, floorY + 1, 19, 6, 0, 0, Math.PI * 2);
  target.fill();

  px(target, x - 15, floorY - 20, 30, 5, "#8a784f");
  px(target, x - 13, floorY - 16, 26, 17, "#a8956b");
  px(target, x - 13, floorY - 16, 4, 17, "#c0ac7e");
  px(target, x + 9, floorY - 16, 4, 17, "#806d4d");
  px(target, x - 10, floorY - 20, 20, 2, "#4a3f2c");

  drawLeaf(target, x - 8, floorY - 48, -1);
  drawLeaf(target, x + 8, floorY - 51, 1);
  drawLeaf(target, x, floorY - 60, 0);
}

function drawLeaf(target, x, y, direction) {
  px(target, x, y + 11, 2, 26, PALETTE.greenLo);
  const widths = [4, 8, 12, 13, 10, 6];
  widths.forEach((width, index) => {
    const sway = state.reducedMotion ? 0 : Math.round(Math.sin(state.ambientTime * 0.72 + x * 0.05 + index) * 1);
    px(target, x - width / 2 + direction * 4 + sway, y + index * 4, width, 4, index < 2 ? PALETTE.greenHi : index < 4 ? PALETTE.green : PALETTE.greenLo);
  });
}

function drawRegistrar(target) {
  const cx = 636;
  const baseY = 482;
  const active = state.nearest?.id === "registrar";

  target.fillStyle = "rgba(22, 20, 15, 0.23)";
  target.beginPath();
  target.ellipse(cx + 2, baseY + 3, 67, 12, 0, 0, Math.PI * 2);
  target.fill();

  px(target, 580, 442, 112, 40, PALETTE.wood);
  px(target, 580, 442, 112, 5, PALETTE.woodHi);
  px(target, 580, 476, 112, 6, PALETTE.woodLo);
  px(target, 590, 451, 92, 20, PALETTE.woodLo);
  px(target, 606, 412, 60, 42, active ? PALETTE.redLo : PALETTE.ink);
  px(target, 610, 416, 52, 30, "#090a08");
  px(target, 622, 454, 28, 5, PALETTE.metalLo);
  px(target, 628, 448, 16, 7, PALETTE.metal);

  const cursor = state.reducedMotion || Math.floor(state.ambientTime * 1.6) % 2 === 0;
  px(target, 616, 423, 18, 2, "rgba(231,222,201,.62)");
  px(target, 616, 429, 34, 2, "rgba(231,222,201,.34)");
  px(target, 616, 435, 26, 2, "rgba(231,222,201,.28)");
  if (cursor) px(target, 648, 435, 4, 2, PALETTE.red);
  drawPlacard(target, 616, 486, active, 40);
}

function drawTree(target, intensity) {
  const baseX = 480;
  const baseY = 127;
  const swayTime = state.reducedMotion ? 0 : state.ambientTime;

  const glow = target.createRadialGradient(baseX, 78, 4, baseX, 78, 104);
  glow.addColorStop(0, `rgba(224, 52, 31, ${0.11 + intensity * 0.18})`);
  glow.addColorStop(1, "rgba(224, 52, 31, 0)");
  target.fillStyle = glow;
  target.fillRect(376, -26, 208, 208);

  const branch = (x, y, angle, length, depth, seed) => {
    if (depth <= 0 || length < 3) return;
    const sway = Math.sin(swayTime * 0.66 + seed * 0.73 + depth) * 0.018;
    const endX = x + Math.cos(angle + sway) * length;
    const endY = y + Math.sin(angle + sway) * length;
    const alpha = 0.48 + intensity * 0.34 + depth * 0.035;
    target.strokeStyle = `rgba(244, 102, 63, ${clamp(alpha, 0, 1)})`;
    target.lineWidth = Math.max(1, depth * 0.7);
    target.beginPath();
    target.moveTo(x, y);
    target.lineTo(endX, endY);
    target.stroke();
    target.strokeStyle = `rgba(224, 52, 31, ${0.26 + intensity * 0.4})`;
    target.lineWidth = 1;
    target.stroke();
    if (depth <= 2) px(target, endX - 1, endY - 1, 2, 2, intensity > 0.35 ? PALETTE.redHi : PALETTE.red);
    branch(endX, endY, angle - 0.42, length * 0.73, depth - 1, seed + 1.3);
    branch(endX, endY, angle + 0.46, length * 0.71, depth - 1, seed + 2.7);
    if (depth % 2 === 0) branch(endX, endY, angle + 0.03, length * 0.61, depth - 1, seed + 4.1);
  };

  branch(baseX, baseY, -Math.PI / 2, 29, 6, 1);
  px(target, baseX - 3, baseY - 12, 6, 16, PALETTE.redLo);
  px(target, baseX - 1, baseY - 18, 2, 22, PALETTE.redHi);
}

function drawPlayer(target) {
  const player = state.player;
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  const frame = player.moving ? player.frame : 0;
  const stride = [0, 3, 0, -3][frame];
  const bob = state.reducedMotion || !player.moving ? 0 : [0, -2, 0, -2][frame];
  const coat = "#26231c";
  const coatHi = "#3a352b";
  const coatLo = "#14120d";
  const skin = "#e2b488";
  const skinLo = "#bc8a5e";
  const hair = "#34261a";

  target.fillStyle = "rgba(22, 20, 15, 0.28)";
  target.beginPath();
  target.ellipse(x, y + 1, 14, 6, 0, 0, Math.PI * 2);
  target.fill();

  target.save();
  target.translate(x, y + bob);
  if (player.dir === "left") target.scale(-1, 1);

  if (player.dir === "left" || player.dir === "right") {
    px(target, -5, -14, 6, 14, coatLo);
    px(target, stride, -14, 6, 14, "#1d1b15");
    px(target, -5, -3, 6, 4, "#0d0c08");
    px(target, stride, -3, 7, 4, "#0d0c08");
    px(target, -8, -38, 18, 25, coat);
    px(target, -8, -38, 4, 23, coatHi);
    px(target, 6, -38, 4, 25, coatLo);
    px(target, -10, -18, 22, 4, coat);
    px(target, -6, -41, 14, 4, PALETTE.red);
    px(target, -6, -41, 14, 2, PALETTE.redHi);
    px(target, 6, -36 - (stride > 0 ? 2 : 0), 5, 15, coat);
    px(target, 7, -22, 4, 4, skin);
    px(target, -4, -55, 13, 14, skin);
    px(target, 7, -55, 2, 14, skinLo);
    px(target, -4, -56, 13, 5, hair);
    px(target, 6, -48, 2, 2, PALETTE.ink);
    px(target, -4, -60, 14, 5, PALETTE.red);
    px(target, -2, -62, 10, 2, PALETTE.redHi);
    px(target, 10, -58, 6, 2, PALETTE.red);
  } else {
    const facing = player.dir === "down";
    px(target, -7 - stride, -14, 6, 14, "#1d1b15");
    px(target, 2 + stride, -14, 6, 14, coatLo);
    px(target, -7 - stride, -3, 7, 4, "#0d0c08");
    px(target, 2 + stride, -3, 7, 4, "#0d0c08");
    px(target, -10, -38, 22, 25, coat);
    px(target, -10, -38, 4, 24, coatHi);
    px(target, 8, -38, 4, 25, coatLo);
    px(target, -1, -38, 2, 24, coatLo);
    px(target, -12, -18, 26, 4, coat);
    px(target, -13, -36 + (stride < 0 ? 2 : 0), 5, 16, coat);
    px(target, 10, -36 + (stride > 0 ? 2 : 0), 5, 16, coat);
    px(target, -8, -41, 18, 4, PALETTE.red);
    px(target, -8, -41, 18, 2, PALETTE.redHi);
    px(target, -6, -57, 14, 15, facing ? skin : hair);
    px(target, -6, -57, 14, 5, hair);
    if (facing) {
      px(target, -2, -50, 2, 2, PALETTE.ink);
      px(target, 4, -50, 2, 2, PALETTE.ink);
      px(target, -6, -45, 2, 2, skinLo);
      px(target, 6, -45, 2, 2, skinLo);
    } else {
      px(target, -6, -53, 14, 7, hair);
    }
    px(target, -6, -61, 14, 5, PALETTE.red);
    px(target, -4, -63, 10, 2, PALETTE.redHi);
    px(target, -6, -57, 14, 2, PALETTE.redLo);
  }

  target.restore();
}

function drawPrompt(target) {
  if (!state.nearest || state.paused) return;
  const x = Math.round(state.player.x);
  const y = Math.round(state.player.y - 78 + (state.reducedMotion ? 0 : Math.sin(state.ambientTime * 4.2) * 2));
  px(target, x - 12, y - 11, 24, 20, PALETTE.ink);
  px(target, x - 10, y - 9, 20, 16, PALETTE.paper);
  px(target, x - 2, y + 7, 4, 5, PALETTE.ink);
  px(target, x, y + 7, 2, 3, PALETTE.paper);
  px(target, x - 3, y - 5, 6, 10, PALETTE.red);
  px(target, x - 1, y - 3, 2, 5, "#fff4df");
  px(target, x - 1, y + 3, 2, 2, "#fff4df");
}

function drawDistantGallery(target, depth) {
  if (depth <= 0) return;
  const glow = target.createLinearGradient(0, 0, 0, 202);
  glow.addColorStop(0, `rgba(231, 222, 201, ${0.06 * depth})`);
  glow.addColorStop(1, "rgba(231, 222, 201, 0)");
  target.fillStyle = glow;
  target.fillRect(440, 0, 80, 204);

  const points = [
    [454, 30], [480, 18], [506, 30], [462, 70], [498, 70], [480, 98], [452, 126], [508, 126],
  ];
  for (const [x, y] of points) {
    px(target, x - 1, y - 1, 3, 3, `rgba(231, 222, 201, ${0.18 + depth * 0.45})`);
  }
}

function focusedPieceId() {
  return state.nearest?.interactionType === "piece" ? state.nearest.id : null;
}

function lightIntensity(rig, approachIntensity) {
  const time = state.reducedMotion ? 0 : state.ambientTime;
  const microVariation = 0.98
    + Math.sin(time * 0.43 + rig.phase) * 0.025
    + Math.sin(time * 0.17 + rig.phase * 0.61) * 0.012;
  const focusId = focusedPieceId();
  const focus = focusId ? (focusId === rig.id ? 1.68 : 0.78) : 1;
  return microVariation * focus * (1 - approachIntensity * 0.3);
}

function drawSoftBeam(target, rig, intensity, rgb = "255, 241, 207", strength = 0.04) {
  const dx = rig.targetX - rig.sourceX;
  const dy = rig.targetY - rig.sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const layers = [
    { scale: 1, alpha: 0.38 },
    { scale: 0.76, alpha: 0.5 },
    { scale: 0.48, alpha: 0.7 },
  ];

  for (const layer of layers) {
    const sourceHalfWidth = 2 + layer.scale * 2;
    const endHalfWidth = rig.endHalfWidth * layer.scale;
    target.beginPath();
    target.moveTo(rig.sourceX + normalX * sourceHalfWidth, rig.sourceY + normalY * sourceHalfWidth);
    target.lineTo(rig.targetX + normalX * endHalfWidth, rig.targetY + normalY * endHalfWidth);
    target.lineTo(rig.targetX - normalX * endHalfWidth, rig.targetY - normalY * endHalfWidth);
    target.lineTo(rig.sourceX - normalX * sourceHalfWidth, rig.sourceY - normalY * sourceHalfWidth);
    target.closePath();
    const gradient = target.createLinearGradient(rig.sourceX, rig.sourceY, rig.targetX, rig.targetY);
    const alpha = strength * intensity * layer.alpha;
    gradient.addColorStop(0, `rgba(${rgb}, ${alpha * 0.16})`);
    gradient.addColorStop(0.22, `rgba(${rgb}, ${alpha * 0.68})`);
    gradient.addColorStop(0.72, `rgba(${rgb}, ${alpha})`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    target.fillStyle = gradient;
    target.fill();
  }
}

function drawEllipticalLight(target, x, y, radiusX, radiusY, intensity, rgb = "255, 241, 207", alpha = 0.1) {
  target.save();
  target.translate(x, y);
  target.scale(1, radiusY / radiusX);
  const gradient = target.createRadialGradient(0, 0, 0, 0, 0, radiusX);
  gradient.addColorStop(0, `rgba(${rgb}, ${alpha * intensity})`);
  gradient.addColorStop(0.35, `rgba(${rgb}, ${alpha * intensity * 0.72})`);
  gradient.addColorStop(0.72, `rgba(${rgb}, ${alpha * intensity * 0.22})`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  target.fillStyle = gradient;
  target.fillRect(-radiusX, -radiusX, radiusX * 2, radiusX * 2);
  target.restore();
}

function drawFloorSheen(target, rig, intensity) {
  const seed = rig.phase * 13.7;
  for (let index = 0; index < 7; index += 1) {
    const y = rig.poolY - rig.poolRadiusY * 0.48 + index * (rig.poolRadiusY * 0.22);
    const width = rig.poolRadiusX * (0.22 + hash(seed + index) * 0.32);
    const x = rig.poolX - width / 2 + (hash(seed + index * 2.3) - 0.5) * rig.poolRadiusX * 0.35;
    px(target, x, y, width, index % 3 === 0 ? 2 : 1, `rgba(255, 246, 220, ${0.03 * intensity})`);
  }
}

function drawLightFixture(target, rig, intensity) {
  const angle = Math.atan2(rig.targetY - rig.sourceY, rig.targetX - rig.sourceX);
  target.save();
  target.translate(rig.sourceX, rig.sourceY);
  target.rotate(angle);
  px(target, -7, -4, 14, 8, PALETTE.ink);
  px(target, -6, -3, 11, 2, PALETTE.woodHi);
  px(target, 4, -3, 4, 6, PALETTE.brass);
  px(target, 7, -2, 2, 4, `rgba(255, 242, 207, ${0.68 * intensity})`);
  target.restore();
}

function drawLightingShadows(target) {
  target.save();
  target.globalCompositeOperation = "multiply";

  for (const rig of PEDESTAL_LIGHT_RIG) {
    const piece = pieceById(rig.id);
    const direction = Math.sign(piece.cx - rig.sourceX) || 1;
    const shadow = target.createLinearGradient(piece.cx, piece.baseY, piece.cx + direction * 92, piece.baseY + 24);
    shadow.addColorStop(0, "rgba(18, 13, 8, 0.2)");
    shadow.addColorStop(0.45, "rgba(18, 13, 8, 0.09)");
    shadow.addColorStop(1, "rgba(18, 13, 8, 0)");
    target.fillStyle = shadow;
    target.beginPath();
    target.moveTo(piece.cx - 27, piece.baseY - 3);
    target.lineTo(piece.cx + 27, piece.baseY - 3);
    target.lineTo(piece.cx + direction * 98 + 22, piece.baseY + 27);
    target.lineTo(piece.cx + direction * 98 - 22, piece.baseY + 27);
    target.closePath();
    target.fill();
  }

  target.restore();
}

function drawCuratorialHighlights(target, approachIntensity) {
  target.save();
  target.globalCompositeOperation = "screen";
  for (const rig of WALL_LIGHT_RIG) {
    const piece = pieceById(rig.id);
    const intensity = lightIntensity(rig, approachIntensity);
    const { x, y, w } = piece.image;
    px(target, x - 5, y - 5, w + 10, 1, `rgba(255, 246, 220, ${0.24 * intensity})`);
    px(target, x - 5, y - 4, 1, 24, `rgba(255, 246, 220, ${0.11 * intensity})`);
  }
  for (const rig of PEDESTAL_LIGHT_RIG) {
    const piece = pieceById(rig.id);
    const intensity = lightIntensity(rig, approachIntensity);
    px(target, piece.cx - 38, piece.baseY - 50, 76, 2, `rgba(255, 246, 220, ${0.24 * intensity})`);
    px(target, piece.cx - 32, piece.baseY - 46, 3, 36, `rgba(255, 246, 220, ${0.09 * intensity})`);
  }
  target.restore();
}

function drawFocusBloom(target, focusId) {
  if (!focusId) return;
  const wallRig = WALL_LIGHT_RIG.find((rig) => rig.id === focusId);
  const pedestalRig = PEDESTAL_LIGHT_RIG.find((rig) => rig.id === focusId);

  if (wallRig) {
    drawSoftBeam(target, wallRig, 1.25, "255, 247, 224", 0.072);
    drawEllipticalLight(target, wallRig.poolX, wallRig.poolY, 84, 72, 1, "255, 247, 224", 0.13);
  }

  if (pedestalRig) {
    const piece = pieceById(focusId);
    drawSoftBeam(target, pedestalRig, 1.3, "255, 245, 218", 0.064);
    drawEllipticalLight(target, piece.cx, piece.baseY - 70, 76, 82, 1, "255, 245, 218", 0.11);
    drawEllipticalLight(target, pedestalRig.poolX, pedestalRig.poolY + 12, pedestalRig.poolRadiusX * 0.92, 32, 1, "255, 229, 177", 0.1);
  }
}

function drawLocalizedDust(target, approachIntensity) {
  const time = state.reducedMotion ? 0 : state.ambientTime;
  const rigs = [...WALL_LIGHT_RIG, ...PEDESTAL_LIGHT_RIG];
  target.save();
  target.globalCompositeOperation = "screen";

  rigs.forEach((rig, rigIndex) => {
    const intensity = lightIntensity(rig, approachIntensity);
    const count = rigIndex < WALL_LIGHT_RIG.length ? 3 : 6;
    const dx = rig.targetX - rig.sourceX;
    const dy = rig.targetY - rig.sourceY;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    for (let index = 0; index < count; index += 1) {
      const seed = rig.phase * 41 + index * 7.9;
      const speed = 0.012 + hash(seed + 2) * 0.014;
      const progress = (hash(seed) + time * speed) % 1;
      const spread = (hash(seed + 4) - 0.5) * rig.endHalfWidth * progress * 1.22;
      const drift = Math.sin(time * 0.38 + seed) * 3;
      const x = rig.sourceX + dx * progress + normalX * (spread + drift);
      const y = rig.sourceY + dy * progress + normalY * (spread + drift);
      const fade = Math.sin(progress * Math.PI) ** 2;
      const alpha = 0.08 * fade * intensity;
      const size = index % 4 === 0 ? 2 : 1;
      px(target, x, y, size, size, `rgba(255, 246, 220, ${alpha})`);
    }
  });

  for (let index = 0; index < 7; index += 1) {
    const seed = 90 + index * 9.7;
    const progress = (hash(seed) + time * (0.01 + hash(seed + 3) * 0.012)) % 1;
    const x = 480 + (hash(seed + 5) - 0.5) * 70 * progress + Math.sin(time * 0.3 + seed) * 2;
    const y = 14 + progress * 246;
    const alpha = (0.06 + approachIntensity * 0.12) * Math.sin(progress * Math.PI) ** 2;
    px(target, x, y, index % 3 === 0 ? 2 : 1, index % 3 === 0 ? 2 : 1, `rgba(244, 102, 63, ${alpha})`);
  }
  target.restore();
}

function drawCrossingProjection(target, approachIntensity) {
  const time = state.reducedMotion ? 0 : state.ambientTime;
  const alpha = 0.055 + approachIntensity * 0.14;

  target.save();
  target.beginPath();
  target.rect(438, 142, 84, 426);
  target.clip();
  target.globalCompositeOperation = "screen";
  target.shadowColor = `rgba(224, 52, 31, ${0.18 + approachIntensity * 0.28})`;
  target.shadowBlur = 5;
  target.strokeStyle = `rgba(244, 102, 63, ${alpha})`;
  target.lineCap = "square";

  const branch = (x, y, angle, length, depth, seed) => {
    if (depth <= 0 || length < 7) return;
    const sway = Math.sin(time * 0.27 + seed) * 0.012;
    const endX = x + Math.cos(angle + sway) * length;
    const endY = y + Math.sin(angle + sway) * length;
    target.lineWidth = Math.max(1, depth * 0.42);
    target.beginPath();
    target.moveTo(x, y);
    target.lineTo(endX, endY);
    target.stroke();
    branch(endX, endY, angle - 0.18, length * 0.78, depth - 1, seed + 1.9);
    branch(endX, endY, angle + 0.2, length * 0.76, depth - 1, seed + 3.7);
  };

  branch(480, 148, Math.PI / 2, 46, 5, 0.8);
  target.shadowBlur = 0;
  for (let index = 0; index < 8; index += 1) {
    const y = 204 + index * 42;
    const width = 18 + hash(index * 4.7) * 38;
    px(target, 480 - width / 2, y, width, 1, `rgba(244, 102, 63, ${alpha * (0.32 + hash(index * 2.2) * 0.34)})`);
  }
  target.restore();
}

function artworkGlassRect(piece) {
  if (piece.kind === "wall") return piece.image;
  const width = piece.id === "the-mesh" || piece.id === "the-orb" ? 62 : 66;
  return {
    x: piece.cx - width / 2,
    y: piece.baseY - 108,
    w: width,
    h: 62,
  };
}

function drawArtworkGlass(target) {
  if (state.reducedMotion) return;
  const time = state.ambientTime;
  const focusId = focusedPieceId();

  target.save();
  target.globalCompositeOperation = "screen";
  PIECES.forEach((piece, index) => {
    const cycle = (time * 0.052 + index * 0.173) % 1;
    const focused = piece.id === focusId;
    if (!focused && cycle > 0.16) return;
    const progress = focused ? (time * 0.11 + index * 0.19) % 1 : cycle / 0.16;
    const rect = artworkGlassRect(piece);
    const bandX = rect.x - 20 + progress * (rect.w + 40);
    const alpha = focused ? 0.11 : 0.052;

    target.save();
    target.beginPath();
    target.rect(rect.x, rect.y, rect.w, rect.h);
    target.clip();
    const glint = target.createLinearGradient(bandX - 16, 0, bandX + 16, 0);
    glint.addColorStop(0, "rgba(255, 250, 231, 0)");
    glint.addColorStop(0.48, `rgba(255, 250, 231, ${alpha})`);
    glint.addColorStop(0.52, `rgba(255, 250, 231, ${alpha * 0.74})`);
    glint.addColorStop(1, "rgba(255, 250, 231, 0)");
    target.fillStyle = glint;
    target.beginPath();
    target.moveTo(bandX - 15, rect.y + rect.h);
    target.lineTo(bandX + 1, rect.y);
    target.lineTo(bandX + 17, rect.y);
    target.lineTo(bandX + 1, rect.y + rect.h);
    target.closePath();
    target.fill();
    target.restore();
  });
  target.restore();
}

function drawMuseumLighting(target, approachIntensity) {
  const lightTarget = state.lightContext;
  if (!lightTarget || !state.lightMap) return;
  lightTarget.clearRect(0, 0, canvas.width, canvas.height);

  drawEllipticalLight(lightTarget, 480, 338, 390, 310, 1, "255, 237, 198", 0.026);

  for (const rig of WALL_LIGHT_RIG) {
    const intensity = lightIntensity(rig, approachIntensity);
    drawSoftBeam(lightTarget, rig, intensity, "255, 241, 207", 0.086);
    drawEllipticalLight(lightTarget, rig.sourceX, rig.sourceY + 7, 18, 13, intensity, "255, 247, 222", 0.25);
    drawEllipticalLight(lightTarget, rig.poolX, rig.poolY, rig.poolRadiusX, rig.poolRadiusY, intensity, "255, 241, 207", 0.17);
    drawEllipticalLight(lightTarget, rig.poolX, 124, 64, 18, intensity, "255, 232, 184", 0.082);
  }

  for (const rig of PEDESTAL_LIGHT_RIG) {
    const intensity = lightIntensity(rig, approachIntensity);
    drawSoftBeam(lightTarget, rig, intensity, "255, 238, 199", 0.078);
    drawEllipticalLight(lightTarget, rig.sourceX, rig.sourceY + 5, 19, 14, intensity, "255, 245, 214", 0.24);
    drawEllipticalLight(lightTarget, rig.poolX, rig.poolY, rig.poolRadiusX, rig.poolRadiusY, intensity, "255, 238, 199", 0.165);
    drawEllipticalLight(lightTarget, rig.poolX, rig.targetY + 24, rig.poolRadiusX * 0.78, 28, intensity, "255, 229, 177", 0.11);
    drawFloorSheen(lightTarget, rig, intensity);
  }

  drawFocusBloom(lightTarget, focusedPieceId());

  const time = state.reducedMotion ? 0 : state.ambientTime;
  const crossingIntensity = 0.96 + Math.sin(time * 0.52) * 0.035 + approachIntensity * 1.72;
  const crossingRig = {
    sourceX: 480,
    sourceY: -10,
    targetX: 480,
    targetY: 330,
    endHalfWidth: 72,
  };
  drawSoftBeam(lightTarget, crossingRig, crossingIntensity, "224, 52, 31", 0.062);
  drawEllipticalLight(lightTarget, 480, 146, 98, 184, crossingIntensity, "224, 52, 31", 0.112);
  const runnerReflection = lightTarget.createLinearGradient(480, 146, 480, 570);
  runnerReflection.addColorStop(0, `rgba(224, 52, 31, ${0.048 * crossingIntensity})`);
  runnerReflection.addColorStop(0.42, `rgba(224, 52, 31, ${0.018 * crossingIntensity})`);
  runnerReflection.addColorStop(1, "rgba(224, 52, 31, 0)");
  lightTarget.fillStyle = runnerReflection;
  lightTarget.fillRect(436, 146, 88, 424);

  target.save();
  target.globalCompositeOperation = "screen";
  target.drawImage(state.lightMap, 0, 0);
  target.restore();

  for (const rig of WALL_LIGHT_RIG) drawLightFixture(target, rig, lightIntensity(rig, approachIntensity));
  for (const rig of PEDESTAL_LIGHT_RIG) drawLightFixture(target, rig, lightIntensity(rig, approachIntensity));
  drawCuratorialHighlights(target, approachIntensity);
  drawCrossingProjection(target, approachIntensity);
}

function render() {
  if (!state.background) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(state.background, 0, 0);

  const approach = state.player.x >= 400 && state.player.x <= 560 && state.player.y <= 304;
  const approachIntensity = approach ? clamp((304 - state.player.y) / 148, 0.18, 1) : 0;
  const galleryDepth = state.player.y <= 232 ? clamp((232 - state.player.y) / 76, 0, 1) : 0;

  drawDistantGallery(ctx, galleryDepth);
  drawLightingShadows(ctx);

  const drawList = [
    ...SCENE_ENTITIES,
    { type: "player", sortY: state.player.y },
  ].sort((a, b) => a.sortY - b.sortY);

  for (const entity of drawList) {
    if (entity.type === "column") drawColumn(ctx, entity.cx);
    if (entity.type === "pedestal") drawPedestal(ctx, pieceById(entity.pieceId));
    if (entity.type === "plant") drawPlant(ctx, entity.x, entity.y);
    if (entity.type === "registrar") drawRegistrar(ctx);
    if (entity.type === "player") drawPlayer(ctx);
  }

  ctx.fillStyle = `rgba(15, 12, 8, ${0.22 + approachIntensity * 0.045})`;
  ctx.fillRect(16, 16, 928, 568);
  drawMuseumLighting(ctx, approachIntensity);
  drawArtworkGlass(ctx);
  drawTree(ctx, approachIntensity);
  drawLocalizedDust(ctx, approachIntensity);
  drawPrompt(ctx);

  const centerLight = ctx.createRadialGradient(480, 236, 30, 480, 280, 460);
  centerLight.addColorStop(0, "rgba(255, 244, 210, 0.035)");
  centerLight.addColorStop(1, "rgba(255, 244, 210, 0)");
  ctx.fillStyle = centerLight;
  ctx.fillRect(0, 0, 960, 600);

  const vignette = ctx.createRadialGradient(480, 310, 190, 480, 310, 610);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(0.7, "rgba(0, 0, 0, 0.07)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.52)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 960, 600);

  if (galleryDepth > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${galleryDepth * 0.04})`;
    ctx.fillRect(0, 0, 960, 600);
  }
}

function isInsideWalkableRegion(x, y) {
  const inMain = x >= 104 + PLAYER_HALF_WIDTH
    && x <= 856 - PLAYER_HALF_WIDTH
    && y >= 252 + PLAYER_HALF_HEIGHT
    && y <= 572 - PLAYER_HALF_HEIGHT;
  const inCorridor = x >= 440 + PLAYER_HALF_WIDTH
    && x <= 520 - PLAYER_HALF_WIDTH
    && y >= 128 + PLAYER_HALF_HEIGHT
    && y <= 264;
  return inMain || inCorridor;
}

function collidesWithObstacle(x, y) {
  return OBSTACLES.some((obstacle) => (
    x + PLAYER_HALF_WIDTH > obstacle.x
    && x - PLAYER_HALF_WIDTH < obstacle.x + obstacle.w
    && y + PLAYER_HALF_HEIGHT > obstacle.y
    && y - PLAYER_HALF_HEIGHT < obstacle.y + obstacle.h
  ));
}

function canOccupy(x, y) {
  return isInsideWalkableRegion(x, y) && !collidesWithObstacle(x, y);
}

function getMovementVector() {
  let x = 0;
  let y = 0;
  if (state.keys.has("left")) x -= 1;
  if (state.keys.has("right")) x += 1;
  if (state.keys.has("up")) y -= 1;
  if (state.keys.has("down")) y += 1;
  if (x === 0 && y === 0) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

function findNearestInteraction() {
  const playerPoint = state.player;
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const interaction of interactions) {
    const currentDistance = distance(playerPoint, interaction.anchor);
    if (currentDistance <= interaction.anchor.range && currentDistance < nearestDistance) {
      nearest = interaction;
      nearestDistance = currentDistance;
    }
  }
  return nearest;
}

function labelForInteraction(interaction) {
  if (!interaction) return "";
  if (interaction.interactionType === "piece") return `Inspect “${interaction.title}”`;
  if (interaction.interactionType === "crossing") return "Read The Crossing plaque";
  if (interaction.interactionType === "registrar") return "Open the collection index";
  return "Return to the Lookout";
}

function updateInteractionUI() {
  const nextId = state.nearest?.id ?? null;
  const locationZone = state.player.y <= 304 && state.player.x >= 400 && state.player.x <= 560
    ? "crossing"
    : "floor";
  readout.classList.toggle("is-visible", Boolean(state.nearest) && !state.paused);
  if (state.nearest) readoutCopy.textContent = labelForInteraction(state.nearest);

  if (nextId === state.lastNearestId && locationZone === state.lastLocationZone) return;
  state.lastNearestId = nextId;
  state.lastLocationZone = locationZone;
  if (state.nearest) {
    const label = labelForInteraction(state.nearest);
    statusLine.textContent = label;
    liveRegion.textContent = `${label}. Press E to open.`;
  } else {
    statusLine.textContent = locationZone === "crossing"
      ? "The Crossing is open. Continue north beneath the canopy."
      : "Walk the collection. Press E when a work is marked.";
  }
}

function openThreshold() {
  if (sendMuseumRoute("navigate", "gallery")) return;
  state.thresholdVisits += 1;
  openTextDialog({
    reason: "threshold",
    kicker: "The Crossing · prototype boundary",
    title: "Beyond the canopy",
    meta: "Permanent Gallery · not yet built",
    statement: "The passage continues into the permanent collection. That next room is deliberately outside this prototype; nothing has been invented behind the threshold yet.",
    action: "Return to the Atrium",
  });
}

function updateFixed(deltaMs = STEP) {
  if (!state.ready || state.paused) return;

  const player = state.player;
  const wasTraveling = Boolean(travelController?.active);
  if (wasTraveling) travelController.update(deltaMs);
  else {
    const movement = getMovementVector();
    const scale = deltaMs / STEP;
    const moving = movement.x !== 0 || movement.y !== 0;

    if (moving) {
      if (Math.abs(movement.x) > Math.abs(movement.y)) player.dir = movement.x > 0 ? "right" : "left";
      else player.dir = movement.y > 0 ? "down" : "up";

      const nextX = player.x + movement.x * PLAYER_SPEED * scale;
      const nextY = player.y + movement.y * PLAYER_SPEED * scale;
      if (canOccupy(nextX, player.y)) player.x = nextX;
      if (canOccupy(player.x, nextY)) player.y = nextY;

      player.frameClock += deltaMs;
      if (player.frameClock >= 112) {
        player.frame = (player.frame + 1) % 4;
        player.frameClock %= 112;
      }
    } else {
      player.frame = 0;
      player.frameClock = 0;
    }
    player.moving = moving;
  }
  if (!state.reducedMotion) state.ambientTime += deltaMs / 1000;

  state.nearest = findNearestInteraction();
  updateInteractionUI();

  if (player.x >= 440 && player.x <= 520 && player.y <= 156) {
    openThreshold();
  }
}

function frame(now) {
  if (!state.ready) {
    requestAnimationFrame(frame);
    return;
  }

  if (!state.lastFrame) state.lastFrame = now;
  if (now < state.manualModeUntil) {
    state.lastFrame = now;
    if (!state.lastRender || now - state.lastRender >= RENDER_INTERVAL) {
      render();
      state.lastRender = now;
    }
    requestAnimationFrame(frame);
    return;
  }
  const elapsed = clamp(now - state.lastFrame, 0, 50);
  state.lastFrame = now;
  state.accumulator += elapsed;

  while (state.accumulator >= STEP) {
    updateFixed(STEP);
    state.accumulator -= STEP;
  }

  if (!state.lastRender || now - state.lastRender >= RENDER_INTERVAL) {
    render();
    state.lastRender = now;
  }
  requestAnimationFrame(frame);
}

function openPiece(piece) {
  state.modalReason = "piece";
  state.paused = true;
  state.keys.clear();
  state.player.moving = false;
  dialog.classList.remove("is-text-only");
  dialogArtWrap.hidden = false;
  dialogArt.src = piece.assets.full;
  dialogArt.alt = `${piece.title}, by ${piece.artist}`;
  dialogKicker.textContent = "Topologie print-library · exhibited work";
  dialogTitle.textContent = piece.title;
  dialogMeta.textContent = `${piece.artist} · ${piece.createdAt} · ${piece.status}`;
  dialogStatement.textContent = piece.statement;
  collectionIndex.hidden = true;
  collectionIndex.replaceChildren();
  returnButton.textContent = "Return to the Atrium";
  if (!dialog.open) dialog.showModal();
  queueMicrotask(() => dialogCloseButton.focus({ preventScroll: true }));
}

function openTextDialog({ reason, kicker, title, meta, statement, action }) {
  state.modalReason = reason;
  state.paused = true;
  state.keys.clear();
  state.player.moving = false;
  dialog.classList.add("is-text-only");
  dialogArtWrap.hidden = true;
  dialogArt.removeAttribute("src");
  dialogArt.alt = "";
  dialogKicker.textContent = kicker;
  dialogTitle.textContent = title;
  dialogMeta.textContent = meta;
  dialogStatement.textContent = statement;
  collectionIndex.hidden = true;
  collectionIndex.replaceChildren();
  returnButton.textContent = action;
  if (!dialog.open) dialog.showModal();
  queueMicrotask(() => dialogCloseButton.focus({ preventScroll: true }));
}

function openRegistrar() {
  state.modalReason = "registrar";
  state.paused = true;
  state.keys.clear();
  state.player.moving = false;
  dialog.classList.add("is-text-only");
  dialogArtWrap.hidden = true;
  dialogArt.removeAttribute("src");
  dialogArt.alt = "";
  dialogKicker.textContent = REGISTRAR.kicker;
  dialogTitle.textContent = REGISTRAR.title;
  dialogMeta.textContent = "Fixed interface · no generative or autonomous behavior";
  dialogStatement.textContent = REGISTRAR.statement;
  collectionIndex.replaceChildren();

  for (const piece of PIECES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "index-button";
    const title = document.createElement("span");
    title.textContent = piece.title;
    const location = document.createElement("span");
    location.textContent = piece.kind === "wall" ? "wall" : "plinth";
    button.append(title, location);
    button.addEventListener("click", () => openPiece(piece));
    collectionIndex.append(button);
  }

  collectionIndex.hidden = false;
  returnButton.textContent = "Return to the Atrium";
  if (!dialog.open) dialog.showModal();
  queueMicrotask(() => dialogCloseButton.focus({ preventScroll: true }));
}

function interact() {
  if (!state.ready || state.paused || !state.nearest) return;
  const interaction = state.nearest;
  if (interaction.interactionType === "piece") openPiece(interaction);
  if (interaction.interactionType === "crossing") {
    openTextDialog({
      reason: "crossing-plaque",
      kicker: CROSSING.kicker,
      title: CROSSING.title,
      meta: "Atrium architecture · open passage",
      statement: CROSSING.statement,
      action: "Return to the Atrium",
    });
  }
  if (interaction.interactionType === "registrar") openRegistrar();
  if (interaction.interactionType === "exit") {
    if (!sendMuseumRoute("exit")) window.location.href = "../index.html";
  }
}

function handleDialogClose() {
  if (state.modalReason === "threshold") {
    state.player.x = 480;
    state.player.y = 232;
    state.player.dir = "up";
  }
  state.modalReason = null;
  state.paused = false;
  state.keys.clear();
  state.nearest = findNearestInteraction();
  updateInteractionUI();
  canvas.focus({ preventScroll: true });
}

function directionForKey(key) {
  const normalized = key.toLowerCase();
  if (normalized === "arrowleft" || normalized === "a") return "left";
  if (normalized === "arrowright" || normalized === "d") return "right";
  if (normalized === "arrowup" || normalized === "w") return "up";
  if (normalized === "arrowdown" || normalized === "s") return "down";
  return null;
}

function onKeyDown(event) {
  if (dialog.open) return;
  const direction = directionForKey(event.key);
  if (direction) {
    if (travelController?.active) travelController.cancel("manual");
    sendMuseumRoute("manual");
    state.keys.add(direction);
    event.preventDefault();
    return;
  }
  if (event.key === "Escape" && travelController?.active) {
    travelController.cancel("escape");
    event.preventDefault();
    return;
  }
  if (event.key === "e" || event.key === "E" || event.key === "Enter" || event.key === " ") {
    interact();
    event.preventDefault();
    return;
  }
  if (event.key === "f" || event.key === "F") {
    toggleFullscreen();
    event.preventDefault();
  }
}

function onKeyUp(event) {
  const direction = directionForKey(event.key);
  if (direction) {
    state.keys.delete(direction);
    if (state.keys.size === 0) state.player.moving = false;
    event.preventDefault();
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stage.requestFullscreen();
  } catch (error) {
    console.warn("Fullscreen is unavailable in this browser.", error);
  }
}

function bindTouchControls() {
  for (const button of document.querySelectorAll("[data-move]")) {
    const direction = button.dataset.move;
    const press = (event) => {
      event.preventDefault();
      if (travelController?.active) travelController.cancel("manual");
      sendMuseumRoute("manual");
      state.keys.add(direction);
      canvas.focus({ preventScroll: true });
    };
    const release = (event) => {
      event.preventDefault();
      state.keys.delete(direction);
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }
  document.querySelector("#touch-inspect").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    interact();
  });
}

function onHostMessage(event) {
  if (!CONNECTED || event.source !== window.parent) return;
  const message = event.data;
  if (!message || message.source !== "mnemos-host") return;
  if (message.type === "cancel-travel") {
    travelController?.cancel("host");
    return;
  }
  if (message.type !== "travel") return;
  const targets = {
    gallery: { x: 480, y: 164 },
    exit: { x: 480, y: 562 },
  };
  const goal = targets[message.target];
  if (!goal) {
    sendTravelState({ state: "unavailable", target: message.target, reason: "unsupported-target" });
    return;
  }
  state.keys.clear();
  travelController.start(message.target, goal);
}

function bindDialog() {
  for (const button of dialog.querySelectorAll("[data-dialog-close]")) {
    button.addEventListener("click", () => dialog.close());
  }
  dialog.addEventListener("close", handleDialogClose);
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const surface = dialog.querySelector(".dialog-surface").getBoundingClientRect();
    const outside = event.clientX < surface.left
      || event.clientX > surface.right
      || event.clientY < surface.top
      || event.clientY > surface.bottom;
    if (outside) dialog.close();
  });
}

function exposeTestContract() {
  window.render_game_to_text = () => JSON.stringify({
    coordinateSystem: "origin top-left; x increases right; y increases down; all values are logical pixels on a 960x600 canvas",
    room: "The Machine Museum · Atrium",
    mode: state.paused ? "dialog" : "explore",
    ready: state.ready,
    reducedMotion: state.reducedMotion,
    player: {
      x: Number(state.player.x.toFixed(2)),
      y: Number(state.player.y.toFixed(2)),
      direction: state.player.dir,
      moving: state.player.moving,
    },
    walkableRegions: [
      { id: "main-floor", x: 104, y: 252, width: 752, height: 320 },
      { id: "crossing-corridor", x: 440, y: 128, width: 80, height: 136 },
    ],
    crossing: {
      open: true,
      crossedThisSession: state.thresholdVisits > 0,
      thresholdLineY: 156,
      nextRoomBuilt: CONNECTED,
    },
    lighting: {
      system: "eight-point curatorial rig",
      activeFocus: focusedPieceId(),
      crossingResponse: state.player.x >= 400 && state.player.x <= 560 && state.player.y <= 304,
      motionFrozen: state.reducedMotion || state.paused,
      localizedDustMotes: 43,
    },
    nearbyInteraction: state.nearest ? {
      id: state.nearest.id,
      type: state.nearest.interactionType,
      label: labelForInteraction(state.nearest),
    } : null,
    dialog: dialog.open ? {
      reason: state.modalReason,
      title: dialogTitle.textContent,
    } : null,
    travel: travelController?.getState() ?? null,
    collection: PIECES.map((piece) => ({
      id: piece.id,
      title: piece.title,
      artist: piece.artist,
      placement: piece.kind,
      status: piece.status,
    })),
  });

  window.advanceTime = (milliseconds) => {
    const duration = Math.max(0, Number(milliseconds) || 0);
    state.manualModeUntil = performance.now() + 500;
    let remaining = duration;
    while (remaining > 0) {
      const slice = Math.min(STEP, remaining);
      updateFixed(slice);
      remaining -= slice;
    }
    render();
    return window.render_game_to_text();
  };

  /* the workshop asks for one clean frame of the whole room: the player is
     stepped off the plane and the prompt cleared for the still, then both
     are put back and the live frame is redrawn */
  window.__workshopRender = () => {
    if (!state.background) return null;
    const held = { x: state.player.x, y: state.player.y, nearest: state.nearest };
    state.player.x = -1000;
    state.player.y = 10000;
    state.nearest = null;
    render();
    const still = canvas.toDataURL("image/png");
    state.player.x = held.x;
    state.player.y = held.y;
    state.nearest = held.nearest;
    render();
    return still;
  };
}

async function start() {
  exposeTestContract();
  travelController = createMuseumTravel({
    player: state.player,
    canOccupy,
    bounds: { minX: 0, minY: 0, maxX: 960, maxY: 600 },
    speed: PLAYER_SPEED * 2,
    reducedMotion: () => state.reducedMotion,
    onState: sendTravelState,
    onArrive: (target) => {
      if (target === "gallery") sendMuseumRoute("navigate", "gallery");
      if (target === "exit") sendMuseumRoute("exit");
    },
  });
  bindTouchControls();
  bindDialog();
  window.addEventListener("message", onHostMessage);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  window.addEventListener("blur", () => state.keys.clear());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) state.keys.clear();
    state.lastFrame = performance.now();
  });
  reducedMotion.addEventListener("change", (event) => {
    state.reducedMotion = event.matches;
  });

  await preloadSceneImages();
  buildStaticBackground();
  state.ready = true;
  state.nearest = findNearestInteraction();
  updateInteractionUI();
  render();
  loadingState.classList.add("is-complete");
  window.setTimeout(() => loadingState.remove(), 300);
  canvas.focus({ preventScroll: true });
  sendMuseumMessage({ type: "ready", scene: "atrium" });
  requestAnimationFrame(frame);
}

start().catch((error) => {
  console.error("The Atrium could not open.", error);
  loadingState.textContent = "The Atrium could not open";
});
