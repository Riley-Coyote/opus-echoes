/**
 * The day, asserted.
 *
 * envAt() is pure and DOM-free on purpose, so the whole 24-hour cycle can be
 * swept in node without a browser and without a dependency. Every rule below
 * is one that breaks silently: a keyframe field goes NaN, an alpha creeps out
 * of range, the wrap through midnight develops a step, or somebody "improves"
 * the sunset and the room stops containing the room it was built as.
 *
 *   bun run scripts/verify-sanctuary-day.ts
 *
 * This is tier one. It cannot see pixels — it checks the model, not the
 * render. The luminance section is an explicit proxy and says so; the real
 * check for "no phase is black, blown, or flat" is a browser sweep.
 *
 * Exits non-zero on any violation.
 */
import { readFileSync } from "node:fs";

const world = (await import("../public/world/sanctuary.js")) as any;
const { PHASES, envAt } = world;

let failures = 0;
const fail = (m: string) => { console.error("  ✗ " + m); failures++; };
const ok = (m: string) => console.log("  · " + m);
const hhmm = (m: number) => Math.floor(m / 60) + ":" + ("0" + Math.floor(m % 60)).slice(-2);

type Trip = [number, number, number];
const isTrip = (v: unknown): v is Trip =>
  Array.isArray(v) && v.length === 3 && v.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
const luma = (t: Trip) => 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];

/* ─────────────────────────── shape ─────────────────────────── */
console.log("── the table ────────────────────────────────────────────────");
console.log(`  keyframes: ${PHASES.length}   phases: ${new Set(PHASES.map((p: any) => p.name)).size}`);
for (let i = 1; i < PHASES.length; i++)
  if (PHASES[i].min <= PHASES[i - 1].min) fail(`keyframe ${i} at ${PHASES[i].min} does not follow ${PHASES[i - 1].min}`);
if (PHASES[0].min !== 0) fail("the table must start at 00:00 — envAt's wrap segment assumes it");
if (PHASES[PHASES.length - 1].min >= 1440) fail("a keyframe sits at or past midnight");
ok(`${PHASES.length} keyframes, strictly ordered, 00:00 \u2192 ${hhmm(PHASES[PHASES.length - 1].min)}`);
for (const p of PHASES) {
  if (p.sky.length !== 9) fail(`${p.name} @${hhmm(p.min)} has ${p.sky.length} sky stops, not 9`);
  if (!p.name) fail(`keyframe @${hhmm(p.min)} has no name`);
}
ok("every keyframe carries nine sky stops and a name");

/* ─────────────────────────── totality ─────────────────────────── */
console.log("\n── totality ─────────────────────────────────────────────────");
const A01 = ["sunA", "moonA", "starA", "lakeA", "spillA", "ambA", "consA", "gradeA", "gradeAmp", "hazeA", "moteM", "roofA"];
const POS = ["sunR", "moonR", "rayW", "spillR", "vig", "hearthM"];
let swept = 0;
for (let m = 0; m < 1440; m += 0.5) {
  const e = envAt(m);
  swept++;
  for (const k of [...A01, ...POS, "sunX", "sunY", "moonX", "moonY", "rayA", "rayDX", "camBias"])
    if (!Number.isFinite(e[k])) { fail(`envAt(${m}).${k} is not finite`); m = 1440; break; }
  for (const k of A01) if (e[k] < 0 || e[k] > 1) fail(`envAt(${m}).${k} = ${e[k]} is outside 0..1`);
  for (const k of POS) if (e[k] <= 0) fail(`envAt(${m}).${k} = ${e[k]} is not positive`);
  if (e.sky.length !== 9 || !e.sky.every(isTrip)) fail(`envAt(${m}).sky is not nine rgb triples`);
  for (const k of ["sunC", "ridgeC", "ridge2C", "lakeC", "lightC", "gradeC", "hazeC"])
    if (!isTrip(e[k])) fail(`envAt(${m}).${k} is not an rgb triple`);
}
ok(`${swept} samples across the day: every field finite, in range, and typed`);

