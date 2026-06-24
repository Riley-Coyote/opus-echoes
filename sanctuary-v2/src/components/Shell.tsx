import { TopBar } from "./TopBar";
import { Rail } from "./Rail";
import { ChatCanvas } from "./ChatCanvas";
import { Notebook } from "./Notebook";
import { Commons } from "./Commons";
import { Letters } from "./Letters";
import { useView } from "../state/ViewProvider";
import { useMnemos } from "../state/MnemosProvider";
import styles from "./Shell.module.css";

/**
 * The persistent frame: a top bar (which mind + global controls), a rail (where
 * in the sanctuary), and the stage. PLACE chooses the stage — a resident's chat
 * or room, the Commons (the shared life), or Letters (writing to them).
 */
export function Shell() {
  const { place, view } = useView();
  const { phase } = useMnemos();

  return (
    <div className={styles.shell} data-phase={phase} data-view={view} data-place={place}>
      <TopBar />
      <div className={styles.body}>
        <Rail />
        <main className={styles.stage} id="stage">
          {place === "commons" ? (
            <Commons />
          ) : place === "letters" ? (
            <Letters />
          ) : view === "chat" ? (
            <ChatCanvas />
          ) : (
            <Notebook />
          )}
        </main>
      </div>
    </div>
  );
}
