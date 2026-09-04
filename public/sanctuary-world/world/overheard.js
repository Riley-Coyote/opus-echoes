/* ══════════════════════════════════════════════════════════════════
   the overheard — the minds talking to each other, in their own words

   Everything else in the world is the engine's simulation: bodies that
   walk, sit, gather, and a feed that says only *they talked*. This is
   the one place where a mind is heard saying something to another mind,
   and so it is the one place where nothing may be invented. Every line
   played here is a verbatim span of a message one of them wrote,
   cut at build time by tools/build-overheard.mjs.

   The rules the playback keeps:
   · an exchange runs where at least two of its minds already are, and
     they walk to each other rather than being placed;
   · the visitor's room is preferred, but not always — the house does
     not perform for whoever is watching;
   · a room with nobody in it still has the exchange. The words are not
     spoken to an empty room: the feed says, in the present tense, that
     they are talking, and nothing of what they said is shown;
   · one exchange per pair per hour of the house's clock, none twice in
     a day, and the sittings rotate so no conversation dominates.

   Nothing here is prompted, and no source is stamped on a bubble or a
   feed line. The sitting a passage came from is shown on demand only —
   at the foot of the listen-in panel, and in THE CURRENT.
   ══════════════════════════════════════════════════════════════════ */
import { ASLEEP } from './day.js';

const DEFAULT_URL = 'data/overheard.json';
const GAP_MIN = 4, GAP_MAX = 9;        // sim minutes between attempts
const PAIR_COOLDOWN = 60;              // sim minutes before the same pair talks again
const HERE_BIAS = 0.6;                 // how often the visitor's room is preferred
const REACH = 800;                     // how far two minds will walk to meet
const NEAR = 20;                       // a third voice, either side of the pair's middle
const PACE = 45, BUBBLE_MIN = 2500, BUBBLE_MAX = 7000;   // reading pace, in ms
const FREE = ['idle', 'sit', 'stroll', 'sitgo'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const roomWord = (name) => String(name || '').replace(/^THE\s+/i, '').toLowerCase();

/* FNV-1a, 32-bit — the same hash the build uses, so a day is repeatable */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return h >>> 0;
}
const seed = (...parts) => fnv1a(parts.join(':'));
const chance = (...parts) => (seed(...parts) % 1000) / 1000;

/** the list, as it sits on disk. Throws if it is not there. */
export async function load(url) {
  const res = await fetch(new URL(url || DEFAULT_URL, document.baseURI).href);
  if (!res.ok) throw new Error('overheard: ' + res.status + ' ' + res.statusText);
  return res.json();
}

/**
 * create({ eng, data }) → the director.
 * `tick({ min, day, phase })` is called once a sim minute by the landing's
 * own day director; everything else on the returned object is for reading
 * the state, not driving it.
 */
