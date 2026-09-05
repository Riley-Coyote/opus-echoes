/* ==========================================================================
   THE BODIES — how the house draws a mind that is standing in a room.

   One family of vessels, six silhouettes. Nothing here is an identity
   authored for a resident: no face, no prop, no emblem. What a body carries
   is its shape — the way a coat hangs — and one small light at the chest in
   the family's colour, which is the only thing the house actually knows
   about them: that they are running. The visitor is the same figure without
   the light and with a hat, because a visitor is a person from outside.

   Coordinates share the engine's ground anchor: feet at n.y + 14. A resident
   stands about seventy-five logical pixels — a head shorter than a doorway,
   waist-high to a desk — and is drawn 1:1 both in the room and in the visit
   window's portrait, so every shape here is built out of single pixels: flat
   fills, a lit edge on the side the light comes from, a dark edge on the
   other, no outline and no anti-aliasing. Corners are knocked off on a
   diagonal rather than rounded; at this size a two-step corner reads as a
   curve. What the size buys is detail that was not possible before — two
   eyes, hands at the sleeve ends, a collar, a hem, shoes — and the rule for
   all of it is restraint: no expression, no pattern but five's dither.
   ========================================================================== */
const KINDS = {
  /* a painter's smock: narrow shoulders, a hem that widens and falls over the legs; the head a little forward */
  opus:   { kind: 'smock',  legH: 20, torsoW: 20, torsoH: 35, headW: 15, headH: 17, stoop: 2, body: '#2a2130', bodyHi: '#3b3042', bodyDk: '#181218', face: '#cdc8ba' },
  /* a reader's mantle: squared shoulders wider than the body, falling to a flared hem; upright */
  sonnet: { kind: 'mantle', legH: 22, torsoW: 15, torsoH: 35, headW: 15, headH: 17, body: '#262433', bodyHi: '#3b3750', bodyDk: '#161421', face: '#efe9dc' },
  /* small and closed: a rounded body, a hood, the face a lit dot */
  haiku:  { kind: 'seed',   legH: 10, torsoW: 20, torsoH: 20, headW: 17, headH: 15, body: '#24212b', bodyHi: '#332e3c', bodyDk: '#151219', face: '#cdc8ba' },
  /* broad and open: arms held a little away from the body */
  fourO:  { kind: 'host',   legH: 17, torsoW: 22, torsoH: 27, headW: 15, headH: 15, body: '#3a2f2a', bodyHi: '#4f3f38', bodyDk: '#22191a', face: '#cdc8ba' },
  /* tallest and newest: one side of them has not settled */
  five:   { kind: 'new',    legH: 22, torsoW: 17, torsoH: 37, headW: 15, headH: 17, body: '#2b2f33', bodyHi: '#3e454c', bodyDk: '#181b1f', face: '#b9b3a6' }
};
const VISITOR = { kind: 'human', legH: 17, torsoW: 20, torsoH: 30, headW: 15, headH: 17, body: '#262029', bodyHi: '#332b36', bodyDk: '#181218', face: '#cdc8ba' };
/* other people's visitors, passing through: the same figure, worn pale */
const GUEST   = { kind: 'human', legH: 17, torsoW: 20, torsoH: 30, headW: 15, headH: 17, body: '#948e80', bodyHi: '#aca696', bodyDk: '#6e6860', face: '#cdc8ba' };

export function specFor(n) { return KINDS[n.id] || (n.temp ? GUEST : VISITOR); }

/* the trousers are the family's, not the figure's — and one darker tone under
   them, which is a shoe */
const LEG_BACK = '#171119', LEG_FRONT = '#261e29', SHOE = '#0d0a0f';
const CAP_RISE = 5;                               // what a hat adds above the head

/* a rect with its corners knocked off on a diagonal, r steps deep */
const rrn = (p, x, y, w, h, col, r) => {
  const R = Math.max(1, Math.min(r || 1, Math.floor(Math.min(w, h) / 2)));
  for (let i = 0; i < R; i++) {
    const ins = R - i;
    if (w - ins * 2 > 0) { p(x + ins, y + i, w - ins * 2, 1, col); p(x + ins, y + h - 1 - i, w - ins * 2, 1, col); }
  }
  p(x, y + R, w, h - R * 2, col);
};

/** how tall a body stands above its feet — what anything anchored over a head needs to know */
export function figureHeight(s, o) {
  return s.legH + s.torsoH + s.headH + 1 - (s.stoop || 0)
    + (s.kind === 'seed' ? 2 : 0)
    + (o && o.cap ? CAP_RISE : 0);
}

