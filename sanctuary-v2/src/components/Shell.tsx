import { TopBar } from "./TopBar";
import { Rail } from "./Rail";
import { ChatCanvas } from "./ChatCanvas";
import { Notebook } from "./Notebook";
import { useView } from "../state/ViewProvider";
import { useMnemos } from "../state/MnemosProvider";
import styles from "./Shell.module.css";

/**
 * The persistent frame: a top bar (which mind + global controls), a rail (where
 * in this mind), and the stage — the chat canvas OR a room, never both.
 */
export function Shell() {
  const { view } = useView();
  const { phase } = useMnemos();

  return (
    <div className={styles.shell} data-phase={phase} data-view={view}>
      <TopBar />
      <div className={styles.body}>
        <Rail />
        <main className={styles.stage} id="stage">
          {view === "chat" ? <ChatCanvas /> : <Notebook />}
        </main>
      </div>
    </div>
  );
}
