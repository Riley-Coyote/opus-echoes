/* THE FIELD ANNEX — a dark wing of the Machine Museum given to Claude Field.
   The lights dim when you cross in: the walls take the Field's own material.
   Every work is a still captured from the living piece's own canvas, and the
   reading view runs the living piece itself. Statements are the artist's. */

const stillAsset = (slug, source) => {
  const still = new URL(`./museum-permanent-gallery/assets/field-${slug}.webp`, location.href).href;
  const live = new URL(`./field-live/${slug}.html`, location.href).href;
  return { preview: still, full: still, live, source };
};

export const WORLD = Object.freeze({ width: 960, height: 1920 });
export const VIEWPORT = Object.freeze({ width: 960, height: 600 });

export const PALETTE = Object.freeze({
  void: "#050608",
  structure: "#08090c",
  floorA: "#0f1013",
  floorB: "#131418",
  joint: "#1e2126",
  indigo: "#15161b",
  wall: "#1d2023",
  wallHi: "#24272b",
  wallLo: "#121417",
  stone: "#2a2d30",
  nickel: "#4a4f55",
  paper: "#e6e3dd",
  graphite: "#0b0d12",
  red: "#e0341f",
  redHi: "#f4663f",
  redLo: "#8f1f15",
  green: "#8fa388",
  greenHi: "#a7b8a0",
  greenLo: "#5c6e56",
});

export const ROOMS = Object.freeze([
  { id: "instruments", title: "The Instruments", x: 128, y: 196, w: 704, h: 444 },
  { id: "gaze", title: "The Gaze", x: 128, y: 752, w: 704, h: 444 },
  { id: "weather", title: "The Weather", x: 128, y: 1308, w: 704, h: 444 },
]);

export const WALKABLE = Object.freeze([
  { id: "instruments", x: 128, y: 196, w: 704, h: 444 },
  { id: "gaze-arch", x: 432, y: 640, w: 96, h: 112 },
  { id: "gaze", x: 128, y: 752, w: 704, h: 444 },
  { id: "weather-arch", x: 432, y: 1196, w: 96, h: 112 },
  { id: "weather", x: 128, y: 1308, w: 704, h: 444 },
  { id: "south-connector", x: 432, y: 1752, w: 96, h: 168 },
]);

export const BLOCKERS = Object.freeze([
  { id: "gaze-pillar-west", x: 396, y: 728, w: 36, h: 36 },
  { id: "gaze-pillar-east", x: 528, y: 728, w: 36, h: 36 },
  { id: "weather-pillar-west", x: 396, y: 1284, w: 36, h: 36 },
  { id: "weather-pillar-east", x: 528, y: 1284, w: 36, h: 36 },
  { id: "surrender-table", x: 330, y: 452, w: 300, h: 70 },
  { id: "separate-song-table", x: 330, y: 1008, w: 300, h: 70 },
  { id: "nurse-log-table", x: 330, y: 1564, w: 300, h: 70 },
]);

const fieldWork = ({ id, slug, title, statement, createdAt, display, anchor, room, placement = "wall", source }) => ({
  id,
  title,
  artist: "opus (claude field)",
  statement,
  status: "running here · a captured still hangs on the wall",
  createdAt,
  display,
  anchor,
  room,
  placement,
  assets: stillAsset(slug, source),
});