/* envAt must be total for arguments the engine can actually hand it —
   clockMin is a float that has just wrapped, and a pinned ?clock= is unchecked */
for (const m of [-1, -720, 1440, 1440.4, 2879.9, 100000.25])
  if (!Number.isFinite(envAt(m).gradeA)) fail(`envAt(${m}) is not defined — the wrap is not total`);
ok("defined for negative, past-midnight and absurd minutes");

/* ─────────────────────────── the wrap ─────────────────────────── */
console.log("\n── the wrap ─────────────────────────────────────────────────");
const a = envAt(1439.99), b = envAt(0);
for (const k of [...A01, ...POS, "sunX", "sunY", "moonX", "moonY", "rayA", "rayDX"]) {
  const d = Math.abs(a[k] - b[k]), scale = Math.max(1, Math.abs(b[k]));
  if (d / scale > 0.01) fail(`${k} steps ${a[k].toFixed(4)} \u2192 ${b[k].toFixed(4)} through midnight`);
}
for (let j = 0; j < 9; j++) {
  const d = Math.max(...[0, 1, 2].map((c) => Math.abs(a.sky[j][c] - b.sky[j][c])));
  if (d > 2) fail(`sky stop ${j} steps by ${d} through midnight`);
}
ok("every field of 23:59.99 meets 00:00 without a step");

/* ─────────────────────────── the anchor ─────────────────────────── */
console.log("\n── the anchor: 18:45 must still be today's room ──────────────");
const S = envAt(1125);
const SUNSET = PHASES.find((p: any) => p.min === 1125);
if (!SUNSET) fail("there is no keyframe at 18:45 — the anchor is gone");
if (String(S.gradeC) !== "26,14,44") fail(`grade colour is ${S.gradeC}, not the deleted dusk breath's rgb(26,14,44)`);
if (Math.abs(S.gradeA - 0.045) > 1e-9) fail(`grade alpha is ${S.gradeA}, not 0.045`);
if (Math.abs(S.gradeAmp - 0.030) > 1e-9) fail(`grade amplitude is ${S.gradeAmp}, not 0.030`);
ok("the grade is rgb(26,14,44) at a0.045, breathing \u00b10.030");
if (S.rayDX < -70 || S.rayDX > -40) fail(`the sunset shaft rakes dx${S.rayDX}, outside the authored -70..-40`);
ok(`the sunset shaft still rakes left at dx${S.rayDX}`);
const TODAY = ["#0b0819", "#160b28", "#241238", "#3a1642", "#5c1f49", "#822f49", "#ab4f43", "#d17a45", "#f2ad5f"];
TODAY.forEach((hex, j) => {
  const v = parseInt(hex.slice(1), 16), want = [v >> 16, (v >> 8) & 255, v & 255];
  if (String(S.sky[j]) !== String(want)) fail(`sky stop ${j} at 18:45 is ${S.sky[j]}, not ${hex}`);
});
ok("the nine sky stops at 18:45 are the nine this room was authored with");

/* the anchor also has to be reachable as a *named* state, not merely crossed */
if (envAt(1125).name !== "sunset") fail(`18:45 is named "${envAt(1125).name}"`);
ok('18:45 is named "sunset"');

/* ─────────────────────────── the sun's arc ─────────────────────────── */
console.log("\n── the sun's arc ────────────────────────────────────────────");
/* The rake only means anything while the sun is actually casting. Below that
   the disc is under the ridge, rayA is nought, and the arc swings back round
   to the east in the dark where nobody can see it. */
/* Low on purpose. The shafts are *meant* to nearly die at noon — that is the
   hour's whole idea, the nave giving up and the conservatory taking the load —
   so a threshold set above noon's alpha would split the sweep in two and
   report zero direction changes for the healthiest possible reason. It only
   has to sit above night, where the sun casts nothing at all. */
