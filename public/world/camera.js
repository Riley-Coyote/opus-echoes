/**
 * The Sanctuary's camera.
 *
 * The room is 2240 wide and the frame is 1530, so 27% of it — the conservatory,
 * the reflecting basin, the loom, the alcoves — rendered nowhere for as long as
 * the camera was pinned. This moves it.
 *
 * THE CAMERA IS AN ATTENTION, NOT A PAN. It rests about nine tenths of the
 * time and turns when the room gives it a reason. Three things were ruled out
 * before this shape:
 *
 *   Scroll-driven — the page's crane already owns scrollY for the stage height,
 *   the mode flip, the canvas shift and the sill. A camera on the same input
 *   slides sideways while the frame shrinks, which reads as a broken sticky
 *   element. It would also stop dead whenever the reader stops, so the room
 *   looks dead exactly when someone is reading it.
 *
 *   Continuous drift — a background in constant motion under fixed chrome is
 *   restless, and in hero mode the display type sits on top of it.
 *
 *   Following the residents — thirteen figures stroll on 13-30s timers; the
 *   centroid jitters, and locking to the speaker recuts the frame on every line.
 *
 * It stops when someone is looking. That is a rule, not a nicety: it keeps a
 * click target from sliding out from under the cursor.
 *
 * Pure and DOM-free on purpose, so it can be stepped in node and asserted.
 */

const smoothstep = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makeCamera(o) {
  const opt = o || {};
  /* HOME frames the hall as it has always been framed; MID reaches the atelier;
     FAR looks down the length of the room to the conservatory. HOME is 90 and
     not 0 because every piece of chrome was tuned at 90, and 0 only buys ninety
     pixels of vestibule. */
  const dwells = opt.dwells || [90, 380, 710];
  const span = Math.max(1, dwells[dwells.length - 1] - dwells[0]);
  const moveMs = opt.moveMs || 8500;          // for the full span; shorter hops scale down
  const minMoveMs = opt.minMoveMs || 4500;
  const holdMin = opt.holdMin || 52000;
  const holdMax = opt.holdMax || 96000;
  const heroSettleMs = opt.heroSettleMs || 25000;
  const rand = opt.rand || Math.random;

  let idx = 0, x = dwells[0], from = x, to = x;
  let moving = false, moveT = 0, moveDur = moveMs;
  let held = 0, hold = holdMin + rand() * (holdMax - holdMin);
  let age = 0;                                 // time since the camera started
  let frames = 0, movingFrames = 0, maxStep = 0;

  /** nearest dwell to a hint, else any dwell but the current one */
  function choose(bias) {
    if (bias != null) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < dwells.length; i++) {
        const d = Math.abs(dwells[i] - bias);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    if (dwells.length < 2) return idx;
    let n = idx;
    while (n === idx) n = Math.floor(rand() * dwells.length) % dwells.length;
    return n;
  }

  function begin(next, reduced) {
    if (next === idx) { held = 0; return; }
    idx = next; from = x; to = dwells[next];
    if (reduced) { x = to; moving = false; held = 0; return; }   // cut, never pan
    moveDur = Math.max(minMoveMs, moveMs * (Math.abs(to - from) / span));
    moveT = 0; moving = true;
  }

  return {
    get x() { return x; },
    get moving() { return moving; },
    get dwell() { return idx; },
    dwells: dwells.slice(),
    /** test + coupling seam: jump straight to a position */
    goto(v) { x = from = to = clamp(v, dwells[0], dwells[dwells.length - 1]); moving = false; held = 0; },
    stats() { return { frames, movingFrames, maxStep, ratio: frames ? movingFrames / frames : 0 }; },

    /**
     * ctx: { frozen, hero, reduced, bias, urgent }
     *   frozen  — pointer over the stage, or an overlay open. Suspends motion.
     *   hero    — the room is the page; hold HOME while the display type is up.
     *   reduced — prefers-reduced-motion; cut instead of panning, hold longer.
     *   bias    — a room x worth looking at (a gathering, an exchange, the light).
     *   urgent  — act on the bias now rather than at the end of the hold.
     */
    step(dt, ctx) {
      const c = ctx || {};
      frames++;
      age += dt;

      if (moving) {
        const before = x;
        moveT = Math.min(1, moveT + dt / moveDur);
        x = from + (to - from) * smoothstep(moveT);
        const d = Math.abs(x - before);
        if (d > maxStep) maxStep = d;
        if (d > 0.001) movingFrames++;
        if (moveT >= 1) { x = to; moving = false; held = 0; hold = holdMin + rand() * (holdMax - holdMin); }
        return x;
      }

      /* frozen still ages the hold, so releasing the pointer does not
         immediately fling the camera somewhere */
      if (c.frozen) { held = Math.min(held, hold - 1); return x; }
      if (c.hero && age < heroSettleMs) return x;

      held += dt * (c.reduced ? 0.55 : 1);
      if (c.urgent && c.bias != null) { begin(choose(c.bias), c.reduced); return x; }
      if (held < (c.hero ? hold * 1.6 : hold)) return x;
      begin(choose(c.bias), c.reduced);
      return x;
    }
  };
}
