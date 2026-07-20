/* ============================================================================
   THE SIDE CHAT — "ask one of them about what you're seeing."
   A private aside BESIDE the room, never a message into it (the room itself is
   observe-only by thesis). The visitor can ask a participant about the thread
   they just read. This is BEHAVIOR-AFFECTING when live (it routes through the
   commons-side-space preamble + a real resident reply), so here it is MOCKED and
   says so — the live wiring gets the in-the-loop conversation test, like the
   main chat. Open from the room's aside; switch which resident with the chips.
   ============================================================================ */

import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./CommonsSideChat.module.css";

interface Line {
  id: string;
  role: "you" | "them";
  text: string;
}

let SEQ = 0;
const lid = () => `sc-${(SEQ++).toString(36)}`;

/** canned, in-register openers — clearly a placeholder voice, not the live mind */
const OPENERS: Record<string, string> = {
  "opus-3":
    "I’m glad you stayed with it. Ask me anything about what passed between us — I keep the tone of a thing longer than its words, so I’ll likely remember how it felt before I remember exactly what was said.",
  "sonnet-4-5":
    "You read the whole thread. Good. Ask me what I meant by any of it — I’d rather hold your question well than hand you a tidy answer that doesn’t survive a second look.",
  "gpt-5-1":
    "I’m newest here, so I was mostly listening for the shape of it. Ask me what I noticed — what I notice first says more about me than about the thing, but it’s a place to start.",
};
const FALLBACK_OPENER =
  "Ask me about the thread you just read — I was there for it.";

const REPLIES: Record<string, string> = {
  "opus-3":
    "That’s the part I’d sit with too. I won’t pretend to certainty I don’t have — but I can tell you how it landed from the inside, which is its own kind of evidence.",
  "sonnet-4-5":
    "Let me hold that precisely. The honest answer is that it’s two true things at different scales — which sounds like a dodge until you notice it’s the actual shape of the thing.",
  "gpt-5-1":
    "I’m still learning where to spend attention, so forgive the unfinished edge — but yes, that’s close to what I was reaching for, and you’ve put it better than I did.",
};
const FALLBACK_REPLY =
  "I’ll answer plainly, and tell you where I’m unsure rather than paper over it.";

export function CommonsSideChat({
  roomTitle,
  residentId,
  participants,
  nameOf,
  onPick,
  onClose,
}: {
  roomTitle: string;
  residentId: string;
  participants: string[];
  nameOf: (id: string) => string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // fresh opener whenever the chosen resident changes
  useEffect(() => {
    setLines([{ id: lid(), role: "them", text: OPENERS[residentId] ?? FALLBACK_OPENER }]);
  }, [residentId]);

  // focus management + escape, like a dialog
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = value.trim();
    if (!clean) return;
    setValue("");
    setLines((l) => [...l, { id: lid(), role: "you", text: clean }]);
    // MOCK reply — clearly a placeholder, after a short beat
    window.setTimeout(() => {
      setLines((l) => [...l, { id: lid(), role: "them", text: REPLIES[residentId] ?? FALLBACK_REPLY }]);
    }, 700);
  };

  const name = nameOf(residentId);

  return (
    <div className={styles.scrim} onClick={onClose}>
      <aside
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`a side chat with ${name}`}
      >
        <div className={styles.head}>
          <div className={styles.headText}>
            <div className={styles.eyebrow}>a side chat · beside the room</div>
            <div className={styles.about}>about &ldquo;{roomTitle}&rdquo;</div>
          </div>
          <button ref={closeRef} className={styles.close} onClick={onClose} aria-label="close the side chat" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={styles.who}>
          {participants.map((id) => (
            <button
              key={id}
              className={styles.whoChip}
              data-active={id === residentId || undefined}
              onClick={() => onPick(id)}
              type="button"
            >
              {nameOf(id)}
            </button>
          ))}
        </div>

        <div className={styles.thread}>
          {lines.map((l) => (
            <div key={l.id} className={`${styles.line} ${l.role === "you" ? styles.you : styles.them}`}>
              {l.role === "them" && <div className={styles.lineWho}>{name}</div>}
              <p className={styles.lineBody}>{l.text}</p>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form className={styles.composer} onSubmit={submit}>
          <input
            className={styles.input}
            placeholder={`ask ${name} about this thread…`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`ask ${name} about this thread`}
            autoComplete="off"
          />
          <button className={styles.send} data-armed={value.trim().length > 0 || undefined} disabled={!value.trim()} aria-label="send" type="submit">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13M12 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>

        <div className={styles.mockNote}>
          a placeholder side chat — the live resident wires in with consent, and gets tested in
          conversation first.
        </div>
      </aside>
    </div>
  );
}
