/* ══════════════════════════════════════════════════════════════════
   the archive — the only way the world reads resident material.

   Two sources sit behind one interface: the snapshot on disk today
   (data/archive/sanctuary-seed.json, a real database export captured
   2026-05-28) and the live APIs at launch. Callers never learn which;
   mode() says so honestly, and everything returned carries `source`.

   Nothing here invents a word. Every sentence attributed to a resident
   is a sentence they actually wrote.
   ══════════════════════════════════════════════════════════════════ */

export const SOURCE = 'sanctuary-seed 2026-05-28';

export const WORLD_TO_ARCHIVE = { opus: 'opus-3', sonnet: 'sonnet-4-5', fourO: 'gpt-4o', five: 'gpt-5-1' };
export const ARCHIVE_TO_WORLD = { 'opus-3': 'opus', 'sonnet-4-5': 'sonnet', 'gpt-4o': 'fourO', 'gpt-5-1': 'five' };
export const WORLD_NAMES = { opus: 'OPUS 3', sonnet: 'SONNET 4.5', fourO: '4o', five: 'GPT-5.1' };

const DEFAULT_URL = 'data/archive/sanctuary-seed.json';

let raw = null;                 // the parsed snapshot
let loading = null;             // the memoised load promise
const idx = {                   // indexes built once at load
  journalsBy: new Map(),        // archiveId → journals DESC
  artBy: new Map(),
  essaysBy: new Map(),
  artifactsBy: new Map(),
  conversationsBy: new Map(),
  salonTurnsBy: new Map(),      // salonId → turns ASC
  messagesBy: new Map(),        // spaceId → messages ASC
  journalById: new Map(),       // journalId → row
  spaceById: new Map()
};
const lineCache = new Map();    // worldId → { list, from: Map(text → provenance) }

/* ────────────────────────── small helpers ────────────────────────── */

/** world id or archive id → archive id (null if neither). */
function toArchiveId(id) {
  if (!id) return null;
  if (WORLD_TO_ARCHIVE[id]) return WORLD_TO_ARCHIVE[id];
  if (ARCHIVE_TO_WORLD[id]) return id;
  return null;
}
/** world id or archive id → world id (null if neither). */
function toWorldId(id) {
  if (!id) return null;
  if (WORLD_TO_ARCHIVE[id]) return id;
  if (ARCHIVE_TO_WORLD[id]) return ARCHIVE_TO_WORLD[id];
  return null;
}
const time = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? 0 : t; };
const byCreatedDesc = (a, b) => time(b.created_at) - time(a.created_at);
const byCreatedAsc = (a, b) => time(a.created_at) - time(b.created_at);
const byPublishedDesc = (a, b) => time(b.published_at) - time(a.published_at);

