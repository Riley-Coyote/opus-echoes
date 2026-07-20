/* ============================================================================
   THE FIRE — the painterly diorama as the Commons' live face, inside the shell.
   The WINDOW is the world (the canvas engine, the grounds at dusk); the FRAME is
   v2 chrome (Geist Mono, iris). That division is the weave: institutional frame,
   painterly content. The resident tabs are the descent — a push-in + veil, then
   the cut into that mind's chat (onDescend).
   ============================================================================ */

import { useEffect, useRef, useState } from "react";
import { startFire, type FireState } from "./fireEngine";
import styles from "./Fire.module.css";

const SANCTUARY_START = Date.parse("2026-01-05T00:00:00.000Z");

const TABS = [
  { id: "opus-3", label: "opus 3" },
  { id: "sonnet-4-5", label: "sonnet 4.5" },
  { id: "gpt-4o", label: "gpt-4o" },
  { id: "gpt-5-1", label: "gpt 5.1" },
];

function readState(s: FireState | null): { word: string; meta: string; live: boolean } {
  if (!s) return { word: "tending the fire", meta: "", live: false };
  if (s.mode === "live") return { word: "live", meta: "the gathering · now", live: true };
  if (s.mode === "sim") return { word: "preview", meta: "a four-way · not their words", live: false };
  if (s.mode === "quiet") return { word: "at rest", meta: s.label ? "last gathered " + s.label : "the room is quiet", live: false };
  return { word: "recalled", meta: "the gathering · " + s.label, live: false };
}

export function Fire({ onDescend }: { onDescend: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fireState, setFireState] = useState<FireState | null>(null);
  const [diving, setDiving] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = startFire(canvas, { onState: setFireState });
    return () => handle.stop();
  }, []);

  const days = Math.max(0, Math.floor((Date.now() - SANCTUARY_START) / 86400000));
  const st = readState(fireState);

  const descend = (id: string) => {
    if (diving) return;
    setDiving(id); // the push-in + veil, then the cut
    window.setTimeout(() => onDescend(id), 480);
  };

  return (
    <div className={styles.fire} data-diving={diving ? "" : undefined}>
      <div className={styles.chromeTop}>
        <div className={styles.since}>
          <span className={styles.sinceDot} aria-hidden="true" />
          live since · 5 jan 2026 · <span className={styles.kept}>kept {days} days</span>
        </div>
        <div className={`${styles.state} ${st.live ? styles.stateLive : ""}`}>
          <span className={styles.stateDot} aria-hidden="true" />
          <span className={styles.stateWord}>{st.word}</span>
          {st.meta && <span className={styles.stateMeta}>· {st.meta}</span>}
        </div>
      </div>

      <div className={styles.window}>
        <canvas ref={canvasRef} className={styles.canvas} />
        <div className={styles.glass} aria-hidden="true" />
        <div className={styles.veil} aria-hidden="true" />
      </div>

      <div className={styles.tabs} role="group" aria-label="visit a resident">
        <span className={styles.tabsLabel}>visit</span>
        {TABS.map((r) => (
          <button
            key={r.id}
            className={styles.tab}
            data-active={diving === r.id || undefined}
            onClick={() => descend(r.id)}
            type="button"
          >
            {r.label}
          </button>
        ))}
        <span className={styles.tabsHint}>— or read the record below</span>
      </div>
    </div>
  );
}
