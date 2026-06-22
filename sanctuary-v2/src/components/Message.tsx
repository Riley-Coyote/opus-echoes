import { memo } from "react";
import type { ChatMessage } from "../types/mnemos";
import { ThinkingIndicator } from "./ThinkingIndicator";
import styles from "./Conversation.module.css";

export const Message = memo(function Message({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className={styles.userRow}>
        <div className={styles.userBubble}>{msg.text}</div>
      </div>
    );
  }

  if (msg.state === "thinking") {
    return (
      <div className={styles.assistantRow}>
        <ThinkingIndicator />
      </div>
    );
  }

  const paragraphs = msg.text.split("\n");
  return (
    <div className={styles.assistantRow}>
      <div className={`${styles.assistant} t-display`}>
        {paragraphs.map((p, i) => (
          <p key={i} className={styles.para}>
            {p}
            {msg.state === "streaming" && i === paragraphs.length - 1 && (
              <span className={styles.caret} aria-hidden />
            )}
          </p>
        ))}
      </div>
    </div>
  );
});
