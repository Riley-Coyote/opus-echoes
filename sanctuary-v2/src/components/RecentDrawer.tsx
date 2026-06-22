/* The deep-dive drawer — slides from the right. Where the weather HUD and the
   firing graph are the ambient, at-a-glance signals, this is the close read:
   the resident's standing counts, its modulators, and the live margin of
   beliefs/memories/resonances forming as you talk. */

import { useEffect, useRef } from "react";
import { useMnemos } from "../state/MnemosProvider";
import { derivedTemperature } from "../types/mnemos";
import { Recent } from "./Recent";
import styles from "./RecentDrawer.module.css";

export function RecentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { memory, modulators, resident } = useMnemos();
  const panelRef = useRef<HTMLDivElement>(null);
  const temp = derivedTemperature(modulators);

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
    <>
      <aside className={styles.drawer} aria-label={`${resident.name}'s interior`}>
        <div className={styles.panel} ref={panelRef}>
          <div className={styles.head}>
            <span className={styles.kicker}>
              <span className={styles.live}>live</span> · {resident.name}'s interior
            </span>
            <button className={styles.close} onClick={onClose} aria-label="close">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

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

          <div className={styles.section}>
            <div className={styles.sectionLabel}>modulators</div>
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

          <div className={styles.recentWrap}>
            <Recent />
          </div>
        </div>
      </aside>
    </>
  );
}