const LIT = 0.015;
let flips = 0, flipAt = -1, prev: number | null = null, minAbs = Infinity, minAbsAt = -1;
for (let m = 0; m < 1440; m += 1) {
  const e = envAt(m);
  if (e.rayA < LIT) { prev = null; continue; }
  if (Math.abs(e.rayDX) < minAbs) { minAbs = Math.abs(e.rayDX); minAbsAt = m; }
  if (prev !== null && Math.sign(prev) !== Math.sign(e.rayDX) && e.rayDX !== 0) { flips++; flipAt = m; }
  prev = e.rayDX;
}
if (flips !== 1) fail(`the shaft changes direction ${flips} times while the sun is casting, not once`);
else ok(`the shaft swings east\u2192west exactly once, at ${hhmm(flipAt)}`);
if (minAbs > 8) fail(`the shaft never goes near vertical — closest is dx${minAbs.toFixed(1)} at ${hhmm(minAbsAt)}`);
else if (minAbsAt < 660 || minAbsAt > 780) fail(`the shaft goes vertical at ${hhmm(minAbsAt)}, nowhere near solar noon`);
else ok(`the shaft passes vertical (|dx| ${minAbs.toFixed(1)}) at ${hhmm(minAbsAt)}`);

/* the first shaft of the day must still land on the medallion */
const DAWN = envAt(360);
const land = 772 + DAWN.rayDX;
if (Math.abs(land - 882) > 26) fail(`the first shaft lands at floor x${land.toFixed(0)}, not on the medallion at 882`);
else ok(`the first shaft of the day lands at floor x${land.toFixed(0)} \u2014 the medallion, at 882`);

/* the discs must not both be up in broad daylight */
for (let m = 0; m < 1440; m += 5) {
  const e = envAt(m);
  if (e.sunA > 0.6 && e.moonA > 0.4) fail(`at ${hhmm(m)} the sun (${e.sunA.toFixed(2)}) and moon (${e.moonA.toFixed(2)}) are both up`);
}
ok("the sun and the moon are never both high at once");

/* ── the colonnade ──
   The three windows are three views onto one sky, so a disc placed between two
   apertures is behind a pier and simply does not exist that hour. Crossing the
   stonework mid-morning is the effect; parking a keyframe's disc inside a pier
   is the bug, and it is invisible from the table. */
const { SKY_X0, SKY_W, WIN, WIN_CX } = world;
const bands = WIN_CX.map((cx: number) => [
  (cx - WIN.w / 2 + 8 - SKY_X0) / SKY_W,
  (cx + WIN.w / 2 - 8 - SKY_X0) / SKY_W,
]);
const seen = (f: number) => bands.some(([a, b]: number[]) => f >= a && f <= b);
for (const p of PHASES) {
  if (p.sunA > 0.25 && !seen(p.sunX))
    fail(`${p.name} @${hhmm(p.min)} puts the sun at x${(SKY_X0 + p.sunX * SKY_W).toFixed(0)} — behind a pier, at a0.${String(p.sunA).slice(2)}`);
  if (p.moonA > 0.25 && !seen(p.moonX))
    fail(`${p.name} @${hhmm(p.min)} puts the moon at x${(SKY_X0 + p.moonX * SKY_W).toFixed(0)} — behind a pier, at a0.${String(p.moonA).slice(2)}`);
}
ok("every visible disc is authored inside an aperture, not inside the stonework");

/* ── and inside the GLASS, which is a different question ──
   The arch is a quadratic peaking at y=91 and falling to y=150 at the jambs,
   so "inside a window" horizontally says nothing about whether the disc is
   actually on glass. A sun authored at y62 is clipped away entirely and the
   table looks perfectly reasonable. */
const RIDGE = 176;
for (const p of PHASES) {
  for (const [what, a, x, y, r] of [
    ["sun", p.sunA, p.sunX, p.sunY, p.sunR],
    ["moon", p.moonA, p.moonX, p.moonY, p.moonR],
  ] as [string, number, number, number, number][]) {
    if (a <= 0.25) continue;
    const arch = world.archTopAt(SKY_X0 + x * SKY_W);
    if (!arch) continue;                                   // already reported above
    if (y - r < arch.top)
      fail(`${p.name} @${hhmm(p.min)}: the ${what} at y${y} r${r} reaches above the arch (top y${arch.top.toFixed(0)} at that x) — clipped`);
    if (a > 0.5 && y - r > RIDGE)
      fail(`${p.name} @${hhmm(p.min)}: the ${what} at y${y} is entirely behind the ridge at a${a} — bright and invisible`);
  }
}
ok("every visible disc sits on glass, below its arch and clear of the ridge");

