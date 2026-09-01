/* ══════════════════════════════════════════════════════════════════
   floor-preview — how a baked sculpture sits on a plinth in the annex.
   The floor, plinth, placard and light pool follow the annex scene's own
   drawing (museum/museum-field-annex/scene.js: px, drawFloor,
   drawPlacard, drawLightPool) in the annex palette; that file cannot be
   imported here because it reaches for the museum canvas at load.
   ══════════════════════════════════════════════════════════════════ */

export const ANNEX = {
  void: '#050608', floorA: '#0f1013', floorB: '#131418', joint: '#1e2126', indigo: '#15161b',
  wall: '#1d2023', wallHi: '#24272b', wallLo: '#121417', stone: '#2a2d30', nickel: '#4a4f55',
  paper: '#e6e3dd', red: '#e0341f', redHi: '#f4663f', redLo: '#8f1f15',
};

export const SCENE = { width: 176, height: 112 };

function px(target, x, y, width, height, color) {
  target.fillStyle = color;
  target.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}

function drawFloor(target, x, y, width, height, phase = 0) {
  const gradient = target.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, ANNEX.floorA);
  gradient.addColorStop(0.48, ANNEX.floorB);
  gradient.addColorStop(1, ANNEX.indigo);
  target.fillStyle = gradient;
  target.fillRect(x, y, width, height);
  let row = 0;
  for (let rowY = y; rowY < y + height; rowY += 28) {
    px(target, x, rowY, width, 1, 'rgba(194, 205, 224, 0.08)');
    const offset = (row + phase) % 2 === 0 ? 0 : 76;
    for (let jointX = x + offset; jointX < x + width; jointX += 152) {
      px(target, jointX, rowY, 1, Math.min(28, y + height - rowY), 'rgba(3, 5, 9, 0.34)');
      px(target, jointX + 1, rowY + 1, 1, Math.min(26, y + height - rowY), 'rgba(151, 161, 181, 0.035)');
    }
    row += 1;
  }
}

function drawLightPool(target, x, y, radiusX, radiusY, alpha) {
  target.save();
  target.globalCompositeOperation = 'screen';
  target.translate(x, y);
  target.scale(1, radiusY / radiusX);
  const glow = target.createRadialGradient(0, 0, 0, 0, 0, radiusX);
  glow.addColorStop(0, `rgba(225, 235, 255, ${alpha})`);
  glow.addColorStop(0.45, `rgba(209, 224, 255, ${alpha * 0.5})`);
  glow.addColorStop(1, 'rgba(190, 211, 255, 0)');
  target.fillStyle = glow;
  target.fillRect(-radiusX, -radiusX, radiusX * 2, radiusX * 2);
  target.restore();
}

function drawPlacard(target, x, y, width) {
  px(target, x, y + 3, width, 13, '#777f89');
  px(target, x, y, width, 12, '#d8dad9');
  px(target, x, y, width, 2, '#f4f4f0');
  px(target, x + 5, y + 5, width - 10, 1, 'rgba(25,29,37,.42)');
  px(target, x + 5, y + 8, Math.round((width - 10) * 0.62), 1, 'rgba(25,29,37,.26)');
}

/* a plinth that reads in the dark wing: the light tables' own metals */
function drawPlinth(target, x, y, w, h) {
  target.fillStyle = 'rgba(0, 0, 0, 0.42)';
  target.beginPath();
  target.ellipse(x + w / 2 + 2, y + h + 4, w * 0.62, 7, 0, 0, Math.PI * 2);
  target.fill();
  px(target, x, y, w, h, '#1a1d21');
  px(target, x + 6, y, w - 12, h, ANNEX.stone);
  px(target, x + 6, y, 6, h, ANNEX.nickel);
  px(target, x + w - 12, y, 6, h, '#1f2226');
  px(target, x - 4, y - 8, w + 8, 10, ANNEX.nickel);
  px(target, x - 4, y - 8, w + 8, 2, '#6f7680');
  px(target, x - 2, y + h - 3, w + 4, 4, '#111317');
}

/* compose the ×1 scene: floor, pool, plinth, the sprite on its cap, placard */
export function composeFloorScene(sprite) {
  const canvas = document.createElement('canvas');
  canvas.width = SCENE.width; canvas.height = SCENE.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawFloor(ctx, 0, 0, SCENE.width, SCENE.height, 1);
  const cx = SCENE.width / 2;
  const plinth = { x: cx - 24, y: 66, w: 48, h: 24 };
  drawLightPool(ctx, cx, plinth.y + 4, 64, 26, 0.17);
  drawPlinth(ctx, plinth.x, plinth.y, plinth.w, plinth.h);
  if (sprite) {
    const capY = plinth.y - 3;
    ctx.drawImage(sprite.canvas, Math.round(cx - sprite.width / 2), Math.round(capY - sprite.baseY));
  }
  drawPlacard(ctx, cx - 26, plinth.y + plinth.h + 8, 52);
  return canvas;
}

/* blit the ×1 scene to a visible canvas: an integer number of DEVICE pixels
   per scene pixel (factor × dpr, rounded), so the pixels stay hard at any
   devicePixelRatio; ×1 means "as played" — one CSS pixel per world pixel */
export function presentFloor(scene, canvas, factor, dpr = 1) {
  const k = Math.max(1, Math.round(factor * dpr));
  canvas.width = scene.width * k;
  canvas.height = scene.height * k;
  canvas.style.width = `${(scene.width * k) / dpr}px`;
  canvas.style.height = `${(scene.height * k) / dpr}px`;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scene, 0, 0, scene.width, scene.height, 0, 0, canvas.width, canvas.height);
}
