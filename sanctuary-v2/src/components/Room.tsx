import { useMnemos } from "../state/MnemosProvider";
import { useView } from "../state/ViewProvider";
import { SECTIONS } from "../types/mnemos";
import styles from "./Room.module.css";

/**
 * STAGE 1 placeholder. The real room — a section index + serif reading pane in
 * claude-field's editorial form, and the engram graph for memory/mind — is built
 * in Stage 2. The rooms stay readable even when a mind is resting.
 */
export function Room() {
  const { resident } = useMnemos();
  const { section } = useView();
  const label = SECTIONS.find((s) => s.key === section)?.label ?? section;

  return (
    <div className={styles.room}>
      <div className={styles.inner}>
        <p className={styles.kick}>
          {resident.name} · {label}
        </p>
        <h2 className={styles.title}>the {label}</h2>
        <p className={styles.line}>
          this room is being arranged. it opens in the next stage of the build —
          the thread stays exactly where you left it.
        </p>
      </div>
    </div>
  );
}