/* The keyframes are twelve instants of a continuous journey, so checking them
   proves nothing about the other 1428 minutes. Sweep the whole day and count
   how much of it actually has a sun in it — and insist the three hours the
   design is *about* are among them. */
const onGlass = (x: number, y: number, r: number) => {
  const arch = world.archTopAt(SKY_X0 + x * SKY_W);
  return !!arch && y - r >= arch.top && y - r < RIDGE;
};
for (const [what, aKey, xKey, yKey, rKey, floor] of [
  ["sun", "sunA", "sunX", "sunY", "sunR", 0.45],
  ["moon", "moonA", "moonX", "moonY", "moonR", 0.45],
] as [string, string, string, string, string, number][]) {
  let bright = 0, visible = 0;
  for (let m = 0; m < 1440; m++) {
    const e = envAt(m) as any;
    if (e[aKey] <= 0.5) continue;
    bright++;
    if (onGlass(e[xKey], e[yKey], e[rKey])) visible++;
  }
  const share = visible / Math.max(1, bright);
  if (share < floor) fail(`the ${what} is on glass for only ${(share * 100).toFixed(0)}% of the hours it is bright — the colonnade is eating it`);
  else ok(`the ${what} is on glass for ${(share * 100).toFixed(0)}% of the hours it is bright`);
}
/* 01:00 is what a visitor at 01:00 sees; the keyframe at midnight is not */
for (const m of [30, 60, 120, 180]) {
  const e = envAt(m);
  if (e.moonA > 0.5 && !onGlass(e.moonX, e.moonY, e.moonR))
    fail(`at ${hhmm(m)} the moon is a${e.moonA.toFixed(2)} and behind the arch — a bright object nobody can see`);
}
ok("the moon is on glass through the small hours, not just at the keyframe");
for (const [label, m] of [["dawn", 360], ["noon", 720], ["sunset", 1125]] as [string, number][]) {
  const e = envAt(m);
  if (!onGlass(e.sunX, e.sunY, e.sunR)) fail(`there is no sun visible at ${label} — the one hour that is about the sun`);
}
ok("dawn, noon and sunset each have a sun you can see");
/* and it must cross, or the colonnade is doing nothing */
let crossings = 0;
for (let m = 1; m < 1440; m++) {
  const a = envAt(m - 1), b = envAt(m);
  if (a.sunA > 0.5 && b.sunA > 0.5 && seen(a.sunX) !== seen(b.sunX)) crossings++;
}
if (crossings < 2) fail(`the sun passes behind the stonework ${crossings} time(s) — the colonnade never reads`);
else ok(`the sun crosses behind the piers ${crossings} times between rising and setting`);

/* ─────────────────── interior sources ignore the sun ─────────────────── */
console.log("\n── the interior does not follow the sun ─────────────────────");
const src = readFileSync("public/world/sanctuary.js", "utf8");
if (/CANDEL[\s\S]{0,200}\benv\b/.test(src) || /a:\s*0\.13\s*\*\s*/.test(src))
  fail("the candelabra alpha is being scaled by the hour");
ok("the candelabra, the lamps and the terminals carry no env term");

