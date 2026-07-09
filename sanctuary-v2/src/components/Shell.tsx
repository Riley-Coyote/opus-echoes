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
  const { phase } = useMnemos();

  return (
    <div className={styles.shell} data-phase={phase} data-view={view} data-place={place}>
      <FireBackdrop />
      {place === "sanctuary" ? (
        <div className={styles.arrival}>
          <SanctuaryPage />
        </div>
      ) : (
        <div className={styles.frame}>
          <TopBar />
          <div className={styles.body}>
            <Rail />
            <main className={styles.stage} id="stage">
              {view === "chat" ? <ChatCanvas /> : <Notebook />}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
