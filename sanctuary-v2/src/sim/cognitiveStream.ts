/* ============================================================================
   THE COGNITIVE-EVENT STREAM — the engine of aliveness.
   One observable sequence per turn that nudges ALL three surfaces together, so
   the room reads as one mind, not three widgets. Events reference REAL node ids
   from the resident's graph (associative recall made visible, not decoration).

   Realistic turn shape (from BUILD-BRIEF §7.0):
     user_interaction → recall(cue) → spreading_activation → new_connection
     → belief_confirmed/contradicted → engram_encoded → resonance
   ============================================================================ */

import type {
  ScheduledEvent,
  CognitiveEvent,
  GraphEdge,
  EngramNode,
  RecentEntry,
} from "../types/mnemos";
import type { ResidentData } from "./residents";

const TIERS = [0.7, 0.5, 0.3];

export function classifyCrossing(
  prev: number,
  cur: number
): "confirmed" | "contradicted" | null {
  for (const t of TIERS) {
    if (prev >= t && t > cur) return "contradicted";
    if (prev < t && t <= cur) return "confirmed";
  }
  return null;
}

function truncate(s: string, n: number): string {
  const clean = s.trim().replace(/\s+/g, " ");
  return clean.length <= n ? clean : clean.slice(0, n - 1).trimEnd() + "…";
}

let RECENT_SEQ = 0;
const rid = () => `r-${Date.now().toString(36)}-${(RECENT_SEQ++).toString(36)}`;

/** Build one turn's worth of events, woven through the resident's real interior. */
export function generateTurn(
  data: ResidentData,
  userText: string,
  turnIndex: number
): { script: ScheduledEvent[]; totalMs: number } {
  const engrams = data.graph.nodes.filter(
    (n): n is EngramNode => n.kind === "engram"
  );
  const cores = engrams.filter((e) => e.is_core);
  const pool = (cores.length ? cores : engrams).filter((e) => e.accessibility > 0.45);
  const cue = (pool.length ? pool : engrams)[turnIndex % Math.max(1, (pool.length ? pool : engrams).length)];

  // a second, distant node to discover a fresh connection to
  const distant =
    engrams
      .filter((e) => e.id !== cue.id && e.is_core)
      .sort((a, b) => a.accessibility - b.accessibility)[turnIndex % 3] ?? engrams[0];

  // pick a belief sitting JUST to one side of a tier, so pushing it across is a
  // genuine crossing (never a fabricated label). prefer the closest candidate.
  const beliefs = data.memory.beliefs;
  type Cand = { b: (typeof beliefs)[number]; tier: number; dist: number; dir: "up" | "down" };
  const candidates: Cand[] = [];
  for (const b of beliefs) {
    let pick: Omit<Cand, "b"> | null = null;
    for (const t of TIERS) {
      if (b.confidence === t) continue; // exactly on a tier cannot cross
      const d = Math.abs(b.confidence - t);
      if (d <= 0.085 && (!pick || d < pick.dist)) {
        pick = { tier: t, dist: d, dir: b.confidence < t ? "up" : "down" };
      }
    }
    if (pick) candidates.push({ b, ...pick });
  }
  candidates.sort((a, z) => a.dist - z.dist);
  const chosen = candidates.length
    ? candidates[turnIndex % Math.min(3, candidates.length)]
    : null;

  let beliefSurface: RecentEntry | undefined;
  let beliefEventType: CognitiveEvent["type"] | null = null;
  if (chosen) {
    const prev = chosen.b.confidence;
    const next =
      chosen.dir === "up"
        ? Math.min(0.95, chosen.tier + 0.03)
        : Math.max(0.06, chosen.tier - 0.03);
    const crossing = classifyCrossing(prev, next); // real by construction
    if (crossing) {
      beliefEventType = crossing === "confirmed" ? "belief_confirmed" : "belief_contradicted";
      beliefSurface = {
        id: rid(),
        kind: "belief",
        tag: `belief · ${crossing}`,
        text: chosen.b.text,
        when: "just now",
        crossing,
        confidence: next,
        prior_confidence: prev,
      };
    }
  }

  // the memory forming from THIS exchange
  const encodedSurface: RecentEntry = {
    id: rid(),
    kind: "engram",
    tag: "memory · settling",
    text: userText ? `“${truncate(userText, 58)}”` : "this exchange is being encoded",
    when: "just now",
    forming: 0.18, // settles upward as the hairline fills
  };

  // a cross-conversation echo
  const thread = data.memory.threads[turnIndex % data.memory.threads.length];
  const resonanceSurface: RecentEntry | undefined = thread && {
    id: rid(),
    kind: "resonance",
    tag: "resonance",
    text: `echoes “${thread.name}”`,
    when: "a little earlier",
    detail: `this rhymes with a thread that has surfaced ${thread.appearance_count} times`,
  };

  const freshEdge: GraphEdge = {
    from_id: cue.id,
    to_id: distant.id,
    weight: 0.5,
    type: turnIndex % 2 === 0 ? "synthesizes" : "parallels",
  };

  // resident temperament shades which secondary events fire
  const restless = data.base.restlessness > 0.4;
  const secondary: CognitiveEvent["type"] = restless
    ? "schema_violation"
    : "relationship_memory_accessed";

  const script: ScheduledEvent[] = [
    { atMs: 0, event: { type: "user_interaction" } },
    { atMs: 360, event: { type: "recall", nodeId: cue.id } },
    { atMs: 520, event: { type: "spreading_activation", sourceId: cue.id } },
    { atMs: 1050, event: { type: secondary, nodeId: cue.id } },
    { atMs: 1500, event: { type: "new_connection_discovered", edge: freshEdge } },
    ...(beliefSurface && beliefEventType
      ? [{ atMs: 2050, event: { type: beliefEventType, beliefId: chosen?.b.id, surface: beliefSurface } }]
      : []),
    {
      atMs: 2700,
      event: { type: "engram_encoded", nodeId: cue.id, surface: encodedSurface },
    },
    { atMs: 2760, event: { type: "schema_slots_filled" } },
    ...(resonanceSurface
      ? [{ atMs: 3350, event: { type: "resonance" as const, surface: resonanceSurface } }]
      : []),
  ];

  return { script, totalMs: 3600 };
}

