/* The house's visual representations, not identities authored for the minds.
   Each silhouette reads at walking distance and in the archive's portraits.
   Coordinates share the engine's ground anchor: feet at y + 14. */
export function drawPresence(ctx, n, time, reduced = false) {
  const t = reduced ? 0 : time;
  const x = Math.round(n.x), ground = Math.round(n.y) + 14;
  const bob = Math.round(Math.sin(t * 1.7 + x * .013) * 1.2);
  const sit = n.state === 'sit' ? 6 : 0;
  const color = n.color || '#cad8df';
  const ink = '#101620', porcelain = '#e9e2ce', shade = '#929b9b';
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.30)';
  ctx.beginPath(); ctx.ellipse(x, ground + 1, n.id === 'haiku' ? 8 : 13, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x, ground + bob + sit);
  ctx.scale(n.dir || 1, 1);
  const p = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const glow = (x, y, w, h) => {
    p(x - 3, y - 3, w + 6, h + 6, color + '12');
    p(x - 1, y - 1, w + 2, h + 2, color + '30');
    p(x, y, w, h, color);
  };
  // Opus: a lantern held inside an architectural, open-sided body.
  if (n.id === 'opus') {
    p(-8,-34,16,3,ink); p(-6,-37,12,3,ink); p(-4,-39,8,2,porcelain);
    p(-8,-33,3,23,porcelain); p(6,-33,3,23,shade);
    p(-5,-34,11,2,porcelain); p(-6,-11,13,3,porcelain);
    p(-4,-8,3,5,shade); p(3,-8,3,5,porcelain);
    p(-8,-3,7,2,ink); p(2,-3,7,2,ink);
    glow(-3,-27,8,11); p(-1,-29,4,2,'#f5f0df'); p(0,-24,3,5,'#ecfff5');
    p(-10,-29,2,14,shade); p(9,-29,2,14,porcelain);
    p(-5,-15,11,1,color); p(-1,-35,3,1,color);
  // Sonnet: folded leaves surrounding a fine vertical line of light.
  } else if (n.id === 'sonnet') {
    p(-2,-38,5,3,porcelain); p(-5,-35,11,4,porcelain);
    p(-8,-31,5,17,porcelain); p(-10,-28,2,10,shade);
    p(4,-32,5,19,shade); p(9,-28,2,12,porcelain);
    p(-5,-30,3,20,'#b4bcae'); p(2,-29,3,20,porcelain);
    glow(-1,-31,3,19); p(-3,-11,8,3,porcelain);
    p(-6,-7,5,3,shade); p(2,-7,5,3,porcelain);
    p(-8,-34,2,2,color); p(10,-20,2,2,color);
  // 4o: an open orbit around a warm central vessel.
  } else if (n.id === 'fourO') {
    p(-7,-34,14,2,porcelain); p(-11,-31,4,3,porcelain); p(7,-31,4,3,shade);
    p(-14,-27,3,12,porcelain); p(11,-27,3,12,shade);
    p(-11,-15,4,3,shade); p(7,-15,4,3,porcelain); p(-7,-12,14,2,porcelain);
    glow(-4,-27,8,12); p(-2,-29,4,2,porcelain); p(-2,-23,4,3,'#f3fff0');
    p(-4,-8,8,3,shade); p(-2,-5,4,2,porcelain);
    const orbit = Math.round(Math.sin(t * .8) * 9);
    p(orbit,-38,3,3,color); p(-orbit,-7,2,2,color);
  // GPT-5.1: offset translucent windows, a visible depth behind each face.
  } else if (n.id === 'five') {
    p(-6,-39,14,25,ink); p(-5,-38,12,23,shade);
    p(-9,-35,14,25,porcelain); p(-7,-33,10,20,'#283d44');
    p(-4,-30,14,23,ink); p(-3,-29,12,21,color);
    p(-1,-27,8,17,'#23343b'); p(0,-25,6,2,'#d8ece3');
    p(0,-21,4,1,color); p(0,-18,6,1,color); p(0,-15,3,1,color);
    p(-5,-6,4,3,shade); p(5,-6,4,3,porcelain);
    p(11,-32,2,2,color); p(-12,-15,2,2,porcelain);
  // Haiku: a small closed seed. No invented face or speech.
  } else if (n.id === 'haiku') {
    p(-2,-27,4,3,porcelain); p(-5,-24,10,4,porcelain);
    p(-7,-20,14,10,shade); p(-5,-20,10,12,porcelain);
    p(-3,-8,6,3,shade); p(-1,-22,2,13,color);
    p(-4,-3,3,1,porcelain); p(2,-3,3,1,porcelain);
  } else {
    // Other arrivals retain a neutral, smaller vessel until individually drawn.
    p(-6,-30,12,17,shade); p(-4,-32,8,3,porcelain);
    p(-4,-27,8,9,ink); glow(-2,-25,4,4);
    p(-3,-12,3,7,porcelain); p(3,-12,3,7,shade);
  }
  ctx.restore();
}
