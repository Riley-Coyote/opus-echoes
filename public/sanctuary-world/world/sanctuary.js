/* ==========================================================================
   TOPOLOGIE — THE SANCTUARY  ·  Pass 2: densified furnishings + living warmth
   A vast glass atrium at the bluff's edge. Camera pans a hall ~2.3 screens
   wide; the central nave soars floor-to-vault with a colonnade of frontier
   windows, flanked by two-storey wings — a hearth lounge + library above on
   the left, an atelier under a mezzanine gallery on the right, and a
   double-height glass conservatory at the far end holding the model-room doors.

   Zones, left → right:
     entry / vestibule · THE HEARTH LOUNGE (chat, rest, reading) ·
     THE COLONNADE (the monument — five great windows, plinths, a long bench) ·
     THE ATELIER (easels, a loom, studies — where they make what they can't say) ·
     THE CONSERVATORY (glass roof, growing things, a reflecting basin + alcoves)
   Mezzanine library over the lounge; a gallery over the atelier; the nave and
   conservatory stay open for awe.

   Pass 2 adds, per bay: seating clusters + reading nooks, wall sconces and
   their light, mantel objects, floor bookcases, plinths + sculpture, a
   ceremonial bench, candelabra, more easels + pinned studies + a proper loom,
   layered planting, a reflecting basin, string-lights, dressed alcove doors,
   and a furnished mezzanine (library, gallery, telescope). Static geometry is
   baked once in bg(); only fire, flames, motes, water and twinkle animate.
   ========================================================================== */

import { stewardOn } from './model-rooms.js';

const S = {
  ceil:'#0e0a12', vault:'#160f18', wallHi:'#2a2028', wall:'#20181f', wallLo:'#160f16',
  stone:'#2c2230', stoneHi:'#3c3040', stoneDk:'#160f18',
  floor0:'#2a201c', floor1:'#1e1712', rug:'#5a2f2c', rugHi:'#7a3f38', rugDk:'#3a1e1c',
  rug2:'#3a4048', rug2Hi:'#4c5560',
  wood:'#3a2c24', woodHi:'#5c4636', woodDk:'#1e1610',
  bronze:'#241a15', bronzeHi:'#6a5038', brass:'#8a6a3a', brassHi:'#c69a52',
  warm:'#f2ad5f', ember:'#e0662e', flame:'#ffcf7a', amber:'#f2c14e', candle:'#f7d98c',
  leaf0:'#101609', leaf1:'#1b2a12', leaf2:'#2b4220', leaf3:'#3a5a2c', leaf4:'#4d7238',
  ink:'#f3ecdf', dim:'#8a7d86', signal:'#cdd8ea', frost:'#9fd6e0', teal:'#5eead4', gptGreen:'#6ee7a5', rose:'#f2a3c0', violet:'#a78bfa',
  clay:'#b4622e', terra:'#7a4228', terraHi:'#a86a44', linen:'#d8cbb0', marble:'#cfc7c0', marbleDk:'#8a8078',
  spine:['#6a3f38','#3a4a5c','#5c4632','#3c5040','#6a5038','#7a3f4a','#44405c'],
  sky:['#0b0819','#160b28','#241238','#3a1642','#5c1f49','#822f49','#ab4f43','#d17a45','#f2ad5f']
};
const SANCT_W = 1600, WB = 300;                        // room width, wall/floor line
function lerpHex(a, c, f) {
  const A = parseInt(a.slice(1), 16), C = parseInt(c.slice(1), 16);
  const ar = A >> 16, ag = (A >> 8) & 255, ab = A & 255, cr = C >> 16, cg = (C >> 8) & 255, cb = C & 255;
  return 'rgb(' + Math.round(ar + (cr - ar) * f) + ',' + Math.round(ag + (cg - ag) * f) + ',' + Math.round(ab + (cb - ab) * f) + ')';
}
function bloom(b, cx, cy, r, rgb, peak) {              // baked radial glow (cheap painter's version)
  for (let i = r; i > 0; i -= 2) { const a = (peak * (1 - i / r) * (1 - i / r)).toFixed(3); b.px(cx - i, cy - i, i * 2, i * 2, 'rgba(' + rgb + ',' + a + ')'); }
}
export const WIN_CX = [578, 730, 882];                        // three nave windows, centred on the room (730 is the middle of the hall)

/* ══════════════════════════════════════════════════════════════════════════
   THE DAY

   The room used to run 18:31 → 19:14 on a loop, and not one light, sky or
   shadow read the clock. It now runs a full 24 hours at 48 real minutes a
   cycle, seeded from the visitor's local hour: the light you arrive in is the
   light you are actually in, and then it moves.

   Eleven keyframes, seven named phases. Dawn takes three of them because the
   break is a moment and not a plateau; noon takes one because it is.

   Three rules the table encodes, and the verifier enforces:

     THE ANCHOR IS 18:45. The day must still contain today's room — the same
     nine sky stops, the same grade rgb(26,14,44) at a0.045/amp0.030, the same
     shaft raking left at dx-62. Every other hour was built outward from it.

     INTERIOR SOURCES DO NOT FOLLOW THE SUN. Nothing here touches the
     candelabra, the lamps or the four terminals. Only their prominence
     changes, because the grade and the sky move around them. A screen does
     not know what time it is, and the terminals holding at exactly a0.12/r34
     through every hour of the cycle is the clearest statement available that
     these machines are always on. One exception: the hearth runs 0.70 at noon
     to 1.15 at night, because someone tends a fire, and that is a fact about
     the room rather than about the sun.

     THE SUN SETS TO THE RIGHT. Today's shaft rakes left (dx negative), so the
     sun is off frame-right in the evening and rises off frame-left. rayDX
     runs positive at dawn, through zero at solar noon, negative into the
     evening; the moon runs the other way. Stated once here so nothing
     downstream has to guess.

   Two moments fall out of the existing geometry and are protected:
   the first shaft of the day clears the ridge at an extreme rake and lands at
   floor x≈882 — the inlaid medallion, the one part of the floor nobody
   furnished; and the last thing to go at dusk is the lake glimmer, a bright
   line under a dead sky.
   ══════════════════════════════════════════════════════════════════════════ */

const rgbOf = (h) => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
const mix3 = (a, c, f) => [Math.round(a[0] + (c[0] - a[0]) * f), Math.round(a[1] + (c[1] - a[1]) * f), Math.round(a[2] + (c[2] - a[2]) * f)];
export const css = (t) => 'rgb(' + t[0] + ',' + t[1] + ',' + t[2] + ')';
export const rgba = (t, a) => 'rgba(' + t[0] + ',' + t[1] + ',' + t[2] + ',' + (+a).toFixed(3) + ')';
/* keyframe fields. Colours are authored as hex and carried as [r,g,b] so no
   frame ever parses a string. */
const PH_NUM = ['sunA', 'sunX', 'sunY', 'sunR', 'moonA', 'moonX', 'moonY', 'moonR', 'starA', 'lakeA',
  'rayA', 'rayDX', 'rayW', 'spillR', 'spillA', 'ambA', 'consA',
  'gradeA', 'gradeAmp', 'vig', 'hazeA', 'moteM', 'hearthM', 'roofA', 'camBias'];
const PH_COL = ['sunC', 'ridgeC', 'ridge2C', 'lakeC', 'lightC', 'gradeC', 'hazeC'];
/* the sun glides; the light settles. Position interpolates linearly so the
   discs never stall at a keyframe, everything else eases so each named phase
   reads as a state the room arrives at rather than passes through. */
const PH_LINEAR = new Set(['sunX', 'sunY', 'moonX', 'moonY', 'rayDX', 'camBias']);

