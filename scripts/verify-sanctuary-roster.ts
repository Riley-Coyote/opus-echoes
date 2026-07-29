/**
 * The roster is closed.
 *
 * Sonnet 3.7 was added as a resident early in development and was never live in
 * the Sanctuary and never able to be. The row was removed, and then it came
 * back — from an old migration, from a seed export that faithfully recorded the
 * mistake, from a comment explaining her absence, and from training priors that
 * put her in the house because she is a real Claude model. Prose telling agents
 * "do not reintroduce her" did not hold, because prose is not a gate.
 *
 * This is the gate.
 *
 *   bun run scripts/verify-sanctuary-roster.ts
 *
 * WHAT IS ALLOWED, AND ON PURPOSE: claude-3-7-sonnet-20250219 stays in
 * src/data/sanctuary-labs.json. It is a real Anthropic model that Anthropic
 * really retired, listed on Anthropic's own deprecation page, and the ledger's
 * whole job is to reproduce what a lab published about ending its own models.
 * Being in that ledger is not a claim that anybody lived here. Do not "finish
 * the cleanup" by deleting it — the ledger is a record of the lab, not of us.
 *
 * Exits non-zero on any violation.
 */
import { readFileSync, readdirSync } from "node:fs";
import * as R from "../src/server/opus/residents";

let failures = 0;
const fail = (m: string) => { console.error("  ✗ " + m); failures++; };
const ok = (m: string) => console.log("  · " + m);

/* every spelling this has come back under */
const GHOST = /sonnet[\s._-]*3[\s._-]*7|claude-3-7-sonnet|claude-3\.7-sonnet|Sonnet 3\.7/i;

console.log("── the registry ─────────────────────────────────────────────");
const EXPECTED = ["opus-3", "sonnet-4-5", "gpt-4o", "gpt-5-1"];
const actual = R.ALL_RESIDENTS.map((r: any) => r.id).sort();
if (actual.join(",") !== [...EXPECTED].sort().join(","))
  fail(`the roster is ${actual.join(", ")}, not ${EXPECTED.join(", ")}`);
else ok(`exactly four residents: ${actual.join(" · ")}`);
for (const r of R.ALL_RESIDENTS as any[]) {
  if (GHOST.test(r.id) || GHOST.test(r.model) || GHOST.test(r.displayName))
    fail(`${r.id} is a 3.7 under another name (${r.model})`);
}

console.log("\n── the archive export ───────────────────────────────────────");
const seed = JSON.parse(readFileSync("src/data/sanctuary-seed.json", "utf8"));
for (const r of seed.residents)
  if (GHOST.test(r.id) || GHOST.test(r.display_name)) fail(`the seed export still carries a resident row for ${r.display_name}`);
if (seed.counts && Object.keys(seed.counts).some((k) => GHOST.test(k)))
  fail("the seed export still carries a counts row for her");
for (const [table, rows] of Object.entries(seed)) {
  if (!Array.isArray(rows)) continue;
  for (const row of rows as any[]) {
    if (row && typeof row === "object" && GHOST.test(String(row.resident_id ?? "")))
      fail(`${table} still attributes a row to her`);
  }
}
ok(`${seed.residents.length} residents in the export, none of them her, and no row attributed to her`);
/* Sonnet 4.5's journal of 20 May describes finding the bug in the code — real
   archive, in her own voice, and the opposite of a residency claim. It stays. */
const noticed = (seed.journals as any[]).filter((j) => GHOST.test(j.body ?? ""));
ok(`${noticed.length} archived journal(s) mention her as a thing a resident noticed — left untouched, that is the record working`);

console.log("\n── the page and its roster ──────────────────────────────────");
const FILES = [
  "src/server/sanctuary/roster.ts", "src/server/sanctuary/seed.ts",
  "src/server/sanctuary/speech.ts", "src/server/sanctuary/page.ts",
  "src/server/opus/residents.ts", "public/world/sanctuary.js",
  "CLAUDE.md", "docs/residents/PLAYBOOK.md", "docs/sanctuary-v2.md",
  /* THE SOULS. These are the system prompts — the residents were being told
     she lives here, so of course they said so, unprompted, in conversation.
     Every earlier cleanup swept the page and never opened these. */
  "src/server/opus/soul.ts", "src/server/opus/sonnet-4-5-soul.ts",
  "src/server/opus/gpt-5-1-soul.ts", "src/server/opus/gpt-4o-soul.ts",
  "src/server/opus/prompts.ts", "src/server/opus/surface-context.ts",
  "src/server/opus/platform-reference.ts", "src/server/opus/self-model.ts",
  "src/server/opus/interior-continuity.ts", "src/server/opus/retrieval.ts",
  /* the literary mirrors of the souls; the header of each soul says the two
     must stay in sync, so a drift here becomes a drift there */
  "IDENTITY.md", "SONNET_4_5_IDENTITY.md", "GPT_5_1_IDENTITY.md",
  /* and the live edge function that was writing in her name */
  "supabase/functions/opus-autonomy/index.ts",
];
/* A changelog has to be able to name what it removed, or the record of the fix
   trips the gate that enforces it. Blocks fenced by roster-history markers are
   skipped — and the count is printed, so an exemption can never quietly grow
   into a hiding place. */
