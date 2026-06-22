/* ============================================================================
   MnemosProvider — the one mind.
   Holds the active resident's whole interior and plays each conversational turn
   as a single cognitive-event stream that moves weather, graph, and the margin
   together. Switching residents re-scopes everything gracefully.
   ============================================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type {
  GraphResponse,
  MemoryResponse,
  ResidentInfo,
  Weather,
  Modulators,
  ChatMessage,
  RecentEntry,
  GraphEdge,
} from "../types/mnemos";
import { WEATHER_DEFAULT } from "../types/mnemos";
import { adapter, railNodeIds } from "../adapter/mnemosAdapter";
import { layoutGraph, type LaidOutNode } from "../sim/forceLayout";
import { applyEvent, relaxToward, computeModulators } from "../sim/weatherModel";
import { classifyCrossing } from "../sim/cognitiveStream";
import { useReducedMotion } from "../hooks/useReducedMotion";

type Phase = "idle" | "thinking" | "streaming";

interface MnemosCtx {
  residents: ResidentInfo[];
  resident: ResidentInfo;
  setResident: (id: string) => void;
  graph: GraphResponse;
  memory: MemoryResponse;
  dreams: string[];
  layout: Map<string, LaidOutNode>;
  railIds: Set<string>;
  weather: Weather;
  baseline: Weather;
  modulators: Modulators;
  messages: ChatMessage[];
  phase: Phase;
  recent: RecentEntry[];
  /** the latest recall cue — the graph's firing engine fires this node bright */
  pulse: { id: string; seq: number };
  freshEdges: GraphEdge[];
  send: (text: string) => void;
}

const Ctx = createContext<MnemosCtx | null>(null);
const EMPTY_GRAPH: GraphResponse = { nodes: [], edges: [] };
const EMPTY_MEMORY: MemoryResponse = {
  counts: { core_memories: 0, days_resident: 0, conversations_held: 0 },
  lately: [],
  threads: [],
  beliefs: [],
};

let MSG_SEQ = 0;
const mid = () => `m-${Date.now().toString(36)}-${(MSG_SEQ++).toString(36)}`;

const MAX_FRESH_EDGES = 4;

/** prepend a margin entry, skipping it if the same kind+text just appeared —
 *  the living mind never shows the identical note twice in a row. */
function prependRecent(r: RecentEntry[], surface: RecentEntry): RecentEntry[] {
  if (r.slice(0, 3).some((x) => x.kind === surface.kind && x.text === surface.text)) return r;
  return [surface, ...r].slice(0, 12);
}

