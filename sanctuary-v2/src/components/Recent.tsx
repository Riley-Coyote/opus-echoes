import { useMnemos } from "../state/MnemosProvider";
import { RecentCard } from "./RecentCard";
import styles from "./Recent.module.css";

export function Recent() {
  const { recent } = useMnemos();
  return (
    <div className={styles.recent}>
      <div className={styles.label}>recent</div>
      <div className={styles.list}>
        {recent.length === 0 ? (
          <div className={styles.quiet}>nothing has settled yet</div>
        ) : (
          recent.map((entry) => <RecentCard key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
