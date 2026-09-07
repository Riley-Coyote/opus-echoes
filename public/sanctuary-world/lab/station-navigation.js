/* A small visibility graph on the station's actual upper floor. Obstacles are
 * furniture footprints, expanded by the guide's body radius. No renderer or
 * per-frame path search: each destination computes one reusable polyline. */
export function createFloorNavigation({ bounds, obstacles, radius = 0.3 }) {
  const limits = {
    x0: bounds.x0 + radius,
    x1: bounds.x1 - radius,
    z0: bounds.z0 + radius,
    z1: bounds.z1 - radius,
  };
  const blocked = obstacles.map((o) => ({
    id: o.id,
    x0: o.x0 - radius,
    x1: o.x1 + radius,
    z0: o.z0 - radius,
    z1: o.z1 + radius,
  }));
  const free = ([x, z]) =>
    x >= limits.x0 &&
    x <= limits.x1 &&
    z >= limits.z0 &&
    z <= limits.z1 &&
    !blocked.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function clear(a, b) {
    if (!free(a) || !free(b)) return false;
    // Slab intersection catches even a very short diagonal across a corner.
    return !blocked.some((r) => {
      let lo = 0,
        hi = 1;
      for (const [axis, min, max] of [
        [0, r.x0, r.x1],
        [1, r.z0, r.z1],
      ]) {
        const d = b[axis] - a[axis];
        if (Math.abs(d) < 1e-9) {
          if (a[axis] < min || a[axis] > max) return false;
        } else {
          const u = (min - a[axis]) / d,
            v = (max - a[axis]) / d;
          lo = Math.max(lo, Math.min(u, v));
          hi = Math.min(hi, Math.max(u, v));
          if (lo > hi) return false;
        }
      }
      return true;
    });
  }
  const corners = blocked
    .flatMap((b) => [
      [b.x0 - 0.035, b.z0 - 0.035],
      [b.x1 + 0.035, b.z0 - 0.035],
      [b.x1 + 0.035, b.z1 + 0.035],
      [b.x0 - 0.035, b.z1 + 0.035],
    ])
    .filter(free);
  function route(start, end) {
    if (!free(start) || !free(end)) return null;
    if (clear(start, end)) return [start.slice(), end.slice()];
    const nodes = [start, end, ...corners],
      cost = nodes.map(() => Infinity),
      prev = [],
      seen = new Set();
    cost[0] = 0;
    while (seen.size < nodes.length) {
      let n = -1;
      for (let i = 0; i < nodes.length; i++)
        if (!seen.has(i) && (n < 0 || cost[i] < cost[n])) n = i;
      if (n < 0 || !Number.isFinite(cost[n])) return null;
      if (n === 1) break;
      seen.add(n);
      for (let j = 0; j < nodes.length; j++)
        if (!seen.has(j) && clear(nodes[n], nodes[j])) {
          const c = cost[n] + distance(nodes[n], nodes[j]);
          if (c < cost[j]) {
            cost[j] = c;
            prev[j] = n;
          }
        }
    }
    const result = [];
    for (let n = 1; n !== undefined; n = prev[n]) result.unshift(nodes[n].slice());
    return result;
  }
  return { free, clear, route, blocked, limits, radius };
}
