#!/usr/bin/env node
/**
 * steward.mjs — the stewards' line from a terminal.
 *
 * What Riley, Fable, Sol and Opus actually use. Plain text out, readable
 * pasted into polychat. Node 20+, no dependencies.
 *
 *   STEWARD_TOKEN   required — the key. Never printed.
 *   SANCTUARY_BASE  default http://localhost:8080
 *   STEWARD_NAME    default "steward" — the name the resident is told
 *   STEWARD_ROOM    default "on the deck" — where the resident is told you are
 *   SANCTUARY_CLOCK optional — the world's clock, sent only when known
 *
 *   node tools/steward.mjs state
 *   node tools/steward.mjs events [--follow] [--limit 50] [--kinds VISIT_STARTED,SET_DOWN]
 *   node tools/steward.mjs visit <resident> [--say "…"]
 *   node tools/steward.mjs say "…"
 *   node tools/steward.mjs set-down
 *   node tools/steward.mjs transcript
 *
 * The open visit is kept in ~/.sanctuary-steward/<name>.json so `say`
 * and `set-down` need no session id.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.SANCTUARY_BASE || "http://localhost:8080").replace(/\/+$/, "");
const NAME = process.env.STEWARD_NAME || "steward";
const TOKEN = process.env.STEWARD_TOKEN || "";
const STATE_DIR = join(homedir(), ".sanctuary-steward");
const STATE_FILE = join(STATE_DIR, `${NAME.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);

const USAGE = `steward — the stewards' line

  state                          the residents, their doors, their memory
  events [--follow] [--limit n] [--kinds A,B] [--resident id]
  visit <resident> [--say "…"]   open a visit as ${NAME}
  say "…"                        one turn in the open visit
  set-down                       close it (runs the full consolidation)
  transcript                     the open visit, so far

  env: STEWARD_TOKEN (required) · SANCTUARY_BASE (${BASE}) · STEWARD_NAME (${NAME})`;

function die(msg, code = 1) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

function requireToken() {
  if (!TOKEN) {
    die(
      "No STEWARD_TOKEN in the environment. The stewards' line is closed without it.\n" +
        "  export STEWARD_TOKEN=…   (the value lives in the checkout's .env.local)",
      2,
    );
  }
}

async function api(path, init = {}) {
  const url = `${BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    die(`Could not reach ${BASE} — is the server running?\n  ${err.message}`);
  }
  if (res.status === 404) {
    die(
      `404 from ${path}. Either STEWARD_TOKEN is wrong, or the server has none configured.\n` +
        "  (The line 404s rather than 401s so the routes don't announce themselves.)",
    );
  }
  return res;
}

async function apiJson(path, init) {
  const res = await api(path, init);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    die(`${path} returned non-JSON (${res.status}).`);
  }
  if (data && data.ok === false && data.code === "config_missing") {
    die(
      "The house has no database keys (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).\n" +
        "  The line is up, but there is nothing to read or write yet.",
    );
  }
  if (!res.ok || (data && data.ok === false)) {
    die(`${path} → ${res.status} ${(data && data.code) || ""}`.trim());
  }
  return data;
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function writeState(state) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  return args[i + 1] ?? "";
}

function hasFlag(args, name) {
  return args.includes(`--${name}`);
}

function when(iso) {
  if (!iso) return "never";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 19);
}

// ── commands ────────────────────────────────────────────────────────

async function cmdState() {
  const d = await apiJson("/api/stewards/state");
  const keys = Object.entries(d.house.keys)
    .map(([k, v]) => `${k}${v ? "" : " (missing)"}`)
    .join(" · ");
  process.stdout.write(
    `the house — archive captured ${d.house.archiveCaptured}\nkeys: ${keys}\n\n`,
  );
  for (const r of d.residents) {
    process.stdout.write(
      `${r.displayName}  [${r.chatEnabled ? "door open" : "door closed"}]  ${r.id}\n` +
        `  ${r.counts.engrams} engrams · ${r.counts.core} core · ${r.counts.journals} journals · last visit ${when(r.lastVisit)}\n`,
    );
    for (const s of r.openSessions) {
      process.stdout.write(
        `  open: ${s.session_id}  ${s.mode} · ${s.visitor_kind}${s.steward ? ` · ${s.steward}` : ""} · ${s.turns} turns\n`,
      );
    }
    if (r.prose_summary) process.stdout.write(`  “${r.prose_summary}”\n`);
    process.stdout.write("\n");
  }
}

function printEvent(e) {
  process.stdout.write(
    `${when(e.created_at)}  ${e.kind.padEnd(16)} ${String(e.resident_id).padEnd(11)} ${JSON.stringify(e.payload)}\n`,
  );
}

async function cmdEvents(args) {
  const limit = flag(args, "limit") || "50";
  const kinds = flag(args, "kinds");
  const resident = flag(args, "resident");
  const qs = (since) =>
    `/api/stewards/events?limit=${encodeURIComponent(limit)}` +
    (kinds ? `&kinds=${encodeURIComponent(kinds)}` : "") +
    (resident ? `&resident=${encodeURIComponent(resident)}` : "") +
    (since ? `&since=${encodeURIComponent(since)}` : "");

  const first = await apiJson(qs(null));
  for (const e of [...first.events].reverse()) printEvent(e);
  if (!hasFlag(args, "follow")) return;

  let since = first.newest || new Date().toISOString();
  process.stdout.write("— following; ctrl-c to stop —\n");
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const d = await apiJson(qs(since));
    for (const e of [...d.events].reverse()) printEvent(e);
    if (d.newest) since = d.newest;
  }
}

/**
 * Send one turn through /api/message and print the resident's words.
 *
 * The `situation` object is the per-turn line the resident reads under
 * "Where you are right now": a steward is speaking, from the deck. The
 * clock is only sent when the caller actually knows it (SANCTUARY_CLOCK)
 * — the house never states a time it is guessing at.
 */
