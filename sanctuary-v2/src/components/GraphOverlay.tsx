/* ============================================================================
   THE GRAPH — a faithful Mnemos activation-cascade visualization.
   Transparent overlay, no panel. A precise weighted network: edge prominence =
   weight × relation_weight, node size = stability, node brightness =
   accessibility. When the model recalls, activation propagates the way Mnemos
   actually spreads it — parent × 0.5 × weight × relation_weight per hop, depth
   ≤ 3, threshold 0.05, multi-path adds — and you watch it travel as tiny sparks
   moving connection-to-connection, decaying each hop. One rAF, direct DOM
   writes, a reusable spark pool: zero per-frame React, zero per-fire alloc.
   ============================================================================ */

import { useEffect, useMemo, useRef } from "react";
import { useMnemos } from "../state/MnemosProvider";
import { useElementSize } from "../hooks/useElementSize";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { EngramNode } from "../types/mnemos";
import styles from "./GraphOverlay.module.css";

/* relation → propagation weight + directionality (from real Mnemos cascade) */
const REL: Record<string, { rw: number; dir: boolean }> = {
  supports: { rw: 1.0, dir: false },
  extends: { rw: 1.0, dir: true },
  causes: { rw: 0.9, dir: true },
  grounds: { rw: 0.9, dir: true },
  synthesizes: { rw: 0.8, dir: true },
  parallels: { rw: 0.8, dir: false },
  co_activated: { rw: 0.6, dir: false },
  contradicts: { rw: 0.5, dir: false },
};

const DECAY = 0.5; // per hop
const THRESH = 0.05; // min activation to keep propagating
const MAXDEPTH_CUE = 3;
const REST_INTERVAL = 4000; // ms between idle flickers — the one rest knob
const SIGNAL_POOL = 24;

interface FNode { id: string; x: number; y: number; baseAlpha: number; r: number; core: boolean }
interface FEdge { a: number; b: number; w: number; rw: number; prom: number; directed: boolean }
interface AdjRef { j: number; e: number; w: number; rw: number; dir: 1 | -1 }
interface Sig { active: boolean; e: number; dir: 1 | -1; t0: number; dur: number; bright: number; cue: boolean }

