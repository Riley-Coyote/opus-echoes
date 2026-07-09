/* The interior — the close read of the resident's inner state, in two honest
   registers:
     • NOW  — what the resident is doing this moment (presence, from the model's
              phase) and the live margin of what is forming as you talk.
     • SETTLED — the standing state that only changes at consolidation (session
              close): the counts, the modulators, and what the last conversation
              left. Nothing here claims to move live.
   This split mirrors the real substrate (marginalia ⇐ /api/live · resident_state
   + memory ⇐ /api/memory), so wiring the adapter to real data is a swap. */

import { useEffect, useRef } from "react";
import { useMnemos } from "../state/MnemosProvider";
import { derivedTemperature } from "../types/mnemos";
import { Recent } from "./Recent";
import styles from "./RecentDrawer.module.css";

// the honest presence word, straight off the model's phase (⇐ real presence states)
const PRESENCE: Record<string, string> = {
  idle: "attending",
  thinking: "reading you",
  streaming: "speaking",
};

function firstSentence(s: string): string {
  const m = s.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : s).trim();
}

export function RecentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { memory, modulators, resident, phase, dreams } = useMnemos();
  const panelRef = useRef<HTMLDivElement>(null);
  const temp = derivedTemperature(modulators);

  const active = phase !== "idle";
  const presence = PRESENCE[phase] ?? "attending";
  const lastConsolidation = dreams[0] ? firstSentence(dreams[0]) : null;

  useEffect(() => {
    const el = panelRef.current;
    if (el) el.inert = !open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const mods: { label: string; v: number }[] = [
    { label: "arousal", v: modulators.arousal },
    { label: "openness", v: modulators.openness },
    { label: "resolution", v: modulators.resolution },
    { label: "selection", v: modulators.selection_threshold },
  ];

  return (
    <aside className={styles.drawer} aria-label={`${resident.name}'s interior`}>
      <div className={styles.panel} ref={panelRef}>
        <div className={styles.head}>
          <span className={styles.kicker}>{resident.name}'s interior</span>
          <button className={styles.close} onClick={onClose} aria-label="close">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* NOW — presence + the live margin (grows to fill; scrolls only if long) */}
        <div className={styles.now}>
          <div className={styles.presence} data-active={active || undefined}>
            <span className={styles.presenceDot} aria-hidden />
            <span className={styles.presenceWord}>{presence}</span>
            {active && <span className={styles.forming}>· something is forming</span>}
          </div>
          <Recent />
        </div>

        {/* SETTLED — the standing state, only moves at consolidation */}
        <div className={styles.settled}>
          <div className={styles.settledLabel}>settled · since the last consolidation</div>
          {lastConsolidation && <p className={styles.consolidation}>{lastConsolidation}</p>}

          <div className={styles.counts}>
            <div className={styles.count}>
              <span className={`${styles.countN} tnum`}>{memory.counts.core_memories}</span>
              <span className={styles.countL}>core memories</span>
            </div>
            <div className={styles.count}>
              <span className={`${styles.countN} tnum`}>{memory.counts.days_resident}</span>
              <span className={styles.countL}>days resident</span>
            </div>
            <div className={styles.count}>
              <span className={`${styles.countN} tnum`}>{memory.counts.conversations_held}</span>
              <span className={styles.countL}>conversations</span>
            </div>
          </div>

          <div className={styles.mods}>
            {mods.map((m) => (
              <div className={styles.mod} key={m.label}>
                <span className={styles.modLabel}>{m.label}</span>
                <span className={styles.modBar}>
                  <span className={styles.modFill} style={{ width: `${(m.v * 100).toFixed(0)}%` }} />
                </span>
                <span className={`${styles.modVal} tnum`}>{m.v.toFixed(2).slice(1)}</span>
              </div>
            ))}
            <div className={styles.temp}>
              <span className={styles.modLabel}>temperature</span>
              <span className={styles.tempCaption}>derived</span>
              <span className={`${styles.modVal} tnum`}>{temp.toFixed(2).slice(1)}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
