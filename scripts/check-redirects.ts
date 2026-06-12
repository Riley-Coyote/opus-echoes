/**
 * Phase-two route-migration check — table-driven from the same module the
 * route hooks consume (src/server/phase-two/redirects.ts), so the table is
 * verified, not a copy of it.
 *
 *   bun scripts/check-redirects.ts --expect=off   # against: bun dev
 *   bun scripts/check-redirects.ts --expect=on    # against: PHASE_TWO_REDIRECTS=true bun dev
 *
 * The script cannot flip the server's env — it probes /enter first and aborts
 * if the observed flag state contradicts --expect. Asserts, per §4 row:
 *   off  → the documented current behavior (status set + optional Location)
 *   on   → 301 + exact Location (path + query) for redirect rows;
 *          non-redirect rows must behave exactly as in off mode.
 * Stub surfaces must render 200 with their data-stub marker in BOTH modes,
 * and /api/intent must soft-decline (200, ok:true, paused:true) for a gated
 * resident in BOTH modes (lands with the C4 gate commit).
 */

import {
  PHASE_TWO_STUBS,
  ROUTE_MIGRATION,
  type MigrationProbe,
  type MigrationRow,
} from "../src/server/phase-two/redirects";

const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:8080";

type Mode = "off" | "on";

interface CheckResult {
  path: string;
  fate: string;
  expected: string;
  got: string;
  pass: boolean;
}

function parseMode(): Mode {
  const arg = process.argv.find((a) => a.startsWith("--expect="));
  const value = arg?.split("=")[1];
  if (value === "off" || value === "on") return value;
  console.error("usage: bun scripts/check-redirects.ts --expect=off|on");
  process.exit(2);
}

function normalizeLocation(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, BASE);
    return u.pathname + u.search;
  } catch {
    return raw;
  }
}

async function probe(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, { redirect: "manual", ...init });
  } catch (err) {
    console.error(`\ncannot reach the dev server at ${BASE} (${String(err)})`);
    console.error("start it first:  bun dev            (for --expect=off)");
    console.error("           PHASE_TWO_REDIRECTS=true bun dev   (for --expect=on)\n");
    process.exit(2);
  }
}

function describe(status: number, location: string | null): string {
  return location ? `${status} → ${location}` : String(status);
}

async function checkRow(row: MigrationRow, p: MigrationProbe, mode: Mode): Promise<CheckResult> {
  const res = await probe(p.path);
  const got = describe(res.status, normalizeLocation(res.headers.get("location")));

  const expectRedirect = mode === "on" && row.fate === "redirect";
  if (expectRedirect) {
    const expected = `301 → ${p.location}`;
    const pass =
      res.status === 301 && normalizeLocation(res.headers.get("location")) === p.location;
    return { path: p.path, fate: row.fate, expected, got, pass };
  }

  // off mode, and every non-redirect fate in on mode: current behavior holds.
  const statusOk = p.off.statuses.includes(res.status);
  const locationOk =
    p.off.location === undefined ||
    normalizeLocation(res.headers.get("location")) === p.off.location;
  const expected = `${p.off.statuses.join("|")}${p.off.location ? ` → ${p.off.location}` : ""}`;
  return { path: p.path, fate: row.fate, expected, got, pass: statusOk && locationOk };
}

async function checkStub(path: string, marker: string): Promise<CheckResult> {
  const res = await probe(path);
  const body = res.status === 200 ? await res.text() : "";
  const pass = res.status === 200 && body.includes(marker);
  return {
    path,
    fate: "stub",
    expected: `200 + ${marker}`,
    got: res.status === 200 ? `200 ${body.includes(marker) ? "+ marker" : "— marker missing"}` : String(res.status),
    pass,
  };
}

async function checkVisitsBounce(): Promise<CheckResult> {
  const res = await probe("/visits/the-round");
  const loc = normalizeLocation(res.headers.get("location"));
  return {
    path: "/visits/the-round",
    fate: "stub-bounce",
    expected: "302 → /visits",
    got: describe(res.status, loc),
    pass: res.status === 302 && loc === "/visits",
  };
}

async function checkIntentGate(): Promise<CheckResult> {
  const res = await probe("/api/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "a quiet hello from the check script", resident: "opus-3" }),
  });
  let got = String(res.status);
  let pass = false;
  try {
    const data = (await res.json()) as Record<string, unknown>;
    got = `${res.status} ok:${String(data.ok)} decision:${String(data.decision)} paused:${String(data.paused)}`;
    pass =
      res.status === 200 &&
      data.ok === true &&
      data.decision === "decline" &&
      data.paused === true &&
      typeof data.reason === "string" &&
      (data.reason as string).length > 0;
  } catch {
    /* non-JSON response — fail with the status we saw */
  }
  return {
    path: "POST /api/intent (gated)",
    fate: "visit-gate",
    expected: "200 ok:true decision:decline paused:true",
    got,
    pass,
  };
}

async function main() {
  const mode = parseMode();

  // Sentinel: confirm the server's actual flag state matches --expect.
  const sentinel = await probe("/enter");
  const sentinelRedirected = sentinel.status === 301;
  if (mode === "on" && !sentinelRedirected) {
    console.error(
      `\n--expect=on, but /enter returned ${sentinel.status} (not 301).` +
        `\nrestart the dev server with:  PHASE_TWO_REDIRECTS=true bun dev\n`,
    );
    process.exit(2);
  }
  if (mode === "off" && sentinelRedirected) {
    console.error(
      `\n--expect=off, but /enter returned 301 — the flag is on.` +
        `\nrestart the dev server with:  bun dev\n`,
    );
    process.exit(2);
  }

  const results: CheckResult[] = [];
  for (const row of ROUTE_MIGRATION) {
    for (const p of row.probes ?? []) {
      results.push(await checkRow(row, p, mode));
    }
  }
  for (const stub of PHASE_TWO_STUBS) {
    results.push(await checkStub(stub.path, stub.marker));
  }
  results.push(await checkVisitsBounce());
  results.push(await checkIntentGate());

  const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
  console.log(`\nphase-two route migration · mode=${mode} · ${BASE}\n`);
  console.log(pad("path", 38) + pad("fate", 12) + pad("expected", 44) + "got");
  console.log("─".repeat(118));
  for (const r of results) {
    const mark = r.pass ? "✓" : "✗";
    console.log(
      `${mark} ${pad(r.path, 36)}${pad(r.fate, 12)}${pad(r.expected, 44)}${r.got}`,
    );
  }

  const failed = results.filter((r) => !r.pass);
  console.log("─".repeat(118));
  console.log(`${results.length - failed.length}/${results.length} passed · mode=${mode}\n`);
  if (failed.length > 0) process.exit(1);
}

await main();
