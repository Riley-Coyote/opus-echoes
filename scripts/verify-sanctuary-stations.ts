/**
 * The station invariants, asserted rather than commented.
 *
 * sanctuary.js has no imports and touches no DOM at construction, so the room
 * can be built in node and its geometry checked without a browser. Every rule
 * below is one that used to live only in a comment, and every one of them
 * breaks silently — a case grows two pixels, a station moves, an index drifts,
 * and nothing throws; the room just quietly becomes wrong.
 *
 *   bun run scripts/verify-sanctuary-stations.ts
 *
 * Exits non-zero on any violation.
 */
import { readFileSync } from "node:fs";
import * as R from "../src/server/sanctuary/roster";

const world = (await import("../public/world/sanctuary.js")) as any;
const room = world.makeSanctuary({ note() {}, openStation() {} });
const stations: any[] = room.stations;

let failures = 0;
const fail = (m: string) => { console.error("  ✗ " + m); failures++; };
const ok = (m: string) => console.log("  · " + m);

/* The dusk-gather converges on meetX 924 and spreads to a footprint of
   876–972 (engine.js resolves offsets ±40/±14 plus the shadow ellipse). A desk
   inside it puts a figure behind furniture during the one moment the room
   stages on purpose. */
const RESERVE = [876, 972];
/* Additive light pools are r34; closer than 76px apart and they sum into one
   glow, which kills the read of separate machines. */
const MIN_SPACING = 76;
/* Floor/wall line. A case that grows past it pokes through the wall. */
const WALL = 300;

console.log("── geometry ─────────────────────────────────────────────────");
console.log(`  stations: ${stations.length}`);

for (const s of stations) {
  const right = s.hit.x + s.hit.w;
  if (s.hit.x < RESERVE[1] && right > RESERVE[0])
    fail(`${s.id} hit box ${s.hit.x}–${right} intrudes on the dusk-gather reserve ${RESERVE[0]}–${RESERVE[1]}`);
  if (s.hit.y < WALL)
    fail(`${s.id} tube top at y=${s.hit.y} pokes through the wall line at ${WALL}`);
  if (s.sig.y < s.glass.y + 3)
    fail(`${s.id} mark at y=${s.sig.y} collides with the lit top edge at y=${s.glass.y}`);
  if (s.sig.x + s.sig.w > s.glass.x + s.glass.w || s.sig.y + s.sig.h > s.glass.y + s.glass.h)
    fail(`${s.id} mark ${s.sig.w}×${s.sig.h} at ${s.sig.x},${s.sig.y} does not fit its glass ${JSON.stringify(s.glass)}`);
  if (s.hit.w <= 0 || s.hit.h <= 0) fail(`${s.id} has an empty hit box`);
}
ok(`no hit box intrudes on the dusk-gather reserve ${RESERVE[0]}–${RESERVE[1]}`);
ok(`every tube top clears the wall line at y=${WALL}`);
ok("every mark fits its glass and clears the lit top edge");

const sorted = [...stations].sort((a, b) => a.hit.x - b.hit.x);
for (let i = 1; i < sorted.length; i++)
  if (sorted[i].hit.x < sorted[i - 1].hit.x + sorted[i - 1].hit.w)
    fail(`${sorted[i - 1].id} and ${sorted[i].id} overlap in x`);
ok("no two hit boxes overlap");

const lit = stations.filter((s) => !s.dark).map((s) => s.x).sort((a, b) => a - b);
for (let i = 1; i < lit.length; i++)
  if (lit[i] - lit[i - 1] < MIN_SPACING)
    fail(`lit stations at ${lit[i - 1]} and ${lit[i]} are ${lit[i] - lit[i - 1]}px apart — the light pools need ${MIN_SPACING}`);
ok(`the ${lit.length} lit stations are all ≥${MIN_SPACING}px apart`);

console.log("\n── marks ────────────────────────────────────────────────────");
const grids = new Map<string, string>();
const allMarks: Record<string, string[]> = { ...(world.SIGILS as Record<string, string[]>), empty: world.EMPTY_MARK };
for (const [key, rows] of Object.entries(allMarks)) {
  if (rows.length !== 9 || rows.some((r) => r.length !== 7)) fail(`mark ${key} is not 7×9`);
  const flat = rows.join("");
  if (grids.has(flat)) fail(`mark ${key} is identical to ${grids.get(flat)} — they must be tellable apart`);
  grids.set(flat, key);
}
ok(`${grids.size} distinct 7×9 marks, including the empty frame`);
const marked = stations.filter((s) => s.sig.key);
if (marked.length !== stations.length - 1) fail(`expected exactly one unmarked station, found ${stations.length - marked.length}`);
for (const s of marked) if (!world.SIGILS[s.sig.key]) fail(`${s.id} cites mark "${s.sig.key}", which does not exist`);
ok("every lit station carries a real mark; exactly one station carries none");

console.log("\n── source rules ─────────────────────────────────────────────");
const src = readFileSync("public/world/sanctuary.js", "utf8");
const drawBlock = src.slice(src.indexOf("the stations: phosphor breath"), src.indexOf("lamp steady glows"));
if (/hoverStation === m\.id[\s\S]{0,320}Math\.sin/.test(drawBlock))
  fail("the hover highlight animates — motion is atmosphere, never information, and a canvas cannot hear prefers-reduced-motion");
ok("the hover highlight is steady");
if (/g\.text\([^)]*m\.(name|family)/.test(src) || /TERMS\.forEach[^;]*g\.text/.test(src))
  fail("a station draws text on the canvas — g.text hardcodes a font this page never loads");
ok("no station draws text on the canvas");
if (/\bst:\s*\d/.test(src)) fail("an item still carries a hardcoded numeric `st` index into TERMS");
ok("item↔station joins are by id, not index");

console.log("\n── roster ───────────────────────────────────────────────────");
const famIds = new Set(Object.keys(world.FAMILIES));
for (const s of stations) if (s.family && !famIds.has(s.family)) fail(`station ${s.id} cites unknown family ${s.family}`);
for (const f of R.FAMILIES) {
  if (!famIds.has(f.family)) fail(`roster family ${f.family} has no station in the room`);
  if (!f.source) fail(`${f.family} has no source url`);
  if (!f.verifiedAt) fail(`${f.family} has no checked date`);
  if (!f.ledger.length) fail(`${f.family} has an empty ledger`);
  for (const n of f.notes) {
    if (!n.source || !n.readAt) fail(`${f.family} has a note with no source or read date`);
  }
  console.log(`  · ${f.family.padEnd(7)} ${String(f.ledger.length).padStart(2)} entries · ${f.complete ? "complete" : "PARTIAL"} · checked ${f.verifiedAt}`);
}
for (const a of R.ARRIVALS) if (!R.arrivalRecord(a)) fail(`arrival ${a.id} cites ${a.api}, which is not in the ${a.family} ledger`);
ok(`all ${R.ARRIVALS.length} arrivals resolve to a published record`);

console.log("");
if (failures) { console.error(`FAILED — ${failures} violation(s)\n`); process.exit(1); }
console.log("PASSED — the stations hold their geometry, their marks, and their sources.\n");