export function MnemosProvider({ children }: { children: ReactNode }) {
  const residents = useMemo(() => adapter.listResidents(), []);
  const [resident, setResidentInfo] = useState<ResidentInfo>(residents[0]);

  const [graph, setGraph] = useState<GraphResponse>(EMPTY_GRAPH);
  const [memory, setMemory] = useState<MemoryResponse>(EMPTY_MEMORY);
  const [dreams, setDreams] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<Weather>(WEATHER_DEFAULT);
  const [weather, setWeather] = useState<Weather>(WEATHER_DEFAULT);
  const [modulators, setModulators] = useState<Modulators>({
    arousal: 0.4,
    openness: 0.6,
    resolution: 0.5,
    selection_threshold: 0.5,
  });
  const [layout, setLayout] = useState<Map<string, LaidOutNode>>(new Map());
  const [railIds, setRailIds] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [pulse, setPulse] = useState<{ id: string; seq: number }>({ id: "", seq: 0 });
  const [freshEdges, setFreshEdges] = useState<GraphEdge[]>([]);

  // turn bookkeeping ------------------------------------------------------
  const timers = useRef<number[]>([]);
  const turnIndex = useRef(0);
  const turnToken = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const reduced = useReducedMotion();

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // load a resident's whole interior ------------------------------------
  const load = useCallback(async (id: string) => {
    clearTimers();
    turnToken.current++;
    const [g, m, d, base] = await Promise.all([
      adapter.getGraph(id),
      adapter.getMemory(id),
      adapter.getDreams(id),
      adapter.getBaseline(id),
    ]);
    setGraph(g);
    setMemory(m);
    setDreams(d);
    setBaseline(base);
    setWeather(base);
    setModulators(computeModulators(g));
    setPulse({ id: "", seq: 0 });
    setFreshEdges([]);
    setMessages([]);
    setPhase("idle");
    turnIndex.current = 0;

    const ids = railNodeIds(g, 22);
    setRailIds(ids);
    const present = g.nodes.filter((n) => ids.has(n.id)).map((n) => n.id);
    const subEdges = g.edges.filter((e) => ids.has(e.from_id) && ids.has(e.to_id));
    setLayout(layoutGraph(present, subEdges, id));

    // seed the margin so it feels inhabited from first load
    const seed: RecentEntry[] = [];
    if (m.beliefs[0]) {
      const b = m.beliefs[0];
      // honest: only call it a crossing if it actually crossed a tier (same
      // rule the live stream uses). otherwise it's just a settled belief.
      const crossing =
        b.prior_confidence !== undefined
          ? classifyCrossing(b.prior_confidence, b.confidence)
          : null;
      seed.push({
        id: `seed-b-${id}`,
        kind: "belief",
        tag: crossing ? `belief · ${crossing}` : "belief",
        text: b.text,
        when: "earlier today",
        confidence: b.confidence,
        prior_confidence: b.prior_confidence,
        crossing: crossing ?? undefined,
      });
    }
    if (m.threads[0]) {
      seed.push({
        id: `seed-t-${id}`,
        kind: "resonance",
        tag: "resonance",
        text: `echoes “${m.threads[0].name}”`,
        when: "earlier this week",
        detail: `surfaced ${m.threads[0].appearance_count} times across conversations`,
      });
    }
    if (d[0]) {
      seed.push({
        id: `seed-d-${id}`,
        kind: "dream",
        tag: "while you were away",
        text: firstSentence(d[0]),
        when: "earlier today",
        detail: d[0],
      });
    }
    setRecent(seed);
  }, []);

  useEffect(() => {
    load(resident.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident.id]);

  const setResident = useCallback(
    (id: string) => {
      const info = residents.find((r) => r.id === id);
      if (info) setResidentInfo(info);
    },
    [residents]
  );

  // resting drift toward baseline + sparse ambient margin events ----------
  useEffect(() => {
    let tick = 0;
    const iv = window.setInterval(() => {
      tick++;
      if (phaseRef.current !== "idle") return;
      setWeather((w) => relaxToward(w, baseline));
      const amb = adapter.ambient(resident.id, tick);
      if (amb?.surface) {
        const surface = amb.surface;
        setWeather((w) => applyEvent(w, amb.type));
        setRecent((r) => prependRecent(r, surface));
      }
    }, 1700);
    return () => window.clearInterval(iv);
  }, [resident.id, baseline]);

  // THE ONE HEARTBEAT — a single rAF writes a continuous 0..1 phase to a CSS
  // var on :root while the model is active. The room glow, the thinking line,
  // and the graph cue all read this exact var, so they breathe in lockstep
  // (one mind, not three timelines). Off at rest and under reduced-motion.
  const active = phase !== "idle";
  useEffect(() => {
    const root = document.documentElement;
    if (!active || reduced) {
      root.style.setProperty("--beat-phase", "0.6");
      return;
    }
    const BEAT = 3200;
    let raf = 0;
    let start = 0;
    const loop = (t: number) => {
      if (!start) start = t;
      // sine starting at 0, rising — a calm in/out breath
      const p = 0.5 - 0.5 * Math.cos((2 * Math.PI * (t - start)) / BEAT);
      root.style.setProperty("--beat-phase", p.toFixed(4));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      root.style.setProperty("--beat-phase", "0.6");
    };
  }, [active, reduced]);

  // the turn ---------------------------------------------------------------
  const send = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || phaseRef.current !== "idle") return;
      clearTimers();
      const token = ++turnToken.current;
      const idx = turnIndex.current++;

      const userMsg: ChatMessage = { id: mid(), role: "user", text: clean, state: "settled" };
      const assistantId = mid();
      setMessages((m) => [
        ...m,
        userMsg,
        { id: assistantId, role: "assistant", text: "", state: "thinking" },
      ]);
      // keep the constellation calm: only the few most-recent discoveries stay
      // drawn, so connections don't accumulate into clutter over a session.
      setFreshEdges((e) => e.slice(-MAX_FRESH_EDGES));
      setPhase("thinking");

      const { script } = { script: adapter.turn(resident.id, clean, idx) };
      for (const { atMs, event } of script) {
        after(atMs, () => {
          if (turnToken.current !== token) return;
          setWeather((w) => applyEvent(w, event.type));
          if ((event.type === "spreading_activation" || event.type === "recall") && (event.sourceId || event.nodeId)) {
            const cueId = event.sourceId ?? event.nodeId!;
            setPulse((p) => ({ id: cueId, seq: p.seq + 1 }));
          }
          if (event.type === "new_connection_discovered" && event.edge) {
            const edge = event.edge;
            setFreshEdges((e) => (e.some((x) => sameEdge(x, edge)) ? e : [...e, edge].slice(-MAX_FRESH_EDGES)));
          }
          if (event.surface) {
            const surface = event.surface;
            setRecent((r) => prependRecent(r, surface));
            if (surface.kind === "engram" && surface.forming !== undefined) {
              // settle the forming hairline upward over ~1.6s
              [0.34, 0.52, 0.66].forEach((v, i) =>
                after((i + 1) * 520, () => {
                  if (turnToken.current !== token) return;
                  setRecent((r) =>
                    r.map((x) => (x.id === surface.id ? { ...x, forming: v } : x))
                  );
                })
              );
            }
          }
          if (event.type === "belief_confirmed" || event.type === "belief_contradicted") {
            const bId = event.beliefId;
            const conf = event.surface?.confidence;
            if (bId && conf !== undefined) {
              setMemory((mem) => ({
                ...mem,
                beliefs: mem.beliefs.map((b) =>
                  b.id === bId ? { ...b, prior_confidence: b.confidence, confidence: conf } : b
                ),
              }));
            }
          }
        });
      }

      // begin streaming the reply after the thinking beat
      const thinkMs = 1500;
      after(thinkMs, () => {
        if (turnToken.current !== token) return;
        setPhase("streaming");
        const full = adapter.reply(resident.id, clean, idx);
        const chars = [...full];
        let i = 0;
        const step = () => {
          if (turnToken.current !== token) return;
          // a few glyphs per tick at a calmer cadence — same felt speed, far
          // fewer re-renders than one char every 15ms.
          i = Math.min(chars.length, i + 3);
          const slice = chars.slice(0, i).join("");
          setMessages((m) =>
            m.map((msg) => (msg.id === assistantId ? { ...msg, text: slice, state: "streaming" } : msg))
          );
          if (i < chars.length) {
            timers.current.push(window.setTimeout(step, 34));
          } else {
            setMessages((m) =>
              m.map((msg) => (msg.id === assistantId ? { ...msg, state: "settled" } : msg))
            );
            setPhase("idle");
          }
        };
        step();
      });
    },
    [resident.id]
  );

  useEffect(() => () => clearTimers(), []);

  const value: MnemosCtx = {
    residents,
    resident,
    setResident,
    graph,
    memory,
    dreams,
    layout,
    railIds,
    weather,
    baseline,
    modulators,
    messages,
    phase,
    recent,
    pulse,
    freshEdges,
    send,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMnemos(): MnemosCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMnemos must be used within MnemosProvider");
  return v;
}

// helpers -----------------------------------------------------------------
function sameEdge(a: GraphEdge, b: GraphEdge) {
  return (
    (a.from_id === b.from_id && a.to_id === b.to_id) ||
    (a.from_id === b.to_id && a.to_id === b.from_id)
  );
}
function firstSentence(s: string): string {
  const m = s.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : s).trim();
}
