const DEFAULT_STEP = 12;

const keyOf = (x, y) => `${x},${y}`;
const pointOf = (key) => {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
};

function nearestNode(point, canOccupy, bounds, grid) {
  const origin = {
    x: Math.round(point.x / grid) * grid,
    y: Math.round(point.y / grid) * grid,
  };
  for (let radius = 0; radius <= 8; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = origin.x + dx * grid;
        const y = origin.y + dy * grid;
        if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
        if (canOccupy(x, y)) return { x, y };
      }
    }
  }
  return null;
}

function compressPath(points) {
  if (points.length < 3) return points;
  const compact = [points[0]];
  let lastDirection = null;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const direction = `${Math.sign(current.x - previous.x)},${Math.sign(current.y - previous.y)}`;
    if (lastDirection && direction !== lastDirection) compact.push(previous);
    lastDirection = direction;
  }
  compact.push(points.at(-1));
  return compact;
}

function findPath(start, goal, canOccupy, bounds, grid) {
  const first = nearestNode(start, canOccupy, bounds, grid);
  const last = nearestNode(goal, canOccupy, bounds, grid);
  if (!first || !last) return null;

  const firstKey = keyOf(first.x, first.y);
  const lastKey = keyOf(last.x, last.y);
  const queue = [firstKey];
  const previous = new Map([[firstKey, null]]);
  let cursor = 0;

  while (cursor < queue.length && queue.length < 24000) {
    const currentKey = queue[cursor++];
    if (currentKey === lastKey) break;
    const current = pointOf(currentKey);
    const neighbors = [
      { x: current.x - grid, y: current.y },
      { x: current.x + grid, y: current.y },
      { x: current.x, y: current.y - grid },
      { x: current.x, y: current.y + grid },
    ];
    for (const next of neighbors) {
      if (next.x < bounds.minX || next.x > bounds.maxX || next.y < bounds.minY || next.y > bounds.maxY) continue;
      const nextKey = keyOf(next.x, next.y);
      if (previous.has(nextKey) || !canOccupy(next.x, next.y)) continue;
      previous.set(nextKey, currentKey);
      queue.push(nextKey);
    }
  }

  if (!previous.has(lastKey)) return null;
  const reversed = [];
  let currentKey = lastKey;
  while (currentKey) {
    reversed.push(pointOf(currentKey));
    currentKey = previous.get(currentKey);
  }
  const path = reversed.reverse();
  if (canOccupy(goal.x, goal.y)) path.push({ x: goal.x, y: goal.y });
  return compressPath(path);
}

export function createMuseumTravel({
  player,
  canOccupy,
  bounds,
  speed,
  reducedMotion,
  onState,
  onArrive,
  grid = DEFAULT_STEP,
}) {
  let travel = null;

  const publish = (state, details = {}) => {
    onState({ state, target: travel?.target ?? details.target ?? null, reason: details.reason ?? null });
  };

  function start(target, goal) {
    if (travel) cancel("replaced");
    travel = { target, goal, points: [], index: 0 };
    publish("planning");
    const path = reducedMotion()
      ? (canOccupy(goal.x, goal.y) ? [{ x: goal.x, y: goal.y }] : null)
      : findPath(player, goal, canOccupy, bounds, grid);
    if (!path || path.length === 0) {
      const failedTarget = target;
      travel = null;
      publish("unavailable", { target: failedTarget, reason: "no-walkable-route" });
      return false;
    }
    travel.points = path;
    publish("walking");
    return true;
  }

  function cancel(reason = "cancelled") {
    if (!travel) return false;
    const target = travel.target;
    travel = null;
    player.moving = false;
    player.frame = 0;
    player.frameClock = 0;
    publish("interrupted", { target, reason });
    return true;
  }

  function finish() {
    if (!travel) return;
    const target = travel.target;
    travel = null;
    player.moving = false;
    player.frame = 0;
    player.frameClock = 0;
    publish("arrived", { target });
    onArrive(target);
  }

  function update(deltaMs) {
    if (!travel) return false;
    const point = travel.points[travel.index];
    if (!point) { finish(); return true; }
    const dx = point.x - player.x;
    const dy = point.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1.2 || reducedMotion()) {
      player.x = point.x;
      player.y = point.y;
      travel.index += 1;
      if (travel.index >= travel.points.length) finish();
      return true;
    }

    const amount = Math.min(distance, speed * (deltaMs / (1000 / 60)));
    const stepX = (dx / distance) * amount;
    const stepY = (dy / distance) * amount;
    let moved = false;
    if (canOccupy(player.x + stepX, player.y)) { player.x += stepX; moved = true; }
    if (canOccupy(player.x, player.y + stepY)) { player.y += stepY; moved = true; }
    if (!moved) {
      const target = travel.target;
      travel = null;
      publish("unavailable", { target, reason: "route-blocked" });
      return true;
    }

    if (Math.abs(dx) > Math.abs(dy)) player.dir = dx > 0 ? "right" : "left";
    else player.dir = dy > 0 ? "down" : "up";
    player.moving = true;
    player.frameClock += deltaMs;
    if (player.frameClock >= 80) {
      player.frame = (player.frame + 1) % 4;
      player.frameClock %= 80;
    }
    return true;
  }

  return {
    start,
    cancel,
    update,
    get active() { return Boolean(travel); },
    getState: () => travel ? { target: travel.target, waypoint: travel.index, waypoints: travel.points.length } : null,
  };
}
