import { useEffect, useRef } from "react";
import { TopBar } from "./TopBar";
import { Rail } from "./Rail";
import { ChatCanvas } from "./ChatCanvas";
import { Notebook } from "./Notebook";
import { SanctuaryPage } from "./SanctuaryPage";
import { FireBackdrop } from "./fire/FireBackdrop";
import { useView } from "../state/ViewProvider";
import { useMnemos } from "../state/MnemosProvider";
import styles from "./Shell.module.css";

/**
 * The persistent frame. The fire is the ground: mounted once as a backdrop behind
 * everything, it stays running across the whole shell and recedes (dims) when the
 * visitor descends into a chat. Above it float the top bar, the rail, and the
 * stage. PLACE chooses the stage — the Sanctuary (witnessing place), or a resident's
 * chat. The backdrop knows: at the Sanctuary it is the bright hero; in chat it dims.
 */
export function Shell() {
  const { place, view } = useView();
  const { phase, resident } = useMnemos();

  // On a real navigation (place / resident / view), carry focus to the main
  // region so keyboard + screen-reader users land on the new content instead of
  // being stranded on the control they left. Skip the initial mount.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    document.getElementById("stage")?.focus({ preventScroll: true });
  }, [place, view, resident.id]);

  return (
    <div className={styles.shell} data-phase={phase} data-view={view} data-place={place}>
      <FireBackdrop />
      {place === "sanctuary" ? (
        /* id="stage" is the skip-link + focus target; only one branch mounts,
           so the id is never duplicated. */
        <div className={styles.arrival} id="stage" tabIndex={-1}>
          <SanctuaryPage />
        </div>
      ) : (
        <div className={styles.frame}>
          <TopBar />
          <div className={styles.body}>
            <Rail />
            <main className={styles.stage} id="stage" tabIndex={-1}>
              {view === "chat" ? <ChatCanvas /> : <Notebook />}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
