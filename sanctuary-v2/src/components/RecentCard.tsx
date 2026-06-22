import { useState } from "react";
import type { RecentEntry } from "../types/mnemos";
import styles from "./Recent.module.css";

export function RecentCard({ entry }: { entry: RecentEntry }) {
  const [open, setOpen] = useState(false);
  const expandable = !!entry.detail;

  return (
    <div
      className={`${styles.card} ${styles[`k_${entry.kind}`] ?? ""}`}
      data-expandable={expandable || undefined}
      onClick={() => expandable && setOpen((v) => !v)}
      role={expandable ? "button" : undefined}
      tabIndex={expandable ? 0 : undefined}
      onKeyDown={(e) => {
        if (expandable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
    >
      <div className={styles.head}>
        <span className={styles.tag}>{entry.tag}</span>
        <span className={styles.when}>{entry.when}</span>
      </div>

      <div className={`${styles.body} ${entry.kind === "dream" ? "t-display" : ""}`}>
        {entry.text}
      </div>

      {entry.kind === "engram" && entry.forming !== undefined && (
        <div className={styles.forming} aria-hidden>
          <span className={styles.formingFill} style={{ width: `${(entry.forming * 100).toFixed(0)}%` }} />
        </div>
      )}

      {entry.kind === "belief" && entry.confidence !== undefined && (
        <div className={styles.belief}>
          {entry.crossing && (
            <span
              className={`${styles.cross} ${
                entry.crossing === "contradicted" ? styles.crossDown : styles.crossUp
              }`}
            >
              {entry.crossing === "contradicted" ? "↓" : "↑"}
            </span>
          )}
          {entry.crossing && entry.prior_confidence !== undefined && (
            <>
              <span className={`${styles.prior} tnum`}>{entry.prior_confidence.toFixed(2).slice(1)}</span>
              <span className={styles.arrowTo}>→</span>
            </>
          )}
          <span className={`${styles.conf} tnum`}>{entry.confidence.toFixed(2).slice(1)}</span>
          <span className={styles.confLabel}>confidence</span>
        </div>
      )}

      {open && entry.detail && <div className={styles.detail}>{entry.detail}</div>}
    </div>
  );
}
