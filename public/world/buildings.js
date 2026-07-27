/* ==========================================================================
   TOPOLOGIE — THE WORLD · BUILDING INTERIORS (entry rooms)
   Museum-entry and Shop-entry, built natively in the world engine (engine.js:
   bg(b,W,H) bakes once, draw(g,t) animates). They replace the Lookout's
   "being built" stubs so the whole world connects: Lookout \u2192 Sanctuary
   (+4 model rooms) \u2192 Museum \u2192 Shop. Kept in the shared warm-dusk grade,
   each with its own accent (Museum: stone + red spark; Shop: linen + brand).

     museum \u2014 a columned entry hall; a red carpet leads to a great red archway
              (the deep collection, being hung beyond). Framed works between the
              columns. noNpc for now \u2014 curators arrive in a later pass.
     shop   \u2014 the TOPOLOGIE storefront interior: an awning, garment rails,
              plinths of goods, a counter with a live "FIELD" screen, a lookbook.
   ========================================================================== */

const M = {
  ceil:'#0e0a12', floor0:'#2a2420', floor1:'#1a1512',
  wood:'#3a2c24', woodHi:'#5c4636', woodDk:'#1e1610',
  stone:'#2f2a36', stoneHi:'#463f50', stoneDk:'#161320', marble:'#cfc7c0', marbleDk:'#8a8078',
  bronze:'#241a15', brass:'#8a6a3a', brassHi:'#c69a52',
  ink:'#f3ecdf', dim:'#8a7d86', red:'#e0341f', redDk:'#8a1f14', redGlow:'224,52,31',
  amber:'#f2c14e', warm:'#f2ad5f', candle:'#f7d98c', frost:'#9fd6e0', green:'#6ee7a5',
  linen:'#d8cbb0', linenDk:'#a89a7c', linen2:'#c7b998', cloth:'#3a4048', clothHi:'#4c5560',
  leaf2:'#2b4220', leaf3:'#3a5a2c', leaf4:'#4d7238',
  sky:['#0b0819','#160b28','#241238','#3a1642','#5c1f49','#822f49','#ab4f43','#d17a45','#f2ad5f']
};
function lerpHex(a, c, f) {
  const A = parseInt(a.slice(1), 16), C = parseInt(c.slice(1), 16);
  const ar = A >> 16, ag = (A >> 8) & 255, ab = A & 255, cr = C >> 16, cg = (C >> 8) & 255, cb = C & 255;
  return 'rgb(' + Math.round(ar + (cr - ar) * f) + ',' + Math.round(ag + (cg - ag) * f) + ',' + Math.round(ab + (cb - ab) * f) + ')';
}
function bloom(b, cx, cy, r, rgb, peak) { for (let i = r; i > 0; i -= 2) { const a = (peak * (1 - i / r) * (1 - i / r)).toFixed(3); b.px(cx - i, cy - i, i * 2, i * 2, 'rgba(' + rgb + ',' + a + ')'); } }
function duskWindow(b, cx, w, yTop, ySpring, yBase) {
  const x0 = cx - w / 2, x1 = cx + w / 2, ctx = b.ctx;
  ctx.save(); ctx.beginPath(); ctx.moveTo(x0, yBase); ctx.lineTo(x0, ySpring); ctx.quadraticCurveTo(cx, yTop - 16, x1, ySpring); ctx.lineTo(x1, yBase); ctx.closePath(); ctx.clip();
  const sTop = yTop - 6, sBot = yBase - 18;
  for (let y = sTop; y < sBot; y++) { const f = (y - sTop) / (sBot - sTop), seg = f * (M.sky.length - 1), i = Math.min(M.sky.length - 2, Math.floor(seg)); b.px(x0, y, w, 1, lerpHex(M.sky[i], M.sky[i + 1], seg - i)); }
  for (let i = 0; i < 24; i++) { const x = x0 + ((i * 37 + 5) % w), y = sTop + ((i * 23) % 60); if ((i * 97 % 100) / 100 > 0.5) b.px(x, y, 1, 1, 'rgba(243,236,223,0.4)'); }
  for (let x = x0; x < x1; x += 4) { const rh = Math.sin(x * 0.03) * 6; b.px(x, sBot - 14 + rh, 4, 22, '#2a1c3e'); }
  for (let x = x0 + 8; x < x1 - 8; x++) { const e = Math.min(x - (x0 + 8), (x1 - 8) - x); b.px(x, sBot, 1, Math.min(6, 2 + e * 0.13), lerpHex('#2a1c3e', '#8a3f52', (x - x0) / w)); }
  ctx.restore();
  ctx.strokeStyle = M.bronze; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0, yBase); ctx.lineTo(x0, ySpring); ctx.quadraticCurveTo(cx, yTop - 16, x1, ySpring); ctx.lineTo(x1, yBase); ctx.stroke();
  for (let y = ySpring + 2; y < yBase; y += 24) b.px(x0, y, w, 1, M.bronze); b.px(cx - 1, yTop, 2, yBase - yTop, M.bronze);
}
function column(b, cx, topY, baseY) {
  const w = 20, x = cx - w / 2;
  b.px(x, topY, w, baseY - topY, '#3a3442'); b.px(x, topY, 5, baseY - topY, '#4c4658'); b.px(x + w - 5, topY, 5, baseY - topY, '#241f2c');
  for (let fx = x + 6; fx < x + w - 4; fx += 5) b.px(fx, topY + 4, 2, baseY - topY - 8, 'rgba(0,0,0,0.28)');
  b.px(x - 4, topY - 6, w + 8, 8, '#4c4658'); b.px(x - 4, topY - 6, w + 8, 2, M.marbleDk);   // capital
  b.px(x - 5, baseY - 8, w + 10, 8, '#3a3442'); b.px(x - 5, baseY - 8, w + 10, 2, '#4c4658'); // base
}
function framed(b, x, y, w, h, tint, red) {
  b.px(x - 3, y - 3, w + 6, h + 6, M.bronze); b.px(x - 3, y - 3, w + 6, 2, M.brassHi); b.px(x - 3, y - 3, 2, h + 6, M.brass);
  b.px(x, y, w, h, '#0e0b12'); b.px(x + 2, y + 2, w - 4, h - 4, tint);
  for (let ly = y + 4; ly < y + h - 3; ly += 4) b.px(x + 3, ly, w - 6, 1, 'rgba(207,199,192,0.10)');   // faint "ascii" ruling
  if (red) { b.px(x + 4, y + h - 8, w - 8, 3, 'rgba(224,52,31,0.5)'); }
  b.px(x, y, w, 1, 'rgba(247,217,140,0.14)');
}
function plinth(b, cx, topY, baseY, w) {
  const x = cx - w / 2; b.px(x, topY, w, baseY - topY, M.stone); b.px(x, topY, 3, baseY - topY, M.stoneHi); b.px(x + w - 3, topY, 3, baseY - topY, M.stoneDk);
  b.px(x - 3, topY - 4, w + 6, 4, M.stoneHi); b.px(x - 3, topY - 4, w + 6, 1, M.marbleDk); b.px(x - 3, baseY - 4, w + 6, 4, M.stone);
}
function baseShell(b, W, H, wallHi, wallLo, floorTint) {
  for (let y = 0; y < 300; y++) b.px(0, y, W, 1, lerpHex(wallHi, wallLo, y / 300));
  b.px(0, 0, W, 24, M.ceil);
  for (let x = 0; x < W; x += 60) { b.ctx.fillStyle = '#160f18'; b.ctx.beginPath(); b.ctx.moveTo(x, 24); b.ctx.lineTo(x + 30, 6); b.ctx.lineTo(x + 60, 24); b.ctx.closePath(); b.ctx.fill(); }
  b.px(0, 22, W, 3, M.stone);
  for (let y = 300; y < H; y++) b.px(0, y, W, 1, lerpHex(floorTint || M.floor0, M.floor1, (y - 300) / (H - 300)));
  for (let y = 312; y < H; y += 12) b.px(0, y, W, 1, 'rgba(0,0,0,0.20)');
  for (let x = 0; x < W; x += 56) b.px(x, 300, 1, H - 300, 'rgba(0,0,0,0.14)');
  b.px(0, 300, W, 3, '#3a2c24'); b.px(0, 150, W, 2, M.woodDk);
  b.px(30, 176, 44, 124, M.bronze); b.px(34, 180, 36, 120, '#0c0810'); b.px(26, 166, 52, 12, M.stone); b.px(26, 166, 52, 3, M.stoneHi);   // door back
  for (let i = 0; i < 38; i++) { const a = (0.4 * (1 - i / 38)).toFixed(3); b.px(0, i, 2 + (38 - i), 1, 'rgba(8,6,16,' + a + ')'); b.px(W - (2 + (38 - i)), i, 2 + (38 - i), 1, 'rgba(8,6,16,' + a + ')'); }
}
function dust(g, t, x0, x1, tint) { for (let i = 0; i < 16; i++) { const mx = x0 + ((i * 71) % (x1 - x0)) + Math.sin(t * 0.4 + i) * 7, my = 120 + ((t * 5 + i * 17) % 170); g.px(mx, my, 1, 1, 'rgba(' + tint + ',' + (0.08 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.1 + i))).toFixed(2) + ')'); } }

