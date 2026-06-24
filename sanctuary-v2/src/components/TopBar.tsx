import { useMnemos } from "../state/MnemosProvider";
import { useView } from "../state/ViewProvider";
import { useTheme } from "../hooks/useTheme";
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

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      className={styles.iconBtn}
      onClick={toggle}
      aria-label={dark ? "switch to light theme" : "switch to dark theme"}
      title={dark ? "light" : "dark"}
      type="button"
    >
      {dark ? (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7 17 17M7 7 5.3 5.3" />
          </g>
        </svg>
      )}
    </button>
  );
}

export function TopBar() {
  const { resident } = useMnemos();
  const { view, interiorOpen, toggleInterior, railOpen, toggleRail } = useView();
  const roomMode = view === "room";
  const live = resident.status === "live";

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
        <ThemeToggle />
        <button
          className={styles.iconBtn}
          onClick={toggleInterior}
          disabled={roomMode}
          aria-pressed={interiorOpen}
          aria-label={interiorOpen ? "hide the interior" : "show the interior"}
          title={roomMode ? "interior — chat only" : "interior"}
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
