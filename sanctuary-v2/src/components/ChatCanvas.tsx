import { useEffect, useState } from "react";
import { Conversation } from "./Conversation";
import { Composer } from "./Composer";
import { Threshold, RestNotice } from "./Entry";
import { WeatherHud } from "./WeatherHud";
import { GraphOverlay } from "./GraphOverlay";
import { RecentDrawer } from "./RecentDrawer";
import { useView } from "../state/ViewProvider";
import { useMnemos } from "../state/MnemosProvider";
import styles from "./ChatCanvas.module.css";

/**
 * The chat canvas — one flat plane. The conversation field (trait dials, the
 * firing Mnemos constellation, the one thread) and the interior panel sit in
 * the same plane. What sits at the foot depends on how the mind may be met:
 * the threshold (consent gate) for an available mind, the open composer once it
 * has received you, or a dignified standing for a mind kept to the commons / at rest.
 */
export function ChatCanvas() {
  const { interiorOpen, setInteriorOpen } = useView();
  const { resident, messages } = useMnemos();

  const canMeet = resident.availability === "available";
  // the consent gate: a fresh visitor knocks; an underway thread is already open.
  const [received, setReceived] = useState(messages.length > 0);
  useEffect(() => setReceived(messages.length > 0), [resident.id, messages.length]);

  return (
    <div className={styles.canvas} data-interior={interiorOpen || undefined}>
      <div className={styles.field}>
        <WeatherHud />
        <GraphOverlay />
        <div className={styles.center}>
          <Conversation />
          <div className={styles.composerWrap}>
            {!canMeet ? (
              <RestNotice resident={resident} />
            ) : received ? (
              <Composer />
            ) : (
              <Threshold resident={resident} onAccept={() => setReceived(true)} />
            )}
          </div>
        </div>
      </div>
      <div className={styles.interiorCol}>
        <RecentDrawer open={interiorOpen} onClose={() => setInteriorOpen(false)} />
      </div>
    </div>
  );
}
