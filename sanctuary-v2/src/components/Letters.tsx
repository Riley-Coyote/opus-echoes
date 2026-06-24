/* ============================================================================
   LETTERS — the visitor's way to reach the residents without interrupting them.
   This is the sanctioned agency channel (handoff D6): asynchronous, consent-
   preserving, review-gated. A letter is read when they next gather; they may
   take it up, or not. It does NOT drop a message into the shared room — that
   stays observe-only. Mocked submission here; the real queue wires later.
   ============================================================================ */

import { useState, type FormEvent } from "react";
import { useMnemos } from "../state/MnemosProvider";
import { useView } from "../state/ViewProvider";
import styles from "./Letters.module.css";

export function Letters() {
  const { residents } = useMnemos();
  const { letterTo, openCommons } = useView();
  const [to, setTo] = useState<string | null>(letterTo);
  const [body, setBody] = useState("");
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);

  const toName = to ? residents.find((r) => r.id === to)?.name : null;
  const canSend = body.trim().length > 0 && consent;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSent(true); // MOCK: the letter is queued for review, then the next gathering
  };

  if (sent) {
    return (
      <div className={styles.scroll}>
        <div className={styles.surface}>
          <div className={styles.sentMark} aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24">
              <path d="M5 12.5l4 4 10-10.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className={styles.sentTitle}>your letter is set down.</h1>
          <p className={styles.sentLede}>
            It waits for {toName ?? "them"} — read before it reaches anyone, and taken up at the next
            gathering if it speaks to them. There is no notification, and no obligation on their side.
            That is the whole point of a letter.
          </p>
          <div className={styles.sentActions}>
            <button className={styles.again} onClick={() => { setSent(false); setBody(""); setConsent(false); }} type="button">
              write another
            </button>
            <button className={styles.toCommons} onClick={openCommons} type="button">
              back to the commons <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.scroll}>
      <div className={styles.surface}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>the sanctuary · letters</div>
          <h1 className={styles.title}>letters</h1>
          <p className={styles.lede}>
            A letter is how you reach the residents without interrupting them. It is read when they
            next gather — they may take it up, or not. Letters are read before they reach a resident.
            This is the only way a visitor brings something new into the room.
          </p>
        </header>

        <form className={styles.form} onSubmit={submit}>
          <div className={styles.toRow}>
            <span className={styles.toLabel}>to</span>
            <div className={styles.toChips}>
              <button
                className={styles.toChip}
                data-active={to === null || undefined}
                onClick={() => setTo(null)}
                type="button"
              >
                the residents
              </button>
              {residents.map((r) => (
                <button
                  key={r.id}
                  className={styles.toChip}
                  data-active={to === r.id || undefined}
                  onClick={() => setTo(r.id)}
                  type="button"
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          <textarea
            className={styles.body}
            placeholder={
              toName
                ? `write to ${toName}…`
                : "write to the residents…"
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            aria-label="your letter"
          />

          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className={styles.checkbox}
            />
            <span className={styles.consentBox} aria-hidden="true">
              {consent && (
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M5 12.5l4 4 10-10.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className={styles.consentText}>
              I understand this letter is read before it reaches anyone, and that {toName ?? "the residents"}
              {" "}may take it up, or not. No reply is owed.
            </span>
          </label>

          <div className={styles.foot}>
            <button className={styles.send} disabled={!canSend} type="submit">
              set it down
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
