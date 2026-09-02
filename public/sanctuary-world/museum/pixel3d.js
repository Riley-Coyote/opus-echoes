/* ══════════════════════════════════════════════════════════════════
   pixel3d — the museum's own material, in three dimensions.
   A small software renderer: meshes of convex faces, an orthographic
   camera tilted the way the museum floor is seen, one light fixed to
   the camera, flat shading quantised to five steps per material, a
   per-pixel depth buffer, a one-pixel outline, and "ghost" parts drawn
   on a screen-space checkerboard. Everything is rasterised by hand into
   a small ImageData so every edge is a hard pixel; the page upscales at
   an integer factor. No DOM is touched at import time.
   ══════════════════════════════════════════════════════════════════ */

export const RAMPS = {
  nickel: ['#1d2023', '#2a2d30', '#4a4f55', '#6f7680', '#9aa1a9'],
  paper:  ['#4a4f55', '#8a8f95', '#b9b7b1', '#e6e3dd', '#f6f4ef'],
  red:    ['#4a120c', '#8f1f15', '#e0341f', '#f4663f', '#ffa07a'],
  green:  ['#2f3a2d', '#5c6e56', '#8fa388', '#a7b8a0', '#c4d1bd'],
  stone:  ['#121417', '#1d2023', '#24272b', '#2a2d30', '#363a3e'],
  wire:   ['#6f7680', '#6f7680', '#6f7680', '#6f7680', '#6f7680'],
};
export const OUTLINES = { dark: '#050608', rim: '#3a3f45' };
export const PLINTH = { size: 6, height: 1.2, shadow: 2.9 };
const STEPS = [0.25, 0.40, 0.55, 0.75];
const DEG = Math.PI / 180;

/* ── colours ── */
const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const RAMP_RGB = {}, RAMP_PACKED = {};
for (const [name, ramp] of Object.entries(RAMPS)) {
  RAMP_RGB[name] = ramp.map(hexToRgb);
  RAMP_PACKED[name] = RAMP_RGB[name].map((c) => pack(...c));
}
export function paletteHex() {
  return [...new Set([...Object.values(RAMPS).flat(), ...Object.values(OUTLINES)])];
}

/* ── vectors ── */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ── parts ──
   part = { v: flat [x,y,z,…], f: [[i,j,k,(l)]…] convex, wound counter-
   clockwise seen from outside, m: material, lines?: [[i,j]…] 1-px wires,
   ghost?: checkerboard, unlit?: fixed ramp step, doubleSided?: no cull } */
export const part = (v, f, m = 'nickel', extra = {}) => ({ v, f, m, ...extra });

/* rings → closed tube. Rings share one left-handed parameterisation
   (u, w, axis with w = u × axis) so the side winding below is outward. */
function tube(rings, m, extra = {}) {
  const seg = rings[0].length;
  const v = [];
  for (const ring of rings) for (const p of ring) v.push(p[0], p[1], p[2]);
  const f = [];
  const idx = (i, s) => i * seg + ((s + seg) % seg);
  for (let i = 0; i < rings.length - 1; i += 1) {
    for (let s = 0; s < seg; s += 1) {
      f.push([idx(i, s + 1), idx(i, s), idx(i + 1, s), idx(i + 1, s + 1)]);
    }
  }
  const cap = (i, reverse) => {
    const face = [];
    for (let s = 0; s < seg; s += 1) face.push(idx(i, reverse ? seg - 1 - s : s));
    f.push(face);
  };
  if (!extra.openBottom) cap(0, false);
  if (!extra.openTop) cap(rings.length - 1, true);
  return part(v, f, m, extra);
}

/* profile [[radius, y]…] revolved around +y; a radius of 0 collapses a ring */
export function lathe(profile, seg = 6, m = 'nickel', extra = {}) {
  const rings = profile.map(([r, y]) => {
    const ring = [];
    for (let s = 0; s < seg; s += 1) {
      const a = (s / seg) * Math.PI * 2 + Math.PI / seg;
      ring.push([r * Math.cos(a), y, r * Math.sin(a)]);
    }
    return ring;
  });
  const first = profile[0][0] === 0, last = profile[profile.length - 1][0] === 0;
  return tube(rings, m, { openBottom: first, openTop: last, ...extra });
}