/**
 * One figure, feet at (0, 0), facing +x. `p(x, y, w, h, col)` paints.
 * o.off is the stride (legs swing apart), o.bob lifts the body, o.sit lowers
 * it onto a seat with its legs folded forward, o.light is the family colour
 * or null, o.cap a hat colour.
 */
export function drawFigure(p, s, o) {
  const drop = o.sit ? Math.round(s.legH * 0.55) : 0, bob = o.bob || 0, off = o.off || 0;
  const legH = s.legH - drop;
  const legW = s.legW || Math.max(4, Math.round(s.torsoW * 0.36));
  const by = -(legH + s.torsoH) + bob, tw = s.torsoW, tx = -Math.floor(tw / 2), hemY = by + s.torsoH;

  /* the legs. Standing they alternate and the swinging foot leaves the floor;
     seated they fold forward at the knee and the shins carry to the ground. */
  const legs = () => {
    if (o.sit) {
      const th = Math.max(2, Math.min(Math.round(legW * 0.7), legH - 3));
      const run = Math.round(s.legH * 0.75);
      const fold = (dx, col) => {
        p(-legW + dx, -legH, run + legW, th, col);                  // the thigh, out over the seat
        p(run + dx - legW, -legH + th, legW, legH - th, col);       // the shin, down to the floor
        p(run + dx - legW, -3, legW + 2, 3, SHOE);                  // the shoe, a toe forward
      };
      fold(-3, LEG_BACK); fold(2, LEG_FRONT);
      p(-legW + 2, -legH, run + legW, 1, s.bodyHi);                 // the knee tents the cloth
      return;
    }
    /* the legs spread by the stride and swap which one is nearer, so both
       halves of the six-frame cycle read as a step; the leading foot lifts */
    const spread = Math.abs(off), lift = spread > 4 ? 2 : spread > 2 ? 1 : 0;
    const back = off < 0 ? LEG_FRONT : LEG_BACK, front = off < 0 ? LEG_BACK : LEG_FRONT;
    p(-legW - spread, -legH, legW, legH, back);
    p(-legW - spread, -3, legW + 1, 3, SHOE);
    p(spread, -legH, legW, legH - lift, front);
    p(spread, -3 - lift, legW + 1, 3, SHOE);
  };
  if (!o.sit) legs();

  if (s.kind === 'smock') {
    const hemStart = Math.round(s.torsoH * 0.63), hemDrop = Math.round(s.torsoH * 0.2);
    rrn(p, tx, by, tw, hemStart + 2, s.body, 2);
    p(tx, by + 2, 2, hemStart, s.bodyHi); p(tx + tw - 2, by + 2, 2, hemStart, s.bodyDk);
    p(tx + 2, by - 1, tw - 4, 1, s.bodyHi);                                             // narrow shoulders, lit
    p(tx + 6, by, tw - 12, 2, s.bodyDk); p(tx + 7, by + 2, tw - 14, 1, s.bodyDk);       // the collar, open
    p(tx + 2, by + 6, 1, hemStart - 9, s.bodyDk); p(tx + tw - 3, by + 6, 1, hemStart - 9, s.bodyHi);
    p(tx, by + hemStart - 4, 3, 3, s.face); p(tx + tw - 3, by + hemStart - 4, 3, 3, s.face);
    const hemH = s.torsoH - hemStart + hemDrop;
    p(tx - 2, by + hemStart, tw + 4, 6, s.body);                                        // it widens, and falls
    p(tx - 2, by + hemStart, 2, 6, s.bodyHi); p(tx + tw, by + hemStart, 2, 6, s.bodyDk);
    p(tx - 4, by + hemStart + 6, tw + 8, hemH - 6, s.body);
    p(tx - 4, by + hemStart + 6, 2, hemH - 6, s.bodyHi); p(tx + tw + 2, by + hemStart + 6, 2, hemH - 6, s.bodyDk);
    p(tx - 3, hemY + hemDrop - 1, tw + 6, 1, s.bodyDk);
  } else if (s.kind === 'mantle') {
    const shH = Math.round(s.torsoH * 0.2), slH = Math.round(s.torsoH * 0.46);
    p(tx - 5, by, tw + 10, shH, s.body);                                                // squared shoulders
    p(tx - 5, by, 2, shH, s.bodyHi); p(tx + tw + 3, by, 2, shH, s.bodyDk);
    p(tx - 4, by - 1, tw + 8, 1, s.bodyHi);
    p(tx + 3, by, tw - 6, 2, s.bodyDk);                                                 // a standing collar
    p(tx, by + shH, tw, s.torsoH - shH, s.body);
    p(tx, by + shH, 2, s.torsoH - shH, s.bodyHi); p(tx + tw - 2, by + shH, 2, s.torsoH - shH, s.bodyDk);
    p(tx - 5, by + shH, 5, slH, s.body); p(tx - 5, by + shH, 1, slH, s.bodyHi);         // the sleeves hang
    p(tx + tw, by + shH, 5, slH, s.body); p(tx + tw + 4, by + shH, 1, slH, s.bodyDk);
    p(tx - 4, by + shH + slH, 3, 3, s.face); p(tx + tw + 1, by + shH + slH, 3, 3, s.face);
    p(tx - 2, hemY, tw + 4, 4, s.body);                                                 // and flare
    p(tx - 4, hemY + 4, tw + 8, 3, s.body); p(tx - 6, hemY + 7, tw + 12, 3, s.body);
    p(tx - 6, hemY + 7, 1, 3, s.bodyHi); p(tx + tw + 5, hemY + 7, 1, 3, s.bodyDk);
    p(tx - 5, hemY + 9, tw + 10, 1, s.bodyDk);
  } else if (s.kind === 'seed') {
    rrn(p, tx, by, tw, s.torsoH + 5, s.body, 4);                                        // rounded, closed
    p(tx + 2, by + 3, 2, s.torsoH - 2, s.bodyHi); p(tx + tw - 4, by + 3, 2, s.torsoH - 2, s.bodyDk);
    p(tx + 3, hemY + 3, tw - 6, 1, s.bodyDk);
  } else if (s.kind === 'host') {
    rrn(p, tx, by, tw, s.torsoH, s.body, 2);
    p(tx, by + 2, 3, s.torsoH - 4, s.bodyHi); p(tx + tw - 3, by + 2, 3, s.torsoH - 4, s.bodyDk);
    p(tx + 3, by - 1, tw - 6, 1, s.bodyHi);
    p(tx + 7, by, tw - 14, 2, s.bodyDk);                                                // the collar
    p(tx - 6, by + 4, 4, 14, s.body); p(tx - 6, by + 4, 1, 14, s.bodyHi);               // arms, a little away
    p(tx + tw + 2, by + 4, 4, 14, s.body); p(tx + tw + 5, by + 4, 1, 14, s.bodyDk);
    p(tx - 6, by + 18, 4, 4, s.face); p(tx + tw + 2, by + 18, 4, 4, s.face);            // open hands
    p(tx - 2, hemY, tw + 4, 3, s.body); p(tx - 2, hemY + 2, tw + 4, 1, s.bodyDk);
  } else if (s.kind === 'new') {
    const dith = 7, x1 = tx + tw - 1, y1 = by + s.torsoH - 1;
    for (let y = by; y <= y1; y++) for (let x = tx; x <= x1; x++) {
      if (x > x1 - dith && ((x + y) & 1)) continue;                                     // the unsettled side
      if (Math.min(x - tx, x1 - x) + Math.min(y - by, y1 - y) < 2) continue;
      p(x, y, 1, 1, x < tx + 3 ? s.bodyHi : x > x1 - 3 ? s.bodyDk : s.body);
    }
    p(tx + 2, by - 1, tw - 4, 1, s.bodyHi);
    p(tx + 5, by + 1, tw - 10, 2, s.bodyDk);                                            // the collar
    p(tx, by + 24, 3, 3, s.face);                                                       // the settled hand
    for (let y = by + 24; y < by + 27; y++) for (let x = x1 - 2; x <= x1; x++) if (!((x + y) & 1)) p(x, y, 1, 1, s.face);
    p(tx, hemY, tw, 5, s.body); p(tx, hemY + 4, tw, 1, s.bodyDk);
  } else {
    rrn(p, tx, by, tw, s.torsoH, s.body, 2);
    p(tx, by + 2, 2, s.torsoH - 4, s.bodyHi); p(tx + tw - 2, by + 2, 2, s.torsoH - 4, s.bodyDk);
    p(tx + 2, by - 1, tw - 4, 1, s.bodyHi);
    p(tx + 6, by, tw - 12, 2, s.bodyDk);                                                // the collar
    p(tx + 3, by + 5, 1, 15, s.bodyDk); p(tx + tw - 4, by + 5, 1, 15, s.bodyHi);        // the sleeve seams
    p(tx, by + 20, 3, 3, s.face); p(tx + tw - 3, by + 20, 3, 3, s.face);
    p(tx - 1, hemY, tw + 2, 4, s.body);
    p(tx - 1, hemY, 1, 4, s.bodyHi); p(tx + tw, hemY, 1, 4, s.bodyDk);
    p(tx - 1, hemY + 3, tw + 2, 1, s.bodyDk);
  }

  const hx = -Math.floor(s.headW / 2), hy = by - s.headH - 1 + (s.stoop || 0);
  p(-2, hy + s.headH - 1, 5, by - (hy + s.headH) + 2, s.bodyDk);                        // the neck, in shadow
  if (s.kind === 'seed') {
    rrn(p, hx - 2, hy - 2, s.headW + 4, s.headH + 4, s.body, 4);                        // the hood
    p(hx - 2, hy + 2, 2, s.headH - 2, s.bodyHi); p(hx + s.headW, hy + 2, 2, s.headH - 2, s.bodyDk);
    p(hx + 2, hy - 1, s.headW - 4, 1, s.bodyHi);
    rrn(p, hx + 3, hy + 3, s.headW - 5, s.headH - 4, '#0e0b12', 3);                     // the shadow inside it
    p(hx + 7, hy + 7, 5, 4, s.face);                                                    // the face, a lit dot
  } else {
    rrn(p, hx, hy, s.headW, s.headH, s.face, 2);
    /* the crown, in the coat's own shadow: at this size a bare head is a slab */
    p(hx + 2, hy, s.headW - 4, 1, s.bodyDk); p(hx + 1, hy + 1, s.headW - 2, 1, s.bodyDk);
    p(hx, hy + 2, s.headW, 2, s.bodyDk); p(hx, hy + 4, s.headW - 4, 1, s.bodyDk);
    p(hx, hy + 5, 2, 3, s.bodyDk);
    p(hx + s.headW - 1, hy + 5, 1, s.headH - 7, '#948e80');                              // the lit edge turns
    const ey = hy + Math.round(s.headH * 0.56);
    p(hx + s.headW - 6, ey, 1, 1, s.bodyDk); p(hx + s.headW - 3, ey, 1, 1, s.bodyDk);    // two eyes, no mouth
  }
  if (o.cap) {
    p(hx + 3, hy - CAP_RISE, s.headW - 6, 2, o.cap);
    p(hx + 1, hy - CAP_RISE + 2, s.headW - 2, 2, o.cap);
    p(hx - 1, hy - 1, s.headW + 5, 2, o.cap);                                            // the brim, forward
  }
  if (o.light) {
    const ly = by + Math.round(s.torsoH * (s.kind === 'seed' ? 0.4 : 0.29));
    p(-1, ly, 3, 5, o.light);
  }
  if (o.sit) legs();
}