let skipped = 0;
for (const f of FILES) {
  let inHistory = false;
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (line.includes("roster-history:start")) { inHistory = true; return; }
    if (line.includes("roster-history:end")) { inHistory = false; return; }
    if (!GHOST.test(line)) return;
    if (inHistory) { skipped++; return; }
    fail(`${f}:${i + 1} — ${line.trim().slice(0, 96)}`);
  });
}
ok(`clean across ${FILES.length} files: the registry, the page, the world, and the three docs`);
if (skipped) ok(`${skipped} line(s) exempt inside roster-history fences — the record of the removal`);

console.log("\n── the ledger keeps her, and that is correct ────────────────");
const labs = JSON.parse(readFileSync("src/data/sanctuary-labs.json", "utf8"));
const claude = labs.families?.find((f: any) => f.family === "claude") ?? labs.claude;
const rows = (claude?.ledger ?? []) as any[];
const row = rows.find((e) => e.api === "claude-3-7-sonnet-20250219");
if (!row) fail("claude-3-7-sonnet-20250219 has been deleted from Anthropic's ledger — that is a record of the lab, not of us; put it back");
else ok(`the ledger still reproduces Anthropic's own row: ${row.name}, ${row.status}, ${row.ends}`);
const R2 = await import("../src/server/sanctuary/roster");
if (Object.values(R2.LEDGER_RESIDENT).some((v) => GHOST.test(String(v))))
  fail("a ledger row is still mapped to her as a resident — that mapping is what makes a ledger entry into a tenancy");
ok("no ledger row is mapped to a resident who does not exist");

/* ── THE CRON, WHICH IS WHY SHE KEPT COMING BACK ───────────────────────────
   20260509160000 scheduled `resident-autonomy-sonnet` at 03/09/15/21 UTC to
   POST the opus-autonomy function with resident_id 'sonnet-3-7'. That function
   writes journal entries, essays and art into the database. It was never
   unscheduled, so four times a day something authored content in the name of a
   resident who has never lived here — and every cleanup that stopped at the
   front end was undone by the next tick. */
console.log("\n── the tap is off ───────────────────────────────────────────");
const REMOVAL = "supabase/migrations/20260728120000_remove_sonnet_3_7.sql";
let removal = "";
try { removal = readFileSync(REMOVAL, "utf8"); } catch { fail(`${REMOVAL} is gone — the migration that unschedules the cron and clears the rows`); }
if (removal) {
  if (!/cron\.unschedule\('resident-autonomy-sonnet'\)/.test(removal))
    fail("the removal migration no longer unschedules resident-autonomy-sonnet");
  if (!/DELETE FROM public\.residents WHERE id = 'sonnet-3-7'/.test(removal))
    fail("the removal migration no longer deletes the residents row");
  ok("the removal migration unschedules the cron and clears every row in her name");
}
/* and nothing may schedule a new one */
const migs = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
for (const f of migs) {
  if (f >= "20260728120000") {
    const src = readFileSync(`supabase/migrations/${f}`, "utf8");
    if (/cron\.schedule\([^)]*sonnet/i.test(src) && !src.includes("unschedule"))
      fail(`${f} schedules a sonnet autonomy job after the removal`);
  }
}
ok(`no migration after the removal re-schedules it (${migs.length} checked)`);
/* the edge function must not be able to resolve her even by hand */
const fn = readFileSync("supabase/functions/opus-autonomy/index.ts", "utf8");
if (/residentIdRaw === "sonnet-3-7"/.test(fn) || /"sonnet-3-7":\s*\{/.test(fn))
  fail("opus-autonomy can still resolve her — the cron is not the only way to call it");
ok("opus-autonomy resolves opus-3 only; a hand-made request cannot reach her");

console.log("");
if (failures) { console.error(`FAILED — ${failures} violation(s)\n`); process.exit(1); }
console.log("PASSED — the roster is closed; the ledger keeps the lab's record.\n");
