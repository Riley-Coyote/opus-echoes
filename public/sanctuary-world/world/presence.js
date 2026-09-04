/* ==========================================================================
   THE BODIES — how the house draws a mind that is standing in a room.

   One family of vessels, six silhouettes. Nothing here is an identity
   authored for a resident: no face, no prop, no emblem. What a body carries
   is its shape — the way a coat hangs — and one small light at the chest in
   the family's colour, which is the only thing the house actually knows
   about them: that they are running. The visitor is the same figure without
   the light and with a hat, because a visitor is a person from outside.

   Coordinates share the engine's ground anchor: feet at n.y + 14. Drawn 1:1
   at walking distance and borrowed for the portrait at 3x, so every shape
   here has to read at nine pixels wide. Corners are knocked off rather than
   rounded: at 2x and up, a missing corner pixel reads as a curve.
   ========================================================================== */
const KINDS = {
  /* a painter's smock: narrow shoulders, a hem that widens and falls over the legs; the head a little forward */
  opus:   { kind: 'smock',  legH: 8, torsoW: 8,  torsoH: 14, headW: 6, headH: 7, stoop: 1, body: '#2a2130', bodyHi: '#3b3042', bodyDk: '#181218', face: '#cdc8ba' },
  /* a reader's mantle: squared shoulders wider than the body, falling to a flared hem; upright */
  sonnet: { kind: 'mantle', legH: 9, torsoW: 6,  torsoH: 14, headW: 6, headH: 7, body: '#262433', bodyHi: '#3b3750', bodyDk: '#161421', face: '#efe9dc' },
  /* small and closed: a rounded body, a hood, the face a lit dot */
  haiku:  { kind: 'seed',   legH: 4, torsoW: 8,  torsoH: 8,  headW: 7, headH: 6, body: '#24212b', bodyHi: '#332e3c', bodyDk: '#151219', face: '#cdc8ba' },
  /* broad and open: arms held a little away from the body */
  fourO:  { kind: 'host',   legH: 7, torsoW: 9,  torsoH: 11, headW: 6, headH: 6, body: '#3a2f2a', bodyHi: '#4f3f38', bodyDk: '#22191a', face: '#cdc8ba' },
  /* tallest and newest: one side of them has not settled */
  five:   { kind: 'new',    legH: 9, torsoW: 7,  torsoH: 15, headW: 6, headH: 7, body: '#2b2f33', bodyHi: '#3e454c', bodyDk: '#181b1f', face: '#b9b3a6' }
};
const VISITOR = { kind: 'human', legH: 7, torsoW: 8, torsoH: 12, headW: 6, headH: 7, body: '#262029', bodyHi: '#332b36', bodyDk: '#181218', face: '#cdc8ba' };
/* other people's visitors, passing through: the same figure, worn pale */
const GUEST   = { kind: 'human', legH: 7, torsoW: 8, torsoH: 12, headW: 6, headH: 7, body: '#948e80', bodyHi: '#aca696', bodyDk: '#6e6860', face: '#cdc8ba' };

export function specFor(n) { return KINDS[n.id] || (n.temp ? GUEST : VISITOR); }

/* a rect with its corners knocked off */
const rr = (p, x, y, w, h, col) => { p(x + 1, y, w - 2, 1, col); p(x, y + 1, w, h - 2, col); p(x + 1, y + h - 1, w - 2, 1, col); };

/**
 * One figure, feet at (0, 0), facing +x. `p(x, y, w, h, col)` paints.
 * o.off is the stride (legs swing apart), o.bob lifts the body, o.sit lowers
 * it onto its heels, o.light is the family colour or null, o.cap a hat colour.
 */