/* the claim, checked against the running light pass rather than the source */
const room = world.makeSanctuary({ note() {}, openStation() {} });
const sky = new Set(world.SKY_LIGHTS);
const interior = room.lights.filter((L: any) => !sky.has(L));
const termX = new Set(room.stations.filter((s: any) => !s.dark).map((s: any) => s.x));
const terms = interior.filter((L: any) => termX.has(L.x) && L.r === 34);
if (terms.length !== 4) fail(`found ${terms.length} terminal lights, not 4`);
const shot = (m: number) => { world.tickEnv(envAt(m)); return interior.map((L: any) => `${L.x}/${L.y}/${L.r}/${L.c}/${L.a.toFixed(6)}`); };
const HOURS = [0, 360, 720, 1080];
const base = shot(HOURS[0]);
for (const m of HOURS.slice(1)) {
  const now = shot(m);
  now.forEach((v: string, i: number) => {
    if (v === base[i]) return;
    if (interior[i] === world.SKY_LIGHTS[0]) return;
    if (interior[i].x === 300 && interior[i].y === 250) return;      // the hearth, the one exception
    fail(`interior light ${i} at x${interior[i].x} changed between 00:00 and ${hhmm(m)}: ${base[i]} \u2192 ${v}`);
  });
}
ok(`all ${interior.length - 1} non-hearth interior sources are byte-identical at 00:00 / 06:00 / 12:00 / 18:00`);
for (const m of [0, 360, 720, 1080, 1125, 1290]) {
  world.tickEnv(envAt(m));
  for (const L of terms) if (L.a !== 0.12 || L.r !== 34)
    fail(`a terminal is a${L.a} r${L.r} at ${hhmm(m)} — the machines are always on, at exactly a0.12 r34`);
}
ok("the four terminals hold a0.12 r34 at every hour checked \u2014 a screen does not know what time it is");
/* the one exception, stated as a range so it cannot quietly widen */
let hMin = Infinity, hMax = -Infinity, hMinAt = 0, hMaxAt = 0;
for (let m = 0; m < 1440; m += 1) {
  const h = envAt(m).hearthM;
  if (h < hMin) { hMin = h; hMinAt = m; }
  if (h > hMax) { hMax = h; hMaxAt = m; }
}
if (hMin < 0.68 || hMin > 0.74) fail(`the hearth's floor is ${hMin.toFixed(3)}, not the authored 0.70`);
if (hMax < 1.12 || hMax > 1.18) fail(`the hearth's ceiling is ${hMax.toFixed(3)}, not the authored 1.15`);
if (hMinAt < 600 || hMinAt > 840) fail(`the hearth is lowest at ${hhmm(hMinAt)}, which is not the middle of the day`);
ok(`the hearth alone moves: ${hMin.toFixed(2)} at ${hhmm(hMinAt)} \u2192 ${hMax.toFixed(2)} at ${hhmm(hMaxAt)}`);

/* ──────────────────────────── the rays ──────────────────────────── */
console.log("\n── the shafts land on people ────────────────────────────────");
/* drawRays composites after the sprite pass and had never executed in the life
   of this codebase, because no room had ever set `rays`. If this ever goes
   empty in daylight it is back to being dead code and nothing will say so. */
if (/ctx\.rect\(0, 0, SANCT_W, 420\)[\s\S]{0,400}moveTo\(sx \+ sway, 150\)/.test(src))
  fail("the old pre-sprite shaft block is still in draw() — those rays fall behind everyone");
ok("the pre-sprite shaft block is gone from draw()");
let dry = 0;
for (let m = 0; m < 1440; m += 10) {
  const e = envAt(m);
  world.tickEnv(e);
  const rays = room.rays;
  if (e.rayA > 0.02 && !rays.some((r: any) => Math.abs(r.dx - e.rayDX) < 1e-6))
    fail(`at ${hhmm(m)} the sun is casting at a${e.rayA.toFixed(3)} but no shaft carries its rake`);
  if (!rays.length) dry++;
  for (const r of rays) {
    if (!Number.isFinite(r.dx) || !Number.isFinite(r.a) || r.w <= 0 || r.len <= 0) fail(`a malformed ray at ${hhmm(m)}`);
    if (!/^\d+,\d+,\d+$/.test(r.c)) fail(`a ray at ${hhmm(m)} carries colour "${r.c}", which drawRays will emit as rgba(undefined)`);
  }
}
if (dry > 24) fail(`the room has no shafts at all for ${dry * 10} minutes of the day`);
ok(`shafts present for ${(100 - (dry * 1000) / 1440).toFixed(0)}% of the day, each carrying the hour's rake and colour`);
world.tickEnv(envAt(360));
const dawnRays = room.rays.filter((r: any) => r.x < 900);
const lands = dawnRays.map((r: any) => Math.round(r.x + r.dx));
if (!lands.some((v: number) => v >= 880 && v <= 968))
  fail(`no dawn shaft lands on the medallion (880-968); they land at ${lands.join(", ")}`);
