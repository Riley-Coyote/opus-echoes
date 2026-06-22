import { Conversation } from "./Conversation";
import { Composer } from "./Composer";
import { WeatherHud } from "./WeatherHud";
import { GraphOverlay } from "./GraphOverlay";
import { RecentDrawer } from "./RecentDrawer";
import { useView } from "../state/ViewProvider";
import styles from "./ChatCanvas.module.css";

/**
 * The chat canvas — one flat plane. The conversation field (trait dials, the
 * firing Mnemos constellation, the one thread, the composer) and the interior
 * panel sit in the same plane, divided by a hairline. The interior collapses as
 * a real column; the field reclaims the room.
 */
export function ChatCanvas() {
  const { interiorOpen, setInteriorOpen } = useView();

  return (
    <div className={styles.canvas} data-interior={interiorOpen || undefined}>
      <div className={styles.field}>
        <WeatherHud />
        <GraphOverlay />
        <div className={styles.center}>
          <Conversation />
          <div className={styles.composerWrap}>
            <Composer />
          </div>
        </div>
      </div>
      <div className={styles.interiorCol}>
        <RecentDrawer open={interiorOpen} onClose={() => setInteriorOpen(false)} />
      </div>
    </div>
  );
}