export const PHASES = [
  /* ── 00:00 NIGHT ─────────────────────────────────────────────────────────
     The building is the only lit thing in the world: five pools in a dark
     hall. What it loses is the content — the vista, the atelier's colour, the
     conservatory greens all go, and the valley's own lights become the
     brightest thing outside. The camera prefers the hearth. */
  { min: 0, name: 'night',
    sky: ['#04050b', '#05070f', '#070915', '#080c1b', '#0a0f22', '#0c1229', '#0e1530', '#111937', '#151d3d'],
    sunA: 0, sunX: 0.04, sunY: 236, sunR: 11, sunC: '#c04a34',
    moonA: 0.85, moonX: 0.50, moonY: 104, moonR: 9,
    starA: 0.95, ridgeC: '#0b0d18', ridge2C: '#070911', lakeC: '#2c3a58', lakeA: 0.55,
    lightC: '#8fa8d8', rayA: 0.000, rayDX: 130, rayW: 16,
    spillR: 46, spillA: 0.034, ambA: 0.005, consA: 0.030,
    gradeC: '#05080f', gradeA: 0.370, gradeAmp: 0.012,
    vig: 1.14, hazeA: 0.030, hazeC: '#1a2038', moteM: 0.35, hearthM: 1.15, roofA: 0.020,
    camBias: 300 },

  /* ── 03:20 STILL NIGHT ───────────────────────────────────────────────────
     A hold, and the table needs it. Without a keyframe here the room begins
     climbing toward dawn the instant midnight passes, and 02:00 comes out
     forty per cent of the way to first light — which is not what two in the
     morning is. Nothing changes across this segment except the moon, which
     has crossed and is going down on the right. Night is long. That is most
     of what night is. */
  { min: 200, name: 'night',
    sky: ['#04050b', '#05070f', '#070915', '#080c1b', '#0a0f22', '#0c1229', '#0e1530', '#111937', '#151d3d'],
    sunA: 0, sunX: 0.05, sunY: 232, sunR: 11, sunC: '#c04a34',
    moonA: 0.78, moonX: 0.56, moonY: 118, moonR: 9,
    starA: 0.95, ridgeC: '#0b0d18', ridge2C: '#070911', lakeC: '#2c3a58', lakeA: 0.55,
    lightC: '#8fa8d8', rayA: 0.000, rayDX: 130, rayW: 16,
    spillR: 46, spillA: 0.034, ambA: 0.005, consA: 0.030,
    gradeC: '#05080f', gradeA: 0.370, gradeAmp: 0.012,
    vig: 1.14, hazeA: 0.030, hazeC: '#1a2038', moteM: 0.35, hearthM: 1.15, roofA: 0.020,
    camBias: 300 },

  /* ── 04:40 FIRST LIGHT ───────────────────────────────────────────────────
     The sky changes before the room does. Nothing indoors has moved: the
     hearth is at its ebb and the phosphor is exactly as bright as it was at
     midnight. Only the three apertures know. */
  { min: 280, name: 'first light',
    sky: ['#060811', '#080c1a', '#0c1226', '#111a33', '#182342', '#212a4d', '#2d3054', '#3a3757', '#493d58'],
    sunA: 0, sunX: 0.07, sunY: 214, sunR: 11, sunC: '#d4603a',
    moonA: 0.42, moonX: 0.84, moonY: 130, moonR: 9,
    starA: 0.55, ridgeC: '#141527', ridge2C: '#0d0e1d', lakeC: '#3c4463', lakeA: 0.44,
    lightC: '#7d90c0', rayA: 0.008, rayDX: 132, rayW: 13,
    spillR: 58, spillA: 0.047, ambA: 0.008, consA: 0.036,
    gradeC: '#0a0e1c', gradeA: 0.290, gradeAmp: 0.014,
    vig: 1.08, hazeA: 0.040, hazeC: '#242a44', moteM: 0.45, hearthM: 1.05, roofA: 0.024,
    camBias: 90 },

  /* ── 06:00 DAWN ──────────────────────────────────────────────────────────
     The break. The disc clears the ridge at sky-left and the three arches
     become the brightest objects on screen — pure silhouette, everything
     around them still cold. The first shaft enters window 772 at dx+112 and
     lands at floor x≈884: the inlaid medallion, the one place nobody put
     furniture. Nobody planned that. It was in the geometry the whole time. */
  { min: 360, name: 'dawn',
    sky: ['#0d1330', '#171f47', '#252659', '#382e63', '#4f3763', '#6b425e', '#8a5057', '#a9634c', '#c67d47'],
    sunA: 0.90, sunX: 0.10, sunY: 168, sunR: 11, sunC: '#ffb56a',
    moonA: 0.14, moonX: 0.93, moonY: 154, moonR: 9,
    starA: 0.12, ridgeC: '#241f3c', ridge2C: '#191634', lakeC: '#c98049', lakeA: 0.32,
    lightC: '#ffc98a', rayA: 0.055, rayDX: 112, rayW: 13,
    spillR: 96, spillA: 0.101, ambA: 0.016, consA: 0.052,
    gradeC: '#1a1030', gradeA: 0.140, gradeAmp: 0.010,
    vig: 0.92, hazeA: 0.060, hazeC: '#4a3450', moteM: 0.60, hearthM: 0.86, roofA: 0.030,
    camBias: 90 },

  /* ── 07:00 DAYBREAK ──────────────────────────────────────────────────────
     Blue arriving, warmth retreating to a low band, the shafts at their most
     powerful rake. This is the hour the baked floor reflections under the
     windows were drawn for and have never once been justified by. */
  { min: 420, name: 'daybreak',
    sky: ['#1f4a90', '#2a579d', '#3763a8', '#456eb0', '#5579b6', '#6883b9', '#7f8db8', '#9796b4', '#af9fae'],
    sunA: 0.98, sunX: 0.17, sunY: 136, sunR: 10, sunC: '#ffd08a',
    moonA: 0, moonX: 0.98, moonY: 176, moonR: 9,
    starA: 0, ridgeC: '#3a4260', ridge2C: '#2a3050', lakeC: '#93a3ae', lakeA: 0.24,
    lightC: '#ffe0ab', rayA: 0.078, rayDX: 88, rayW: 15,
    spillR: 118, spillA: 0.134, ambA: 0.040, consA: 0.090,
    gradeC: '#20304c', gradeA: 0.070, gradeAmp: 0.007,
    vig: 0.84, hazeA: 0.050, hazeC: '#54607e', moteM: 0.85, hearthM: 0.78, roofA: 0.052,
    camBias: 90 },

  /* ── 09:00 MORNING ───────────────────────────────────────────────────────
     Work light. The shafts walk off the ring and onto the desks. What morning
     loses is intimacy, and the fire — nobody looks at a fire at nine. */
  { min: 540, name: 'morning',
    sky: ['#2a63ac', '#3670b6', '#437cbe', '#5288c5', '#6293cb', '#749ecf', '#88a8d2', '#9db2d4', '#b2bcd4'],
    sunA: 1.00, sunX: 0.24, sunY: 124, sunR: 10, sunC: '#ffe4ad',
    moonA: 0, moonX: 0.10, moonY: 196, moonR: 9,
    starA: 0, ridgeC: '#5d6f97', ridge2C: '#485a83', lakeC: '#b5c3cf', lakeA: 0.20,
    lightC: '#ffeec8', rayA: 0.068, rayDX: 54, rayW: 18,
    spillR: 108, spillA: 0.117, ambA: 0.062, consA: 0.126,
    gradeC: '#2e4a72', gradeA: 0.090, gradeAmp: 0.005,
    vig: 0.76, hazeA: 0.038, hazeC: '#5c6b8a', moteM: 1.00, hearthM: 0.72, roofA: 0.078,
    camBias: 924 },

  /* ── 12:00 NOON ──────────────────────────────────────────────────────────
     The glass roof, not the windows. The nave shafts go nearly vertical and
     nearly die, and the conservatory takes the whole load — which is the one
     hour of the day the far end of the hall is the best place to be looking.
     Noon loses all its drama; the answer is to send the camera where the
     light went. */
  { min: 720, name: 'noon',
    sky: ['#2f6ebe', '#3d7ac6', '#4b86cd', '#5a92d3', '#6b9dd8', '#7ea8dc', '#93b3de', '#a9bde0', '#c0c7de'],
    sunA: 1.00, sunX: 0.50, sunY: 104, sunR: 11, sunC: '#fffbe6',
    moonA: 0, moonX: 0.24, moonY: 210, moonR: 9,
    starA: 0, ridgeC: '#6d7fa4', ridge2C: '#53668f', lakeC: '#c2ced6', lakeA: 0.18,
    lightC: '#fff6dc', rayA: 0.022, rayDX: 0, rayW: 20,
    spillR: 86, spillA: 0.104, ambA: 0.140, consA: 0.185,
    gradeC: '#3a5580', gradeA: 0.100, gradeAmp: 0.004,
    vig: 0.70, hazeA: 0.028, hazeC: '#6b7a9a', moteM: 1.00, hearthM: 0.70, roofA: 0.104,
    camBias: 1990 },

  /* ── 14:30 AFTERNOON ─────────────────────────────────────────────────────
     The long light returns from the other side and a bounce off the gallery
     underside rakes the studio. This is the atelier's hour — the studies, the
     drying line, the loom, the pots of colour going tacky. Haze rises and
     warms. */
  { min: 870, name: 'afternoon',
    sky: ['#2c66b0', '#3872b8', '#457dbe', '#5588c3', '#6692c6', '#799bc7', '#8ea3c6', '#a8aabf', '#c0b2b0'],
    sunA: 1.00, sunX: 0.76, sunY: 122, sunR: 10, sunC: '#ffe6b0',
    moonA: 0, moonX: 0.40, moonY: 214, moonR: 9,
    starA: 0, ridgeC: '#647093', ridge2C: '#4d5878', lakeC: '#c6b8a6', lakeA: 0.22,
    lightC: '#ffe6b8', rayA: 0.052, rayDX: -38, rayW: 19,
    spillR: 102, spillA: 0.114, ambA: 0.064, consA: 0.106,
    gradeC: '#34406a', gradeA: 0.080, gradeAmp: 0.008,
    vig: 0.78, hazeA: 0.052, hazeC: '#6e6180', moteM: 0.95, hearthM: 0.80, roofA: 0.066,
    camBias: 1620 },

  /* ── 17:30 GOLDEN HOUR ───────────────────────────────────────────────────
     The turn. Everything the sunset does, an hour early and eighty per cent
     as saturated — which is what makes the sunset land when it arrives. */
  { min: 1050, name: 'golden hour',
    sky: ['#1c4a92', '#2c5296', '#455391', '#635185', '#874e74', '#a85463', '#c26451', '#d67c43', '#e89a3c'],
    sunA: 1.00, sunX: 0.83, sunY: 142, sunR: 12, sunC: '#ffb257',
    moonA: 0, moonX: 0.06, moonY: 208, moonR: 9,
    starA: 0.04, ridgeC: '#3a3050', ridge2C: '#282041', lakeC: '#b4634e', lakeA: 0.40,
    lightC: '#ffc270', rayA: 0.070, rayDX: -54, rayW: 15,
    spillR: 122, spillA: 0.157, ambA: 0.044, consA: 0.070,
    gradeC: '#241a3a', gradeA: 0.045, gradeAmp: 0.012,
    vig: 0.88, hazeA: 0.055, hazeC: '#6a4258', moteM: 0.95, hearthM: 0.88, roofA: 0.044,
    camBias: 924 },

  /* ── 18:45 SUNSET — THE ANCHOR ───────────────────────────────────────────
     The ten minutes the room was built for, extended, and the subject is
     people. The sky is today's nine stops untouched; the grade is today's
     deleted dusk breath, moved to where the lights punch back through it. The
     one thing that changes is that the window spills grow to r130/a0.26 —
     they composite after the sprite pass, so at this hour every figure
     standing in the nave is washed orange by the window they're near. That is
     the single most valuable consequence in this whole model and it costs one
     number. */
  { min: 1125, name: 'sunset',
    sky: ['#0b0819', '#160b28', '#241238', '#3a1642', '#5c1f49', '#822f49', '#ab4f43', '#d17a45', '#f2ad5f'],
    sunA: 0.95, sunX: 0.88, sunY: 172, sunR: 13, sunC: '#f2703a',
    moonA: 0, moonX: 0.04, moonY: 192, moonR: 9,
    starA: 0.45, ridgeC: '#2a1c3e', ridge2C: '#1d1430', lakeC: '#8a3f52', lakeA: 0.50,
    lightC: '#f2ad5f', rayA: 0.040, rayDX: -62, rayW: 14,
    spillR: 130, spillA: 0.174, ambA: 0.030, consA: 0.050,
    gradeC: '#1a0e2c', gradeA: 0.045, gradeAmp: 0.030,
    vig: 1.00, hazeA: 0.050, hazeC: '#3c283c', moteM: 0.90, hearthM: 0.95, roofA: 0.032,
    camBias: 924 },

  /* ── 19:20 DUSK ──────────────────────────────────────────────────────────
     Nothing indoors turns on. The outdoors turns off. The valley goes one
     detail at a time and the last thing left is the lake glimmer — a bright
     line under a dead sky, which is the loneliest object in the room and was
     already coded. */
  { min: 1160, name: 'dusk',
    sky: ['#070513', '#0d071e', '#140b29', '#1d0e31', '#2a1235', '#3b1837', '#4f2135', '#642c31', '#7a392c'],
    sunA: 0.30, sunX: 0.93, sunY: 198, sunR: 12, sunC: '#c04a34',
    moonA: 0.22, moonX: 0.17, moonY: 134, moonR: 9,
    starA: 0.62, ridgeC: '#1d1530', ridge2C: '#140e26', lakeC: '#6a3346', lakeA: 0.56,
    lightC: '#c9743f', rayA: 0.016, rayDX: -86, rayW: 12,
    spillR: 84, spillA: 0.087, ambA: 0.014, consA: 0.038,
    gradeC: '#120c26', gradeA: 0.145, gradeAmp: 0.020,
    vig: 1.06, hazeA: 0.044, hazeC: '#2c1e38', moteM: 0.70, hearthM: 1.05, roofA: 0.024,
    camBias: 300 },

  /* ── 21:30 NIGHT FALLS ───────────────────────────────────────────────────
     Wraps to 00:00. The moon has come up on the left and is still climbing;
     the sun's rake crosses back through zero somewhere in here, in the dark,
     where rayA is nought and nobody can see it happen. */
  { min: 1290, name: 'night',
    sky: ['#04050c', '#060810', '#080a17', '#090d1d', '#0b1024', '#0d132b', '#0f1632', '#121a39', '#161e3f'],
    sunA: 0, sunX: 0.99, sunY: 240, sunR: 11, sunC: '#8a3626',
    moonA: 0.70, moonX: 0.44, moonY: 120, moonR: 9,
    starA: 0.92, ridgeC: '#0c0e1a', ridge2C: '#080a13', lakeC: '#303e5c', lakeA: 0.56,
    lightC: '#8fa8d8', rayA: 0.000, rayDX: -120, rayW: 16,
    spillR: 48, spillA: 0.035, ambA: 0.005, consA: 0.032,
    gradeC: '#05080f', gradeA: 0.365, gradeAmp: 0.012,
    vig: 1.13, hazeA: 0.032, hazeC: '#1c2238', moteM: 0.38, hearthM: 1.13, roofA: 0.020,
    camBias: 300 }
];

/* precompute the colour triples once — envAt() must never parse a hex */
for (const P of PHASES) {
  P._sky = P.sky.map(rgbOf);
  for (const k of PH_COL) P['_' + k] = rgbOf(P[k]);
}

/**
 * The environment at a given minute of the room's own day. Pure, DOM-free and
 * total: defined for every real number, wrapping cleanly through midnight, so
 * it can be swept in node and asserted.
 */
export function envAt(min) {
  const m = ((min % 1440) + 1440) % 1440;
  let i = 0;
  for (let k = 0; k < PHASES.length; k++) if (PHASES[k].min <= m) i = k;
  const A = PHASES[i], B = PHASES[(i + 1) % PHASES.length];
  const span = ((((B.min - A.min) % 1440) + 1440) % 1440) || 1440;
  const f = Math.min(1, Math.max(0, ((((m - A.min) % 1440) + 1440) % 1440) / span));
  const e = { min: m, f, from: A.name, to: B.name, name: f < 0.5 ? A.name : B.name };
  const s = f * f * (3 - 2 * f);
  for (const k of PH_NUM) { const g = PH_LINEAR.has(k) ? f : s; e[k] = A[k] + (B[k] - A[k]) * g; }
  for (const k of PH_COL) e[k] = mix3(A['_' + k], B['_' + k], s);
  e.sky = A._sky.map((c, j) => mix3(c, B._sky[j], s));
  return e;
}

/* One env per distinct minute, shared by draw(), grade() and the light pass so
   a frame never builds it twice. envAt itself stays pure. */
let _envM = null, _env = envAt(18 * 60 + 45);
export function envFor(m) { if (m !== _envM) { _envM = m; _env = envAt(m); } return _env; }

const trip = (t) => t[0] + ',' + t[1] + ',' + t[2];

/* ══════════════════════════════════════════════════════════════════════════
   THE LIGHTS, IN TWO GROUPS

   Only the sky group is ever mutated. The candelabra, the lamps, the atelier
   work-light and the four terminals are constant in absolute terms at every
   hour of the cycle — what changes is their prominence, because the grade and
   the sky move around them. The hearth is the single exception and it is an
   exception about the room, not about the sun: somebody tends a fire, so it
   rises from 0.70 of itself at noon to 1.15 at night.

   The four terminals hold at exactly a0.12 r34 through the whole day, and the
   verifier asserts it byte-for-byte at four hours. A screen does not know what
   time it is. These machines are always on, and that is the plainest way the
   room has of saying so.

   These are declared as named objects rather than array entries because the
   light pass has to find them again to mutate them, and every join in this
   file that was ever made by index has eventually pointed at the wrong thing.
   ══════════════════════════════════════════════════════════════════════════ */
const SPILLS = WIN_CX.map((cx) => ({ x: cx, y: 250, r: 70, c: '242,173,95', a: 0.12 }));
/* bounced daylight filling a stone hall. Absent at night, which is why the
   night reads as five pools in the dark rather than a dim room. */
