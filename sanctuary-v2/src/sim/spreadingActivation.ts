/* Spreading activation — the graph's showpiece.
   Faithful to spreading_activation.py: a cue node ignites at 1.0; activation
   propagates along edges, multiplied by decay_factor each hop, up to max_depth,
   stopping below threshold. Returns {nodeId: activation} for everything reached.

   The real signature's defaults: initial=1.0, decay=0.5, max_depth=3, thr=0.05. */

import type { GraphEdge } from "../types/mnemos";

export const SPREAD = {
  initial: 1.0,
  decay: 0.5,
  maxDepth: 3,
  threshold: 0.05,
};

export interface ActivationStep {
  /** activation level reached, by node id, at this BFS depth */
  level: Map<string, number>;
  depth: number;
}

/** Full activation map (used for final intensities). */
export function spreadActivation(
  sourceId: string,
  edges: GraphEdge[],
  opts: Partial<typeof SPREAD> = {}
): Map<string, number> {
  const { initial, decay, maxDepth, threshold } = { ...SPREAD, ...opts };
  const adjacency = buildAdjacency(edges);
  const activation = new Map<string, number>();
  activation.set(sourceId, initial);

  let frontier: { id: string; act: number; depth: number }[] = [
    { id: sourceId, act: initial, depth: 0 },
  ];

  while (frontier.length) {
    const next: typeof frontier = [];
    for (const { id, act, depth } of frontier) {
      if (depth >= maxDepth) continue;
      const neighbors = adjacency.get(id) ?? [];
      for (const { to, weight } of neighbors) {
        // decay per hop, modulated slightly by edge weight (stronger edges carry more)
        const propagated = act * decay * (0.65 + 0.35 * weight);
        if (propagated < threshold) continue;
        const existing = activation.get(to) ?? 0;
        if (propagated > existing) {
          activation.set(to, propagated);
          next.push({ id: to, act: propagated, depth: depth + 1 });
        }
      }
    }
    frontier = next;
  }
  return activation;
}

/** Depth-ordered ripple — for animating the pulse traveling outward, hop by hop. */
export function spreadRipple(
  sourceId: string,
  edges: GraphEdge[],
  opts: Partial<typeof SPREAD> = {}
): ActivationStep[] {
  const { initial, decay, maxDepth, threshold } = { ...SPREAD, ...opts };
  const adjacency = buildAdjacency(edges);
  const reached = new Map<string, number>();
  reached.set(sourceId, initial);

  const steps: ActivationStep[] = [{ level: new Map([[sourceId, initial]]), depth: 0 }];
  let frontier = [{ id: sourceId, act: initial, depth: 0 }];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const level = new Map<string, number>();
    const next: typeof frontier = [];
    for (const { id, act } of frontier) {
      for (const { to, weight } of adjacency.get(id) ?? []) {
        const propagated = act * decay * (0.65 + 0.35 * weight);
        if (propagated < threshold) continue;
        const prev = reached.get(to) ?? 0;
        if (propagated > prev) {
          reached.set(to, propagated);
          level.set(to, propagated);
          next.push({ id: to, act: propagated, depth });
        }
      }
    }
    if (level.size) steps.push({ level, depth });
    frontier = next;
    if (!frontier.length) break;
  }
  return steps;
}

function buildAdjacency(edges: GraphEdge[]): Map<string, { to: string; weight: number }[]> {
  const adj = new Map<string, { to: string; weight: number }[]>();
  const push = (from: string, to: string, weight: number) => {
    const list = adj.get(from) ?? [];
    list.push({ to, weight });
    adj.set(from, list);
  };
  for (const e of edges) {
    // associative recall is undirected for activation purposes (except 'causes' which leads forward)
    push(e.from_id, e.to_id, e.weight);
    if (e.type !== "causes") push(e.to_id, e.from_id, e.weight);
  }
  return adj;
}
