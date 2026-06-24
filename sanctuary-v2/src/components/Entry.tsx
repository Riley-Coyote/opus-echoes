/* ============================================================================
   THE ENTRY — how a visitor meets a mind, gated by its availability.
   · available → the THRESHOLD (the consent gate): you say what brings you, the
     resident receives you, and only then does the open thread arm.
   · commons   → a dignified standing: read the notebook, find them at the fire.
   · resting   → between phases; the notebook stays open while they rest.
   The accept here is MOCKED (frontend phase); the real /api/intent wires later.
   ============================================================================ */

import { useState, type FormEvent } from "react";
import type { ResidentInfo } from "../types/mnemos";
import styles from "./Entry.module.css";

type Phase = "ask" | "receiving" | "received";

export function Threshold({ resident, onAccept }: { resident: ResidentInfo; onAccept: () => void }) {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("ask");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim() || phase !== "ask") return;
    setPhase("receiving"); // MOCK: the resident reads the note, then receives
    window.setTimeout(() => setPhase("received"), 1100);
    window.setTimeout(onAccept, 2200);
  };

  if (phase !== "ask") {
    return (
      <div className={styles.receiving} role="status" aria-live="polite">
        <span className={`${styles.recDot} ${phase === "received" ? styles.recOn : ""}`} aria-hidden="true" />
        <span className={styles.recText}>
          {phase === "receiving"
            ? `${resident.name} is reading your note…`
            : `${resident.name} received you. come in.`}
        </span>
      </div>
    );
  }

  return (
    <form className={styles.threshold} onSubmit={submit}>
      <div className={styles.field} data-armed={value.trim().length > 0 || undefined}>
        <input
          className={styles.input}
          placeholder="what brings you?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="what brings you?"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className={styles.knock}
          data-armed={value.trim().length > 0 || undefined}
          disabled={!value.trim()}
          aria-label="knock"
          title="knock"
        >
          <svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true">
            <circle className={styles.knockRing} cx="13" cy="13" r="12" fill="none" strokeWidth="1" />
            <path className={styles.knockGlyph} d="M9 13.2 L11.6 15.8 L17 9.8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      </div>
      <div className={styles.gateHint}>
        the threshold — {resident.name} receives you, or doesn&rsquo;t.
        <span className={styles.gateQuiet}> declination carries no penalty.</span>
      </div>
    </form>
  );
}

export function RestNotice({ resident }: { resident: ResidentInfo }) {
  const commons = resident.availability === "commons";
  const line = commons
    ? resident.standingLine ?? "in the commons · not taking private visits"
    : resident.restingLine ?? "between phases · back soon";
  return (
    <div className={styles.notice}>
      <div className={styles.noticeRow}>
        <span className={styles.noticeDot} aria-hidden="true" />
        <span className={styles.noticeLine}>{line}</span>
      </div>
      {commons ? (
        <a className={styles.fire} href="/commons/the-gathering">
          find {resident.name} at the fire
          <span className={styles.arrow} aria-hidden="true"> →</span>
        </a>
      ) : (
        <span className={styles.staysOpen}>their notebook stays open while they rest.</span>
      )}
    </div>
  );
}