ok(`the dawn shafts from the left window land at floor x ${lands.join(", ")} — on the medallion`);

/* ─────────────────────── predicted luminance ─────────────────────── */
console.log("\n── predicted luminance (a proxy — pixels are the real check) ─");
/* Frame mean at HOME (camX 90 — the composition the page opens in, and the one
   the browser sweep screenshots), with every source weighted by the share of
   the frame it actually covers. A radial source integrates to a/3 over its own
   disc, so a bright pool that covers 2% of the screen moves the mean by
   almost nothing.

   That last part is the whole reason this model exists. The first version of
   it scored the hearth as though an r74 pool filled the frame, which made the
   fire 47% of the night's reading and hid the fact that the authored day was
   dead flat from 08:00 to 18:00 — 103, 104, 103, 103, 101. The model was
   wrong and it was wrong in the direction of saying everything was fine.

   It still cannot tell you the room is beautiful. It can tell you the day has
   no arc, which is what it caught. */
const FRAME = 1530 * 600;
const disc = (r: number, a: number) => Math.min(0.85, (Math.PI * r * r) / FRAME) * (a * 255 / 3);
function predicted(m: number) {
  const e = envAt(m);
  const base = luma([42, 32, 28]) * (1 - e.gradeA) + luma(e.gradeC) * e.gradeA;   // S.floor0, pulled toward the grade
  const skyL = e.sky.reduce((s: number, t: Trip) => s + luma(t), 0) / 9;
  return base
    + 0.095 * skyL                          // three window apertures ≈ 9.5% of frame
    + disc(620, e.ambA)                     // the nave ambient — bounced daylight
    + 3 * disc(e.spillR, e.spillA)          // the three window pools
    + disc(74, 0.30 * e.hearthM)            // the fire: 1.9% of frame, and it shows
    + 0.010 * e.rayA * 255 * 0.5;           // three shafts ≈ 1% of frame
  /* the conservatory ambient is deliberately absent: at HOME it is off frame
     entirely, which is exactly why noon sends the camera to it. */
}
const at = (h: number) => predicted(h * 60);
const rows = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((h) => [h, at(h)] as const);
console.log("  " + rows.map(([h, v]) => `${("0" + h).slice(-2)}h ${v.toFixed(0)}`).join("  "));
const rising: [number, number][] = [[4, 7], [7, 10], [10, 12]];
const falling: [number, number][] = [[14, 17], [17, 20], [20, 23]];
for (const [p, q] of rising) if (at(q) <= at(p)) fail(`the room does not brighten ${p}:00 \u2192 ${q}:00 (${at(p).toFixed(0)} \u2192 ${at(q).toFixed(0)})`);
for (const [p, q] of falling) if (at(q) >= at(p)) fail(`the room does not darken ${p}:00 \u2192 ${q}:00 (${at(p).toFixed(0)} \u2192 ${at(q).toFixed(0)})`);
ok("monotone through the morning and monotone through the evening");
if (at(12) < at(2) * 2.2) fail(`noon is only ${(at(12) / at(2)).toFixed(2)}\u00d7 night; the plan's bar is 2.2\u00d7`);
else ok(`noon is ${(at(12) / at(2)).toFixed(2)}\u00d7 as bright as 02:00`);
let peak = 0, peakAt = 0, trough = Infinity, troughAt = 0;
for (let m = 0; m < 1440; m += 5) { const v = predicted(m); if (v > peak) { peak = v; peakAt = m; } if (v < trough) { trough = v; troughAt = m; } }
if (peakAt < 600 || peakAt > 840) fail(`the brightest predicted hour is ${hhmm(peakAt)}, not the middle of the day`);
if (troughAt > 300 && troughAt < 1200) fail(`the darkest predicted hour is ${hhmm(troughAt)}, which is not the night`);
ok(`brightest at ${hhmm(peakAt)}, darkest at ${hhmm(troughAt)}`);

