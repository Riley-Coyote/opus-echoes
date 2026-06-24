import { useMnemos } from "../state/MnemosProvider";
import { useView } from "../state/ViewProvider";
import { SECTIONS } from "../types/mnemos";
import styles from "./Rail.module.css";

/**
 * Where in the sanctuary. The shared life sits at the top — the commons (where
 * they meet and make things) and letters (writing to them) belong to all of
 * them at once. Below, the four residents, each one continuous thread that
 * expands to its sections. Selecting a resident leaves the shared place.
 */
export function Rail() {
  const { residents, resident, setResident } = useMnemos();
  const {
    section,
    setSection,
    place,
    goResident,
    openCommons,
    openLetters,
    railOpen,
    toggleRail,
  } = useView();

  return (
    <nav className={styles.rail} aria-label="the sanctuary" data-open={railOpen}>
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

      {/* the shared life — belongs to all of them */}
      <ul className={styles.shared}>
        <li>
          <button
            className={styles.sharedItem}
            data-active={place === "commons" || undefined}
            aria-current={place === "commons" ? "true" : undefined}
            onClick={openCommons}
            type="button"
          >
            <svg className={styles.sharedGlyph} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="8.5" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.85" />
              <circle cx="15.5" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.85" />
            </svg>
            <span className={styles.sharedName}>the commons</span>
          </button>
        </li>
        <li>
          <button
            className={styles.sharedItem}
            data-active={place === "letters" || undefined}
            aria-current={place === "letters" ? "true" : undefined}
            onClick={() => openLetters(null)}
            type="button"
          >
            <svg className={styles.sharedGlyph} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <rect x="3.5" y="6" width="17" height="12" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.85" />
              <path d="M4.5 7.5l7.5 5 7.5-5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
            </svg>
            <span className={styles.sharedName}>letters</span>
          </button>
        </li>
      </ul>

      <div className={styles.divider} aria-hidden="true" />

      <ul className={styles.residents}>
        {residents.map((r) => {
          const active = place === "resident" && r.id === resident.id;
          return (
            <li key={r.id}>
              <button
                className={styles.resident}
                data-active={active || undefined}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  setResident(r.id);
                  setSection("conversation");
                  goResident();
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