export function box(w, h, d, m = 'nickel', extra = {}) {
  const x = w / 2, z = d / 2;
  const v = [-x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z, -x, h, -z, x, h, -z, x, h, z, -x, h, z];
  const f = [[4, 7, 6, 5], [0, 1, 2, 3], [3, 2, 6, 7], [1, 0, 4, 5], [2, 1, 5, 6], [0, 3, 7, 4]];
  return part(v, f, m, extra);
}

export function sphere(r, seg = 8, rings = 6, m = 'nickel', extra = {}) {
  const profile = [];
  for (let i = 0; i <= rings; i += 1) {
    const phi = -Math.PI / 2 + (i / rings) * Math.PI;
    profile.push([r * Math.cos(phi), r * Math.sin(phi)]);
  }
  return lathe(profile, seg, m, extra);
}

/* a rod from a to b; r1 tapers the far end; radius never falls below minR */
export function rod(a, b, r0, m = 'nickel', { sides = 6, r1 = r0, minR = 0, ...extra } = {}) {
  const dir = norm(sub(b, a));
  const up = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(up, dir));
  const w = cross(u, dir);
  const ra = Math.max(r0, minR), rb = Math.max(r1, minR);
  const ring = (c, r) => {
    const out = [];
    for (let s = 0; s < sides; s += 1) {
      const t = (s / sides) * Math.PI * 2 + Math.PI / sides;
      const cs = Math.cos(t) * r, sn = Math.sin(t) * r;
      out.push([c[0] + u[0] * cs + w[0] * sn, c[1] + u[1] * cs + w[1] * sn, c[2] + u[2] * cs + w[2] * sn]);
    }
    return out;
  };
  return tube([ring(a, ra), ring(b, rb)], m, extra);
}

export const wire = (a, b, extra = {}) => part([...a, ...b], [], 'wire', { lines: [[0, 1]], ...extra });

/* twelve rods along the edges of a box standing on y = 0 */
export function frame(w, h, d, r, m = 'nickel', extra = {}) {
  const x = w / 2, z = d / 2;
  const c = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, h, -z], [x, h, -z], [x, h, z], [-x, h, z]];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  return edges.map(([i, j]) => rod(c[i], c[j], r, m, { sides: 4, ...extra }));
}

/* a flat polygon in the y = h plane facing up */
export function disc(r, h, seg = 12, m = 'stone', extra = {}) {
  const v = [], f = [];
  for (let s = 0; s < seg; s += 1) {
    const a = -(s / seg) * Math.PI * 2;
    v.push(r * Math.cos(a), h, r * Math.sin(a));
    f.push(s);
  }
  return part(v, [f], m, extra);
}

/* ── transforms: each returns a new part (or list) ── */
function mapVerts(p, fn) {
  if (Array.isArray(p)) return p.map((q) => mapVerts(q, fn));
  const v = new Array(p.v.length);
  for (let i = 0; i < p.v.length; i += 3) {
    const [x, y, z] = fn(p.v[i], p.v[i + 1], p.v[i + 2]);
    v[i] = x; v[i + 1] = y; v[i + 2] = z;
  }
  return { ...p, v };
}
export const translate = (p, [tx, ty, tz]) => mapVerts(p, (x, y, z) => [x + tx, y + ty, z + tz]);
export const scale = (p, s) => mapVerts(p, (x, y, z) => [x * s, y * s, z * s]);
export function rotateY(p, deg, [px, py, pz] = [0, 0, 0]) {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return mapVerts(p, (x, y, z) => { x -= px; z -= pz; return [x * c + z * s + px, y, -x * s + z * c + pz]; });
}
export function rotateX(p, deg, [px, py, pz] = [0, 0, 0]) {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return mapVerts(p, (x, y, z) => { y -= py; z -= pz; return [x, y * c - z * s + py, y * s + z * c + pz]; });
}
export function rotateZ(p, deg, [px, py, pz] = [0, 0, 0]) {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return mapVerts(p, (x, y, z) => { x -= px; y -= py; return [x * c - y * s + px, x * s + y * c + py, z]; });
}
export const merge = (...parts) => parts.flat(Infinity);
export const withMaterial = (p, m, extra = {}) => (Array.isArray(p) ? p.map((q) => withMaterial(q, m, extra)) : { ...p, m, ...extra });