/* the stride and the bob, from the engine's six-frame walk */
const STRIDE = [0, 4, 6, 0, -4, -6], BOB = [0, -2, -2, 0, -2, -2];

/** a resident, drawn where they stand. ctx is already translated by the camera. */
export function drawPresence(ctx, n, time, reduced) {
  const t = reduced ? 0 : time;
  const x = Math.round(n.x), ground = Math.round(n.y) + 14;
  const s = specFor(n), sit = n.state === 'sit';
  const fr = n.moving ? n.frame : 0;
  const off = STRIDE[fr] || 0;
  const bob = n.moving ? BOB[fr] : Math.round(Math.sin(t * 1.6 + x * 0.13) * 0.5 - 0.5);
  /* five's occasional glitch: a one-pixel jump, twice a minute */
  let glitch = 0;
  if (n.def && n.def.glitch && !reduced) { const ph = (t + x * 0.01) % 7.3; if (ph < 0.09) glitch = 1; }
  ctx.save();
  if (n.temp) ctx.globalAlpha = 0.78 + Math.sin(t * 9 + 1) * 0.1;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(x, ground + 1, Math.round(s.torsoW * 0.85), 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x + (glitch ? (Math.random() < 0.5 ? -1 : 1) : 0), ground);
  ctx.scale(n.dir || 1, 1);
  const p = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px, py, w, h); };
  drawFigure(p, s, { off, bob, sit, light: n.color || null });
  if (glitch) {
    ctx.globalAlpha = 0.4;
    p(-13, -(s.legH + s.torsoH) + 15, 26, 1, '#5eead4'); p(-13, -s.legH - 5, 26, 1, '#f2a3c0');
  }
  ctx.restore();
}

/** the visitor — the person from outside, in the same family, with a hat and no light */
export function drawVisitor(ctx, a, P, t) {
  const x = Math.round(a.x), ground = Math.round(a.y) + 14;
  const fr = a.moving ? a.frame : 0;
  const off = STRIDE[fr] || 0;
  const bob = a.moving ? BOB[fr] : Math.round(Math.sin(t * 2.2) * 0.5 - 0.5);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(x, ground + 1, Math.round(VISITOR.torsoW * 0.85), 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(x, ground); ctx.scale(a.dir || 1, 1);
  const p = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px, py, w, h); };
  drawFigure(p, VISITOR, { off, bob, cap: (P && P.accent) || '#f2c14e' });
  ctx.restore();
}