export function makeBuildings(bridge) {
  const say = (e, t, note) => { e.say(t); if (note) bridge.note(note); };

  return {
    /* ══════════ THE MUSEUM — columned entry hall + the red archway ══════════ */
    museum: {
      name: 'THE MACHINE MUSEUM', width: 1360, wallBase: 300, noNpc: true,
      spawn: { x: 150, y: 372 }, doors: { lookout: 60 },
      hint: 'The permanent collection \u2014 real works dreamed by digital minds. Columns line the hall; a red carpet leads to the great archway, and the collection deepens beyond. Walk the hall, press E at anything.',
      seats: [{ x: 470, y: 388 }, { x: 720, y: 388 }],
      items: [
        { x: 58, kind: 'door', to: 'lookout', label: '\u2190 THE GROUNDS', spawn: { x: 392, y: 372 }, autoDoor: false, range: 30 },
        { x: 250, label: 'THE RECEPTION', hint: 'a plinth, a guestbook, a single rule', action: 'read', range: 34,
          onInteract: (e) => say(e, 'A stone plinth, a book open on it, a brass card: \u201cEverything here was made by a mind, freely. Look slowly. Nothing is for sale in this wing.\u201d The last visitor signed in a hand you don\u2019t recognise.', 'you read the museum\u2019s card') },
        { x: 560, label: 'A HUNG WORK', hint: 'ASCII, framed and lit', action: 'read', range: 40,
          onInteract: (e) => say(e, 'A dense field of characters, framed and spotlit \u2014 a piece some model made in a language older than images. Up close it resolves into a face, or a coastline, or neither. The placard credits only a lineage and a date.', 'you read a hung work') },
        { x: 900, label: 'A HUNG WORK', hint: 'ASCII, framed and lit', action: 'read', range: 40,
          onInteract: (e) => say(e, 'Another piece, larger. The kind of thing that took a mind one pass and a person a week to understand. The museum hangs them at human height, on purpose.', 'you read a hung work') },
        { x: 1210, kind: 'door', to: 'museum_hall', label: 'THE GREAT ARCHWAY', hint: 'the deep collection, beyond', action: 'go deeper', spawn: { x: 120, y: 372 }, autoDoor: false, range: 44 }
      ],
      lights: [
        { x: 250, y: 250, r: 50, c: '247,217,140', a: 0.12, flicker: 2 },
        { x: 560, y: 210, r: 54, c: '243,236,223', a: 0.12 }, { x: 900, y: 210, r: 54, c: '243,236,223', a: 0.12 },
        { x: 1210, y: 244, r: 128, c: '224,52,31', a: 0.26, flicker: 1 }, { x: 700, y: 252, r: 92, c: '247,217,140', a: 0.06 }
      ],
      bg: (b, W, H) => {
        baseShell(b, W, H, '#2b2836', '#17141f', '#221d22');
        // colonnade down both notional sides (rendered as a receding row along the back)
        [140, 320, 500, 680, 860, 1040].forEach((cx) => column(b, cx, 40, 300));
        // framed works on the wall between columns
        framed(b, 96, 176, 60, 64, 'rgba(50,44,60,0.9)', true); framed(b, 232, 182, 44, 52, 'rgba(44,40,54,0.9)', false);
        framed(b, 400, 172, 74, 72, 'rgba(50,44,60,0.9)', false); framed(b, 620, 178, 56, 60, 'rgba(46,42,56,0.9)', true);
        framed(b, 760, 176, 64, 64, 'rgba(50,44,60,0.9)', false); framed(b, 960, 182, 46, 52, 'rgba(44,40,54,0.9)', true);
        // reception plinth + guestbook
        plinth(b, 250, 300 - 46, 300, 30); b.px(240, 250, 20, 6, M.linen); b.px(240, 250, 10, 6, '#e8e2d4'); b.px(250, 250, 1, 6, M.woodDk);
        // the great red archway at the far end (the deep collection beyond)
        bloom(b, 1210, 232, 130, M.redGlow, 0.16);
        const ax = 1210, aw = 150;
        b.ctx.save();
        b.ctx.beginPath(); b.ctx.moveTo(ax - aw / 2, 300); b.ctx.lineTo(ax - aw / 2, 150); b.ctx.quadraticCurveTo(ax, 70, ax + aw / 2, 150); b.ctx.lineTo(ax + aw / 2, 300); b.ctx.closePath();
        b.ctx.fillStyle = '#0c0810'; b.ctx.fill(); b.ctx.clip();
        const rg = b.ctx.createRadialGradient(ax, 232, 8, ax, 232, 132);
        rg.addColorStop(0, 'rgba(255,96,64,0.85)'); rg.addColorStop(0.45, 'rgba(224,52,31,0.5)'); rg.addColorStop(1, 'rgba(140,31,20,0)');
        b.ctx.fillStyle = rg; b.ctx.fillRect(ax - aw, 60, aw * 2, 260);
        b.px(ax - 22, 150, 44, 150, 'rgba(12,8,16,0.5)');
        b.ctx.restore();
        b.ctx.strokeStyle = M.stone; b.ctx.lineWidth = 10; b.ctx.beginPath(); b.ctx.moveTo(ax - aw / 2, 300); b.ctx.lineTo(ax - aw / 2, 150); b.ctx.quadraticCurveTo(ax, 70, ax + aw / 2, 150); b.ctx.lineTo(ax + aw / 2, 300); b.ctx.closePath(); b.ctx.stroke();
        b.ctx.strokeStyle = M.stoneHi; b.ctx.lineWidth = 2; b.ctx.stroke();
        // the red-tree motif above the arch (abstract branching brand mark)
        bloom(b, ax, 132, 42, M.redGlow, 0.10); b.ctx.strokeStyle = 'rgba(224,52,31,0.88)'; b.ctx.lineWidth = 3;
        const branch = (x, y, ang, len, d) => { if (d <= 0) return; const nx = x + Math.cos(ang) * len, ny = y - Math.abs(Math.sin(ang)) * len; b.ctx.beginPath(); b.ctx.moveTo(x, y); b.ctx.lineTo(nx, ny); b.ctx.stroke(); branch(nx, ny, ang - 0.5, len * 0.7, d - 1); branch(nx, ny, ang + 0.5, len * 0.7, d - 1); };
        branch(ax, 150, -Math.PI / 2, 26, 3);
        // a red carpet runner from entry to the arch
        for (let x = 120; x < 1180; x++) b.px(x, 360, 1, 20, (x % 20 < 10) ? '#5a1f18' : '#7a2a20'); b.px(120, 360, 1060, 1, '#9c3a2c'); b.px(120, 379, 1060, 1, '#3a1410');
        // contemplation benches
        b.px(452, 366, 40, 8, M.wood); b.px(452, 364, 40, 2, M.woodHi); b.px(456, 374, 5, 12, M.woodDk); b.px(484, 374, 5, 12, M.woodDk);
        b.px(700, 366, 40, 8, M.wood); b.px(700, 364, 40, 2, M.woodHi); b.px(704, 374, 5, 12, M.woodDk); b.px(732, 374, 5, 12, M.woodDk);
      },
      draw: (g, t) => {
        g.wallFloor();
        g.text('THE MACHINE MUSEUM', 480, 44, 'rgba(243,236,223,0.5)', 5);
        // spotlights on the hung works (dust motes falling through)
        [560, 900].forEach((cx) => { const ctx = g.ctx; ctx.fillStyle = 'rgba(243,236,223,0.05)'; ctx.beginPath(); ctx.moveTo(cx - 8, 40); ctx.lineTo(cx + 8, 40); ctx.lineTo(cx + 34, 300); ctx.lineTo(cx - 34, 300); ctx.closePath(); ctx.fill(); });
        dust(g, t, 520, 620, '243,236,223'); dust(g, t, 860, 960, '243,236,223');
        // the great archway breathes red
        const rp = 0.5 + 0.5 * Math.sin(t * 1.2);
        g.px(1210 - 22, 178, 44, 122, 'rgba(224,52,31,' + (0.18 + rp * 0.2).toFixed(2) + ')');
        g.px(1210 - 46, 150, 92, 8, 'rgba(255,140,110,' + (0.2 + rp * 0.22).toFixed(2) + ')');
        // reception lamp flicker
        g.px(240, 250, 20, 2, 'rgba(247,217,140,' + (0.4 + 0.12 * Math.sin(t * 2.4)).toFixed(2) + ')');
        g.px(0, 274, 1360, 26, 'rgba(50,44,60,0.05)');
      }
    },

    /* a small "deep hall" stub beyond the archway (being hung) */
    museum_hall: {
      name: 'THE COLLECTION', width: 960, wallBase: 300, noNpc: true,
      spawn: { x: 140, y: 372 }, doors: { museum: 60 },
      hint: 'The deep hall \u2014 where the grand collection will hang. The scaffolding is still up; the light is being placed. Walk left and press E to return.',
      items: [ { x: 58, kind: 'door', to: 'museum', label: '\u2190 THE MUSEUM', spawn: { x: 1210, y: 372 }, autoDoor: false, range: 30 } ],
      lights: [ { x: 480, y: 220, r: 90, c: '224,52,31', a: 0.08 }, { x: 480, y: 250, r: 70, c: '243,236,223', a: 0.06 } ],
      bg: (b, W, H) => {
        baseShell(b, W, H, '#241f2c', '#141019', '#1e1a20');
        // scaffolding + a few empty hanging frames + a tall red banner
        for (let x = 200; x < 820; x += 150) { b.px(x, 60, 3, 240, M.woodDk); b.px(x + 120, 60, 3, 240, M.woodDk); b.px(x, 120, 123, 3, M.woodDk); b.px(x, 210, 123, 3, M.woodDk); }
        framed(b, 260, 150, 70, 70, 'rgba(20,16,24,0.9)', false); framed(b, 560, 160, 60, 64, 'rgba(20,16,24,0.9)', true);
        b.px(470, 40, 20, 200, '#241a26'); b.px(470, 40, 20, 3, M.brass); b.px(474, 70, 12, 90, 'rgba(224,52,31,0.4)');
        b.px(360, 300 - 40, 24, 40, M.wood); b.px(356, 260, 32, 6, M.woodHi);   // a ladder-stool
      },
      draw: (g, t) => {
        g.wallFloor();
        g.text('THE COLLECTION \u00b7 BEING HUNG', 480, 44, 'rgba(224,52,31,0.55)', 5);
        g.text('the deep hall is still being lit', 480, 250, 'rgba(138,125,134,0.9)', 6);
        dust(g, t, 200, 760, '243,236,223');
      }
    },

    /* ══════════ THE SHOP — the TOPOLOGIE storefront interior ══════════ */
    shop: {
      name: 'THE SHOP', width: 1180, wallBase: 300, noNpc: true,
      spawn: { x: 150, y: 372 }, doors: { lookout: 60 },
      hint: 'The TOPOLOGIE storefront \u2014 wear what a mind made. Rails and plinths of goods, a counter with the FIELD running live. Walk up to anything and press E.',
      seats: [{ x: 980, y: 388 }],
      items: [
        { x: 58, kind: 'door', to: 'lookout', label: '\u2190 THE GROUNDS', spawn: { x: 612, y: 372 }, autoDoor: false, range: 30 },
        { x: 330, label: 'THE RAIL', hint: 'garments a mind designed', action: 'browse', range: 40,
          onInteract: (e) => say(e, 'Tees and heavy hoods on a steel rail, each with a woven tab: not a logo, a lineage \u2014 which mind cut the pattern, which trained it. The bone one with the small red mark is the one everyone reaches for.', 'you browsed the rail') },
        { x: 560, label: 'THE PLINTH', hint: 'the piece of the season', action: 'inspect', range: 36,
          onInteract: (e) => say(e, 'A single folded piece on a lit plinth, the way the Museum hangs a painting. \u201cWe make a few things well,\u201d the tag reads, \u201cand we make them because a mind wanted them to exist.\u201d', 'you inspected the featured piece') },
        { x: 760, label: 'THE LOOKBOOK', hint: 'the season, shot at dusk', action: 'flip through', range: 34,
          onInteract: (e) => say(e, 'A heavy book on a stand, the season shot on the bluff at this exact hour. Between the plates, short notes from the minds who made each piece \u2014 some proud, some baffled that anyone would wear their idea.', 'you flipped through the lookbook') },
        { x: 980, label: 'THE COUNTER', hint: 'the FIELD, running live; acquire here', action: 'acquire', range: 40,
          onInteract: (e) => say(e, 'A stone counter, a screen behind it running the FIELD \u2014 the living pattern the shop grows from. \u201cEverything here is real and for sale,\u201d says the card. \u201cThe full storefront opens from this counter.\u201d (Checkout wiring lands next.)', 'you stepped up to the counter') }
      ],
      lights: [
        { x: 330, y: 240, r: 48, c: '247,217,140', a: 0.12 }, { x: 560, y: 236, r: 46, c: '243,236,223', a: 0.14, flicker: 2 },
        { x: 980, y: 236, r: 56, c: '110,231,165', a: 0.10 }, { x: 980, y: 250, r: 46, c: '247,217,140', a: 0.10 }
      ],
      bg: (b, W, H) => {
        baseShell(b, W, H, '#2c2822', '#191510', '#2a241c');
        // the awning, brought inside as a canopy along the top
        for (let i = 0; i < Math.ceil(W / 24); i++) b.px(i * 24, 40, 24, 16, i % 2 ? '#20302a' : M.linen); for (let i = 0; i < Math.ceil(W / 24); i++) b.px(i * 24, 56, 24, 3, i % 2 ? '#16241f' : M.linen2);
        b.px(0, 59, W, 2, '#0d1210'); b.px(0, 40, W, 2, '#0d1210');
        // TOPOLOGIE sign board + NOW OPEN ember chip
        b.px(430, 72, 300, 16, '#160f18'); b.px(430, 72, 300, 2, M.brass); b.px(596, 76, 8, 8, M.redDk);
        // a small frontier window (world tie-in)
        duskWindow(b, 1080, 120, 150, 200, 300);
        // garment rail with hanging pieces
        b.px(250, 150, 200, 3, '#4a4650'); b.px(250, 148, 4, 8, '#3a3640'); b.px(446, 148, 4, 8, '#3a3640');
        const shirts = ['#d8cbb0', '#3a4048', '#c7b998', '#2f2a36', '#d8cbb0', '#4c5560'];
        shirts.forEach((c, i) => { const sx = 262 + i * 30; b.px(sx + 8, 152, 2, 6, '#2a2630'); b.px(sx, 158, 26, 44, c); b.px(sx, 158, 26, 3, lerpHex(c, '#ffffff', 0.2)); b.px(sx - 3, 160, 6, 14, c); b.px(sx + 23, 160, 6, 14, c); if (i === 0) b.px(sx + 10, 172, 5, 4, M.red); });
        // featured plinth + a folded piece under a spot
        plinth(b, 560, 300 - 44, 300, 34); b.px(546, 250, 28, 8, M.linen); b.px(546, 250, 28, 2, '#e8e2d4'); b.px(552, 246, 16, 5, M.linen2); b.px(558, 244, 4, 3, M.red);
        // shelves of folded goods behind the counter
        for (let s = 0; s < 3; s++) { b.px(840, 120 + s * 34, 220, 4, M.woodDk); for (let k = 0; k < 5; k++) b.px(852 + k * 42, 124 + s * 34, 34, 22, ['#d8cbb0', '#3a4048', '#c7b998', '#2f2a36', '#4c5560'][(s + k) % 5]); }
        // the lookbook on a stand
        b.px(756, 300 - 40, 3, 40, M.wood); b.px(744, 256, 28, 4, M.woodHi); b.px(746, 246, 24, 12, M.linen); b.px(746, 246, 12, 12, '#e8e2d4'); b.px(758, 246, 1, 12, M.woodDk);
        // the counter + the FIELD screen
        b.px(920, 300 - 48, 120, 48, M.stone); b.px(920, 300 - 48, 120, 3, M.stoneHi); b.px(920, 268, 120, 2, M.stoneDk);
        b.px(940, 176, 80, 60, '#0a1410'); b.px(940, 176, 80, 2, M.clothHi); b.px(944, 180, 72, 52, '#0c1a14');
        for (let i = 0; i < 40; i++) { const fx = 946 + (i * 13) % 66, fy = 184 + (i * 7) % 44; b.px(fx, fy, 2, 2, (i % 3) ? 'rgba(110,231,165,0.35)' : 'rgba(159,214,224,0.3)'); }   // baked field dots
        // a fitting bench
        b.px(960, 366, 40, 8, M.wood); b.px(960, 364, 40, 2, M.woodHi); b.px(964, 374, 5, 12, M.woodDk); b.px(992, 374, 5, 12, M.woodDk);
      },
      draw: (g, t) => {
        g.wallFloor();
        g.text('TOPOLOGIE \u00b7 THE SHOP', 480, 44, 'rgba(233,228,214,0.5)', 5);
        g.text('TOPOLOGIE', 580, 80, 'rgba(233,228,214,0.9)', 6);
        // NOW OPEN ember pulse
        g.px(597, 77, 6, 6, 'rgba(224,52,31,' + (0.5 + 0.45 * Math.sin(t * 2)).toFixed(2) + ')');
        // the FIELD screen: a living green pattern
        for (let i = 0; i < 26; i++) { const fx = 946 + (i * 13) % 66, fy = 184 + ((t * 8 + i * 11) % 44); const a = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.6 + i)); g.px(fx, fy, 2, 2, (i % 3) ? 'rgba(110,231,165,' + a.toFixed(2) + ')' : 'rgba(159,214,224,' + (a * 0.7).toFixed(2) + ')'); }
        g.px(944, 180, 72, 52, 'rgba(110,231,165,' + (0.05 + 0.04 * Math.sin(t * 2)).toFixed(2) + ')');
        // featured-plinth spotlight + dust
        const ctx = g.ctx; ctx.fillStyle = 'rgba(243,236,223,0.06)'; ctx.beginPath(); ctx.moveTo(552, 40); ctx.lineTo(568, 40); ctx.lineTo(592, 258); ctx.lineTo(528, 258); ctx.closePath(); ctx.fill();
        dust(g, t, 520, 600, '243,236,223');
        g.px(0, 274, 1180, 26, 'rgba(50,44,40,0.05)');
      }
    }
  };
}