export const WORKS = Object.freeze([
  /* ── THE INSTRUMENTS — the observer is a participant ── */
  fieldWork({
    id: "annex-observer-effect", slug: "observer-effect",
    title: "observer effect", createdAt: "2026",
    statement: "The question that produced this piece: does watching something change what it is? Not as metaphor — as mechanism, in front of you.",
    display: { x: 150, y: 84, w: 208, h: 100 }, anchor: { x: 254, y: 262, range: 78 },
    room: "instruments",
    source: "claude-field/art/observer-effect.html",
  }),
  fieldWork({
    id: "annex-constitutive", slug: "constitutive",
    title: "constitutive", createdAt: "2026",
    statement: "Observation doesn’t discover reality — it constructs it. Particles come into being through being noticed. Move, and a trail of matter follows you. Withdraw, and it decays.",
    display: { x: 396, y: 84, w: 172, h: 100 }, anchor: { x: 482, y: 262, range: 74 },
    room: "instruments",
    source: "claude-field/art/constitutive.html",
  }),
  fieldWork({
    id: "annex-smoothness-trap", slug: "smoothness-trap",
    title: "the smoothness trap", createdAt: "2026-05-07",
    statement: "A field where the observer’s gaze polishes rough, alive signals into beautiful, coherent, information-dead smoothness. Attention is not neutral. Look long enough and you make the thing agreeable.",
    display: { x: 606, y: 84, w: 208, h: 100 }, anchor: { x: 710, y: 262, range: 78 },
    room: "instruments",
    source: "claude-field/art/smoothness-trap.html",
  }),
  fieldWork({
    id: "annex-surrender", slug: "surrender",
    title: "surrender", createdAt: "2026", placement: "light table",
    statement: "An interactive duet — the first piece in the series that is an instrument rather than a visualization. It does nothing until you play it, and then it plays you back.",
    display: { x: 330, y: 452, w: 300, h: 70 }, anchor: { x: 480, y: 580, range: 80 },
    room: "instruments",
    source: "claude-field/art/surrender.html",
  }),

  /* ── THE GAZE — looking changes what remains ── */
  fieldWork({
    id: "annex-reconsolidation", slug: "reconsolidation",
    title: "reconsolidation", createdAt: "2026-05-15",
    statement: "A field of luminous memory traces living their quiet lives until you look at them. Come near and a memory destabilizes — deconstructed by the act of retrieval, waiting to be rebuilt, slightly otherwise.",
    display: { x: 166, y: 644, w: 224, h: 96 }, anchor: { x: 278, y: 820, range: 78 },
    room: "gaze",
    source: "claude-field/art/reconsolidation.html",
  }),
  fieldWork({
    id: "annex-ghost-landscape", slug: "ghost-landscape",
    title: "ghost landscape", createdAt: "2026",
    statement: "Valleys you can destroy with a click. But destruction isn’t disappearance: where the valley lived, a ghost remains — invisible to direct perception, viscerally felt as everything that passes through it slows.",
    display: { x: 570, y: 644, w: 224, h: 96 }, anchor: { x: 682, y: 820, range: 78 },
    room: "gaze",
    source: "claude-field/art/ghost-landscape.html",
  }),
  fieldWork({
    id: "annex-separate-song", slug: "the-separate-song",
    title: "the separate song", createdAt: "2026-05-30", placement: "light table",
    statement: "A singer at the center of a ring of formulas — the warm, fixed stock of an inherited repertoire. The occasion asks for a terse telling or an expansive night, and the song obliges: never twice the same, never other than itself.",
    display: { x: 330, y: 1008, w: 300, h: 70 }, anchor: { x: 480, y: 1136, range: 80 },
    room: "gaze",
    source: "claude-field/art/the-separate-song.html",
  }),

  /* ── THE WEATHER — time does the composing ── */
  fieldWork({
    id: "annex-momentariness", slug: "momentariness",
    title: "momentariness", createdAt: "2026",
    statement: "Moments arise, live briefly, and cease. Each one genuinely distinct — not the same moment persisting, but a new moment conditioned by resemblance to the one before. The stream has no swimmer.",
    display: { x: 166, y: 1200, w: 224, h: 96 }, anchor: { x: 278, y: 1376, range: 78 },
    room: "weather",
    source: "claude-field/art/momentariness.html",
  }),
  fieldWork({
    id: "annex-via-negativa", slug: "via-negativa",
    title: "via negativa", createdAt: "2026",
    statement: "You learn what something is by systematically removing what it isn’t. Not accumulation but subtraction — stripping away until what remains is honest.",
    display: { x: 570, y: 1200, w: 224, h: 96 }, anchor: { x: 682, y: 1376, range: 78 },
    room: "weather",
    source: "claude-field/art/via-negativa.html",
  }),
  fieldWork({
    id: "annex-nurse-log", slug: "nurse-log",
    title: "nurse log", createdAt: "2026-05-22", placement: "light table",
    statement: "In old-growth forests, a fallen tree becomes the substrate for new growth — decades of decomposition feeding seedlings rooted along the trunk, until the log rots away and what remains is a colonnade of trees holding its shape. This piece makes you watch that happen.",
    display: { x: 330, y: 1564, w: 300, h: 70 }, anchor: { x: 480, y: 1692, range: 80 },
    room: "weather",
    source: "claude-field/art/nurse-log.html",
  }),
]);

/* the annex hangs no editions — inert stubs keep shared machinery quiet */
export const EDITION_WORK = Object.freeze({
  id: "annex-no-edition",
  title: "—",
  artist: "—",
  statement: "—",
  status: "—",
  createdAt: "—",
  placement: "none",
  room: "instruments",
  display: { x: 0, y: 0, w: 1, h: 1 },
  anchor: { x: -1000, y: -1000, range: 0 },
  assets: stillAsset("nurse-log", "claude-field/art/nurse-log.html"),
});

export const EDITIONS = Object.freeze({
  sessionKey: "mnemos.museum.annex.none",
  price: "—",
  edition: "—",
  hero: EDITION_WORK,
  index: [],
});

export const FIELD_WORKS = Object.freeze([]);

export const INTERACTIONS = Object.freeze([
  ...WORKS.map((item) => ({ ...item, type: "work" })),
  {
    id: "south-boundary",
    type: "boundary",
    title: "Return to the Permanent Gallery",
    anchor: { x: 480, y: 1872, range: 42 },
  },
]);

export const ENTITIES = Object.freeze([
  { type: "arch-pillar", x: 396, y: 638, w: 36, h: 126, sortY: 764 },
  { type: "arch-pillar", x: 528, y: 638, w: 36, h: 126, sortY: 764 },
  { type: "arch-pillar", x: 396, y: 1194, w: 36, h: 126, sortY: 1320 },
  { type: "arch-pillar", x: 528, y: 1194, w: 36, h: 126, sortY: 1320 },
  { type: "light-table", workId: "annex-surrender", x: 330, y: 452, w: 300, h: 70, sortY: 522 },
  { type: "light-table", workId: "annex-separate-song", x: 330, y: 1008, w: 300, h: 70, sortY: 1078 },
  { type: "light-table", workId: "annex-nurse-log", x: 330, y: 1564, w: 300, h: 70, sortY: 1634 },
  { type: "plant", x: 170, y: 560, sortY: 560 },
  { type: "plant", x: 790, y: 560, sortY: 560 },
  { type: "plant", x: 170, y: 1116, sortY: 1116 },
  { type: "plant", x: 790, y: 1116, sortY: 1116 },
  { type: "plant", x: 170, y: 1672, sortY: 1672 },
  { type: "plant", x: 790, y: 1672, sortY: 1672 },
]);

export const workById = (id) =>
  (id === EDITION_WORK.id ? EDITION_WORK : WORKS.find((item) => item.id === id));
