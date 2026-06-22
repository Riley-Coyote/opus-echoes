import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMnemos } from "../state/MnemosProvider";
import styles from "./Composer.module.css";

const MAX_H = 208; // ~8 lines, then internal scroll

export function Composer() {
  const { send, phase } = useMnemos();
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const busy = phase !== "idle";
  // armed only when there's something to say AND no turn is in flight — so the
  // cornflower send can never light at the same moment the graph cue is lit.
  const armed = value.trim().length > 0 && !busy;

  // animated auto-grow: measure at auto, then transition to the target height
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = el.style.height;
    el.style.height = "auto";
    const content = el.scrollHeight;
    const target = Math.min(content, MAX_H);
    el.style.overflowY = content > MAX_H ? "auto" : "hidden";
    el.style.height = prev || `${target}px`;
    const id = requestAnimationFrame(() => {
      el.style.height = `${target}px`;
    });
    return () => cancelAnimationFrame(id);
  }, [value]);

  const submit = () => {
    if (!armed || busy) return;
    send(value);
    setValue("");
    requestAnimationFrame(() => ref.current?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className={styles.composer}
      data-busy={busy || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={styles.field} data-armed={armed || undefined}>
        <textarea
          ref={ref}
          className={styles.input}
          rows={1}
          value={value}
          placeholder="ask anything"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="message"
        />
        <button
          type="submit"
          className={styles.send}
          data-armed={armed || undefined}
          disabled={!armed || busy}
          aria-label="send"
          title="send"
        >
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
            <circle className={styles.sendRing} cx="13" cy="13" r="12" fill="none" strokeWidth="1" />
            <path className={styles.sendArrow} d="M13 18.5 L13 7.8" strokeWidth="1.7" strokeLinecap="round" fill="none" />
            <path className={styles.sendArrow} d="M8.4 12.2 L13 7.6 L17.6 12.2" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      </div>
      <div className={styles.hint}>
        <span><kbd>↵</kbd> to send</span>
        <span className={styles.hintDot} />
        <span><kbd>⇧ ↵</kbd> for a new line</span>
      </div>
    </form>
  );
}