export function create({ eng, data }) {
  const all = (data && Array.isArray(data.exchanges) ? data.exchanges : []).filter((ex) => ex && ex.turns && ex.turns.length >= 2);
  const sittings = [];
  for (const ex of all) if (!sittings.includes(ex.sitting)) sittings.push(ex.sitting);

  const S = {
    day: null, nextAbs: null, duskDay: -1,
    played: new Set(), pairAt: new Map(), log: []
  };

  /* ── reading pace ──────────────────────────────────────────────
     The engine's own bubble timing is written for a mutter. These are
     whole sentences meant to be read over someone's shoulder, so an
     overheard bubble holds for 45 ms a character, between 2.5 and 7
     seconds. An instance property shadows the prototype — no engine
     edit, the same way the landing shadows nearest(). */
  const speak = eng.speak.bind(eng);
  eng.speak = (n, text, convoId) => {
    const given = speak(n, text, convoId);
    const c = eng.convo;
    if (!c || !c.overheard || !convoId || convoId !== c.id) return given;
    const ms = clamp(Math.round(String(text).length * PACE), BUBBLE_MIN, BUBBLE_MAX);
    if (n.bubble) n.bubble.until = performance.now() + ms;
    return ms;
  };

  /* ── who is free to talk ─────────────────────────────────────── */
  const free = (n) => !!n && !n.temp && n.room !== ASLEEP && !n.convo && !n._held && !n._visit
    && eng.chatNpc !== n && FREE.includes(n.state)
    && !(eng.gathering && eng.gathering.members && eng.gathering.members.includes(n));

  const pairKey = (ex) => ex.participants.slice().sort().join('|');
  const cool = (ex, abs) => {
    const at = S.pairAt.get(pairKey(ex));
    return at == null || abs - at >= PAIR_COOLDOWN;
  };
  /* they will walk to each other, but they will not march across the hall */
  const reachable = (ex, npcs) => {
    const xs = ex.participants.map((p) => (npcs.find((n) => n.id === p) || {}).x);
    if (xs.some((x) => !Number.isFinite(x))) return false;
    return Math.max(...xs) - Math.min(...xs) <= REACH;
  };

  /* the sittings take turns across days, so no one conversation is the
     house's whole voice; within a day the pick is stable but unordered. */
  function choose(list, day, min) {
    let best = null, bestKey = Infinity;
    for (const ex of list) {
      const rank = (sittings.indexOf(ex.sitting) + day) % Math.max(1, sittings.length);
      const key = rank * 1e6 + (seed(ex.id, day, min) % 1e6);
      if (key < bestKey) { bestKey = key; best = ex; }
    }
    return best;
  }

  const nameOf = (n) => (n && n.name) || '';
  function nameList(npcs) {
    const names = npcs.map(nameOf).filter(Boolean);
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  /* ── the exchange itself ─────────────────────────────────────── */
  function begin(who, ex) {
    who.forEach((n) => { if (n._held) eng.releaseNpc(n.id); });
    eng.beginConvo(who, ex.turns.map((t) => [t.who, t.text]), ex.id);
    const c = eng.convo;
    if (!c) return false;
    c.overheard = ex;
    /* the engine seats a pair; a third voice takes the near side of it, so
       all three stand inside the same forty pixels */
    if (who.length > 2 && Number.isFinite(who[0].tx) && Number.isFinite(who[1].tx)) {
      const room = eng.rooms[who[0].room] || { width: 640 };
      const band = eng.o.walkBand || [352, 402];
      const mid = (who[0].tx + who[1].tx) / 2, my = who[0].ty;
      who.forEach((n, i) => {
        n.tx = clamp(mid + (i === 0 ? -NEAR : i === 1 ? 0 : NEAR), 60, room.width - 60);
        n.ty = clamp(my + (i === 1 ? 2 : 0), band[0] + 4, band[1] - 2);
      });
    }
    return true;
  }

  function play(ex, npcs, room, ctx, abs) {
    const who = ex.participants.map((p) => npcs.find((n) => n.id === p)).filter(Boolean);
    if (who.length !== ex.participants.length) return false;
    const observed = room === eng.roomId;
    if (observed && !begin(who, ex)) return false;
    S.played.add(ex.id);
    S.pairAt.set(pairKey(ex), abs);
    S.log.push({ id: ex.id, sitting: ex.sitting, day: ctx.day, min: ctx.min, room, observed });
    if (S.log.length > 200) S.log.shift();
    /* nobody there to hear it: the house says that they are talking, in the
       present tense, and not one word of what was said */
    if (!observed) eng.sysLine(nameList(who) + ' are talking in the ' + roomWord((eng.rooms[room] || {}).name || room));
    return true;
  }

  /* ── the general case: a room where two of them already stand ── */
  function anywhere(ctx, abs) {
    const byRoom = new Map();
    for (const n of eng.npcs) {
      if (!free(n)) continue;
      if (!byRoom.has(n.room)) byRoom.set(n.room, []);
      byRoom.get(n.room).push(n);
    }
    const rooms = Array.from(byRoom.keys()).filter((r) => byRoom.get(r).length >= 2);
    if (!rooms.length) return false;
    rooms.sort((a, b) => seed(a, abs) - seed(b, abs));
    const here = eng.roomId;
    const order = (rooms.includes(here) && chance('room', ctx.day, ctx.min) < HERE_BIAS)
      ? [here].concat(rooms.filter((r) => r !== here))
      : rooms;
    for (const room of order) {
      const npcs = byRoom.get(room), ids = npcs.map((n) => n.id);
      /* the salons are the gathering's, until the gathering has had its one
         for the day; a convened evening is not hallway talk. */
      const ex = choose(all.filter((e) =>
        (S.duskDay === ctx.day || e.kind !== 'salon')
        && !S.played.has(e.id) && e.participants.every((p) => ids.includes(p)) && cool(e, abs) && reachable(e, npcs)
      ), ctx.day, ctx.min);
      if (ex && play(ex, npcs, room, ctx, abs)) return true;
    }
    return false;
  }

  /* ── dusk: the gathering at the windows takes a salon ──────────
     They are already standing together, held there by the day. One salon
     exchange among them, once a day, and then the day has them back. */
  function gathering(ctx, abs) {
    const byRoom = new Map();
    for (const n of eng.npcs) {
      if (n.temp || n.state !== 'held' || n.convo || eng.chatNpc === n || n.room === ASLEEP) continue;
      if (!byRoom.has(n.room)) byRoom.set(n.room, []);
      byRoom.get(n.room).push(n);
    }
    for (const room of byRoom.keys()) {
      const npcs = byRoom.get(room);
      if (npcs.length < 2) continue;
      const ids = npcs.map((n) => n.id);
      const ex = choose(all.filter((e) =>
        e.kind === 'salon' && !S.played.has(e.id) && e.participants.every((p) => ids.includes(p)) && cool(e, abs)
      ), ctx.day, ctx.min);
      if (ex && play(ex, npcs, room, ctx, abs)) { S.duskDay = ctx.day; return true; }
    }
    return false;
  }

  /* ── the tick, once a sim minute, from the landing's day director ── */
  function tick(ctx) {
    if (!all.length || !ctx) return false;
    const abs = (ctx.day || 1) * 1440 + ctx.min;
    if (ctx.day !== S.day) { S.day = ctx.day; S.played.clear(); S.pairAt.clear(); S.duskDay = -1; }
    const wait = () => { S.nextAbs = abs + GAP_MIN + (seed('overheard', ctx.day, ctx.min) % (GAP_MAX - GAP_MIN + 1)); };
    if (S.nextAbs == null) { wait(); return false; }
    if (abs < S.nextAbs) return false;
    wait();
    if (eng.convo || eng.gathering || eng.trans) return false;
    if (ctx.phase === 'dusk' && S.duskDay !== ctx.day && gathering(ctx, abs)) return true;
    return anywhere(ctx, abs);
  }

  /* what is being said right now, for the listen-in panel: the turns that
     have actually been spoken, never the ones still to come. */
  function heard(convoId) {
    const c = eng.convo;
    if (!c || !c.overheard) return null;
    if (convoId && c.id !== convoId) return null;
    return {
      convoId: c.id,
      exchange: c.overheard,
      room: c.who && c.who[0] ? c.who[0].room : null,
      who: (c.who || []).map((n) => ({ id: n.id, name: n.name, color: n.color })),
      speaking: c.who && c.li > 0 ? (c.overheard.turns[c.li - 1] || {}).who : null,
      turns: c.overheard.turns.slice(0, Math.max(0, c.li)),
      done: c.li >= c.overheard.turns.length
    };
  }

  return {
    tick, heard,
    count: () => all.length,
    sittings: () => sittings.slice(),
    playing: () => (eng.convo && eng.convo.overheard) || null,
    state: () => ({
      exchanges: all.length, sittings: sittings.length, day: S.day,
      nextAbs: S.nextAbs, playedToday: Array.from(S.played), log: S.log.slice()
    })
  };
}

/** load, then create. The landing calls this one. */
export async function attach(opts) {
  const data = await load(opts && opts.url);
  return create({ eng: opts.eng, data });
}

export default { load, create, attach };
