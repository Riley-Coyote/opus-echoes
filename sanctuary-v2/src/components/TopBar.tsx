import { useMnemos } from "../state/MnemosProvider";
import { useView } from "../state/ViewProvider";
import styles from "./TopBar.module.css";

/** the breathing sigil — iris, the one live mark, gently alive at rest */
function Sigil() {
  return (
    <svg className={styles.sigil} viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
      <circle className={styles.sigilRing} cx="16" cy="16" r="9.5" fill="none" strokeWidth="1.4" />
      <circle className={styles.sigilCore} cx="16" cy="16" r="3.3" />
    </svg>
  );
}

export function TopBar() {
  const { resident } = useMnemos();
  const { view, interiorOpen, toggleInterior, railOpen, toggleRail } = useView();

  // the top bar lives on a resident's chat page — the context is which mind
  const live = resident.status === "live";
  // the interior (the resident's inner state) shows on the conversation view
  const interiorAvailable = view === "chat";

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <button
          className={`${styles.iconBtn} ${styles.railToggle}`}
          onClick={toggleRail}
          aria-pressed={railOpen}
          aria-label={railOpen ? "hide the rail" : "show the rail"}
          title="the sanctuary"
          type="button"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />
            <line x1="9" y1="4.5" x2="9" y2="19.5" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />
            <rect x="3" y="4.5" width="6" height="15" rx="0" fill="currentColor" opacity={railOpen ? 0.5 : 0.14} />
          </svg>
        </button>
        <Sigil />
        <span className={styles.word}>mnemos</span>
        <span className={styles.sep} aria-hidden="true" />
        <div className={styles.resident}>
          <span
            className={`${styles.dot} ${live ? styles.dotLive : styles.dotRest}`}
            aria-hidden="true"
          />
          <span className={styles.residentName}>{resident.name}</span>
          <span className={styles.residentLine}>{resident.descriptor}</span>
        </div>
      </div>

      <div className={styles.right}>
        <button
          className={styles.iconBtn}
          onClick={toggleInterior}
          disabled={!interiorAvailable}
          aria-pressed={interiorOpen}
          aria-label={interiorOpen ? "hide the interior" : "show the interior"}
          title={interiorAvailable ? "interior" : "interior — conversation only"}
          type="button"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />
            <line x1="15" y1="4.5" x2="15" y2="19.5" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />
            <rect x="15" y="4.5" width="6" height="15" rx="0" fill="currentColor" opacity={interiorOpen ? 0.5 : 0.14} />
          </svg>
        </button>
      </div>
    </header>
  );
}