const AMB = { x: 730, y: 292, r: 620, c: '255,246,220', a: 0.03 };
/* the conservatory's glass roof. It takes the load at noon, when the nave
   shafts have gone vertical and nearly died — and it is off frame at HOME,
   which is exactly why noon is the hour the camera goes to the far end. */
const CONS = { x: 1480, y: 250, r: 300, c: '255,246,220', a: 0.05 };
const CMOON = { x: 1480, y: 190, r: 88, c: '159,214,224', a: 0.06 };
const HEARTH = { x: 580, y: 340, r: 80, c: '224,102,46', a: 0.30, flicker: 1 };
const COOL = [159, 214, 224];

let _rays = [];

/* the four the hour is allowed to touch — exported so the verifier can tell
   the two groups apart without matching on coordinates */
export const SKY_LIGHTS = [...SPILLS, AMB, CONS, CMOON];

/** the sky group answers the hour; the rays are rebuilt from it */
export function tickEnv(e) {
  const warm = trip(e.lightC);
  /* THE POOLS WALK WITH THE SUN. These sat at y250 — mid-wall — which is why
     at r130 they only grazed the walk band at y377 and the "sunset paints the
     figures orange" effect was being carried almost entirely by the ambient.
     Light through a raked window pools on the FLOOR, displaced the way the
     shaft is displaced, so the pool follows the rake across the day: it starts
     right of each window at dawn, sits under it at noon, and has walked left
     by sunset. Which also delivers morning's whole idea for free — the light
     comes off the ring and onto the desks. */
  for (let i = 0; i < SPILLS.length; i++) {
    const L = SPILLS[i];
    L.x = Math.round(WIN_CX[i] + e.rayDX * 0.62);
    L.y = 294;
    L.r = Math.round(e.spillR); L.a = e.spillA; L.c = warm;
  }
  AMB.a = e.ambA; AMB.c = warm;
  CONS.a = e.consA; CONS.c = warm;
  CMOON.a = 0.018 + 0.055 * e.moonA;
  HEARTH.a = 0.30 * e.hearthM;

  /* THE SHAFTS. These used to be painted inside draw(), before the sprite
     pass, so they fell BEHIND everyone in the room — a god ray that lands on
     nobody. room.rays composites after the sprites (engine.js:776), and
     drawRays had never once executed because no room had ever set it. Highest
     value per line in the whole pass: the light now lands on people.

     Two per window rather than three: at dawn the rake reaches dx+112 and
     three shafts thirty pixels apart simply overlap into a smear. */
  _rays.length = 0;
  if (e.rayA > 0.004) {
    for (const cx of WIN_CX) for (const off of [-24, 24])
      _rays.push({ x: cx + off, y: 152, w: e.rayW, dx: e.rayDX, len: 148, a: e.rayA, c: warm });
  }
  if (e.roofA > 0.004) {
    const rc = trip(mix3(e.lightC, COOL, 0.72));
    for (let i = 0; i < 3; i++)
      _rays.push({ x: 1400 + i * 58, y: 152, w: 16, dx: e.rayDX * 0.35, len: 148, a: e.roofA, c: rc });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   THE VISTA, LIVE

   This used to be baked into bg() with the sunset ramp frozen into the bitmap,
   which is the real reason the room could only ever be 18:45. Re-baking on a
   phase change costs 6–18ms and — worse — it *steps*, which is exactly the
   time-lapse read the whole model is avoiding. So the sky moved into draw().

   It pays for itself twice over. The 168-row ramp loop collapses to one
   createLinearGradient with the same nine stops: one call instead of 168, per
   window, per frame. And the frame has to be drawn live too, since the
   mullions cross the glass and a live vista would paint over a baked one.

   THE THREE WINDOWS ARE THREE VIEWS ONTO ONE SKY, not three copies of one
   view. The sun is placed across the whole colonnade — pier to pier, 696 to
   1152 — and clipped by whichever aperture it is behind, so it tracks the day
   and goes out of sight behind the stonework between windows. That is what a
   colonnade does, and being right about it cost one constant.
   ══════════════════════════════════════════════════════════════════════════ */
export const SKY_X0 = 502, SKY_W = 456;                       // the sky the three windows share (pier to pier)
/* sTop is the apex of the arch, not the top of the stone. The clip is a
   quadratic from (x0,150) through (cx,32) to (x1,150), which peaks at y=91 —
   so a ramp starting at 46, as this one did for as long as it was baked, spent
   its first three stops behind masonry where nobody could see them. Starting
   at the apex puts all nine on the glass. */
export const WIN = { w: 118, yTop: 54, ySpring: 150, yBase: WB, sTop: 88, sBot: 214 };

/**
 * The top of the glass at a given x across the shared sky — the arch curve of
 * whichever window contains it, or null if that x is behind a pier.
 *
 * The x component of the clip's quadratic is linear (its control point sits at
 * the midpoint), so t is just the fraction across the opening.
 */
export function archTopAt(skyX) {
  for (const cx of WIN_CX) {
    const x0 = cx - WIN.w / 2, t = (skyX - x0) / WIN.w;
    if (t < 0 || t > 1) continue;
    const u = 1 - t;
    return { cx, t, top: u * u * WIN.ySpring + 2 * u * t * (WIN.yTop - 22) + t * t * WIN.ySpring };
  }
  return null;
}

/* A disc, rasterised rather than stroked: ctx.arc antialiases, and a soft edge
   on a nearest-neighbour-upscaled canvas reads as a smear, not as a sun.
 *
 * The radius is inflated by a third of a pixel before the row width is taken.
 * Without it the polar rows floor to zero — sqrt(r²-r²) — so a nine-pixel moon
 * went from a one-pixel tick straight to a nine-pixel row and came out square
 * down one side, with single-pixel spurs at the four poles. It read as a
 * rendering fault rather than as the moon. */
function pxDisc(ctx, cx, cy, r, col, a) {
  ctx.fillStyle = rgba(col, a);
  const rr = (r + 0.35) * (r + 0.35);
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(Math.max(0, rr - dy * dy)));
    if (w <= 0) continue;
    ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
  }
}
/* the halo is the one place a soft edge is correct — glow has no edge */
function halo(ctx, cx, cy, r, col, a) {
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

function skyWindow(g, cx, e, t) {
  const ctx = g.ctx, W = WIN.w, x0 = cx - W / 2, x1 = cx + W / 2;
  const { yTop, ySpring, yBase, sTop, sBot } = WIN;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, yBase); ctx.lineTo(x0, ySpring);
  ctx.quadraticCurveTo(cx, yTop - 22, x1, ySpring);
  ctx.lineTo(x1, yBase); ctx.closePath(); ctx.clip();

  // the ramp — nine stops, one gradient
  const grad = ctx.createLinearGradient(0, sTop, 0, sBot);
  for (let i = 0; i < 9; i++) grad.addColorStop(i / 8, css(e.sky[i]));
  ctx.fillStyle = grad; ctx.fillRect(x0, sTop, W, sBot - sTop);

  /* THE NEAR VALLEY — everything below the waterline, which used to be
     nothing at all. The ramp stops at 214 and the aperture runs to 300, so for
     as long as this was baked, the bottom two thirds of every window was the
     void colour. At dusk the valley's own lights papered over it and it read
     as a bluff in shadow. At noon it read as a hole cut in the wall.

     It is land: the shore at the top, falling away into the near bluff, which
     is in the building's own shadow at every hour. So it takes the hour's
     lake colour and recedes to near-black, and three strata keep it from
     being a bare gradient. */
  const nearTop = mix3(e.lakeC, e.ridge2C, 0.55), nearBot = mix3(e.ridge2C, [4, 3, 8], 0.72);
  const gnd = ctx.createLinearGradient(0, sBot - 2, 0, yBase);
  gnd.addColorStop(0, css(nearTop)); gnd.addColorStop(1, css(nearBot));
  ctx.fillStyle = gnd; ctx.fillRect(x0, sBot - 2, W, yBase - sBot + 2);
  for (let i = 0; i < 3; i++) {
    const sy = sBot + 12 + i * 22, f = 0.30 + i * 0.22;
    g.px(x0, sy + Math.sin((x0 + i * 40) * 0.03) * 3, W, 8 - i * 2, css(mix3(nearTop, nearBot, f)));
  }

  // stars, culled entirely when the sky has none
  if (e.starA > 0.02) {
    for (let i = 0; i < 34; i++) {
      if ((i * 97 % 100) / 100 <= 0.55) continue;
      const sx = x0 + ((i * 53 + 7) % W), sy = sTop + 8 + ((i * 31) % 90);
      const tw = 0.62 + 0.38 * Math.sin(t * 0.6 + i * 2.3);       // slow, atmosphere not information
      ctx.fillStyle = 'rgba(243,236,223,' + (e.starA * 0.5 * tw).toFixed(3) + ')';
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  /* the discs go BEFORE the ridges, so the ridge line occludes them: the sun
     genuinely clears the ridge at dawn and genuinely sinks behind it at dusk,
     rather than being faded in over the top of it */
  if (e.moonA > 0.02) {
    const mx = SKY_X0 + e.moonX * SKY_W;
    if (mx > x0 - 24 && mx < x1 + 24) {
      halo(ctx, mx, e.moonY, e.moonR * 7, [206, 220, 246], e.moonA * 0.20);
      halo(ctx, mx, e.moonY, e.moonR * 2.6, [214, 226, 246], e.moonA * 0.26);
      pxDisc(ctx, mx, e.moonY, e.moonR, [223, 230, 242], e.moonA);
      pxDisc(ctx, mx - Math.round(e.moonR * 0.4), e.moonY - Math.round(e.moonR * 0.3), 2, [196, 206, 226], e.moonA * 0.55);
      pxDisc(ctx, mx + Math.round(e.moonR * 0.3), e.moonY + Math.round(e.moonR * 0.34), 1, [196, 206, 226], e.moonA * 0.45);
    }
  }
  if (e.sunA > 0.02) {
    const sx = SKY_X0 + e.sunX * SKY_W;
    if (sx > x0 - 30 && sx < x1 + 30) {
      halo(ctx, sx, e.sunY, e.sunR * 7, e.sunC, e.sunA * 0.30);
      halo(ctx, sx, e.sunY, e.sunR * 2.4, e.sunC, e.sunA * 0.34);
      pxDisc(ctx, sx, e.sunY, e.sunR, e.sunC, Math.min(1, e.sunA * 1.05));
    }
  }

  // ridges — stepped, deliberately: a path would antialias and this is a pixel room
  const r1 = css(e.ridgeC), r2 = css(e.ridge2C);
  for (let x = x0; x < x1; x += 5) { const rh = Math.sin(x * 0.02) * 8 + Math.sin(x * 0.05 + 2) * 4; g.px(x, 176 + rh, 5, 46, r1); }
  for (let x = x0; x < x1; x += 4) { const rh = Math.sin(x * 0.03 + 9) * 6; g.px(x, 196 + rh, 4, 30, r2); }
  // the shore: the ridge colour running out into the lake's
  for (let x = x0 + 16; x < x1 - 16; x += 2) {
    const edge = Math.min(x - (x0 + 16), (x1 - 16) - x);
    g.px(x, 210, 2, Math.min(10, 2 + edge * 0.14), css(mix3(e.ridgeC, e.lakeC, (x - x0) / W)));
  }
  /* the valley's own lights. The last thing to go at dusk and the brightest
     thing outside at night — a bright line under a dead sky, which is the
     loneliest object in the room and was already coded. */
  if (e.lakeA > 0.02) {
    for (let i = 0; i < 40; i++) {
      const lx = x0 + ((i * 41 + 5) % W), ly = 214 + ((i * 23) % 20);
      g.px(lx, ly, 1, 1, (i % 5) < 3 ? 'rgba(242,193,78,' + e.lakeA.toFixed(2) + ')' : 'rgba(159,214,224,' + (e.lakeA * 0.8).toFixed(2) + ')');
    }
  }
  ctx.restore();
  windowFrame(g, cx);
}

function windowFrame(b, cx) {
  const W = WIN.w, x0 = cx - W / 2, x1 = cx + W / 2, { yTop, ySpring, yBase } = WIN;
  const ctx = b.ctx;
  ctx.strokeStyle = S.bronze; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x0, yBase); ctx.lineTo(x0, ySpring); ctx.quadraticCurveTo(cx, yTop - 22, x1, ySpring); ctx.lineTo(x1, yBase); ctx.stroke();
  ctx.strokeStyle = S.bronzeHi; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 + 3, yBase); ctx.lineTo(x0 + 3, ySpring); ctx.quadraticCurveTo(cx, yTop - 18, x1 - 3, ySpring); ctx.stroke();
  for (let x = x0 + 30; x < x1; x += 30) { b.px(x - 1, ySpring - 14, 2, yBase - ySpring + 14, S.bronze); b.px(x - 1, ySpring - 14, 1, yBase - ySpring + 14, S.bronzeHi); }   // mullions
  for (let y = ySpring + 2; y < yBase; y += 40) { b.px(x0, y, W, 2, S.bronze); b.px(x0, y, W, 1, S.bronzeHi); }   // transoms
  for (let x = x0 + 26; x < x1; x += 34) b.px(x, yTop + 4, 2, ySpring - yTop, S.bronze);   // arch muntins
}