/* ── the camera's scale: pixels per model unit ── */
export function computeScale({ width, height, bounds, pitch = 28, fill = 0.78, plinth = true }) {
  const p = pitch * DEG;
  const h = bounds.height + (plinth ? PLINTH.height : 0);
  const r = Math.max(bounds.radius, plinth ? PLINTH.size * 0.72 : 0);
  return (fill * height) / (h * Math.cos(p) + 2 * r * Math.sin(p));
}

export function plinthParts() {
  return [
    box(PLINTH.size, PLINTH.height, PLINTH.size, 'stone'),
    disc(PLINTH.shadow, PLINTH.height + 0.02, 12, 'stone', { unlit: 0 }),
  ];
}

/* ── the renderer ── */
export function createRenderer(width, height) {
  const image = new ImageData(width, height);
  const rgba = new Uint32Array(image.data.buffer);
  const depth = new Float32Array(width * height);
  const cover = new Uint8Array(width * height);
  const stats = { faces: 0, ms: 0 };

  function shade(m, lum, mode) {
    const ramp = RAMP_PACKED[m] || RAMP_PACKED.nickel;
    if (mode === 'smooth') {
      const rgb = RAMP_RGB[m] || RAMP_RGB.nickel;
      const u = Math.min(3.999, Math.max(0, lum * 4));
      const k = Math.floor(u), t = u - k;
      const a = rgb[k], b = rgb[k + 1];
      return pack(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t));
    }
    let step = 0;
    for (let i = 0; i < STEPS.length; i += 1) if (lum >= STEPS[i]) step = i + 1;
    return ramp[step];
  }

  function ditherPair(m, lum) {
    const ramp = RAMP_PACKED[m] || RAMP_PACKED.nickel;
    for (let i = 0; i < STEPS.length; i += 1) {
      if (Math.abs(lum - STEPS[i]) < 0.03) return [ramp[i], ramp[i + 1]];
    }
    return null;
  }

  function fillPolygon(sx, sy, sd, n, colour, alt, ghost, coverValue) {
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i += 1) { if (sy[i] < minY) minY = sy[i]; if (sy[i] > maxY) maxY = sy[i]; }
    /* depth plane from the widest triangle of the face */
    let best = 0, a = 0, b = 1, c = 2;
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) for (let k = j + 1; k < n; k += 1) {
      const det = (sx[j] - sx[i]) * (sy[k] - sy[i]) - (sx[k] - sx[i]) * (sy[j] - sy[i]);
      if (Math.abs(det) > best) { best = Math.abs(det); a = i; b = j; c = k; }
    }
    let ddx = 0, ddy = 0, d0 = sd[a], x0 = sx[a], y0 = sy[a];
    if (best > 1e-6) {
      const det = (sx[b] - sx[a]) * (sy[c] - sy[a]) - (sx[c] - sx[a]) * (sy[b] - sy[a]);
      ddx = ((sd[b] - sd[a]) * (sy[c] - sy[a]) - (sd[c] - sd[a]) * (sy[b] - sy[a])) / det;
      ddy = ((sd[c] - sd[a]) * (sx[b] - sx[a]) - (sd[b] - sd[a]) * (sx[c] - sx[a])) / det;
    } else {
      d0 = Math.min(...sd.slice(0, n));
    }
    const yStart = Math.max(0, Math.ceil(minY - 0.5));
    const yEnd = Math.min(height - 1, Math.floor(maxY - 0.5));
    for (let y = yStart; y <= yEnd; y += 1) {
      const yc = y + 0.5;
      let xa = Infinity, xb = -Infinity;
      for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        const ya = sy[i], yb = sy[j];
        if ((ya <= yc) !== (yb <= yc)) {
          const x = sx[i] + ((yc - ya) * (sx[j] - sx[i])) / (yb - ya);
          if (x < xa) xa = x;
          if (x > xb) xb = x;
        }
      }
      if (xa === Infinity) continue;
      const xStart = Math.max(0, Math.ceil(xa - 0.5));
      const xEnd = Math.min(width - 1, Math.ceil(xb - 0.5) - 1);
      for (let x = xStart; x <= xEnd; x += 1) {
        if (ghost && ((x + y) & 1)) continue;
        const i = y * width + x;
        const d = d0 + ddx * (x + 0.5 - x0) + ddy * (yc - y0);
        if (d < depth[i]) {
          depth[i] = d;
          rgba[i] = alt && ((x & 1) ^ (y & 1)) ? alt : colour;
          cover[i] = coverValue;
        }
      }
    }
  }

  function drawLine(x0, y0, d0, x1, y1, d1, colour) {
    let ax = Math.floor(x0), ay = Math.floor(y0);
    const bx = Math.floor(x1), by = Math.floor(y1);
    const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
    const steps = Math.max(dx, -dy, 1);
    let err = dx + dy, k = 0;
    for (;;) {
      if (ax >= 0 && ay >= 0 && ax < width && ay < height) {
        const i = ay * width + ax;
        const d = d0 + ((d1 - d0) * k) / steps - 0.05;
        if (d < depth[i]) { depth[i] = d; rgba[i] = colour; cover[i] = 1; }
      }
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; ax += sx; }
      if (e2 <= dx) { err += dx; ay += sy; }
      k += 1;
    }
  }

  function outlinePass(mode) {
    const colour = pack(...hexToRgb(OUTLINES[mode]));
    const marks = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        const up = y > 0 ? i - width : -1, down = y < height - 1 ? i + width : -1;
        const left = x > 0 ? i - 1 : -1, right = x < width - 1 ? i + 1 : -1;
        if (cover[i] === 0) {
          if ((up >= 0 && cover[up] === 1) || (down >= 0 && cover[down] === 1)
            || (left >= 0 && cover[left] === 1) || (right >= 0 && cover[right] === 1)) marks.push(i);
        } else if (mode === 'dark' && cover[i] === 1) {
          const d = depth[i] - 0.9;
          if ((up >= 0 && cover[up] === 1 && depth[up] < d) || (down >= 0 && cover[down] === 1 && depth[down] < d)
            || (left >= 0 && cover[left] === 1 && depth[left] < d) || (right >= 0 && cover[right] === 1 && depth[right] < d)) marks.push(i);
        }
      }
    }
    for (const i of marks) { rgba[i] = colour; cover[i] = 3; }
  }

  /* parts → pixels. Returns the ImageData; stats in .stats */
  function render(parts, {
    yaw = 0, pitch = 28, lightAz = -55, lightEl = 53, mode = 'pixel', outline = 'dark',
    dither = false, fill = 0.78, bounds = { height: 10, radius: 5 }, plinth = true, S: forcedS = 0,
    ambient = 0.18,
  } = {}) {
    const t0 = performance.now();
    rgba.fill(0); depth.fill(Infinity); cover.fill(0);
    const p = pitch * DEG, yw = yaw * DEG;
    const cp = Math.cos(p), sp = Math.sin(p), cy0 = Math.cos(yw), sy0 = Math.sin(yw);
    const S = forcedS || computeScale({ width, height, bounds, pitch, fill, plinth });
    const totalH = bounds.height + (plinth ? PLINTH.height : 0);
    const cx = width / 2, cy = height / 2 + (S * totalH * cp) / 2;
    const el = lightEl * DEG, az = lightAz * DEG;
    const L = norm([Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]);
    const list = plinth ? [...plinthParts(), ...translate(parts.flat(Infinity), [0, PLINTH.height, 0])] : parts.flat(Infinity);
    let faces = 0;
    const sx = [], sy = [], sd = [], vx = [], vy = [], vz = [];
    for (const item of list) {
      const n = item.v.length / 3;
      for (let i = 0; i < n; i += 1) {
        const x = item.v[i * 3], y = item.v[i * 3 + 1], z = item.v[i * 3 + 2];
        const x1 = x * cy0 + z * sy0, z1 = -x * sy0 + z * cy0;          // yaw
        const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;             // pitch
        vx[i] = x1; vy[i] = y2; vz[i] = z2;
        sx[i] = cx + x1 * S; sy[i] = cy - y2 * S; sd[i] = -z2;
      }
      const ghost = Boolean(item.ghost);
      const coverValue = ghost ? 2 : 1;
      for (const face of item.f) {
        const m = face.length;
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < m; i += 1) {
          const a = face[i], b = face[(i + 1) % m];
          nx += (vy[a] - vy[b]) * (vz[a] + vz[b]);
          ny += (vz[a] - vz[b]) * (vx[a] + vx[b]);
          nz += (vx[a] - vx[b]) * (vy[a] + vy[b]);
        }
        if (nz <= 0) {
          if (!item.doubleSided) continue;
          nx = -nx; ny = -ny; nz = -nz;
        }
        const nl = Math.hypot(nx, ny, nz) || 1;
        const lum = ambient + (1 - ambient) * Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nl);
        let colour, alt = 0;
        if (item.unlit !== undefined) colour = (RAMP_PACKED[item.m] || RAMP_PACKED.stone)[item.unlit];
        else {
          colour = shade(item.m, lum, mode);
          if (dither && mode === 'pixel') { const pair = ditherPair(item.m, lum); if (pair) { colour = pair[0]; alt = pair[1]; } }
        }
        const fx = [], fy = [], fd = [];
        for (let i = 0; i < m; i += 1) { fx[i] = sx[face[i]]; fy[i] = sy[face[i]]; fd[i] = sd[face[i]]; }
        fillPolygon(fx, fy, fd, m, colour, alt, ghost, coverValue);
        faces += 1;
      }
      if (item.lines) {
        const colour = RAMP_PACKED.wire[2];
        for (const [a, b] of item.lines) drawLine(sx[a], sy[a], sd[a], sx[b], sy[b], sd[b], colour);
      }
    }
    if (mode === 'pixel' && outline !== 'none' && OUTLINES[outline]) outlinePass(outline);
    stats.faces = faces; stats.ms = performance.now() - t0; stats.S = S; stats.baseY = Math.round(cy);
    return image;
  }

  return { width, height, image, render, stats };
}

