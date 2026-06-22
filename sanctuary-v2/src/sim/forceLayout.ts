/* A small, deterministic force-directed layout for the constellation.
   Seeded per-resident so positions are stable across renders and graceful on
   switch. Spring-electrical: edge springs pull, all-pairs repulsion pushes,
   gentle gravity centers. Runs a fixed iteration budget at module call — cheap
   for ≤ ~28 nodes — then we hand normalized [0..1] coords to the renderer. */

import type { GraphEdge } from "../types/mnemos";

export interface LaidOutNode {
  id: string;
  x: number; // 0..1
  y: number; // 0..1
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function layoutGraph(
  nodeIds: string[],
  edges: GraphEdge[],
  seedKey: string,
  iterations = 400
): Map<string, LaidOutNode> {
  const rand = mulberry32(hashSeed(seedKey));
  const n = nodeIds.length;
  const idx = new Map(nodeIds.map((id, i) => [id, i]));

  // initialize on a jittered ring so we never start degenerate
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.6;
    const r = 0.55 + rand() * 0.35;
    px[i] = Math.cos(a) * r;
    py[i] = Math.sin(a) * r;
  }

  const springs = edges
    .map((e) => ({ a: idx.get(e.from_id), b: idx.get(e.to_id), w: e.weight }))
    .filter((s): s is { a: number; b: number; w: number } => s.a !== undefined && s.b !== undefined);

  const k = 0.88 / Math.sqrt(n); // ideal distance
  let temp = 0.12;
  const cool = Math.pow(0.004 / temp, 1 / iterations);

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);

  for (let it = 0; it < iterations; it++) {
    dx.fill(0);
    dy.fill(0);

    // repulsion (all pairs)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = px[i] - px[j];
        let ddy = py[i] - py[j];
        let dist2 = ddx * ddx + ddy * ddy;
        if (dist2 < 1e-6) {
          ddx = (rand() - 0.5) * 0.01;
          ddy = (rand() - 0.5) * 0.01;
          dist2 = ddx * ddx + ddy * ddy;
        }
        const dist = Math.sqrt(dist2);
        const force = (k * k) / dist;
        const fx = (ddx / dist) * force;
        const fy = (ddy / dist) * force;
        dx[i] += fx;
        dy[i] += fy;
        dx[j] -= fx;
        dy[j] -= fy;
      }
    }

    // attraction (springs)
    for (const s of springs) {
      const ddx = px[s.a] - px[s.b];
      const ddy = py[s.a] - py[s.b];
      const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1e-4;
      const force = ((dist * dist) / k) * (0.62 + 0.38 * s.w);
      const fx = (ddx / dist) * force;
      const fy = (ddy / dist) * force;
      dx[s.a] -= fx;
      dy[s.a] -= fy;
      dx[s.b] += fx;
      dy[s.b] += fy;
    }

    // gravity toward center, scaled by distance² so far leaves are reeled in
    // hard — keeps the constellation a cohesive disc, never lonely satellites
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(px[i], py[i]) || 1e-4;
      const g = 0.07 + 0.12 * r; // stronger the farther out a node drifts
      dx[i] -= px[i] * g;
      dy[i] -= py[i] * g;
    }

    // integrate with temperature cap
    for (let i = 0; i < n; i++) {
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1e-4;
      const cap = Math.min(d, temp);
      px[i] += (dx[i] / d) * cap;
      py[i] += (dy[i] / d) * cap;
    }
    temp *= cool;
  }

  // normalize UNIFORMLY around the centroid (one scale, both axes), so the
  // disc the strong gravity produced fills the field with its shape intact.
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += px[i]; my += py[i]; }
  mx /= n; my /= n;
  let maxR = 0;
  for (let i = 0; i < n; i++) maxR = Math.max(maxR, Math.hypot(px[i] - mx, py[i] - my));
  const scale = 0.43 / (maxR || 1);
  const out = new Map<string, LaidOutNode>();
  for (let i = 0; i < n; i++) {
    out.set(nodeIds[i], {
      id: nodeIds[i],
      x: 0.5 + (px[i] - mx) * scale,
      y: 0.5 + (py[i] - my) * scale,
    });
  }
  return out;
}