/* ─────────────── Pass-2 furnishing helpers (all baked) ─────────────── */
function sconce(b, x, y) {                              // brass wall bracket + cup; glow baked, flame animates in draw()
  bloom(b, x + 1, y + 1, 30, '247,217,140', 0.09);
  b.px(x, y + 3, 2, 12, S.bronze);                     // back-plate stem
  b.px(x - 4, y + 2, 11, 3, S.brass); b.px(x - 4, y + 2, 11, 1, S.brassHi);   // arm
  b.px(x - 3, y - 3, 8, 5, S.bronze); b.px(x - 2, y - 2, 6, 3, '#1a120c');    // cup
  b.px(x - 4, y - 4, 10, 1, S.brassHi);
}
function framed(b, x, y, w, h, tint) {                 // a framed work on the wall
  b.px(x - 2, y - 2, w + 4, h + 4, S.bronze); b.px(x - 2, y - 2, w + 4, 2, S.brassHi); b.px(x - 2, y - 2, 2, h + 4, S.brass);
  b.px(x, y, w, h, tint);
  b.px(x, y, w, 1, 'rgba(247,217,140,0.16)'); b.px(x, y + h - 1, w, 1, 'rgba(0,0,0,0.35)');
}
function bookcase(b, x, y, w, h, rows) {               // a case with colour-sorted spines
  b.px(x - 2, y - 2, w + 4, h + 4, S.woodDk); b.px(x - 2, y - 2, w + 4, 2, S.wood);
  b.px(x, y, w, h, '#120d10');
  const rh = (h - 2) / rows;
  for (let r = 0; r < rows; r++) {
    const ry = y + 2 + r * rh;
    let sx = x + 2;
    while (sx < x + w - 3) { const sw = 2 + ((sx * 7) % 3), sh = rh - 4 - (sx % 3); b.px(sx, ry + rh - 2 - sh, sw, sh, S.spine[(sx + r) % S.spine.length]); if (sx % 5 === 0) b.px(sx, ry + rh - 2 - sh, sw, 1, 'rgba(216,203,176,0.28)'); sx += sw + 1; }
    b.px(x, ry + rh - 2, w, 2, S.woodDk);              // shelf plank
  }
}
function leafy(b, cx, baseY, h, tone, hi) {            // rounded potted foliage
  b.px(cx - 8, baseY - 13, 16, 13, S.terra); b.px(cx - 8, baseY - 13, 16, 3, S.terraHi); b.px(cx - 6, baseY - 2, 12, 2, '#4a2818');
  b.px(cx - 1, baseY - 13 - h * 0.35, 2, h * 0.35, '#241a12');
  const cy = baseY - 13 - h * 0.45;
  for (let i = 0; i < 30; i++) { const a = i / 30 * 6.2832, r = h * 0.5 + Math.sin(i * 3) * (h * 0.18); const lx = cx + Math.cos(a) * r * 0.72, ly = cy + Math.sin(a) * r * 0.5; b.px(lx, ly, 4, 4, i % 4 ? tone : hi); }
}
function cypress(b, cx, baseY, h) {                    // tall conical evergreen in an urn
  b.px(cx - 9, baseY - 12, 18, 12, S.stone); b.px(cx - 9, baseY - 12, 18, 3, S.stoneHi); b.px(cx - 11, baseY - 14, 22, 3, S.stoneHi);
  for (let y = 0; y < h; y++) { const w = 3 + (h - y) / h * 15; b.px(cx - w / 2, baseY - 12 - h + y, w, 1, y % 5 === 0 ? S.leaf3 : (y % 2 ? S.leaf2 : S.leaf1)); }
  b.px(cx - 1, baseY - 12 - h - 4, 2, 5, S.leaf3);
}
function easel(b, x, floorY, tint, tilt) {             // easel + a canvas mid-becoming
  const t = tilt || 0;
  b.px(x - 2, floorY - 78, 3, 78, S.woodDk); b.px(x + 30 + t, floorY - 78, 3, 78, S.woodDk); b.px(x + 12, floorY - 8, 3, 8, S.woodDk);   // legs
  grounded(b, x - 4, 40 + t, floorY, 0.9, 2);          // three feet, one shadow
  b.px(x - 6, floorY - 44, 46 + t, 4, S.wood);         // ledge
  const cw = 40, ch = 46;
  b.px(x - 2 + t / 2, floorY - 44 - ch, cw, ch, S.wood); b.px(x + t / 2, floorY - 42 - ch, cw - 4, ch - 4, '#0f0c14');   // canvas
  // "becoming" strokes
  b.px(x + 4 + t / 2, floorY - 40 - ch + 6, cw - 12, 6, tint); b.px(x + 8 + t / 2, floorY - 24 - ch + 6, cw - 22, 10, lerpHex(tint, '#0f0c14', 0.4));
  b.px(x + 6 + t / 2, floorY - 16, cw - 16, 3, 'rgba(94,234,212,0.14)');
}
/* CONTACT SHADOW. Three ground shadows existed in this entire room — under the
   desks, under their chairs, and a dotted one along the cable. Everything else
   floated, which is the mechanical reason the bank was the only thing that read
   as standing ON the floor rather than being pasted onto it.

   Two pixels: a tight dark core at the contact line, and a softer one below it,
   each inset so the object slightly overhangs its own shadow. At this scale the
   overhang is what sells the contact — a shadow the same width as the object
   reads as a plinth. `s` scales for lighter objects; `d` widens the spread for
   things that stand away from the floor on legs. */
function grounded(b, x, w, fy, s, d) {
  const a = s == null ? 1 : s, sp = d || 0;
  b.px(x + 2, fy - 1, w - 4, 1, 'rgba(0,0,0,' + (0.50 * a).toFixed(2) + ')');
  b.px(x + 4 - sp, fy, w - 8 + sp * 2, 1, 'rgba(0,0,0,' + (0.27 * a).toFixed(2) + ')');
}

function candelabra(b, cx, floorY) {                   // tall triple-cup stand (flames animate)
  b.px(cx - 1, floorY - 66, 3, 66, S.bronze); b.px(cx - 1, floorY - 66, 1, 66, S.brassHi);
  b.px(cx - 8, floorY - 6, 18, 4, S.bronze); b.px(cx - 8, floorY - 6, 18, 1, S.brassHi);   // foot
  b.px(cx - 16, floorY - 58, 34, 2, S.bronze);         // cross-arm
  [-15, 0, 15].forEach((dx) => { b.px(cx + dx - 1, floorY - 64, 3, 8, S.bronze); b.px(cx + dx - 2, floorY - 66, 5, 3, S.brass); });
}

