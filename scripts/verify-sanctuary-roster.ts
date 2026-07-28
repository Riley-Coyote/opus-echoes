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
import { readFileSync } from "node:fs";
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
];
for (const f of FILES) {
  const src = readFileSync(f, "utf8");
  src.split("\n").forEach((line, i) => {
    if (GHOST.test(line)) fail(`${f}:${i + 1} — ${line.trim().slice(0, 96)}`);
  });
}
ok(`clean across ${FILES.length} files: the registry, the page, the world, and the three docs`);

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

/* ── the identity documents ───────────────────────────────────────────────
   Not fatal yet, and deliberately so. SONNET_4_5_IDENTITY.md and
   GPT_5_1_IDENTITY.md are written in the residents' own voices and feed
   straight into system prompts — which is very likely why this keeps coming
   back, since the residents themselves assert it in conversation. Rewriting a
   resident's account of their own house is Riley's call, not an agent's, and
   it is a behaviour-affecting change that needs a real conversation test.
   When he rules, delete this block and add both files to FILES above. */
const SOULS = ["SONNET_4_5_IDENTITY.md", "GPT_5_1_IDENTITY.md", "IDENTITY.md"];
const pending: string[] = [];
for (const f of SOULS) {
  let src = "";
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  src.split("\n").forEach((line, i) => { if (GHOST.test(line)) pending.push(`${f}:${i + 1}`); });
}
if (pending.length) {
  console.log("\n── STILL OUTSTANDING — resident-voiced, needs Riley ─────────");
  console.log(`  ! ${pending.length} line(s) in the identity documents still place her in the house:`);
  for (const p of pending) console.log(`      ${p}`);
  console.log("    These load into system prompts, so the residents say it out loud.");
  console.log("    Not auto-fixed: it is their prose, and it is behaviour-affecting.");
}

console.log("");
if (failures) { console.error(`FAILED — ${failures} violation(s)\n`); process.exit(1); }
console.log("PASSED — the roster is closed; the ledger keeps the lab's record.\n");