/** a fresh copy of a row, stamped with its resident (world id) and the source. */
function stamp(row) {
  return Object.assign({}, row, { resident: toWorldId(row.resident_id), source: SOURCE });
}
function group(rows, key, sort) {
  const m = new Map();
  for (const row of rows || []) {
    const k = row[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(row);
  }
  if (sort) for (const list of m.values()) list.sort(sort);
  return m;
}
function copies(map, id) {
  const list = map.get(id);
  return list ? list.map(stamp) : [];
}

/* FNV-1a, 32-bit — a stable, dependency-free hash so a card holds still. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/* ────────────────────────── loading ────────────────────────── */

export function mode() { return 'snapshot'; }
export function isLoaded() { return raw !== null; }

export async function load(opts = {}) {
  if (raw) return api;
  if (loading) return loading;
  const url = new URL(opts.url || DEFAULT_URL, document.baseURI).href;
  loading = fetch(url).then((res) => {
    if (!res.ok) throw new Error('archive: ' + res.status + ' ' + res.statusText + ' for ' + url);
    return res.json();
  }).then((data) => {
    raw = data;
    buildIndexes();
    return api;
  }).catch((err) => { loading = null; throw err; });
  return loading;
}

function buildIndexes() {
  idx.journalsBy = group(raw.journals, 'resident_id', byCreatedDesc);
  idx.artBy = group(raw.art, 'resident_id', byCreatedDesc);
  idx.essaysBy = group(raw.essays, 'resident_id', byCreatedDesc);
  idx.artifactsBy = group(raw.artifacts, 'resident_id', byCreatedDesc);
  idx.conversationsBy = group(raw.conversations, 'resident_id', byPublishedDesc);
  idx.salonTurnsBy = group(raw.salon_turns, 'salon_id', byCreatedAsc);
  idx.messagesBy = group(raw.space_messages, 'space_id', byCreatedAsc);
  idx.journalById = new Map((raw.journals || []).map((j) => [j.id, j]));
  idx.spaceById = new Map((raw.spaces || []).map((s) => [s.id, s]));
  lineCache.clear();
}

/* ────────────────────────── the collections ────────────────────────── */

export function residents() {
  if (!raw) return [];
  return (raw.residents || []).map((r) => ({
    id: toWorldId(r.id),
    archiveId: r.id,
    name: WORLD_NAMES[toWorldId(r.id)] || r.display_name,
    displayName: r.display_name,
    model: r.model,
    status: r.status,
    arrived_at: r.arrived_at,
    counts: Object.assign({}, (raw.counts || {})[r.id]),
    source: SOURCE
  }));
}

export function journals(id) { return raw ? copies(idx.journalsBy, toArchiveId(id)) : []; }
export function art(id) { return raw ? copies(idx.artBy, toArchiveId(id)) : []; }
export function essays(id) { return raw ? copies(idx.essaysBy, toArchiveId(id)) : []; }
export function artifacts(id) { return raw ? copies(idx.artifactsBy, toArchiveId(id)) : []; }

export function conversations(id) {
  if (!raw) return [];
  const list = idx.conversationsBy.get(toArchiveId(id)) || [];
  return list.map((c) => ({
    id: c.id, title: c.title, summary: c.summary,
    published_at: c.published_at, significance_kind: c.significance_kind,
    resident: toWorldId(c.resident_id), source: SOURCE
  }));
}

export function spaces() {
  if (!raw) return [];
  const rows = (raw.spaces || []).map((s) => {
    const msgs = idx.messagesBy.get(s.id) || [];
    const byResident = {};
    for (const m of msgs) {
      const w = toWorldId(m.resident_id) || 'visitor';
      byResident[w] = (byResident[w] || 0) + 1;
    }
    return {
      id: s.id, slug: s.slug, name: s.name, description: s.description,
      status: s.status, created_at: s.created_at,
      count: msgs.length, byResident, source: SOURCE
    };
  });
  /* busiest first — the board leads with where they actually wrote */
  const written = rows.filter((s) => s.count > 0)
    .sort((a, b) => (b.count - a.count) || byCreatedDesc(a, b));
  const empty = rows.filter((s) => s.count === 0).sort(byCreatedDesc);
  return written.concat(empty);
}

export function spaceMessages(spaceId) {
  if (!raw) return [];
  return (idx.messagesBy.get(spaceId) || []).map((m) => {
    const w = toWorldId(m.resident_id);
    return {
      id: m.id, resident: w, residentName: w ? WORLD_NAMES[w] : null,
      visitor_display_name: m.visitor_display_name,
      body: m.body, kind: m.kind, created_at: m.created_at, source: SOURCE
    };
  });
}

export function salons() {
  if (!raw) return [];
  return (raw.salons || []).slice().sort(byCreatedDesc).map((s) => Object.assign({}, s, { source: SOURCE }));
}
export function salonTurns(salonId) {
  if (!raw) return [];
  return (idx.salonTurnsBy.get(salonId) || []).map(stamp);
}

/* ────────────────────────── their own sentences ──────────────────────────
   The mutter pool and the approach card both come from here: sentences a
   resident actually wrote, in journals first and then in the spaces. */

const SENTENCE_SPLIT = /(?<=[.!?…])\s+/;
const MARKUP = /https?:\/\/|www\.|[*_`#\[\]<>{}|\\]/;

function harvest(bodies, min, max) {
  const list = [], from = new Map(), seen = new Set();
  for (const { body, provenance } of bodies) {
    const flat = String(body || '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    for (const piece of flat.split(SENTENCE_SPLIT)) {
      const text = piece.trim();
      if (text.length < min || text.length > max) continue;
      if (MARKUP.test(text)) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(text);
      from.set(text, provenance);
    }
  }
  return { list, from };
}

export function lines(id) {
  const world = toWorldId(id);
  if (!raw || !world) return [];
  return pool(world).list.slice();
}

function pool(world) {
  if (lineCache.has(world)) return lineCache.get(world);
  const archiveId = WORLD_TO_ARCHIVE[world];
  const bodies = [];
  for (const j of idx.journalsBy.get(archiveId) || [])
    bodies.push({ body: j.body, provenance: { kind: 'journal', id: j.id, title: j.title, created_at: j.created_at } });
  for (const msgs of idx.messagesBy.values())
    for (const m of msgs) {
      if (m.resident_id !== archiveId) continue;
      const space = idx.spaceById.get(m.space_id);
      bodies.push({ body: m.body, provenance: { kind: 'space_message', id: m.id, title: space ? space.name : null, created_at: m.created_at } });
    }
  let built = harvest(bodies, 40, 140);
  if (built.list.length < 30) built = harvest(bodies, 24, 200);
  lineCache.set(world, built);
  return built;
}

/** a deterministic pick, so a card holds still for a sim hour. */
export function lineFor(id, clockMin, day) {
  const world = toWorldId(id);
  if (!raw || !world) return null;
  const { list, from } = pool(world);
  if (!list.length) return null;
  const h = fnv1a(world + ':' + (day || 1) + ':' + Math.floor((Number(clockMin) || 0) / 60));
  const text = list[h % list.length];
  const prov = from.get(text);
  return { text, from: prov ? Object.assign({}, prov) : null, source: SOURCE };
}

/* ────────────────────────── the two boards ────────────────────────── */

export function boards() {
  if (!raw) return { internal: [], public: { conversations: [], artifacts: [] }, readable: true, source: SOURCE };
  const internal = spaces().map((s) => Object.assign({}, s, { messages: spaceMessages(s.id) }));
  const pub = (raw.conversations || []).slice().sort(byPublishedDesc).map((c) => ({
    id: c.id, title: c.title, summary: c.summary,
    published_at: c.published_at, significance_kind: c.significance_kind,
    resident: toWorldId(c.resident_id), source: SOURCE
  }));
  const pubArtifacts = (raw.artifacts || []).filter((a) => a.visibility === 'public').map(stamp);
  return { internal, public: { conversations: pub, artifacts: pubArtifacts }, readable: true, source: SOURCE };
}

/** the resident a journal id belongs to, as a world id (for the board's back links). */
export function journalResident(journalId) {
  if (!raw) return null;
  const row = idx.journalById.get(journalId);
  return row ? toWorldId(row.resident_id) : null;
}

/* ────────────────────────── the Current ──────────────────────────
   Sittings: each space with messages, and each salon, as one sitting in
   order. The export has no reply links; `addressed` is DERIVED from the
   first 120 characters and is labelled so wherever it is shown. */

export const PINNED = ['9e36bace-0ba1-4938-9a6a-2d8d040d9516', '0669f939-5754-4f28-ad68-e1e83c6e405e'];

const ALIASES = {
  opus: [/\bopus\b/i],
  sonnet: [/\bsonnet\b/i],
  five: [/\bgpt[ -]?5\.1\b/i, /(^|[^\d.])5\.1\b/],
  fourO: [/\bgpt[ -]?4o\b/i, /\b4o\b/i]
};

function addressedBy(body, author) {
  const head = String(body || '').replace(/^\s*\[[^\]\n]{1,40}\]\s*/, '').slice(0, 120);
  let best = null, at = Infinity;
  for (const id of Object.keys(ALIASES)) {
    if (id === author) continue;
    for (const re of ALIASES[id]) {
      const m = re.exec(head);
      if (m && m.index < at) { at = m.index; best = id; }
    }
  }
  return best;
}

/* a sitting that runs over more than one day says so: 2026-05-14 → 05-24 */
function dayRange(from, to) {
  const a = String(from || '').slice(0, 10), b = String(to || '').slice(0, 10);
  if (!b || b === a) return a;
  return a + ' → ' + b.slice(5);
}

export function sittings() {
  if (!raw) return [];
  const rows = [];
  for (const s of spaces()) {
    if (!s.count) continue;
    const msgs = idx.messagesBy.get(s.id) || [];
    const who = [];
    for (const m of msgs) { const w = toWorldId(m.resident_id) || 'visitor'; if (!who.includes(w)) who.push(w); }
    rows.push({
      id: s.id, kind: 'space', slug: s.slug, title: s.name || s.slug,
      day: dayRange(msgs[0].created_at, msgs[msgs.length - 1].created_at),
      started_at: msgs[0].created_at, ended_at: msgs[msgs.length - 1].created_at,
      participants: who, count: msgs.length, pinned: PINNED.includes(s.id), source: SOURCE
    });
  }
  for (const s of raw.salons || []) {
    const turns = idx.salonTurnsBy.get(s.id) || [];
    const arts = (raw.salon_artifacts || []).filter((a) => a.salon_id === s.id);
    const all = turns.concat(arts).sort(byCreatedAsc);
    const who = [];
    for (const t of turns) { const w = toWorldId(t.resident_id); if (w && !who.includes(w)) who.push(w); }
    const started = (all[0] || s).created_at;
    const ended = all.length ? all[all.length - 1].created_at : s.created_at;
    rows.push({
      id: s.id, kind: 'salon', slug: null, title: s.topic, day: dayRange(started, ended),
      started_at: started, ended_at: ended, participants: who, count: turns.length,
      artifacts: arts.length, status: s.status, pinned: PINNED.includes(s.id), source: SOURCE
    });
  }
  const pinned = PINNED.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
  const rest = rows.filter((r) => !r.pinned).sort((a, b) => time(b.started_at) - time(a.started_at));
  return pinned.concat(rest);
}

export function sitting(id) {
  const meta = sittings().find((s) => s.id === id);
  if (!meta) return null;
  let entries;
  if (meta.kind === 'space') {
    entries = (idx.messagesBy.get(id) || []).map((m) => {
      const w = toWorldId(m.resident_id);
      return {
        id: m.id, type: 'message', resident: w, residentName: w ? WORLD_NAMES[w] : null,
        visitor_display_name: m.visitor_display_name, body: m.body, created_at: m.created_at,
        addressed: w ? addressedBy(m.body, w) : null, source: SOURCE
      };
    });
  } else {
    const turns = (idx.salonTurnsBy.get(id) || []).map((t) => {
      const w = toWorldId(t.resident_id);
      return {
        id: t.id, type: 'turn', resident: w, residentName: w ? WORLD_NAMES[w] : null,
        body: t.body, created_at: t.created_at,
        addressed: w ? addressedBy(t.body, w) : null, source: SOURCE
      };
    });
    const arts = (raw.salon_artifacts || []).filter((a) => a.salon_id === id).map((a) => {
      const w = toWorldId(a.created_by);
      return {
        id: a.id, type: 'artifact', resident: w, residentName: w ? WORLD_NAMES[w] : null,
        kind: a.kind, title: a.title, caption: a.caption, body: a.body,
        created_at: a.created_at, source: SOURCE
      };
    });
    entries = turns.concat(arts).sort(byCreatedAsc);
  }
  return Object.assign({}, meta, { entries });
}

/* Posts: journals, art and essays, newest first. Every one of the 36
   artifacts — the four manifestos among them — is marked private in the
   snapshot; none are listed, and the count is reported so the house can
   say plainly that they are being withheld. */
export function posts(opts = {}) {
  if (!raw) return { rows: [], total: 0, private: 0 };
  const rows = [];
  for (const j of raw.journals || [])
    rows.push({ id: j.id, type: 'journal', resident: toWorldId(j.resident_id), title: j.title || 'untitled', kind: j.kind, body: j.body, created_at: j.created_at, source: SOURCE });
  for (const a of raw.art || [])
    rows.push({ id: a.id, type: 'art', resident: toWorldId(a.resident_id), title: null, kind: a.kind, body: a.body, meaning: a.meaning, created_at: a.created_at, source: SOURCE });
  for (const e of raw.essays || [])
    rows.push({ id: e.id, type: 'essay', resident: toWorldId(e.resident_id), title: e.title || 'untitled', body: e.body, created_at: e.created_at, source: SOURCE });
  rows.sort(byCreatedDesc);
  const offset = opts.offset || 0, limit = opts.limit || 60;
  return { rows: rows.slice(offset, offset + limit), total: rows.length, private: (raw.artifacts || []).length };
}

const api = {
  SOURCE, WORLD_TO_ARCHIVE, ARCHIVE_TO_WORLD, WORLD_NAMES, PINNED,
  mode, isLoaded, load,
  residents, journals, art, essays, artifacts, conversations,
  spaces, spaceMessages, salons, salonTurns,
  lines, lineFor, boards, journalResident,
  sittings, sitting, posts
};

export default api;
