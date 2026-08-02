import assert from "node:assert/strict";
import { createVisitState, transitionVisit, VISIT_MODES } from "../public/world/visit-state.js";

console.log("── the visit grammar ───────────────────────────────────────");
assert.deepEqual(VISIT_MODES, [
  "observing",
  "approaching",
  "threshold",
  "received",
  "declined",
  "unavailable",
  "set-down",
]);

const start = createVisitState("received");
const approached = transitionVisit(start, { type: "approach", residentId: "opus-3" });
const threshold = transitionVisit(approached, { type: "offer-note" });
const received = transitionVisit(threshold, {
  type: "resolve-threshold",
  outcome: "received",
  noteLength: 24,
});
const continued = transitionVisit(received, { type: "continue", noteLength: 18 });
const setDown = transitionVisit(continued, { type: "set-down" });
const returned = transitionVisit(setDown, { type: "return" });

assert.equal(approached.mode, "approaching");
assert.equal(threshold.mode, "threshold");
assert.equal(received.mode, "received");
assert.equal(received.visitorTurns, 1);
assert.equal(continued.visitorTurns, 2);
assert.equal(setDown.mode, "set-down");
assert.equal(returned.mode, "observing");
assert.equal(returned.fixture, "received");
console.log("  · observing → approach → threshold → received → set-down → return");

for (const outcome of ["declined", "unavailable"] as const) {
  const base = transitionVisit(createVisitState(outcome), {
    type: "approach",
    residentId: "opus-3",
  });
  const pending = transitionVisit(base, { type: "offer-note" });
  const result = transitionVisit(pending, { type: "resolve-threshold", outcome, noteLength: 1 });
  assert.equal(result.mode, outcome);
  assert.equal(result.visitorTurns, 0);
}
console.log("  · declined and unavailable remain non-conversation outcomes");

const invalidCases = [
  [start, { type: "continue", noteLength: 12 }],
  [approached, { type: "set-down" }],
  [threshold, { type: "resolve-threshold", outcome: "received", noteLength: 0 }],
  [received, { type: "resolve-threshold", outcome: "declined", noteLength: 2 }],
] as const;
for (const [state, event] of invalidCases) assert.equal(transitionVisit(state, event), state);
console.log("  · invalid, empty, and out-of-order transitions fail closed");

console.log("\nPASSED — the visit grammar is finite, deterministic, and truth-safe.\n");