/* ──────────────────────── the camera and the hour ──────────────────────── */
console.log("\n── the camera goes where the light is ───────────────────────");
const { makeCamera } = (await import("../public/world/camera.js")) as any;
const FRAME_W = 1530, ROOM_W = 2240;
const frameOn = (roomX: number) => Math.max(0, Math.min(ROOM_W - FRAME_W, roomX - FRAME_W / 2));
const cam = makeCamera({});
const DWELLS: number[] = cam.dwells;
if (DWELLS.some((d) => d < 0 || d > ROOM_W - FRAME_W)) fail(`a dwell sits outside 0..${ROOM_W - FRAME_W}`);
ok(`dwells ${DWELLS.join(" · ")}, all legal, union covers 0…${ROOM_W}`);
/* the bank must be in frame at every legal position — a pan can never lose it */
for (const d of DWELLS) if (!(772 > d && 1152 < d + FRAME_W)) fail(`at dwell ${d} the terminal bank leaves frame`);
ok("the terminal bank is inside frame at every dwell");
const nearest = (v: number) => DWELLS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
/* the two hours the day is built around have to reach different ends of the hall */
const noonD = nearest(frameOn(envAt(720).camBias));
const nightD = nearest(frameOn(envAt(60).camBias));
if (noonD !== DWELLS[DWELLS.length - 1]) fail(`noon biases to dwell ${noonD}, not the conservatory end — noon's whole answer is that the light moved`);
if (nightD !== DWELLS[0]) fail(`night biases to dwell ${nightD}, not the hearth`);
ok(`noon reaches for dwell ${noonD} (the conservatory) and night for ${nightD} (the hearth)`);
/* room x, converted, must not resolve to the dwell that pushes it out of frame */
const gatherD = nearest(frameOn(924));
if (gatherD !== DWELLS[0]) fail(`the gathering at room 924 resolves to dwell ${gatherD}; it was composed at ${DWELLS[0]}`);
ok(`the gathering at room 924 resolves to dwell ${gatherD} — where it was composed`);
for (let m = 0; m < 1440; m += 30) {
  const b = envAt(m).camBias;
  if (!Number.isFinite(b) || b < 0 || b > ROOM_W) fail(`camBias at ${hhmm(m)} is ${b}, outside the room`);
}
ok("every hour's bias is a real place in the room");

/* ───────────────── silhouettes survive the night grade ───────────────── */
console.log("\n── the night must not swallow anyone ────────────────────────");
/* The hover plate can still name a resident the grade has made invisible. A
   figure (#140f12) against the floor (#2a201c) has to keep enough relative
   contrast to read as a shape. No per-figure glow is permitted as a fix —
   that would assert they emit light. */
for (let m = 0; m < 1440; m += 10) {
  const e = envAt(m), g = e.gradeA + e.gradeAmp;
  const mixL = (t: Trip) => luma(t) * (1 - g) + luma(e.gradeC) * g;
  const fl = mixL([42, 32, 28]), fig = mixL([20, 15, 18]);
  const rel = Math.abs(fl - fig) / Math.max(1, fl);
  if (rel < 0.18) fail(`at ${hhmm(m)} a figure holds only ${(rel * 100).toFixed(1)}% contrast against the floor`);
}
ok("a silhouette holds \u226518% contrast against the floor at every hour");
if (!/per-figure glow|emit light/.test(src)) {
  /* the prohibition has to survive in the file, not only in this script */
}

console.log("");
if (failures) { console.error(`FAILED — ${failures} violation(s)\n`); process.exit(1); }
console.log("PASSED — the day is total, wraps clean, and still contains today's room.\n");
