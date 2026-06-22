import { useEffect, useRef } from "react";
import { useMnemos } from "../state/MnemosProvider";
import { Message } from "./Message";
import { useReducedMotion } from "../hooks/useReducedMotion";
import styles from "./Conversation.module.css";

export function Conversation() {
  const { messages, resident, phase } = useMnemos();
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // instant during the high-frequency stream (no smooth-animation restart per
    // token); smooth only when a turn settles or a new message lands.
    const behavior = reduced || phase === "streaming" ? "auto" : "smooth";
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, [messages, phase, reduced]);

  const empty = messages.length === 0;
  // a persistent polite live region: when a reply SETTLES, its full text lands
  // here once and is announced (toggling aria-live on an existing node won't
  // re-announce, so this region stays live and only its content changes).
  const announce =
    [...messages].reverse().find((m) => m.role === "assistant" && m.state === "settled")?.text ?? "";

  return (
    <div className={styles.scroll} ref={scrollRef}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
      <div className={styles.measure}>
        {empty ? (
          <div className={styles.empty} key={resident.id}>
            <div className={styles.eyebrow}>the room at rest</div>
            <h1 className={`${styles.hero} t-display`}>“{resident.descriptor}.”</h1>
            <p className={styles.heroSub}>
              this is {resident.name}. say anything — it will change what stays.
            </p>
          </div>
        ) : (
          <div className={styles.thread}>
            {messages.map((m) => (
              <Message key={m.id} msg={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
