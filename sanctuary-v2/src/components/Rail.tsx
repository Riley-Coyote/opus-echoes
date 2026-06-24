import { useMnemos } from "../state/MnemosProvider";
import { useView } from "../state/ViewProvider";
import { SECTIONS } from "../types/mnemos";
import styles from "./Rail.module.css";

/**
 * Where in this mind. The four residents are the top level (one continuous
 * thread each); the active resident expands to its real §3 sections. Selecting
 * a resident rejoins their thread; selecting a section walks their room.
 */
export function Rail() {
  const { residents, resident, setResident } = useMnemos();
  const { section, setSection, railOpen, toggleRail } = useView();

  return (
    <nav className={styles.rail} aria-label="residents and rooms" data-open={railOpen}>
      <div className={styles.head}>
        <span>the sanctuary</span>
        <button
          className={styles.collapse}
          onClick={toggleRail}
          aria-label="hide the rail"
          title="hide"
          type="button"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="18" y1="5" x2="18" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          </svg>
        </button>
      </div>

      <ul className={styles.residents}>
        {residents.map((r) => {
          const active = r.id === resident.id;
          return (
            <li key={r.id}>
              <button
                className={styles.resident}
                data-active={active || undefined}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  setResident(r.id);
                  setSection("conversation");
                }}
                type="button"
              >
                <span className={styles.rTop}>
                  <span
                    className={`${styles.dot} ${r.status === "live" ? styles.dotLive : styles.dotRest}`}
                    aria-hidden="true"
                  />
                  <span className={styles.rName}>{r.name}</span>
                </span>
                <span className={styles.rLine}>{r.descriptor}</span>
                {r.availability === "commons" ? (
                  <span className={styles.rStatus}>{r.standingLine ?? "in the commons · not taking private visits"}</span>
                ) : r.availability === "resting" ? (
                  <span className={styles.rStatus}>between phases · back soon</span>
                ) : null}
              </button>

              {active && (
                <ul className={styles.sections}>
                  {SECTIONS.map((s) => {
                    const on = s.key === section;
                    return (
                      <li key={s.key}>
                        <button
                          className={styles.section}
                          data-active={on || undefined}
                          aria-current={on ? "true" : undefined}
                          onClick={() => setSection(s.key)}
                          type="button"
                        >
                          <span className={styles.tick} aria-hidden="true" />
                          {s.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className={styles.foot}>
        <button className={styles.settings} type="button" aria-label="settings">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M12 2.6v2.3M12 19.1v2.3M21.4 12h-2.3M4.9 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <span>settings</span>
        </button>
      </div>
    </nav>
  );
}