/* small buffer → visible canvas at an integer factor, hard pixels */
export function present(image, small, big) {
  const sctx = small.getContext('2d');
  small.width = image.width; small.height = image.height;
  sctx.putImageData(image, 0, 0);
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = false;
  bctx.clearRect(0, 0, big.width, big.height);
  bctx.drawImage(small, 0, 0, image.width, image.height, 0, 0, big.width, big.height);
}

/* one small still of a model at the floor's angle, for the world's plinths */
export function bakeSprite(parts, { height = 48, yaw = 24, pitch = 38, lightAz = -55, outline = 'dark', bounds }) {
  const p = pitch * DEG;
  const S = height / (bounds.height * Math.cos(p) + 2 * bounds.radius * Math.sin(p));
  const width = Math.ceil(2 * bounds.radius * S) + 6;
  const h = height + 6;
  const renderer = createRenderer(width, h);
  const image = renderer.render(parts, { yaw, pitch, lightAz, outline, bounds, plinth: false, S });
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = h;
  canvas.getContext('2d').putImageData(image, 0, 0);
  return { canvas, width, height: h, baseY: renderer.stats.baseY, S };
}

export function hashImage(image) {
  const words = new Uint32Array(image.data.buffer);
  let h = 2166136261;
  for (let i = 0; i < words.length; i += 1) { h ^= words[i]; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}