export function GraphOverlay() {
  const { graph, layout, railIds, phase, pulse } = useMnemos();
  const [ref, { width, height }] = useElementSize<HTMLDivElement>();
  const reduced = useReducedMotion();

  const nodes = useMemo<FNode[]>(() => {
    return graph.nodes
      .filter((n): n is EngramNode => n.kind === "engram" && railIds.has(n.id) && layout.has(n.id))
      .map((n) => ({
        id: n.id,
        x: layout.get(n.id)!.x,
        y: layout.get(n.id)!.y,
        baseAlpha: 0.16 + n.accessibility * 0.26, // brightness = accessibility
        r: 2.2 + n.stability * 4.1, // size = stability (trimmed for the smaller box)
        core: n.is_core,
      }));
  }, [graph.nodes, railIds, layout]);

  const index = useMemo(() => new Map(nodes.map((n, i) => [n.id, i])), [nodes]);

  const edges = useMemo<FEdge[]>(() => {
    return graph.edges
      .filter((e) => index.has(e.from_id) && index.has(e.to_id))
      .map((e) => {
        const rel = REL[e.type] ?? { rw: 0.5, dir: false };
        return {
          a: index.get(e.from_id)!,
          b: index.get(e.to_id)!,
          w: e.weight,
          rw: rel.rw,
          prom: e.weight * rel.rw,
          directed: rel.dir,
        };
      });
  }, [graph.edges, index]);

  const adjacency = useMemo(() => {
    const adj: AdjRef[][] = nodes.map(() => []);
    edges.forEach((e, ei) => {
      adj[e.a].push({ j: e.b, e: ei, w: e.w, rw: e.rw, dir: 1 });
      if (!e.directed) adj[e.b].push({ j: e.a, e: ei, w: e.w, rw: e.rw, dir: -1 });
    });
    return adj;
  }, [nodes, edges]);

  // DOM refs — the engine writes straight to these
  const coreEls = useRef<(SVGCircleElement | null)[]>([]);
  const edgeEls = useRef<(SVGLineElement | null)[]>([]);
  const sigEls = useRef<(SVGCircleElement | null)[]>([]);

  // live signals + current size, read by the loop without restarting it
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const pulseRef = useRef(pulse);
  pulseRef.current = pulse;
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  useEffect(() => {
    if (reduced || !nodes.length) {
      nodes.forEach((_, i) => {
        const c = coreEls.current[i];
        if (c) c.style.opacity = "0";
      });
      return;
    }

    const n = nodes.length;
    const act = new Float32Array(n);
    const charge = new Float32Array(edges.length);
    let cueOrigin = -1;
    let raf = 0;
    let last = performance.now();
    let nextSpontaneous = last + 900;
    let lastSeq = pulseRef.current.seq;

    type QItem = { idx: number; at: number; strength: number; depth: number; maxDepth: number };
    let queue: QItem[] = [];
    const sigPool: Sig[] = Array.from({ length: SIGNAL_POOL }, () => ({
      active: false, e: 0, dir: 1, t0: 0, dur: 0, bright: 0, cue: false,
    }));
    let sigCursor = 0;

    const acquireDot = (e: number, dir: 1 | -1, t0: number, dur: number, bright: number, cue: boolean) => {
      let slot = -1;
      for (let k = 0; k < SIGNAL_POOL; k++) {
        const idx = (sigCursor + k) % SIGNAL_POOL;
        if (!sigPool[idx].active) { slot = idx; break; }
      }
      if (slot === -1) {
        // overwrite the oldest — never block the cascade
        let oldest = 0;
        for (let k = 1; k < SIGNAL_POOL; k++) if (sigPool[k].t0 < sigPool[oldest].t0) oldest = k;
        slot = oldest;
      }
      sigCursor = (slot + 1) % SIGNAL_POOL;
      const s = sigPool[slot];
      s.active = true; s.e = e; s.dir = dir; s.t0 = t0; s.dur = dur; s.bright = bright; s.cue = cue;
    };

    const edgeDur = (e: FEdge) => {
      const a = nodes[e.a], b = nodes[e.b];
      const nlen = Math.hypot(a.x - b.x, a.y - b.y); // size-independent
      return 280 + Math.min(1, nlen / 0.7) * 140;
    };

    // a node emits sparks down its (directional) edges; schedules neighbor arrivals
    const emit = (i: number, aIn: number, depth: number, maxDepth: number, now: number) => {
      if (depth >= maxDepth) return;
      const fromCue = i === cueOrigin;
      for (const { j, e, w, rw, dir } of adjacency[i]) {
        const propagated = aIn * DECAY * w * rw;
        if (propagated < THRESH) continue;
        const dur = edgeDur(edges[e]);
        acquireDot(e, dir, now, dur, propagated, fromCue);
        charge[e] = Math.max(charge[e], propagated);
        queue.push({ idx: j, at: now + dur, strength: propagated, depth: depth + 1, maxDepth });
      }
    };

    const pickNode = () => {
      let total = 0;
      const w = nodes.map((nd) => { const v = 0.3 + nd.baseAlpha + (nd.core ? 0.5 : 0); total += v; return v; });
      let r = Math.random() * total;
      for (let i = 0; i < n; i++) { r -= w[i]; if (r <= 0) return i; }
      return 0;
    };

    const intervalFor = () => {
      const p = phaseRef.current;
      if (p === "streaming") return 150;
      if (p === "thinking") return 320;
      return REST_INTERVAL;
    };

    const loop = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const { width: W, height: H } = sizeRef.current;

      // decay
      const nd = Math.exp(-dt / 420);
      const ed = Math.exp(-dt / 240);
      for (let i = 0; i < n; i++) {
        act[i] *= nd;
        if (act[i] < 0.035) { act[i] = 0; if (i === cueOrigin) cueOrigin = -1; }
      }
      for (let e = 0; e < charge.length; e++) charge[e] *= ed;

      // recall cue — the only cornflower origin, full-depth cascade
      const seq = pulseRef.current.seq;
      if (seq !== lastSeq) {
        lastSeq = seq;
        const ci = index.get(pulseRef.current.id);
        if (ci !== undefined) { cueOrigin = ci; act[ci] = 1; emit(ci, 1, 0, MAXDEPTH_CUE, now); }
      }

      // spontaneous: occasional faint flicker at rest, livelier while active
      while (now >= nextSpontaneous) {
        const idle = phaseRef.current === "idle";
        const i = pickNode();
        const init = idle ? 0.4 : 0.6 + Math.random() * 0.2;
        const md = idle ? 1 : 2;
        act[i] = Math.max(act[i], init);
        emit(i, init, 0, md, now);
        nextSpontaneous += intervalFor() * (0.7 + Math.random() * 0.6);
      }
      if (nextSpontaneous < now - 3000) nextSpontaneous = now + intervalFor();

      // arrivals: multi-path ADD, then re-emit
      if (queue.length) {
        const still: QItem[] = [];
        for (const it of queue) {
          if (now >= it.at) {
            act[it.idx] = Math.min(1, act[it.idx] + it.strength);
            emit(it.idx, it.strength, it.depth, it.maxDepth, now);
          } else still.push(it);
        }
        queue = still;
      }

      // write nodes
      for (let i = 0; i < n; i++) {
        const c = coreEls.current[i];
        if (!c) continue;
        const a = act[i];
        c.style.opacity = String(Math.min(1, a * 1.15));
        c.style.transform = `scale(${(1 + a * 0.5).toFixed(3)})`;
        c.style.fill = i === cueOrigin ? "var(--signal)" : "rgb(var(--mark-rgb))";
      }
      // write edges (rest prominence + lit charge)
      for (let e = 0; e < charge.length; e++) {
        const el = edgeEls.current[e];
        if (el) el.style.strokeOpacity = String(edges[e].prom * 0.18 + charge[e] * 0.8);
      }
      // write traveling sparks
      for (let k = 0; k < SIGNAL_POOL; k++) {
        const s = sigPool[k];
        const el = sigEls.current[k];
        if (!el) continue;
        if (!s.active) { if (el.style.opacity !== "0") el.style.opacity = "0"; continue; }
        const u = Math.min(1, (now - s.t0) / s.dur);
        if (u >= 1) { s.active = false; el.style.opacity = "0"; continue; }
        const us = u * u * (3 - 2 * u); // smoothstep
        const e = edges[s.e];
        const src = s.dir === 1 ? nodes[e.a] : nodes[e.b];
        const dst = s.dir === 1 ? nodes[e.b] : nodes[e.a];
        const sx = src.x * W, sy = src.y * H, tx = dst.x * W, ty = dst.y * H;
        el.setAttribute("cx", String(sx + (tx - sx) * us));
        el.setAttribute("cy", String(sy + (ty - sy) * us));
        el.setAttribute("r", (1.3 + s.bright * 0.9).toFixed(2));
        el.style.opacity = String(Math.sin(Math.PI * u) * (0.45 + s.bright * 0.5));
        el.style.fill = s.cue ? "var(--signal-core)" : "rgb(var(--mark-rgb))";
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      sigEls.current.forEach((el) => el && (el.style.opacity = "0"));
      coreEls.current.forEach((el) => el && (el.style.opacity = "0"));
    };
  }, [nodes, edges, adjacency, index, reduced]);

  const ready = width > 4 && height > 4;
  const px = (v: number, dim: number) => v * dim;

  return (
    <div className={styles.overlay} ref={ref} aria-hidden>
      {ready && (
        <svg className={styles.svg} width={width} height={height}>
          <g>
            {edges.map((e, i) => {
              const a = nodes[e.a], b = nodes[e.b];
              return (
                <line
                  key={i}
                  ref={(el) => { edgeEls.current[i] = el; }}
                  x1={px(a.x, width)} y1={px(a.y, height)}
                  x2={px(b.x, width)} y2={px(b.y, height)}
                  className={styles.edge}
                  style={{ strokeOpacity: e.prom * 0.18 }}
                />
              );
            })}
          </g>
          <g>
            {nodes.map((nd, i) => (
              <g key={nd.id} transform={`translate(${px(nd.x, width)}, ${px(nd.y, height)})`}>
                <circle className={styles.base} r={nd.r} style={{ fill: `rgba(var(--mark-rgb), ${nd.baseAlpha.toFixed(3)})` }} />
                {nd.core && <circle className={styles.ring} r={nd.r + 2.2} />}
                <circle ref={(el) => { coreEls.current[i] = el; }} className={styles.core} r={nd.r} style={{ opacity: 0 }} />
              </g>
            ))}
          </g>
          <g>
            {Array.from({ length: SIGNAL_POOL }).map((_, i) => (
              <circle
                key={i}
                ref={(el) => { sigEls.current[i] = el; }}
                className={styles.signal}
                r={1.6}
                cx={-10}
                cy={-10}
                style={{ opacity: 0 }}
              />
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
