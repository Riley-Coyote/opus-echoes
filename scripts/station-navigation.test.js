import { test, expect } from "bun:test";
import { createFloorNavigation } from "../public/sanctuary-world/lab/station-navigation.js";

// Independently measured station footprints, re-measured for WP-46's corrected
// room: no pit, the desk forward at the eye, the credenza flat against the
// machine wall under the board, the guide's home post off its far end.
// Browser validation also checks the currently rendered furniture bounds, so
// changed furniture cannot hide behind this regression fixture.
const obstacles = [
  { id: "planter ledge", x0: -5, x1: -4.45, z0: -1.1, z1: 2.5 },
  { id: "aperture step", x0: -4.25, x1: -0.95, z0: -3.25, z1: -2.42 },
  { id: "credenza", x0: 3.495, x1: 4.246, z0: -2.34, z1: -0.76 },
  { id: "desk", x0: -3.006, x1: -1.194, z0: 0.842, z1: 1.776 },
  { id: "chair", x0: -1.689, x1: -1.021, z0: -0.015, z1: 0.659 },
  { id: "console chair", x0: 2.098, x1: 2.634, z0: -2.312, z1: -1.738 },
  { id: "tree planter", x0: -4.86, x1: -4.34, z0: -2.36, z1: -1.84 },
  { id: "corner plant", x0: 3.664, x1: 4.016, z0: -0.308, z1: 0.048 },
  { id: "back run", x0: -0.2, x1: 4.9, z0: -3.25, z1: -2.65 },
  { id: "right run", x0: 4.3, x1: 5, z0: -3.25, z1: 0.7 },
];
const nav = createFloorNavigation({ bounds: { x0: -5, x1: 5, z0: -3.25, z1: 3.25 }, obstacles });
const stops = [
  [-3.86, -1.85],
  [-3.95, 0.62],
  [0.4, -2.2],
  [3.05, -2.2],
  [2, 2.7],
  [-1.9, 2.75],
  [2.7, 2.75],
];
test("every guide station, conversation stop and passage rendezvous is connected with body clearance", () => {
  for (const start of stops)
    for (const end of stops) {
      const path = nav.route(start, end);
      expect(path).not.toBeNull();
      expect(path[0]).toEqual(start);
      expect(path.at(-1)).toEqual(end);
      for (let i = 1; i < path.length; i++) {
        expect(nav.clear(path[i - 1], path[i])).toBe(true);
        for (let t = 0; t <= 1; t += 0.01) {
          const x = path[i - 1][0] * (1 - t) + path[i][0] * t,
            z = path[i - 1][1] * (1 - t) + path[i][1] * t;
          // Validate geometry independently, including the 30 cm body radius.
          for (const b of obstacles)
            expect(
              x >= b.x0 - 0.3 && x <= b.x1 + 0.3 && z >= b.z0 - 0.3 && z <= b.z1 + 0.3,
            ).toBe(false);
        }
      }
    }
});
test("calling Limen from beside the porthole goes round the desk, not across it", () => {
  const path = nav.route(stops[0], stops[5]);
  expect(nav.clear(stops[0], stops[5])).toBe(false);
  // the slab now stands between that station and the visitor, so the walk has to
  // turn out past one of its ends before it comes down the room
  expect(path.length).toBeGreaterThan(2);
  expect(path.some(([x]) => x < -3.306 || x > -0.894)).toBe(true);
});
test("the guide can reach the aisle beside the slab, and the post at the credenza", () => {
  // the lane between the planter ledge and the slab's left end
  expect(nav.free([-3.86, -1.85])).toBe(true);
  expect(nav.route([-3.86, -1.85], [2.7, 2.75])).not.toBeNull();
  expect(nav.route([2.7, 2.75], [-3.86, -1.85])).not.toBeNull();
  // and the slot between the console chair and the credenza, which is where the
  // guide's home post stands now
  expect(nav.free(stops[3])).toBe(true);
  expect(nav.route(stops[3], stops[5])).not.toBeNull();
  expect(nav.route(stops[5], stops[3])).not.toBeNull();
});
test("an inaccessible destination never falls back to walking through furniture", () => {
  // the middle of the slab, and the middle of the credenza
  expect(nav.route(stops[0], [-2.1, 1.2])).toBeNull();
  expect(nav.route(stops[0], [4.0, -1.55])).toBeNull();
  expect(nav.route(stops[0], [20, 0])).toBeNull();
  const wall = createFloorNavigation({
    bounds: { x0: 0, x1: 10, z0: 0, z1: 10 },
    obstacles: [{ id: "wall", x0: 4, x1: 6, z0: 0, z1: 10 }],
  });
  expect(wall.route([2, 5], [8, 5])).toBeNull();
});
test("diagonal grazing and very thin blockers are caught without sampling gaps", () => {
  const n = createFloorNavigation({
    radius: 0,
    bounds: { x0: 0, x1: 5, z0: 0, z1: 5 },
    obstacles: [{ id: "thin", x0: 2.123, x1: 2.124, z0: 0, z1: 5 }],
  });
  expect(n.clear([1, 1], [4, 4])).toBe(false);
});