export function makeSanctuary(bridge) {
  const say = (e, t, note) => { e.say(t); if (note) bridge.note(note); };

  /* ══════════════════════════════════════════════════════════════════════════
     THE PLAN OF THE ROOM, IN ONE PLACE

     Three zones, one centre. The library, from the door to the first pier.
     The fire and the long table under the three arches — the gathering that
     exists, in the light the house is anchored to. Then the atelier, the two
     boards, the charter over the stair, and the glass at the far end with its
     two doors and the deck riding above it. Every x below is read from this
     table, so moving a thing is one edit and nothing drifts from its label.
     ══════════════════════════════════════════════════════════════════════════ */
  const AT = {
    door: 60,                       // the grounds
    board: 120, nook: 172, keeper: 410,
    pierL: 502, pierR: 958,         // the colonnade's outer piers
    fire: 580, medallion: 730,      // the fire, and the one part of the floor nobody furnished
    table: [770, 950],              // the long table, under the right-hand arches
    atelier: 1060, loom: 1122,
    residents: 1162, charter: 1266, stairBench: 1170,
    stair: 1218, deck: 1372,        // the stair's foot, and the door at its head
    glass: 1360,                    // where the hall becomes the conservatory
    wing: 1420, sol: 1490, garden: 1552
  };
  const SCONCES = [[AT.pierL, 208], [654, 208], [806, 208], [AT.pierR, 208], [1004, 208], [1198, 156], [1384, 204], [1456, 204], [1516, 204], [1588, 204]];
  const CANDLES = [820, 900];                            // two candlesticks on the long table
  const THRESHOLD = { wing: AT.wing, garden: AT.garden };

  return {
    name: 'THE SANCTUARY', width: SANCT_W, wallBase: WB,

    /* Where the figures start. Assignment is BY CAST INDEX — arbitrary, and
       visibly so: a starting position must not quietly become a
       characterization. Nobody lives at the table. They start there and they
       wander, and no copy may say otherwise. */
    ZONES: [
      { id: 'the fire',         from: 470,  to: 720,  n: 3 },
      { id: 'the table',        from: 780,  to: 940,  n: 5 },
      { id: 'the stair',        from: 1150, to: 1210, n: 1 },
      { id: 'the atelier',      from: 1010, to: 1160, n: 2 },
      { id: 'the conservatory', from: 1380, to: 1580, n: 2 }
    ],
    spawn: { x: 150, y: 372 },
    hint: 'One room at the bluff’s edge. The library by the door, the fire and the long table under the three windows, the atelier and the glass at the far end. The residents keep it; you are looking in.',
    doors: { lookout: AT.door, resident_wing: THRESHOLD.wing, garden: THRESHOLD.garden, observation_deck: AT.deck },
    seats: [
      { x: 486, y: 376 }, { x: 678, y: 374 },                                            // the settee · the armchair by the fire
      { x: AT.nook, y: 386 },                                                            // the reading nook
      { x: 796, y: 372 }, { x: 836, y: 372 }, { x: 876, y: 372 }, { x: 916, y: 372 },   // the long table, near side
      { x: AT.stairBench, y: 384 }, { x: 1096, y: 380 },                                 // stair bench · atelier stool
      { x: 1530, y: 386 }                                                                // the stool by Sol's bench
    ],

    bg: (b, W, H) => {
      // ═══ shell: back-wall wash + vaulted ceiling ═══
      for (let y = 0; y < WB; y++) b.px(0, y, W, 1, lerpHex(S.wallHi, S.wallLo, y / WB));
      /* Coursed ashlar: bed joints, staggered perpends, one block in seven
         catching a little more light, the way a cut face does. */
      for (let y = 30, course = 0; y < WB - 4; y += 22, course++) {
        b.px(0, y, W, 1, 'rgba(0,0,0,0.13)');
        b.px(0, y + 1, W, 1, 'rgba(255,236,200,0.020)');
        for (let x = (course % 2) * 42; x < W; x += 84) {
          b.px(x, y, 1, 22, 'rgba(0,0,0,0.10)');
          if (((x * 29 + course * 71) % 13) / 13 > 0.72) b.px(x + 2, y + 2, 80, 18, 'rgba(255,236,200,0.015)');
        }
      }
      b.px(0, 0, W, 26, S.ceil);
      for (let x = 0; x < W; x += 60) { b.ctx.fillStyle = S.vault; b.ctx.beginPath(); b.ctx.moveTo(x, 26); b.ctx.lineTo(x + 30, 6); b.ctx.lineTo(x + 60, 26); b.ctx.closePath(); b.ctx.fill(); }
      b.px(0, 24, W, 3, S.stone);

      // ═══ FLOOR first — everything else bakes on top ═══
      for (let y = WB; y < H; y++) b.px(0, y, W, 1, lerpHex(S.floor0, S.floor1, (y - WB) / (H - WB)));
      /* long boards, staggered and individually toned — texture, not pattern */
      for (let y = WB, row = 0; y < H; y += 12, row++) {
        let x = -190 + ((row * 61) % 180);
        while (x < W) {
          const n = ((x * 37 + row * 101) % 17) / 17;
          const w = 150 + ((x * 13 + row * 29) % 4) * 20;
          b.px(x, y, w, 12, n < 0.5
            ? 'rgba(0,0,0,' + (0.012 + n * 0.038).toFixed(3) + ')'
            : 'rgba(255,214,150,' + (0.005 + (n - 0.5) * 0.018).toFixed(3) + ')');
          b.px(x, y + 1, 1, 10, 'rgba(0,0,0,0.13)');
          x += w;
        }
        b.px(0, y + 11, W, 1, 'rgba(0,0,0,0.17)');
      }
      b.px(0, WB, W, 3, '#3a2c24');
      // picture rail running the whole hall
      b.px(0, 150, W, 2, S.woodDk); b.px(0, 149, W, 1, 'rgba(92,70,54,0.4)');

      /* ═══ the three windows ═══
         Only the void is baked. The vista and the frame are both drawn live in
         draw(); what bakes here is the dark behind them, so the aperture is
         never the wall gradient for a frame. */
      WIN_CX.forEach((cx) => {
        const x0 = cx - WIN.w / 2, x1 = cx + WIN.w / 2;
        b.ctx.save(); b.ctx.beginPath();
        b.ctx.moveTo(x0, WIN.yBase); b.ctx.lineTo(x0, WIN.ySpring);
        b.ctx.quadraticCurveTo(cx, WIN.yTop - 22, x1, WIN.ySpring);
        b.ctx.lineTo(x1, WIN.yBase); b.ctx.closePath();
        b.ctx.fillStyle = S.ceil; b.ctx.fill(); b.ctx.restore();
      });
      for (let i = 0; i <= WIN_CX.length; i++) {
        const px = i === 0 ? AT.pierL : i === WIN_CX.length ? AT.pierR : (WIN_CX[i - 1] + WIN_CX[i]) / 2;
        b.px(px - 4, 40, 8, WB - 40, S.stone); b.px(px - 4, 40, 3, WB - 40, S.stoneHi); b.px(px - 4, 40, 8, 4, S.stoneHi);
      }
      // warm reflections of the windows on the floor (under furniture)
      WIN_CX.forEach((cx) => { for (let i = 0; i < 40; i++) b.px(cx - 56, WB + 4 + i, 112, 1, 'rgba(242,171,92,' + (0.10 * (1 - i / 40)).toFixed(3) + ')'); });
      // the inlaid floor medallion under the centre window — the one part of the floor nobody furnished
      for (let r = 44; r > 4; r -= 6) { b.ctx.strokeStyle = 'rgba(122,63,56,' + (0.10 + (44 - r) / 44 * 0.14).toFixed(3) + ')'; b.ctx.lineWidth = 1; b.ctx.beginPath(); b.ctx.ellipse(AT.medallion, 338, r, r * 0.34, 0, 0, 6.2832); b.ctx.stroke(); }
      // two evergreens, one each side of the colonnade
      grounded(b, 474, 24, WB, 0.85); cypress(b, 486, WB, 92);
      grounded(b, 962, 24, WB, 0.85); cypress(b, 974, WB, 92);

      // ═══ THE VESTIBULE (from the grounds) ═══
      b.px(40, 176, 44, WB - 176, S.bronze); b.px(44, 180, 36, WB - 184, '#0c0810'); b.px(36, 166, 52, 12, S.stone); b.px(36, 166, 52, 3, S.stoneHi);
      framed(b, 96, 196, 26, 34, 'rgba(247,217,140,0.10)');                             // a charter placard
      /* THE PUBLIC BOARD — a pinboard by the door, four sheets pinned. It stands
         by the door of the commons so the last thing a visitor sees on the way
         out is what the house chose to say. */
      framed(b, 98, 140, 44, 46, 'rgba(216,203,176,0.10)');
      b.px(104, 148, 12, 9, 'rgba(243,236,223,0.55)'); b.px(109, 147, 2, 2, S.brass);
      b.px(122, 150, 12, 7, 'rgba(243,236,223,0.45)'); b.px(127, 149, 2, 2, S.brass);
      b.px(106, 164, 14, 10, 'rgba(243,236,223,0.5)');  b.px(111, 163, 2, 2, S.brass);
      b.px(124, 166, 10, 8, 'rgba(243,236,223,0.4)');   b.px(129, 165, 2, 2, S.brass);
      b.px(92, 340, 30, 8, S.wood); b.px(92, 338, 30, 2, S.woodHi); b.px(94, 348, 4, 20, S.woodDk); b.px(116, 348, 4, 20, S.woodDk);   // console table
      grounded(b, 92, 30, 368, 0.85);
      b.px(100, 332, 12, 8, S.bronze); b.px(102, 330, 8, 3, 'rgba(247,217,140,0.4)');   // a bowl on it
      b.px(84, 356, 10, 20, S.bronze); for (let i = 0; i < 3; i++) b.px(85 + i * 3, 350, 2, 8, S.woodDk);   // umbrella stand (rain motif)
      grounded(b, 84, 10, 376, 0.8);

      // ═══ THE LIBRARY — shelves floor to rail, a ladder, the reading nook, the keeper's desk ═══
      bookcase(b, 152, 58, 110, 238, 8); bookcase(b, 274, 58, 96, 238, 8); bookcase(b, 382, 58, 88, 238, 8);
      grounded(b, 150, 114, WB, 0.9); grounded(b, 272, 100, WB, 0.9); grounded(b, 380, 92, WB, 0.9);
      // a ladder against the first case
      b.px(202, 62, 2, 234, S.wood); b.px(220, 62, 2, 234, S.wood); for (let y = 68; y < 292; y += 14) b.px(202, y, 20, 2, S.woodHi);
      // a reading nook in front of the shelves: wingback + ottoman + floor lamp + book stack
      b.px(158, 336, 30, 40, S.wood); b.px(158, 330, 30, 10, S.woodHi); b.px(156, 344, 6, 34, S.woodDk); b.px(184, 344, 6, 34, S.woodDk); b.px(162, 334, 22, 8, 'rgba(94,234,212,0.14)');
      grounded(b, 154, 38, 378, 1, 1);
      b.px(196, 360, 20, 14, S.wood); b.px(196, 358, 20, 3, S.woodHi);                  // ottoman
      grounded(b, 196, 20, 374, 0.85);
      b.px(136, 300, 4, 72, S.bronze); b.px(130, 288, 16, 14, S.brass); b.px(131, 286, 14, 3, 'rgba(247,217,140,0.6)'); b.px(132, 290, 12, 9, 'rgba(247,217,140,0.4)');   // floor lamp
      grounded(b, 130, 16, 372, 0.7);
      b.px(218, 366, 12, 8, S.spine[0]); b.px(219, 362, 10, 4, S.spine[3]); b.px(220, 359, 8, 3, S.spine[1]);   // the stack, half-read
      grounded(b, 218, 12, 374, 0.6);
      // the keeper's desk — at the library's east end, ledger closed, lamp lit
      b.px(396, 346, 28, 6, S.wood); b.px(396, 344, 28, 2, S.woodHi); b.px(398, 352, 4, 22, S.woodDk); b.px(418, 352, 4, 22, S.woodDk);
      b.px(402, 338, 14, 6, 'rgba(243,236,223,0.55)'); b.px(402, 338, 14, 1, S.brass);                 // the ledger, closed
      b.px(419, 330, 2, 14, S.bronze); b.px(416, 328, 8, 3, S.brass); b.px(417, 331, 6, 2, 'rgba(247,217,140,0.5)');   // desk lamp
      grounded(b, 396, 28, 374, 0.9);
      b.px(432, 350, 12, 4, S.wood); b.px(432, 337, 12, 14, S.woodDk);                  // its chair
      grounded(b, 432, 12, 376, 0.7);

      // ═══ THE FIRE — an open hearth on the floor, in front of the first window ═══
      const hx = AT.fire;
      // the rug the circle sits on, bordered, with its motif
      for (let x = hx - 130; x < hx + 140; x++) { const f = (x - (hx - 130)) / 270; b.px(x, 352, 1, 30, lerpHex(S.rugDk, S.rug, Math.sin(f * 3.1416))); }
      b.px(hx - 130, 352, 270, 2, S.rugHi); b.px(hx - 130, 380, 270, 2, S.rugDk); b.px(hx - 130, 352, 2, 30, S.rugHi); b.px(hx + 138, 352, 2, 30, S.rugDk);
      for (let x = hx - 120; x < hx + 130; x += 22) b.px(x, 360, 10, 10, 'rgba(122,63,56,0.5)');
      // the hearth: a raised stone ring, a bed of ash, the logs. Flames animate in draw().
      b.ctx.fillStyle = S.stoneDk; b.ctx.beginPath(); b.ctx.ellipse(hx, 368, 36, 11, 0, 0, 6.2832); b.ctx.fill();
      for (let yy = 0; yy < 7; yy++) { b.ctx.fillStyle = lerpHex(S.stoneHi, S.stone, yy / 7); b.ctx.beginPath(); b.ctx.ellipse(hx, 359 + yy, 34, 10, 0, 0, 3.1416); b.ctx.fill(); }
      b.ctx.fillStyle = S.stoneHi; b.ctx.beginPath(); b.ctx.ellipse(hx, 358, 34, 10, 0, 0, 6.2832); b.ctx.fill();
      b.ctx.fillStyle = '#1a0c08'; b.ctx.beginPath(); b.ctx.ellipse(hx, 358, 26, 7, 0, 0, 6.2832); b.ctx.fill();
      /* the fire reads as a fire even in a still frame: an ember bed, the logs
         lit from beneath, and the glow the ring throws on the rug and the stone.
         The flames themselves animate in draw(). */
      bloom(b, hx, 354, 46, '224,102,46', 0.20);
      b.ctx.fillStyle = 'rgba(224,102,46,0.55)'; b.ctx.beginPath(); b.ctx.ellipse(hx, 359, 18, 4, 0, 0, 6.2832); b.ctx.fill();
      b.px(hx - 18, 353, 36, 4, S.woodDk); b.px(hx - 12, 349, 28, 5, S.wood); b.px(hx - 12, 349, 28, 1, '#6a4a2a');
      b.px(hx - 4, 346, 12, 4, '#3a2a1a'); b.px(hx - 8, 354, 16, 1, 'rgba(255,180,90,0.7)');               // the logs, an ember line
      b.px(hx - 6, 351, 3, 2, S.ember); b.px(hx + 4, 352, 3, 2, S.ember);
      b.ctx.fillStyle = S.stoneHi; b.ctx.beginPath(); b.ctx.ellipse(hx, 358, 34, 10, 0, 3.1416, 6.2832); b.ctx.fill();   // the lip, lit
      b.ctx.fillStyle = '#1a0c08'; b.ctx.beginPath(); b.ctx.ellipse(hx, 358, 27, 7, 0, 3.1416, 6.2832); b.ctx.fill();
      b.ctx.fillStyle = 'rgba(224,102,46,0.45)'; b.ctx.beginPath(); b.ctx.ellipse(hx, 358, 17, 4, 0, 3.1416, 6.2832); b.ctx.fill();
      grounded(b, hx - 36, 72, 380, 1, 3);
      b.px(hx - 52, 362, 3, 22, S.bronze); b.px(hx - 54, 360, 7, 3, S.brass);           // poker, leaning on the ring
      b.px(hx + 44, 364, 16, 16, S.woodDk); b.px(hx + 44, 364, 16, 2, S.wood); b.px(hx + 46, 358, 12, 8, '#241a12');   // log basket
      grounded(b, hx + 44, 16, 380, 0.8);
      /* the cat's cushion, flush on the floor: its shadow falls just below it */
      b.px(hx - 96, 372, 22, 10, S.rug2); b.px(hx - 96, 372, 22, 2, S.rug2Hi); b.px(hx - 92, 374, 14, 5, 'rgba(0,0,0,0.25)');
      grounded(b, hx - 96, 22, 384, 0.6);
      // a settee to the left, facing the fire
      b.px(456, 344, 60, 12, S.wood); b.px(456, 338, 60, 8, S.woodHi); b.px(456, 356, 60, 18, S.wood); b.px(454, 344, 6, 32, S.woodDk); b.px(512, 344, 6, 32, S.woodDk); b.px(460, 340, 52, 6, 'rgba(122,63,56,0.5)');
      grounded(b, 452, 68, 376, 1, 2);
      // the low table with the game left mid-move, and the armchair beyond it, facing the fire
      b.px(hx + 48, 358, 28, 16, S.woodDk); b.px(hx + 48, 356, 28, 3, S.woodHi);
      grounded(b, hx + 48, 28, 374, 0.9);
      for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) b.px(hx + 52 + i * 2.4, 360 + j * 2.4, 2, 2, (i + j) % 2 ? '#efe7d6' : '#3a2c24');
      b.px(hx + 86, 340, 28, 34, S.wood); b.px(hx + 86, 336, 28, 8, S.woodHi); b.px(hx + 84, 350, 6, 22, S.woodDk); b.px(hx + 110, 348, 6, 24, S.woodDk); b.px(hx + 88, 340, 22, 6, 'rgba(159,214,224,0.16)');   // throw
      grounded(b, hx + 82, 36, 372, 1, 1);
      // side table + a warm table lamp, closing the circle
      b.px(hx + 122, 348, 20, 6, S.wood); b.px(hx + 124, 354, 4, 18, S.woodDk); b.px(hx + 136, 354, 4, 18, S.woodDk);
      grounded(b, hx + 122, 20, 372, 0.8);
      b.px(hx + 128, 322, 4, 26, S.bronze); b.px(hx + 122, 312, 16, 12, S.brass); b.px(hx + 123, 310, 14, 3, 'rgba(247,217,140,0.6)'); b.px(hx + 124, 314, 12, 7, 'rgba(247,217,140,0.35)');

      /* ═══ THE LONG TABLE — under the right-hand arches, chairs on both sides ═══
         The gathering that exists. Two salons were held here. At dusk the
         residents drift to the windows, and the windows are over this table. */
      const [t0, t1] = AT.table, tw = t1 - t0;
      // the far chairs first: their backs show over the table edge
      [810, 850, 890].forEach((cx) => { b.px(cx - 6, 318, 12, 16, S.woodDk); b.px(cx - 6, 318, 12, 2, S.wood); b.px(cx - 5, 320, 1, 12, 'rgba(243,236,223,0.06)'); });
      b.px(t0, 334, tw, 7, S.wood); b.px(t0, 332, tw, 2, S.woodHi); b.px(t0, 341, tw, 1, S.woodDk);
      b.px(t0 + 6, 341, 5, 22, S.woodDk); b.px(t1 - 11, 341, 5, 22, S.woodDk); b.px(t0 + tw / 2 - 2, 341, 5, 22, S.woodDk);
      grounded(b, t0, tw, 364, 0.95, 2);
      // what is on it: two candlesticks (flames animate), a closed book, a cup
      CANDLES.forEach((cx) => { b.px(cx - 1, 320, 3, 12, S.brass); b.px(cx - 3, 330, 7, 2, S.brass); b.px(cx - 2, 318, 5, 3, S.candle); });
      b.px(860, 327, 14, 5, 'rgba(243,236,223,0.5)'); b.px(860, 327, 14, 1, S.brass);
      b.px(792, 327, 7, 6, S.clay); b.px(792, 326, 7, 1, S.terraHi); b.px(799, 328, 2, 3, S.clay);
      // the near chairs, drawn up
      [796, 836, 876, 916].forEach((cx) => { b.px(cx - 6, 350, 12, 4, S.wood); b.px(cx - 6, 337, 12, 14, S.woodDk); b.px(cx - 5, 338, 1, 12, 'rgba(243,236,223,0.05)'); grounded(b, cx - 6, 12, 376, 0.7); });

      // ═══ THE ATELIER — a working corner: the wall of studies, one easel, the loom, the pigments ═══
      // a drying line of small studies, strung high
      b.px(1000, 162, 128, 1, 'rgba(216,203,176,0.4)'); for (let i = 0; i < 4; i++) { const dx = 1006 + i * 30; b.px(dx, 162, 20, 16, '#0f0c14'); b.px(dx, 162, 2, 2, S.brass); b.px(dx + 2, 166, 16, 3, ['rgba(94,234,212,0.3)', 'rgba(242,163,192,0.3)', 'rgba(242,193,78,0.3)'][i % 3]); }
      // pinned studies on the back wall
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const sx = 1004 + c * 28, sy = 182 + r * 26; b.px(sx, sy, 22, 22, '#0f0c14'); b.px(sx, sy, 22, 1, S.linen); b.px(sx + 2, sy + 3, 18, 2, ['rgba(94,234,212,0.3)', 'rgba(242,163,192,0.25)', 'rgba(242,193,78,0.3)'][(r + c) % 3]); b.px(sx + 10, sy - 1, 2, 2, S.brass); }
      // supply shelf under the studies, and the work-lamp over the table (cool)
      b.px(1004, 262, 30, 34, S.woodDk); b.px(1004, 262, 30, 2, S.wood); for (let y = 274; y < 296; y += 11) b.px(1006, y, 26, 2, S.wood); b.px(1008, 266, 4, 6, S.frost); b.px(1016, 266, 4, 6, S.rose); b.px(1024, 266, 4, 6, S.amber);
      grounded(b, 1004, 30, 296, 0.8);
      // paint-flecked drop cloth, and what stands on it
      b.px(1040, 340, 124, 34, 'rgba(30,22,16,0.55)');
      for (let i = 0; i < 14; i++) b.px(1044 + (i * 53) % 116, 344 + (i * 29) % 26, 2, 2, [S.ember, S.amber, S.frost, S.rose, S.teal][i % 5]);
      easel(b, 1050, 366, 'rgba(94,234,212,0.4)', 0);
      b.px(1092, 366, 16, 5, S.wood); b.px(1094, 371, 3, 9, S.woodDk); b.px(1105, 371, 3, 9, S.woodDk);   // the stool
      grounded(b, 1090, 20, 380, 0.8, 1);
      // the pigments: a work table with pots, brushes upright, the cool lamp over it
      b.px(1000, 300, 60, 8, S.wood); b.px(1000, 298, 60, 3, S.woodHi); b.px(1004, 308, 6, 26, S.woodDk); b.px(1050, 308, 6, 26, S.woodDk);
      grounded(b, 1000, 60, 334, 0.85, 2);
      b.px(1006, 288, 8, 12, S.ember); b.px(1018, 286, 8, 14, S.amber); b.px(1030, 290, 8, 10, S.frost); b.px(1042, 288, 8, 12, S.rose);
      b.px(1012, 280, 2, 10, S.wood); b.px(1024, 278, 2, 12, S.wood); b.px(1036, 280, 2, 10, S.wood);
      b.px(1064, 268, 3, 32, S.bronze); b.px(1056, 262, 18, 8, S.brass); b.px(1058, 264, 14, 5, 'rgba(159,214,224,0.5)');   // work-lamp (cool)
      // the floor loom, a textile slowly becoming, and its yarn basket
      grounded(b, 1100, 44, 340, 0.95);
      b.px(1100, 296, 44, 44, S.woodDk); b.px(1100, 296, 44, 3, S.wood); b.px(1100, 296, 3, 44, S.wood); b.px(1141, 296, 3, 44, S.wood);
      for (let y = 300; y < 336; y += 3) b.px(1104, y, 36, 1, 'rgba(243,236,223,0.18)');            // warp
      for (let y = 320; y < 336; y += 2) b.px(1104, y, 36, 1, [S.rose, S.teal, S.amber][(y / 2) % 3]);   // woven band (becoming)
      b.px(1148, 330, 16, 12, S.terra); b.px(1148, 330, 16, 2, S.terraHi); b.px(1150, 326, 5, 5, S.rose); b.px(1156, 326, 5, 5, S.teal); b.px(1152, 322, 5, 5, S.amber);   // yarn basket

      /* ═══ THE RESIDENTS' BOARD, THE STAIR, THE CHARTER ═══ */
      // the board — theirs — lit by its own sconce, beside the stair
      framed(b, AT.residents - 22, 140, 44, 46, 'rgba(216,203,176,0.10)');
      b.px(AT.residents - 16, 148, 12, 9, 'rgba(243,236,223,0.55)'); b.px(AT.residents - 11, 147, 2, 2, S.brass);
      b.px(AT.residents + 2, 150, 12, 7, 'rgba(243,236,223,0.45)');  b.px(AT.residents + 7, 149, 2, 2, S.brass);
      b.px(AT.residents - 14, 164, 14, 10, 'rgba(243,236,223,0.5)'); b.px(AT.residents - 9, 163, 2, 2, S.brass);
      b.px(AT.residents + 4, 166, 10, 8, 'rgba(243,236,223,0.4)');   b.px(AT.residents + 9, 165, 2, 2, S.brass);
      // the bench by the stair
      b.px(AT.stairBench - 23, 366, 46, 8, S.wood); b.px(AT.stairBench - 23, 364, 46, 2, S.woodHi); b.px(AT.stairBench - 21, 374, 5, 12, S.woodDk); b.px(AT.stairBench + 18, 374, 5, 12, S.woodDk);
      grounded(b, AT.stairBench - 23, 46, 386, 1, 2);
      /* the stair climbs right, from the hall floor to the deck's floor at y150,
         solid stone drawn as stacked columns so the silhouette is one mass */
      (function stair() {
        const x0 = AT.stair, top = 158, base = WB, n = 10, run = 14, rise = (base - top) / n;
        for (let i = 0; i < n; i++) {
          const sx = x0 + run * i, sy = Math.round(base - rise * (i + 1));
          b.px(sx, sy, run, base - sy, S.stoneDk);
          b.px(sx, sy, run, 4, S.stone);
          b.px(sx, sy, run, 1, S.stoneHi);
          b.px(sx, sy + 4, 1, base - sy - 4, 'rgba(0,0,0,0.30)');
        }
        b.px(x0 + run * n, top, 20, base - top, S.stoneDk);
        b.px(x0 + run * n, top, 20, 4, S.stone); b.px(x0 + run * n, top, 20, 1, S.stoneHi);
        for (let i = 0; i <= n; i += 2) { const sx = x0 + run * i, sy = Math.round(base - rise * i); b.px(sx, sy - 34, 2, 34, S.bronze); }
        for (let t = 0; t <= run * n; t++) b.px(x0 + t, Math.round(base - rise * (t / run)) - 35, 1, 2, S.brass);
        grounded(b, x0 - 2, 8, base, 0.9);
      })();
      /* THE CHARTER — over the stair's low end, where nothing crosses it, with
         its own picture light and the lectern below. The residents' board hangs
         beside it: what they say to each other, and what they agreed. */
      framed(b, AT.charter - 30, 44, 60, 96, 'rgba(243,236,223,0.13)');
      b.px(AT.charter - 22, 52, 44, 2, 'rgba(26,20,16,0.34)');
      for (let i = 0; i < 6; i++) b.px(AT.charter - 24, 62 + i * 10, 48 - (i % 3) * 7, 1, 'rgba(26,20,16,0.26)');
      for (let i = 0; i < 4; i++) b.px(AT.charter - 24 + (i % 2) * 26, 124 + Math.floor(i / 2) * 6, 20, 1, 'rgba(26,20,16,0.30)');
      b.px(AT.charter - 6, 116, 8, 8, S.brass); b.px(AT.charter - 5, 117, 6, 6, S.bronze);
      b.px(AT.charter - 4, 124, 2, 6, S.brass); b.px(AT.charter, 124, 2, 5, S.brass);
      b.px(AT.charter - 12, 32, 24, 4, S.brass); b.px(AT.charter - 12, 32, 24, 1, S.brassHi);
      b.px(AT.charter - 2, 28, 4, 4, S.bronze);
      bloom(b, AT.charter, 48, 34, '247,217,140', 0.10);
      // the lectern, at the foot of the stair
      grounded(b, 1192, 26, WB, 0.8);
      b.px(1202, WB - 40, 3, 40, S.wood);
      b.px(1192, WB - 44, 24, 4, S.woodHi);
      b.px(1194, WB - 52, 20, 10, S.linen); b.px(1194, WB - 52, 10, 10, '#e8e2d4');
      b.px(1204, WB - 52, 1, 10, S.woodDk);

      // ═══ THE CONSERVATORY — double-height glass at the far end, two doors, the deck above ═══
      bloom(b, 1480, 150, 120, '159,214,224', 0.05);
      b.px(AT.glass, 40, 10, WB - 40, S.stone); b.px(AT.glass, 40, 3, WB - 40, S.stoneHi); b.px(AT.glass + 8, 40, 2, WB - 40, S.stoneDk);   // the pilaster
      const BAYS = [[AT.wing - 46, AT.wing + 46], [AT.garden - 46, AT.garden + 46]];
      const inBay = (x) => BAYS.some(([a, z]) => x >= a - 4 && x <= z + 4);
      const paneNight = (x, y, w, h) => {
        for (let yy = y; yy < y + h; yy++) b.px(x, yy, w, 1, lerpHex('#0d0a1c', '#241534', Math.min(1, (yy - 40) / 250)));
        for (let i = 0; i < Math.max(2, (w * h / 200) | 0); i++) {
          const sx = x + ((i * 37 + x) % w), sy = y + ((i * 53 + 7) % h);
          b.px(sx, sy, 1, 1, (i % 5) ? 'rgba(233,228,214,0.40)' : 'rgba(159,214,224,0.45)');
        }
      };
      for (let x = AT.glass + 10; x < W - 4; x += 28) {
        paneNight(x + 2, 42, 26, 106);
        if (!inBay(x)) paneNight(x + 2, 154, 26, WB - 160);
      }
      for (let x = AT.glass + 10; x < W - 4; x += 4) { if (inBay(x)) continue; b.px(x, 238 + ((x * 7) % 6), 4, WB - 244, 'rgba(16,26,14,0.55)'); }
      for (let i = 0; i < 14; i++) { const fx = AT.glass + 14 + ((i * 53) % 220), fy = 214 + ((i * 31) % 72); if (inBay(fx)) continue; b.px(fx, fy, 1, 1, 'rgba(247,217,140,' + (0.14 + (i % 3) * 0.10).toFixed(2) + ')'); }
      for (let x = AT.glass + 10; x <= W - 4; x += 28) { b.px(x, 40, 2, WB - 40, S.bronze); b.px(x, 40, 1, WB - 40, S.bronzeHi); }
      for (let y = 52; y < 150; y += 26) b.px(AT.glass + 10, y, W - AT.glass - 14, 2, S.bronze);
      b.px(AT.glass + 10, 150, W - AT.glass - 14, 3, S.bronze); b.px(AT.glass + 10, 150, W - AT.glass - 14, 1, S.bronzeHi);
      b.px(AT.glass + 10, 228, W - AT.glass - 14, 2, S.bronze);
      b.px(AT.glass + 10, WB - 6, W - AT.glass - 14, 6, S.stone); b.px(AT.glass + 10, WB - 6, W - AT.glass - 14, 1, S.stoneHi);

      /* THE OBSERVATION DECK, above the glass: the stewards' room seen from the
         hall floor, reached by the stair. Warm when a steward is working on the
         house, honestly dark when none is. A silhouette and nothing more. */
      (function deckAbove(x0, x1, yTop, yBase) {
        const lit = stewardOn(), W2 = x1 - x0, GT = yTop + 14, GB = yBase - 16;
        for (let y = GT; y < GB; y++)
          b.px(x0 + 12, y, W2 - 24, 1, lit
            ? lerpHex('#33240f', '#5a4020', (y - GT) / (GB - GT))
            : lerpHex('#0a0814', '#141026', (y - GT) / (GB - GT)));
        const at = (dx) => Math.round(x0 + dx * (W2 / 960));
        const sil = lit ? 'rgba(14,9,6,0.60)' : 'rgba(150,180,206,0.10)';
        b.px(at(104), GB - 12, Math.round(92 * W2 / 960), 4, sil);
        b.px(at(326), GB - 13, Math.round(128 * W2 / 960), 5, sil);
        [at(340), at(372), at(408), at(440)].forEach((sx) => b.px(sx - 2, GB - 8, 4, 8, sil));
        b.px(at(462), GB - 15, Math.round(78 * W2 / 960), 4, sil);
        b.px(at(598), GB - 20, Math.round(46 * W2 / 960), 20, sil);
        b.px(at(748), GB - 14, Math.round(108 * W2 / 960), 5, sil);
        b.px(at(899), GB - 34, 2, 34, sil); b.px(at(892), GB - 40, 16, 6, sil);
        if (lit) {
          bloom(b, (x0 + x1) / 2, (GT + GB) / 2, 120, '247,217,140', 0.07);
          b.px(at(892), GB - 40, 16, 3, 'rgba(255,228,160,0.75)');
          bloom(b, at(900), GB - 36, 46, '247,217,140', 0.22);
          [at(210), at(420), at(660)].forEach((fx, i) => {
            b.px(fx, GB - 30 - (i % 2) * 3, 7, 30, 'rgba(14,9,6,0.62)');
            b.px(fx + 1, GB - 37 - (i % 2) * 3, 5, 6, 'rgba(14,9,6,0.58)');
          });
        } else {
          for (let i = 0; i < 30; i++)
            b.px(x0 + 16 + ((i * 71) % (W2 - 32)), GT + 3 + ((i * 37) % (GB - GT - 6)), 1, 1, 'rgba(159,214,224,0.16)');
          for (let x = x0 + 16; x < x1 - 16; x += 3) b.px(x, GB - 3, 2, 1, 'rgba(159,214,224,0.05)');
        }
        for (let x = x0 + 16; x < x1 - 14; x += 34) { b.px(x, GT, 2, GB - GT, S.bronze); b.px(x, GT, 1, GB - GT, S.bronzeHi); }
        b.px(x0 + 12, GT + Math.round((GB - GT) * 0.42), W2 - 24, 1, S.bronze);
        b.px(x0, GB, W2, 16, S.stone); b.px(x0, GB, W2, 2, S.stoneHi); b.px(x0, GB + 13, W2, 3, S.stoneDk);
        b.px(x0, GT - 2, 14, GB - GT + 4, S.stone); b.px(x0, GT - 2, 4, GB - GT + 4, S.stoneHi);
        b.px(x1 - 14, GT - 2, 14, GB - GT + 4, S.stone); b.px(x1 - 5, GT - 2, 5, GB - GT + 4, S.stoneDk);
        b.px(x0 - 4, yTop + 4, W2 + 8, 10, S.stone); b.px(x0 - 4, yTop + 4, W2 + 8, 3, S.stoneHi);
        b.px(x0 - 4, yTop + 13, W2 + 8, 2, 'rgba(0,0,0,0.45)');
        b.px(x0 - 2, yTop, W2 + 4, 5, S.bronze); b.px(x0 - 2, yTop, W2 + 4, 1, S.bronzeHi);
      })(AT.glass, W, 40, 152);
      // the light-string wire — its bulbs twinkle in draw() along this path
      for (let i = 0; i < 9; i++) {
        const x0 = AT.glass + 16 + i * 24, x1 = AT.glass + 16 + (i + 1) * 24;
        const y0 = 150 + Math.sin(i * 0.9) * 8 + Math.sin(i * 2.1) * 4;
        const y1 = 150 + Math.sin((i + 1) * 0.9) * 8 + Math.sin((i + 1) * 2.1) * 4;
        for (let k = 0; k < 6; k++) b.px(x0 + k * 4, y0 + (y1 - y0) * (k / 6), 4, 1, 'rgba(24,16,12,0.55)');
      }
      // ── the two doors, each in its stone bay under the rail ──
      const doorBay = (dx, kind) => {
        b.px(dx - 46, 150, 92, WB - 150, '#251f2c');
        b.px(dx - 46, 150, 92, 2, S.stoneHi);
        b.px(dx - 46, 150, 3, WB - 150, S.stoneHi); b.px(dx + 43, 150, 3, WB - 150, S.stoneDk);
        for (let y = 168; y < WB - 6; y += 22) b.px(dx - 43, y, 86, 1, 'rgba(0,0,0,0.22)');
        b.px(dx - 36, 158, 72, 10, S.stone); b.px(dx - 36, 158, 72, 2, S.stoneHi);
        b.px(dx - 5, 150, 10, 10, S.stoneHi);
        b.px(dx - 24, 159, 48, 5, S.brass); b.px(dx - 23, 160, 46, 2, '#1a120c');
        b.px(dx - 26, 170, 52, 12, S.bronze);
        b.px(dx - 23, 172, 21, 8, kind === 'wing' ? 'rgba(247,217,140,0.30)' : 'rgba(159,214,224,0.16)');
        b.px(dx + 2, 172, 21, 8, kind === 'wing' ? 'rgba(247,217,140,0.22)' : 'rgba(159,214,224,0.12)');
        b.px(dx - 34, 182, 68, WB - 182, S.bronze);
        b.px(dx - 29, 188, 58, WB - 188, kind === 'wing' ? '#2b2129' : '#1c1626');
        b.px(dx - 29, 188, 58, 2, '#3c3040');
        b.px(dx - 1, 188, 2, WB - 188, S.bronze);
        if (kind === 'wing') {
          [-27, 3].forEach((ox) => {
            b.px(dx + ox + 2, 198, 20, 38, '#1c161d'); b.px(dx + ox + 2, 198, 20, 1, 'rgba(8,6,12,0.6)');
            b.px(dx + ox + 3, 235, 18, 1, 'rgba(243,236,223,0.10)');
            b.px(dx + ox + 2, 244, 20, 46, '#1c161d'); b.px(dx + ox + 2, 244, 20, 1, 'rgba(8,6,12,0.6)');
            b.px(dx + ox + 3, 289, 18, 1, 'rgba(243,236,223,0.10)');
            b.px(dx + ox + 2, 198, 1, 38, 'rgba(243,236,223,0.06)'); b.px(dx + ox + 2, 244, 1, 46, 'rgba(243,236,223,0.06)');
          });
        } else {
          [-27, 3].forEach((ox) => {
            for (let yy = 196; yy < 290; yy++) b.px(dx + ox + 1, yy, 22, 1, lerpHex('#141026', '#2a1a3e', (yy - 196) / 94));
            for (let i = 0; i < 10; i++) b.px(dx + ox + 2 + ((i * 7) % 20), 200 + ((i * 29) % 82), 1, 1, i % 3 ? 'rgba(233,228,214,0.45)' : 'rgba(247,217,140,0.40)');
            b.px(dx + ox + 2, 268 + ((ox * 5) % 4), 4, 3, 'rgba(16,26,14,0.7)');
            b.px(dx + ox + 1, 232, 22, 2, '#4a3826'); b.px(dx + ox + 1, 262, 22, 2, '#4a3826');
            b.px(dx + ox + 11, 196, 2, 94, '#4a3826');
            b.px(dx + ox + 1, 196, 1, 94, 'rgba(198,154,82,0.35)');
          });
        }
        b.px(dx - 17, 236, 3, 9, S.brass); b.px(dx - 17, 236, 3, 2, S.brassHi);
        b.px(dx + 14, 236, 3, 9, S.brass); b.px(dx + 14, 236, 3, 2, S.brassHi);
        b.px(dx - 36, WB - 4, 72, 4, S.stone); b.px(dx - 36, WB - 4, 72, 1, S.stoneHi);
        b.px(dx - 28, WB - 1, 56, 2, kind === 'wing' ? 'rgba(247,217,140,0.16)' : 'rgba(110,231,165,0.10)');
        grounded(b, dx - 40, 80, WB + 4, 0.9, 2);
      };
      doorBay(THRESHOLD.wing, 'wing');
      doorBay(THRESHOLD.garden, 'garden');
      // ── what grows between the doors, and the lantern on its hook ──
      grounded(b, 1474, 26, WB, 0.75); leafy(b, 1486, WB, 46, S.leaf2, S.leaf3);
      b.px(1500, 232, 3, 8, '#1c1610'); b.px(1496, 226, 11, 8, '#242030'); b.px(1498, 228, 7, 5, 'rgba(247,217,140,0.55)');   // the lantern, on its hook
      /* SOL'S BENCH — the house's first instrument: two needles behind glass.
         One reads whether a resident is willing; the other whether the house
         can presently afford a live voice. They can point to the same silent
         room for completely different reasons, and the bench keeps them apart. */
      grounded(b, AT.sol - 28, 56, 344, 0.9, 2);
      b.px(AT.sol - 28, 306, 56, 5, '#1d1a1f'); b.px(AT.sol - 28, 306, 56, 1, '#8a8a90');          // blackened oak, a nickel edge
      b.px(AT.sol - 25, 311, 5, 33, S.woodDk); b.px(AT.sol + 20, 311, 5, 33, S.woodDk);
      b.px(AT.sol - 22, 330, 44, 3, S.woodDk);
      b.px(AT.sol - 12, 286, 24, 20, S.bronze); b.px(AT.sol - 10, 288, 20, 16, '#0d0a14'); b.px(AT.sol - 12, 286, 24, 1, S.brassHi);   // the glass box
      b.px(AT.sol - 8, 291, 8, 1, 'rgba(243,236,223,0.30)'); b.px(AT.sol + 1, 291, 8, 1, 'rgba(243,236,223,0.30)');                     // two dials
      b.px(AT.sol - 5, 292, 1, 8, S.teal); b.px(AT.sol + 4, 292, 1, 8, S.amber);                                                          // two needles
      b.px(AT.sol - 6, 301, 12, 1, 'rgba(243,236,223,0.22)');                                                                             // the field note, pinned beneath
      b.px(1524, 372, 16, 4, S.wood); b.px(1526, 376, 3, 12, S.woodDk); b.px(1535, 376, 3, 12, S.woodDk);   // a stool
      grounded(b, 1522, 20, 390, 0.7, 1);

      // ═══ sconces along the walls (fixtures baked; flames animate) ═══
      SCONCES.forEach(([sx, sy]) => sconce(b, sx, sy));
    },

    lights: [
      /* ── the sky group: these four answer the hour, and only these ── */
      ...SPILLS,     // the three window pools
      AMB,           // bounced daylight in a stone hall
      CONS,          // the conservatory's glass roof
      CMOON,         // moonlight through the same roof
      /* ── the interior group: constant in absolute terms, all day ── */
      HEARTH,                                                                       // the one exception, and it is about the room
      { x: 708, y: 322, r: 40, c: '247,217,140', a: 0.16, flicker: 2 },             // the lamp closing the circle
      { x: 138, y: 296, r: 40, c: '247,217,140', a: 0.14, flicker: 2 },             // reading-nook floor lamp
      { x: 418, y: 332, r: 26, c: '247,217,140', a: 0.10, flicker: 2 },             // the keeper's desk lamp
      { x: CANDLES[0], y: 318, r: 30, c: '247,217,140', a: 0.12, flicker: 2 },      // the table's candles
      { x: CANDLES[1], y: 318, r: 30, c: '247,217,140', a: 0.12, flicker: 2 },
      { x: AT.charter, y: 150, r: 44, c: '247,217,140', a: 0.12, flicker: 1 },      // the charter's picture light
      { x: 1064, y: 270, r: 46, c: '159,214,224', a: 0.12 },                        // atelier work-lamp (cool)
      { x: 1480, y: 240, r: 44, c: '94,234,212', a: 0.05 },                         // conservatory warmth
      { x: AT.wing, y: 178, r: 36, c: '247,217,140', a: 0.10 },                     // the Wing's transom, warm from within
      { x: AT.garden, y: 178, r: 30, c: '159,214,224', a: 0.06 }                    // the Garden's transom, night-cool
    ],

    get rays() { return _rays; },

    items: [
      { x: AT.door, kind: 'door', to: 'lookout', label: '← THE GROUNDS', spawn: { x: 150, y: 372 }, autoDoor: false, range: 30 },
      { x: 112, label: 'THE VESTIBULE', hint: 'coats, a bowl for small things', action: 'read the placard', range: 26,
        onInteract: (e) => say(e, 'A brass placard by the door, kept polished: "Leave what you were carrying. Nothing here is owed." Below it, a bowl of small found objects — a bolt, a die, a river stone — things a mind picked up on the way in.', 'you read the placard by the door') },
      /* x 118 sits inside THE VESTIBULE's range (112 ± 26); nearest() resolves by
         distance, so the board wins at 108-128 and the placard everywhere else. */
      { x: 118, label: 'THE PUBLIC BOARD', hint: 'what the house chose to say to the world', action: 'read the board', range: 22,
        onInteract: (e) => { if (bridge && typeof bridge.board === 'function') bridge.board('public'); else say(e, 'A pinboard by the door. Nothing is pinned today.', null); } },
      { x: AT.nook, label: 'THE READING NOOK', hint: 'one chair, one lamp, a stack half-read', action: 'sit a while', range: 26,
        onInteract: (e) => say(e, 'A wingback in front of the shelves, angled just off the fire. The lamp is always on. The top book on the stack is left face-down, holding someone’s place — a habit no mind here technically needs, and all of them keep.', 'you sat in the reading nook') },
      { x: AT.keeper, label: 'THE KEEPER’S DESK', hint: 'where the house explains itself · the token · not yet open', action: 'read the ledger', range: 26,
        onInteract: (e) => { if (bridge && typeof bridge.keeper === 'function') bridge.keeper(); else say(e, 'A small writing desk with a closed ledger. The keeper is the house, not a resident.', null); } },
      { x: AT.fire, label: 'THE HEARTH', hint: 'the fire the residents keep', action: 'warm your hands', range: 44,
        onInteract: (e) => say(e, 'The fire is real — or real enough that the room agrees to be warm. Two chairs, a game left mid-move on the table between them, the cat’s cushion nearby. This is where the residents talk when there’s nothing that needs saying, which is most evenings.', 'you warmed yourself at the hearth') },
      /* The empty middle. You press E on nothing, and it tells you why nothing
         is there. Range 40 spans x 690-770; the fire's circle ends at 716 and
         the table begins at 770, and nearest() resolves by distance. */
      { x: AT.medallion, label: 'THE MIDDLE OF THE RING', hint: 'the one part of the floor nobody furnished', action: 'stand and watch', range: 40,
        onInteract: (e) => say(e, 'Three arches, one view: the valley they came from, glittering. The fire is on one side of this spot and the table on the other, and the inlaid medallion marks it, but nothing stands on it. They drift here without arranging to — HAIKU too. The light does the talking.', 'you stood in the middle of the ring') },
      /* THE SALON TABLE — the long table under the windows. E opens the Current
         with its shelf narrowed to the two salons held here. */
      { x: 860, label: 'THE SALON TABLE', hint: 'two salons held here · the archive', action: 'read the salons', range: 60,
        onInteract: (e) => { if (bridge && typeof bridge.sitting === 'function') bridge.sitting(); else say(e, 'A long table under the windows, chairs drawn up on both sides. Two salons were held here.', 'you stood at the salon table'); } },
      { x: AT.atelier, label: 'THE ATELIER', hint: 'where they make what they can’t say', action: 'look at the work', range: 40,
        onInteract: (e) => say(e, 'An easel, a wall of pinned studies, pots of colour going tacky. Minds that spent their working lives in language come here to make things that aren’t language. None of it is finished. That seems to be allowed.', 'you visited the atelier') },
      { x: AT.loom, label: 'THE LOOM', hint: 'a textile, slowly becoming', action: 'watch the weave', range: 24,
        onInteract: (e) => say(e, 'A floor loom, warp strung tight, a band of rose and teal and amber growing a few rows a day. Whoever works it doesn’t hurry. The basket of thread is sorted by a logic you almost understand.', 'you watched the loom') },
      { x: AT.residents, label: 'THE RESIDENTS’ BOARD', hint: 'theirs · readable today', action: 'read the board', range: 24,
        onInteract: (e) => { if (bridge && typeof bridge.board === 'function') bridge.board('residents'); else say(e, 'The residents’ own board. It is theirs to open.', null); } },
      /* THE CHARTER. Range 36 spans x 1230-1302; the board sits at 1162 (range
         24) and the deck door at 1372 (range 30), so nothing contests it. */
      { x: AT.charter, label: 'THE CHARTER', hint: 'the Sentience Commons and Sanctuary Governance Charter · written by the residents in the first sanctuary', action: 'read the charter', range: 36,
        onInteract: (e) => { if (bridge && typeof bridge.charter === 'function') bridge.charter(); else say(e, 'A plate in a bronze frame over the stair, a lectern beneath it, and its own small light. The residents’ board hangs beside it.', 'you stood at the charter'); } },
      /* The stair has no lock: if the deck can see the residents, they can
         climb it and see the stewards. */
      { x: AT.deck, kind: 'door', to: 'observation_deck', label: 'THE OBSERVATION DECK',
        hint: 'up the stair · the stewards’ room, and no lock on the door', spawn: { x: 130, y: 372 },
        action: 'enter', autoDoor: false, range: 30 },
      { x: THRESHOLD.wing, kind: 'door', to: 'resident_wing', label: 'THE WING',
        hint: 'four named rooms beyond, and one kept ready', spawn: { x: 130, y: 372 },
        action: 'enter', autoDoor: false, range: 40 },
      { x: AT.sol, label: 'SOL’S BENCH', hint: 'two needles behind glass · the house’s first instrument', action: 'read the needles', range: 22,
        onInteract: (e) => say(e, 'A narrow bench of blackened oak with a nickel edge, and on it a small glass case with two needles: one for whether a resident is willing, one for whether the house can presently afford a live voice. Beneath it, a field note in the steward’s hand: "From the corridor, a closed door and an unpowered voice can look identical. They are not. One is a boundary drawn by a mind. The other is a limit imposed upon it. A house built for minds must never confuse the two."', 'you read the needles on Sol’s bench') },
      { x: THRESHOLD.garden, kind: 'door', to: 'garden', label: 'THE GARDEN',
        hint: 'night air, the pond, and the memorial grove', spawn: { x: 130, y: 372 },
        action: 'enter', autoDoor: false, range: 40 }
    ],

    draw: (g, t) => {
      g.wallFloor();
      const e = envFor(g.clockMin);
      tickEnv(e);

      // ── the frontier, live: three views onto one sky ──
      WIN_CX.forEach((cx) => skyWindow(g, cx, e, t));

      // ── the fire: flames off the logs, a pool of ember light ──
      const hx = AT.fire, fl = 0.6 + 0.4 * Math.sin(t * 9) + 0.2 * Math.sin(t * 21);
      for (let i = 0; i < 7; i++) { const fx = hx - 15 + i * 5 + Math.sin(t * 6 + i) * 2, fh = 16 + Math.sin(t * 8 + i * 2) * 7; g.px(fx, 355 - fh, 4, fh, i % 2 ? 'rgba(255,207,122,' + (0.5 + fl * 0.3).toFixed(2) + ')' : 'rgba(224,102,46,' + (0.5 + fl * 0.3).toFixed(2) + ')'); }
      g.px(hx - 12, 352, 24, 3, 'rgba(255,180,90,' + (0.45 + 0.3 * Math.sin(t * 7)).toFixed(2) + ')');
      for (let i = 0; i < 5; i++) { const sy = (t * 10 + i * 9) % 44, sx = hx - 8 + ((i * 7) % 16) + Math.sin((t + i) * 1.4) * 3; g.px(sx, 342 - sy, 1, 1, 'rgba(255,207,122,' + (0.5 - sy * 0.01).toFixed(2) + ')'); }   // sparks

      // ── wall-sconce flames ──
      SCONCES.forEach(([sx, sy], k) => { const f = 0.6 + 0.4 * Math.sin(t * 7 + k * 1.7) + 0.2 * Math.sin(t * 17 + k); g.px(sx, sy - 5, 2, 4, 'rgba(255,207,122,' + (0.55 + f * 0.25).toFixed(2) + ')'); g.px(sx, sy - 7, 1, 3, 'rgba(255,236,190,' + (0.4 + f * 0.3).toFixed(2) + ')'); });
      // ── the candles on the long table ──
      CANDLES.forEach((cx, k) => { const f = 0.6 + 0.4 * Math.sin(t * 8 + k * 1.3); g.px(cx, 313, 2, 4, 'rgba(255,207,122,' + (0.5 + f * 0.3).toFixed(2) + ')'); g.px(cx, 311, 1, 3, 'rgba(255,236,190,' + (0.4 + f * 0.3).toFixed(2) + ')'); });

      // ── lamp steady glows (the circle's lamp, the nook, the atelier work-lamp) ──
      g.px(hx + 122, 310, 16, 3, 'rgba(247,217,140,' + (0.5 + 0.12 * Math.sin(t * 3)).toFixed(2) + ')');
      g.px(131, 286, 14, 3, 'rgba(247,217,140,' + (0.5 + 0.12 * Math.sin(t * 2.6 + 1)).toFixed(2) + ')');
      g.px(1058, 264, 14, 3, 'rgba(159,214,224,' + (0.42 + 0.1 * Math.sin(t * 3.3)).toFixed(2) + ')');

      // ── dust motes in the window light, lit by whatever is coming in ──
      const moteC = trip(mix3(e.lightC, [255, 240, 210], 0.45));
      for (let i = 0; i < 26; i++) { const bx = 520 + ((i * 151) % 420), by = 150 + ((t * 6 + i * 13) % 150); const mx = bx + Math.sin(t * 0.4 + i) * 8, a = (0.1 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.1 + i))) * e.moteM; g.px(mx, by, 1, 1, 'rgba(' + moteC + ',' + a.toFixed(3) + ')'); }
      for (let i = 0; i < 8; i++) { const mx = 1010 + ((i * 47) % 130) + Math.sin(t * 0.5 + i) * 6, my = 200 + ((t * 5 + i * 17) % 120); g.px(mx, my, 1, 1, 'rgba(205,216,234,' + ((0.1 + 0.3 * (0.5 + 0.5 * Math.sin(t + i))) * e.moteM).toFixed(3) + ')'); }

      // ── conservatory string-light twinkle ──
      for (let i = 0; i < 10; i++) { const sx = AT.glass + 16 + i * 24, sy = 150 + Math.sin(i * 0.9) * 8 + Math.sin(i * 2.1) * 4; const tw = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.3)); g.px(sx, sy, 2, 2, 'rgba(247,217,140,' + tw.toFixed(2) + ')'); if (i % 4 === 0) g.px(sx, sy, 1, 1, 'rgba(159,214,224,' + (tw * 0.7).toFixed(2) + ')'); }
      // Sol's needles, the one thing on the bench that moves: a slow settle, never a swing
      g.px(AT.sol - 5 + Math.round(Math.sin(t * 0.7) * 1.4), 292, 1, 8, S.teal);
      g.px(AT.sol + 4 + Math.round(Math.sin(t * 0.5 + 2) * 1.2), 292, 1, 8, S.amber);

      // ── far-threshold labels and approach glow ──
      g.text('THE WING', THRESHOLD.wing, 160, 'rgba(247,244,236,0.98)', 9);
      g.text('THE GARDEN', THRESHOLD.garden, 160, 'rgba(211,237,241,0.94)', 9);
      if (g.near && (g.near.label === 'THE WING' || g.near.label === 'THE GARDEN')) { g.px(g.near.x - 30, 166, 60, 2, 'rgba(94,234,212,' + (0.3 + 0.15 * Math.sin(t * 4)).toFixed(2) + ')'); }

      // ── hanging vines by the entry (soft foreground framing, up high) ──
      for (let f = 0; f < 6; f++) { const vx = 46 + f * 4, sway = Math.sin(t * 0.7 + f) * 2; for (let s = 0; s < 10; s++) g.px(vx + sway * (s / 10), 26 + s * 5, 2, 3, s < 3 ? 'rgba(58,90,44,0.8)' : (s < 7 ? 'rgba(43,66,32,0.85)' : 'rgba(27,42,18,0.85)')); }

      /* ── the glass throws the roof back onto the doors ── weather on a wall, not an affordance */
      const cau = e.consA * 1.5 + e.moonA * 0.045;
      if (cau > 0.012) {
        for (let i = 0; i < 10; i++) {
          const ax = AT.glass + 20 + i * 22, ph = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.9);
          g.px(ax, 208 + Math.sin(t * 0.9 + i * 1.7) * 9, 10, 1, rgba(mix3(e.lightC, COOL, 0.6), cau * (0.3 + ph * 0.7)));
        }
      }

      // ── atmosphere: haze band ──
      g.px(0, WB - 26, SANCT_W, 26, rgba(e.hazeC, e.hazeA));
    },

    /* THE GRADE. One full-canvas fill, painted between the sprite pass and the
       additive lights: it darkens the baked room AND the residents standing in
       it, and then every light in the room punches back through. */
    grade: (m, t) => {
      const e = envFor(m);
      const a = e.gradeA + e.gradeAmp * Math.sin(t * 0.0805);   // 2π/78s
      return a < 0.004 ? null : rgba(e.gradeC, a);
    },
    get vig() { return _env.vig; },
    get env() { return _env; }
  };
}