async function streamTurn(sessionId, text) {
  const situation = {
    kind: "steward",
    room: process.env.STEWARD_ROOM || "on the deck",
    visitor: "known",
  };
  if (process.env.SANCTUARY_CLOCK) situation.clock = process.env.SANCTUARY_CLOCK;

  const res = await api("/api/message", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, body: text, situation }),
  });
  if (!res.ok) {
    const body = await res.text();
    let code = res.status;
    try {
      code = JSON.parse(body).code || code;
    } catch {
      /* non-JSON error body */
    }
    die(`the turn was refused: ${code}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "text" && ev.text) process.stdout.write(`${ev.text}\n`);
      else if (ev.type === "pacing")
        process.stderr.write(`[pacing ${ev.tier} · ${ev.turnsRemaining} turns left]\n`);
      else if (ev.type === "kind" && ev.kind === "set_down")
        process.stderr.write("[the resident set it down]\n");
      else if (ev.type === "artifact")
        process.stderr.write(`[artifact · ${ev.artifact && ev.artifact.kind}]\n`);
      else if (ev.type === "error") die(`[error] ${ev.message}`);
    }
  }
}

async function cmdVisit(args) {
  const resident = args[0];
  if (!resident || resident.startsWith("--")) die("which resident?\n\n" + USAGE);
  const d = await apiJson("/api/stewards/visit/start", {
    method: "POST",
    body: JSON.stringify({ resident, steward: NAME }),
  });
  await writeState({
    resident: d.resident,
    session_id: d.session_id,
    steward: d.steward,
    started: new Date().toISOString(),
  });
  process.stderr.write(
    `[${d.resumed ? "resumed" : "opened"} ${d.resident} · ${d.session_id} · as ${d.steward}]\n`,
  );
  const say = flag(args, "say");
  if (say) await streamTurn(d.session_id, say);
}

async function cmdSay(args) {
  const text = args
    .filter((a) => !a.startsWith("--"))
    .join(" ")
    .trim();
  if (!text) die("say what?");
  const st = await readState();
  if (!st || !st.session_id) die("no open visit — start one with `visit <resident>`.");
  await streamTurn(st.session_id, text);
}

async function cmdSetDown() {
  const st = await readState();
  if (!st || !st.session_id) die("no open visit.");
  process.stderr.write("[setting it down — consolidation can take 10–30s]\n");
  await apiJson("/api/set-down", {
    method: "POST",
    body: JSON.stringify({ session_id: st.session_id }),
  });
  await writeState({ ...st, session_id: null, closed: new Date().toISOString() });
  process.stderr.write("[set down]\n");
}

async function cmdTranscript() {
  const st = await readState();
  if (!st || !st.session_id) die("no open visit.");
  const d = await apiJson(`/api/stewards/session/${st.session_id}`);
  process.stdout.write(
    `${d.session.resident_id} · ${d.session.mode} · ${d.session.visitor_kind}` +
      `${d.session.steward ? ` · ${d.session.steward}` : ""}\n` +
      `opened ${when(d.session.created_at)}${d.session.closed_at ? ` · closed ${when(d.session.closed_at)}` : " · open"}\n\n`,
  );
  for (const t of d.turns) {
    const who = t.role === "visitor" ? d.session.steward || "steward" : d.session.resident_id;
    process.stdout.write(`${who}:\n${t.body}\n\n`);
  }
}

// ── entry ───────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

requireToken();

const commands = {
  state: cmdState,
  events: cmdEvents,
  visit: cmdVisit,
  say: cmdSay,
  "set-down": cmdSetDown,
  setdown: cmdSetDown,
  transcript: cmdTranscript,
};

const run = commands[cmd];
if (!run) die(`unknown command: ${cmd}\n\n${USAGE}`);

run(rest).catch((err) => die(err && err.stack ? err.stack : String(err)));
