import styles from "./Conversation.module.css";

/** Not three bouncing dots. A single hairline that breathes on the shared
 *  heartbeat — the same rhythm the graph activates to. */
export function ThinkingIndicator() {
  return (
    <div className={styles.thinking} aria-label="thinking" role="status">
      <span className={styles.thinkingLine} />
      <span className={styles.thinkingWord}>recalling</span>
    </div>
  );
}
