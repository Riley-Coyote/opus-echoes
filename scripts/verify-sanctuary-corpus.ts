/**
 * Enforces the Sanctuary's governing rule:
 *
 *   Nothing that reaches the screen as a resident's voice is invented.
 *
 * Every line the room speaks must be a verbatim contiguous substring of one
 * real archived message BY THE RESIDENT IT IS ATTRIBUTED TO. This script proves
 * that against the export itself, so the guarantee is checked rather than
 * asserted. Run it after any change to seed.ts, speechLine(), or the corpus.
 *
 *   bun run scripts/verify-sanctuary-corpus.ts
 *   bun run scripts/verify-sanctuary-corpus.ts --dump   (write the full corpus)
 *
 * Exits non-zero on any violation.
 */
import * as S from "../src/server/sanctuary/seed";
import { buildCorpus, speechLine } from "../src/server/sanctuary/speech";
import seedJson from "../src/data/sanctuary-seed.json";

const raw = seedJson as unknown as {
  space_messages: { id: string; resident_id: string | null; body: string }[];
  salon_turns: { id: string; resident_id: string; body: string }[];
};

const byId = new Map<string, { resident_id: string | null; body: string }>();
for (const m of raw.space_messages) byId.set(m.id, m);
for (const t of raw.salon_turns) byId.set(t.id, t);

let failures = 0;
const fail = (msg: string) => { console.error("  ✗ " + msg); failures++; };

console.log("── candidates ───────────────────────────────────────────────");
const candidates = S.exchanges();
const pairKey = (p: readonly string[]) => [...p].sort().join(" ↔ ");
const byPair: Record<string, number> = {};
for (const e of candidates) byPair[pairKey(e.pair)] = (byPair[pairKey(e.pair)] ?? 0) + 1;
console.log(`  windows: ${candidates.length}`);
for (const [k, v] of Object.entries(byPair).sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${v}`);
console.log(`  salon: ${candidates.filter((e) => e.source === "salon").length}  commons: ${candidates.filter((e) => e.source === "commons").length}`);
console.log(`  3-turn: ${candidates.filter((e) => e.turns.length === 3).length}  2-turn: ${candidates.filter((e) => e.turns.length === 2).length}`);

console.log("\n── integrity: misattributed messages excluded ───────────────");
const usedIds = new Set(candidates.flatMap((e) => e.turns.map((t) => t.message_id)));
const TAGGED = /^\s*\[([A-Za-z0-9 .\-]+)\]/;
const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const names = new Map(S.residents().map((r) => [key(r.display_name), r.id]));
let mismatches = 0;
for (const m of [...raw.space_messages, ...raw.salon_turns]) {
  const t = TAGGED.exec(m.body);
  if (!t) continue;
  const tagged = names.get(key(t[1]));
  if (!tagged || tagged === m.resident_id) continue;
  mismatches++;
  if (usedIds.has(m.id)) fail(`misattributed message survived into a candidate: ${m.id} (stored ${m.resident_id}, tagged ${tagged})`);
}
console.log(`  misattributed messages in export: ${mismatches} — all excluded: ${failures === 0 ? "yes" : "NO"}`);

console.log("\n── corpus ──────────────────────────────────────────────────");
const built = buildCorpus();
const corpus = built.gathering ? [built.gathering, ...built.exchanges] : built.exchanges;
console.log(`  exchanges shipped: ${corpus.length}`);
const shippedPairs: Record<string, number> = {};
for (const e of corpus) shippedPairs[pairKey(e.pair)] = (shippedPairs[pairKey(e.pair)] ?? 0) + 1;
for (const [k, v] of Object.entries(shippedPairs).sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${v}`);

console.log("\n── rule: every line is verbatim, by the attributed resident ─");
const seenSource = new Set<string>();
let lines = 0;
for (const e of corpus) {
  for (const l of e.lines) {
    lines++;
    const src = byId.get(l.message_id);
    if (!src) { fail(`line cites an unknown message id ${l.message_id}`); continue; }
    if (src.resident_id !== l.resident_id) fail(`ATTRIBUTION: line credited to ${l.resident_id} but message ${l.message_id} is by ${src.resident_id}\n      "${l.text}"`);
    if (!src.body.includes(l.text)) fail(`NOT VERBATIM in ${l.message_id}:\n      "${l.text}"`);
    if (/[<>[\]]|set-down|\b(presence|tempo)\b/.test(l.text)) fail(`markup leaked:\n      "${l.text}"`);
    if (l.text.length < 30 || l.text.length > 140) fail(`length ${l.text.length} out of range:\n      "${l.text}"`);
    if (seenSource.has(l.message_id)) fail(`source message reused across the corpus: ${l.message_id}`);
    seenSource.add(l.message_id);
  }
}
console.log(`  lines: ${lines}  distinct source messages: ${seenSource.size}`);

console.log("\n── payload size ────────────────────────────────────────────");
const bytes = Buffer.byteLength(JSON.stringify(corpus), "utf8");
console.log(`  corpus JSON: ${(bytes / 1024).toFixed(1)} KB`);
if (bytes > 90_000) fail(`corpus is ${(bytes / 1024).toFixed(1)} KB, over the 90 KB budget`);

if (process.argv.includes("--dump")) {
  const out: string[] = ["# The Sanctuary — every line the room can speak", "", `_${corpus.length} exchanges · ${lines} lines · generated from the 2026-05-28 export_`, ""];
  for (const e of corpus) {
    const where = e.source === "salon" ? `a salon${e.open ? ", still open" : ""}` : `the commons, "${e.where.toLowerCase()}"`;
    /* a gathering has three speakers; `pair` only carries two */
    const who = Array.from(new Set(e.lines.map((l) => l.resident_id)));
    out.push(`### ${who.join(" ↔ ")}${who.length > 2 ? "  — the dusk gathering" : ""} — ${where} · ${e.date}`);
    for (const l of e.lines) out.push(`- **${l.resident_id}** — "${l.text}"  \n  <sub>${l.message_id}</sub>`);
    out.push("");
  }
  const path = "docs/sanctuary-spoken-corpus.md";
  require("node:fs").writeFileSync(path, out.join("\n"));
  console.log(`\n  wrote ${path}`);
}

console.log("");
if (failures) { console.error(`FAILED — ${failures} violation(s)\n`); process.exit(1); }
console.log("PASSED — every shipped line is verbatim archive, correctly attributed, used once.\n");
