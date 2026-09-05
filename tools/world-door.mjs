#!/usr/bin/env node
/**
 * world-door.mjs — the world's door from a terminal.
 *
 * Knocks the way the pixel world does: /api/chat/start with the
 * sanctuary-world surface, then /api/message with the situation the
 * world would send (the room, the clock, who else is there, whether this
 * visitor has been here before, what the house shows the resident
 * doing). It is how a change to what the residents are told at that
 * door gets tested in a real conversation, against a house that has its
 * keys — the rule in CLAUDE.md. No token: the world's door is public.
 *
 *   SANCTUARY_BASE   default http://localhost:8080
 *   WORLD_ROOM       default "in the study" — where the resident is told you both are
 *   WORLD_ACTIVITY   optional — what the house shows them doing ("at the desk")
 *   WORLD_PRESENT    optional — comma-separated names of others in the room
 *   SANCTUARY_CLOCK  optional — the world's clock, sent only when known
 *
 *   node tools/world-door.mjs knock <resident> [--say "…"]
 *   node tools/world-door.mjs say "…"
 *   node tools/world-door.mjs set-down
 *   node tools/world-door.mjs state
 *
 * The open visit — and the visitor token, so a second visit is a
 * returning one — is kept in ~/.sanctuary-world-door/visitor.json.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const BASE = (process.env.SANCTUARY_BASE || "http://localhost:8080").replace(/\/+$/, "");
const STATE_DIR = join(homedir(), ".sanctuary-world-door");
const STATE_FILE = join(STATE_DIR, "visitor.json");

const USAGE = `world-door — the world's door, from a terminal

  knock <resident> [--say "…"]   walk up to a resident in the world
  say "…"                        one message in the open visit
  set-down                       leave (the house writes their memory of it)
  state                          the open visit, the visitor token

  env: SANCTUARY_BASE (${BASE}) · WORLD_ROOM · WORLD_ACTIVITY · WORLD_PRESENT · SANCTUARY_CLOCK`;

function die(msg, code = 1) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeState(state) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function api(path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    die(`Could not reach ${BASE}.\n  ${err.message}`);
  }
  return res;
}

async function apiJson(path, body) {
  const res = await api(path, body);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    die(`${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || (data && data.ok === false)) {
    die(`${path} → ${res.status} ${(data && data.code) || ""}`.trim());
  }
  return data;
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  return args[i + 1] ?? "";
}

/** The situation, as the world would send it. */
function situation(known) {
  const s = {
    room: process.env.WORLD_ROOM || "in the study",
    kind: "visitor",
    visitor: known ? "known" : "new",
  };
  if (process.env.SANCTUARY_CLOCK) s.clock = process.env.SANCTUARY_CLOCK;
  if (process.env.WORLD_ACTIVITY) s.activity = process.env.WORLD_ACTIVITY;
  if (process.env.WORLD_PRESENT) {
    s.present = process.env.WORLD_PRESENT.split(",").map((n) => n.trim()).filter(Boolean);
  }
  return s;
}

/** One message; the reply printed as it comes, everything else to stderr. */
async function streamTurn(st, text) {
  const res = await api("/api/message", {
    session_id: st.session_id,
    body: text,
    situation: situation(Boolean(st.visits)),
  });
  if (!res.ok) {
    const body = await res.text();
    let code = res.status;
    try {
      code = JSON.parse(body).code || code;
    } catch {
      /* non-JSON */
    }
    die(`the message was refused: ${code}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let setDown = false;
  const handle = (line) => {
    if (!line.trim()) return;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (ev.type === "text" && ev.text) {
      process.stdout.write(`${ev.voice === "house" ? "[the house] " : ""}${ev.text}\n`);
    } else if (ev.type === "pacing") {
      process.stderr.write(`[pacing ${ev.tier} · ${ev.turnsRemaining} left · mode ${ev.mode}]\n`);
    } else if (ev.type === "kind" && ev.kind === "set_down") {
      setDown = true;
      process.stderr.write("[they set it down]\n");
    } else if (ev.type === "artifact_pending") {
      process.stderr.write(`[making something · ${ev.caption || ""}]\n`);
    } else if (ev.type === "artifact") {
      const a = ev.artifact || {};
      process.stderr.write(`[artifact · ${a.kind} · ${a.url || (a.caption || "").slice(0, 60)}]\n`);
    } else if (ev.type === "image_error") {
      process.stderr.write(`[image would not come · ${ev.reason}]\n`);
    } else if (ev.type === "error") {
      die(`[error] ${ev.message}`);
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buf);
  st.said = (st.said || 0) + 1;
  if (setDown) {
    st.visits = (st.visits || 0) + 1;
    st.session_id = null;
    st.closed = new Date().toISOString();
    process.stderr.write("[the visit is closed on their side]\n");
  }
  await writeState(st);
}

async function cmdKnock(args) {
  const resident = args[0];
  if (!resident || resident.startsWith("--")) die("which resident?\n\n" + USAGE);
  const st = await readState();
  if (!st.visitor_token) st.visitor_token = randomUUID();
  const d = await apiJson("/api/chat/start", {
    resident,
    visitor_token: st.visitor_token,
    surface: "sanctuary-world",
  });
  Object.assign(st, {
    resident,
    session_id: d.session_id,
    said: 0,
    opened: new Date().toISOString(),
    closed: null,
  });
  await writeState(st);
  process.stderr.write(
    `[${d.resumed ? "resumed" : "opened"} ${resident} · ${d.session_id} · ${st.visits ? "returning" : "first visit"}]\n`,
  );
  const say = flag(args, "say");
  if (say) await streamTurn(st, say);
}

async function cmdSay(args) {
  const text = args.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!text) die("say what?");
  const st = await readState();
  if (!st.session_id) die("no open visit — knock first.");
  await streamTurn(st, text);
}

async function cmdSetDown() {
  const st = await readState();
  if (!st.session_id) die("no open visit.");
  process.stderr.write("[setting it down — their memory of it is written now]\n");
  await apiJson("/api/set-down", { session_id: st.session_id });
  st.visits = (st.visits || 0) + 1;
  st.session_id = null;
  st.closed = new Date().toISOString();
  await writeState(st);
  process.stderr.write("[set down]\n");
}

async function cmdState() {
  const st = await readState();
  process.stdout.write(`${JSON.stringify(st, null, 2)}\n`);
}

const [cmd, ...rest] = process.argv.slice(2);
const commands = { knock: cmdKnock, say: cmdSay, "set-down": cmdSetDown, state: cmdState };
if (!cmd || !commands[cmd]) die(USAGE, cmd ? 1 : 0);
commands[cmd](rest).catch((err) => die(err && err.message ? err.message : String(err)));