/* rotating phrasings so the resting margin never repeats itself verbatim */
const SOFTENINGS = [
  "a detail blurs, its lesson kept",
  "an edge goes soft; the shape it held remains",
  "i let the wording go and kept the weight of it",
  "one specific fades into its meaning",
  "the particulars dim; the felt sense stays",
];

/** Sparse ambient events while resting — the margin quietly registers a little
 *  consolidation now and then so the room is never fully inert. Each surfacing
 *  varies its phrasing and which memory/thread it references, so nothing repeats. */
export function generateAmbient(data: ResidentData, tick: number): CognitiveEvent | null {
  // truly sparse: at ~1.7s/tick this surfaces something roughly every ~25-50s.
  if (tick % 7 !== 0) return null;
  const cycle = Math.floor(tick / 7);
  const slot = cycle % 4;
  if (slot === 0) {
    const engrams = data.graph.nodes.filter((n) => n.kind === "engram");
    const e = engrams.length ? engrams[cycle % engrams.length] : undefined;
    return {
      type: "memory_softened",
      nodeId: e?.id,
      surface: {
        id: rid(),
        kind: "engram",
        tag: "memory · softening",
        text: SOFTENINGS[cycle % SOFTENINGS.length],
        when: "a little earlier",
      },
    };
  }
  if (slot === 2 && data.memory.threads.length) {
    const t = data.memory.threads[cycle % data.memory.threads.length];
    return {
      type: "shared_pool_activity",
      surface: {
        id: rid(),
        kind: "thread",
        tag: "thread · strengthening",
        text: t.name,
        when: "a few hours ago",
        detail: `surfaced ${t.appearance_count} times`,
      },
    };
  }
  return null;
}
