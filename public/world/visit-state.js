/* The house's visit grammar. This module knows nothing about models, prompts,
   memory, or the DOM: it only accepts finite transitions the room can render.
   Invalid events return the same object, so callers fail closed. */

export const VISIT_MODES = Object.freeze([
  "observing",
  "approaching",
  "threshold",
  "received",
  "declined",
  "unavailable",
  "set-down",
]);

export function createVisitState(fixture = null) {
  return Object.freeze({
    mode: "observing",
    residentId: null,
    fixture,
    noteLength: 0,
    visitorTurns: 0,
  });
}

function next(state, patch) {
  return Object.freeze({ ...state, ...patch });
}

export function transitionVisit(state, event) {
  if (!state || !event || typeof event.type !== "string") return state;

  if (event.type === "approach" && event.residentId) {
    return next(state, {
      mode: "approaching",
      residentId: event.residentId,
      noteLength: 0,
      visitorTurns: 0,
    });
  }

  if (
    event.type === "offer-note" &&
    ["approaching", "declined", "unavailable"].includes(state.mode)
  ) {
    return next(state, { mode: "threshold" });
  }

  if (event.type === "cancel-note" && state.mode === "threshold") {
    return next(state, { mode: "approaching" });
  }

  if (event.type === "resolve-threshold" && state.mode === "threshold") {
    const outcome = event.outcome;
    const noteLength = Math.max(0, Number(event.noteLength) || 0);
    if (!noteLength || !["received", "declined", "unavailable"].includes(outcome)) return state;
    return next(state, {
      mode: outcome,
      noteLength,
      visitorTurns: outcome === "received" ? 1 : 0,
    });
  }

  if (event.type === "continue" && state.mode === "received") {
    const length = Math.max(0, Number(event.noteLength) || 0);
    if (!length) return state;
    return next(state, { visitorTurns: state.visitorTurns + 1 });
  }

  if (event.type === "set-down" && state.mode === "received") {
    return next(state, { mode: "set-down" });
  }

  if (event.type === "return" && state.mode !== "observing") {
    return createVisitState(state.fixture);
  }

  return state;
}