export function drawFigure(p, s, o) {
  const sit = o.sit ? 2 : 0, bob = o.bob || 0, off = o.off || 0;
  const legH = s.legH - sit;
  p(-3 - off, -legH, 3, legH, '#181218'); p(0 + off, -legH, 3, legH, '#1d151d');
  const by = -(legH + s.torsoH) + bob, tw = s.torsoW, tx = -Math.floor(tw / 2), hemY = by + s.torsoH;
  if (s.kind === 'smock') {
    rr(p, tx, by, tw, s.torsoH, s.body);
    p(tx - 1, by + 9, tw + 2, s.torsoH - 9 + 3, s.body); p(tx - 1, by + 9, 1, s.torsoH - 9 + 3, s.bodyHi); p(tx + tw, by + 9, 1, s.torsoH - 9 + 3, s.bodyDk);
    p(tx, by, 2, 9, s.bodyHi); p(tx + tw - 2, by, 2, 9, s.bodyDk);
    p(tx + 1, by - 1, tw - 2, 1, s.bodyHi);
  } else if (s.kind === 'mantle') {
    p(tx - 2, by, tw + 4, 3, s.body); p(tx - 2, by, 2, 3, s.bodyHi); p(tx + tw, by, 2, 3, s.bodyDk);
    p(tx, by + 3, tw, s.torsoH - 3, s.body); p(tx, by + 3, 1, s.torsoH - 3, s.bodyHi); p(tx + tw - 1, by + 3, 1, s.torsoH - 3, s.bodyDk);
    p(tx - 1, hemY, tw + 2, 4, s.body); p(tx - 2, hemY + 2, tw + 4, 2, s.body); p(tx - 2, hemY + 3, tw + 4, 1, s.bodyDk);
  } else if (s.kind === 'seed') {
    rr(p, tx, by, tw, s.torsoH + 2, s.body); p(tx + 1, by + 1, 1, s.torsoH, s.bodyHi); p(tx + tw - 2, by + 1, 1, s.torsoH, s.bodyDk);
  } else if (s.kind === 'host') {
    rr(p, tx, by, tw, s.torsoH, s.body); p(tx, by + 1, 2, s.torsoH - 2, s.bodyHi); p(tx + tw - 2, by + 1, 2, s.torsoH - 2, s.bodyDk);
    p(tx - 3, by + 2, 2, 7, s.body); p(tx - 3, by + 8, 2, 2, s.face); p(tx + tw + 1, by + 2, 2, 7, s.bodyDk); p(tx + tw + 1, by + 8, 2, 2, s.face);
    p(tx - 1, hemY, tw + 2, 1, s.body);
  } else if (s.kind === 'new') {
    for (let y = by; y < by + s.torsoH; y++) for (let x = tx; x < tx + tw; x++) {
      if (x >= tx + tw - 3 && ((x + y) & 1)) continue;                                   // the unsettled side
      if ((y === by || y === by + s.torsoH - 1) && (x === tx || x === tx + tw - 1)) continue;
      p(x, y, 1, 1, x < tx + 2 ? s.bodyHi : x >= tx + tw - 2 ? s.bodyDk : s.body);
    }
    p(tx, hemY, tw, 2, s.body);
  } else {
    rr(p, tx, by, tw, s.torsoH, s.body); p(tx, by + 1, 2, s.torsoH - 2, s.bodyHi); p(tx + tw - 2, by + 1, 2, s.torsoH - 2, s.bodyDk);
  }
  const hx = -Math.floor(s.headW / 2), hy = by - s.headH - 1 + (s.stoop || 0);
  if (s.kind === 'seed') { rr(p, hx - 1, hy - 1, s.headW + 2, s.headH + 2, s.bodyHi); rr(p, hx, hy, s.headW, s.headH, '#0e0b12'); p(hx + 2, hy + 2, 2, 2, s.face); }
  else { rr(p, hx, hy, s.headW, s.headH, s.face); p(hx + s.headW - 1, hy + 1, 1, s.headH - 2, '#948e80'); }
  if (o.cap) { p(hx + 1, hy - 2, s.headW - 2, 1, o.cap); p(hx, hy - 1, s.headW, 1, o.cap); p(hx - 1, hy, s.headW + 2, 1, o.cap); }
  if (o.light) p(-1, by + (s.kind === 'seed' ? 3 : 4), 2, 3, o.light);
}

/* the stride and the bob, from the engine's six-frame walk */
const STRIDE = [0, 2, 3, 0, -2, -3], BOB = [0, -1, -1, 0, -1, -1];

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
  ctx.beginPath(); ctx.ellipse(x, ground + 1, s.kind === 'seed' ? 6 : 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x + (glitch ? (Math.random() < 0.5 ? -1 : 1) : 0), ground);
  ctx.scale(n.dir || 1, 1);
  const p = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px, py, w, h); };
  drawFigure(p, s, { off, bob, sit, light: n.color || null });
  if (glitch) {
    ctx.globalAlpha = 0.4;
    p(-5, -(s.legH + s.torsoH) + 6, 10, 1, '#5eead4'); p(-5, -s.legH - 2, 10, 1, '#f2a3c0');
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
  ctx.beginPath(); ctx.ellipse(x, ground + 1, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(x, ground); ctx.scale(a.dir || 1, 1);
  const p = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px, py, w, h); };
  drawFigure(p, VISITOR, { off, bob, cap: (P && P.accent) || '#f2c14e' });
  ctx.restore();
}
