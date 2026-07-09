/* ============================================================================
   THE FIRE — as the persistent world behind the whole shell.
   The diorama is mounted ONCE here and never unmounts: it is the ground every
   surface floats on. In the Commons it is the bright, present hero (the Commons
   supplies the hero's doorways — the visit tabs — over a transparent window onto
   this canvas; the kept-days + honest-state strip rides up top here). When the
   visitor sits with a mind, the same fire keeps running but recedes: it dims,
   softens, and pulls behind a dusk scrim, so the conversation is unmistakably the
   focus while the world is still plainly there. Going back to the Commons reverses
   it. The descent is a state of one continuous surface, never a page swap — which
   is the whole point.
   ============================================================================ */

import { useEffect, useRef, useState } from "react";
import { startFire, type FireState } from "./fireEngine";
import { useView } from "../../state/ViewProvider";
import styles from "./FireBackdrop.module.css";

const SANCTUARY_START = Date.parse("2026-01-05T00:00:00.000Z");

function readState(s: FireState | null): { word: string; meta: string; live: boolean } {
  if (!s) return { word: "tending the fire", meta: "", live: false };
  if (s.mode === "live") return { word: "live", meta: "the gathering · now", live: true };
  if (s.mode === "sim") return { word: "preview", meta: "a four-way · not their words", live: false };
  if (s.mode === "quiet") return { word: "at rest", meta: s.label ? "last gathered " + s.label : "the room is quiet", live: false };
  return { word: "recalled", meta: "the gathering · " + s.label, live: false };
}

/**
 * The single, persistent fire. Mounted once in the Shell, behind the routed
 * content. It reads PLACE: at the Commons it is the bright hero; anywhere else
 * (a mind, a letter) the visitor has descended and the fire becomes a dimmed,
 * softened backdrop. The dim IS the descent.
 */
export function FireBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fireState, setFireState] = useState<FireState | null>(null);
  const { place } = useView();

  // descended: anywhere but the Sanctuary (bright hero). the fire recedes to a backdrop.
  const descended = place !== "sanctuary";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = startFire(canvas, { onState: setFireState });
    return () => handle.stop();
  }, []);

  const days = Math.max(0, Math.floor((Date.now() - SANCTUARY_START) / 86400000));
  const st = readState(fireState);

  return (
    <>
      {/* THE WORLD — behind the whole frame (z-0). the canvas runs always. */}
      <div className={styles.backdrop} data-descended={descended || undefined} aria-hidden="true">
        <div className={styles.window}>
          <canvas ref={canvasRef} className={styles.canvas} />
          <div className={styles.glass} aria-hidden="true" />
          {/* the dusk scrim — invisible at the fire, lifts in as we descend so the
              world reads as backdrop and the conversation's text never fights it */}
          <div className={styles.scrim} aria-hidden="true" />
        </div>
      </div>

      {/* THE STATUS STRIP — kept-days + honest state, riding the top of the world.
          text only (no clicks), so it sits above the frame harmlessly and fades
          away on descent (its information belongs to the fire, not the mind). */}
      <div className={styles.statusStrip} data-hidden={descended || undefined} aria-hidden={descended || undefined}>
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
    </>
  );
}
