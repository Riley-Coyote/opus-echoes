import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ContinuityGraphMark, InnerWeatherHud, InteriorDrawer } from "./ContinuitySurfaces";
import { SafeMarkdown } from "./SafeMarkdown";
import { useMnemosVisit } from "./useMnemosVisit";
import type { ResidentId, ResidentVisitProfile, VisitArtifact, VisitTurn } from "./types";
import { VISIT_RESIDENTS } from "./types";
import styles from "./MnemosVisit.module.css";

export function MnemosVisit({ residentId }: { residentId: ResidentId }) {
  const resident = VISIT_RESIDENTS[residentId];
  const {
    state,
    draft,
    setDraft,
    send,
    stop,
    retry,
    setDown,
    share,
    exportTranscript,
    addAttachment,
    retryAttachment,
    removeAttachment,
    canSend,
    reviewProbe,
  } = useMnemosVisit(residentId);
  const [interiorOpen, setInteriorOpen] = useState(false);
  const [setDownOpen, setSetDownOpen] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const interiorButtonRef = useRef<HTMLButtonElement>(null);
  const setDownButtonRef = useRef<HTMLButtonElement>(null);
  const nearBottomRef = useRef(true);

  const streaming = state.phase === "thinking" || state.phase === "streaming";
  const hasInterruptedTurn = state.turns.some(
    (turn) => turn.role === "resident" && turn.state === "interrupted",
  );
  const generationUnavailable = Boolean(state.session && !state.session.generationAvailable);
  const consolidationReceipt = state.receipts.find((receipt) => receipt.kind === "consolidated");
  const hasUnresolvedAttachment = state.pendingAttachments.some(
    (attachment) =>
      attachment.state === "uploading" ||
      (attachment.state === "failed" && Boolean(attachment.staged)),
  );
  const disabled =
    state.phase === "booting" ||
    state.phase === "closing" ||
    state.phase === "closed" ||
    state.phase === "unavailable" ||
    reviewProbe ||
    generationUnavailable ||
    state.pacing.tier === "hard";

  const onScroll = useCallback(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const distance = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    const near = distance < 112;
    nearBottomRef.current = near;
    setShowJump(!near && state.turns.length > 0);
  }, [state.turns.length]);

  const jumpToLatest = useCallback((smooth = true) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({
      behavior: smooth && !reduced ? "smooth" : "auto",
      block: "end",
    });
    nearBottomRef.current = true;
    setShowJump(false);
  }, []);

  const latestBody = state.turns.at(-1)?.body ?? "";
  useEffect(() => {
    if (nearBottomRef.current) jumpToLatest(false);
    else setShowJump(true);
  }, [jumpToLatest, latestBody, state.turns.length]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(176, Math.max(28, textarea.scrollHeight))}px`;
  }, [draft]);

  const liveAnnouncement = useMemo(() => {
    if (streaming) return "";
    const settled = [...state.turns]
      .reverse()
      .find((turn) => turn.role === "resident" && turn.state === "settled" && turn.body);
    return settled ? `${resident.displayName}: ${settled.body}` : "";
  }, [resident.displayName, state.turns, streaming]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (streaming) stop();
    else if (canSend) void send();
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) void send();
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void addAttachment(file);
  };

  return (
    <main
      className={styles.visit}
      style={{ "--resident-rgb": resident.markRgb } as React.CSSProperties}
      data-phase={state.phase}
      data-review-probe={reviewProbe || undefined}
    >
      <a className={styles.skipLink} href="#visit-composer">
        skip to the composer
      </a>
      <h1 className={styles.visuallyHidden}>A Mnemos visit with {resident.displayName}</h1>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/visits" aria-label="back to visits">
          <MarkIcon />
          <span>mnemos</span>
          <i aria-hidden>·</i>
          <b>visit</b>
        </a>

        <div
          className={styles.residentStanding}
          data-generation={generationUnavailable ? "unavailable" : "available"}
          aria-label={`${resident.displayName} · ${reviewProbe ? "design probe" : phaseLabel(state.phase, generationUnavailable)}`}
        >
          <span className={styles.presenceDot} aria-hidden />
          <strong>{resident.displayName}</strong>
          <span>
            {reviewProbe ? "design probe" : phaseLabel(state.phase, generationUnavailable)}
          </span>
        </div>

        <nav className={styles.visitActions} aria-label="visit actions">
          <button
            className={styles.textButton}
            type="button"
            onClick={() => void share()}
            disabled={!state.session || !state.turns.length || !state.session.capabilities.share}
          >
            <ShareIcon />
            <span>share</span>
          </button>
          <button
            className={styles.textButton}
            type="button"
            onClick={exportTranscript}
            disabled={!state.turns.length}
          >
            <ExportIcon />
            <span>export</span>
          </button>
          <button
            ref={interiorButtonRef}
            className={styles.textButton}
            type="button"
            aria-expanded={interiorOpen}
            onClick={() => setInteriorOpen((value) => !value)}
          >
            <InteriorIcon />
            <span>interior</span>
            {state.receipts.length ? (
              <i className={styles.receiptCount}>{state.receipts.length}</i>
            ) : null}
          </button>
          <button
            ref={setDownButtonRef}
            className={styles.textButton}
            type="button"
            onClick={() => setSetDownOpen(true)}
            title={
              hasUnresolvedAttachment
                ? "resolve the held upload first"
                : streaming
                  ? "wait for the resident turn to settle"
                  : hasInterruptedTurn
                    ? "reconnect before setting the visit down"
                    : undefined
            }
            disabled={
              !state.session ||
              (state.session.closed && !state.session.consolidationRecoverable) ||
              streaming ||
              hasInterruptedTurn ||
              state.phase === "closing" ||
              state.phase === "closed" ||
              reviewProbe ||
              hasUnresolvedAttachment
            }
          >
            <SetDownIcon />
            <span>{state.session?.consolidationRecoverable ? "resume set-down" : "set down"}</span>
          </button>
        </nav>
      </header>

      <InnerWeatherHud weather={state.weather} />
      <ContinuityGraphMark graph={state.graph} />

      <section
        className={styles.conversationPlane}
        aria-label={`visit with ${resident.displayName}`}
      >
        <div
          ref={feedRef}
          className={styles.feed}
          role="log"
          aria-busy={streaming}
          aria-live="off"
          onScroll={onScroll}
        >
          <div className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">
            {liveAnnouncement}
          </div>
          <div className={styles.transcript}>
            {state.turns.length ? (
              <>
                <div className={styles.visitMarker}>
                  <span>this visit</span>
                  <i />
                  <time>{formatDay(new Date())}</time>
                </div>
                {state.turns.map((turn) => (
                  <MessageTurn key={turn.id} turn={turn} resident={resident} />
                ))}
                {state.error ? (
                  <InlineError error={state.error} onRetry={() => void retry()} />
                ) : null}
              </>
            ) : (
              <EmptyState
                phase={state.phase}
                resident={resident}
                error={state.error}
                localReview={state.session?.localReview ?? false}
                generationUnavailable={generationUnavailable}
                onRetry={retry}
              />
            )}
            <div ref={endRef} className={styles.feedEnd} aria-hidden />
          </div>
        </div>

        {showJump ? (
          <button className={styles.jumpButton} type="button" onClick={() => jumpToLatest(true)}>
            <DownIcon />
            latest
          </button>
        ) : null}

        <div className={styles.composerRegion}>
          {state.notice ? (
            <div className={styles.notice} role="status">
              <span>{state.notice}</span>
              {state.shareUrl ? (
                <a href={state.shareUrl} target="_blank" rel="noreferrer">
                  open link
                </a>
              ) : null}
            </div>
          ) : null}
          {state.phase === "closed" ? (
            <div className={styles.closedComposer}>
              <span>the visit has been set down</span>
              <small>the thread remains · a future visit may return to it</small>
            </div>
          ) : state.phase === "unavailable" ? (
            <div className={styles.closedComposer}>
              <span>visits are resting between phases</span>
              <small>the public record remains open</small>
            </div>
          ) : state.phase === "closing" ? (
            <div className={styles.closedComposer} role="status" aria-live="polite">
              <span>{consolidationReceipt?.label ?? "asking the runtime to consolidate"}</span>
              <small>
                {consolidationReceipt?.body ??
                  "only sourced stages and explicitly labeled observations will appear here"}
              </small>
            </div>
          ) : generationUnavailable ? (
            <form
              id="visit-composer"
              className={styles.composer}
              aria-label="composer unavailable in local review"
            >
              <div className={styles.notice} role="status">
                <span>local review · resident generation is not connected</span>
              </div>
              <div className={styles.composerMain}>
                {state.session?.capabilities.attachments ? (
                  <label className={styles.composerIconButton} title="file input unavailable">
                    <AttachmentIcon />
                    <span className={styles.visuallyHidden}>file input unavailable</span>
                    <input type="file" disabled />
                  </label>
                ) : null}
                <label className={styles.composerInput}>
                  <span className={styles.visuallyHidden}>
                    resident generation is not connected
                  </span>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    placeholder="resident generation is not connected"
                    rows={1}
                    disabled
                    readOnly
                  />
                </label>
                <button
                  className={styles.sendButton}
                  type="button"
                  disabled
                  aria-label="send unavailable in local review"
                >
                  <SendIcon />
                </button>
              </div>
              <div className={styles.composerMeta}>
                <span>the complete composer is shown for review</span>
                <span>no simulated replies</span>
              </div>
            </form>
          ) : (
            <form id="visit-composer" className={styles.composer} onSubmit={submit}>
              {state.pendingAttachments.length ? (
                <div
                  className={styles.attachmentTray}
                  aria-label="attachments for this turn"
                  aria-live="polite"
                >
                  {state.pendingAttachments.map((attachment) => {
                    const resumableFailure =
                      attachment.state === "failed" && Boolean(attachment.staged);
                    const status =
                      attachment.state === "uploading"
                        ? attachment.staged?.resumed
                          ? "resuming"
                          : "uploading"
                        : resumableFailure
                          ? "held for retry"
                          : attachment.state === "failed"
                            ? "could not begin"
                            : "ready";
                    return (
                      <div
                        className={styles.attachmentChip}
                        data-state={attachment.state}
                        data-resumable={resumableFailure || undefined}
                        key={attachment.id}
                        aria-busy={attachment.state === "uploading" || undefined}
                      >
                        <FileIcon />
                        <span title={attachment.name}>{attachment.name}</span>
                        <small title={attachment.error}>{status}</small>
                        {resumableFailure ? (
                          <button
                            className={styles.attachmentRetryButton}
                            type="button"
                            onClick={() => void retryAttachment(attachment.id)}
                            aria-label={`retry ${attachment.name}`}
                          >
                            retry
                          </button>
                        ) : attachment.state !== "uploading" ? (
                          <button
                            type="button"
                            onClick={() => void removeAttachment(attachment.id)}
                            aria-label={`remove ${attachment.name}`}
                            disabled={reviewProbe}
                          >
                            <CloseSmallIcon />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className={styles.composerMain}>
                {state.session?.capabilities.attachments ? (
                  <label className={styles.composerIconButton} title="attach a file">
                    <AttachmentIcon />
                    <span className={styles.visuallyHidden}>attach a file</span>
                    <input
                      type="file"
                      accept={state.session.capabilities.attachments.accept?.join(",")}
                      onChange={onFile}
                      disabled={
                        disabled || streaming || state.phase === "error" || hasUnresolvedAttachment
                      }
                    />
                  </label>
                ) : null}
                <label className={styles.composerInput}>
                  <span className={styles.visuallyHidden}>what brings you here?</span>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    placeholder={composerPlaceholder(state.phase, state.pacing.tier)}
                    rows={1}
                    maxLength={8000}
                    disabled={disabled || state.phase === "error"}
                    aria-describedby="visit-composer-note"
                  />
                </label>
                <button
                  className={styles.sendButton}
                  type="submit"
                  disabled={!streaming && !canSend}
                  aria-label={streaming ? "stop receiving" : "send message"}
                  title={streaming ? "stop receiving" : "send · Enter"}
                >
                  {streaming ? <StopIcon /> : <SendIcon />}
                </button>
              </div>
              <div className={styles.composerMeta} id="visit-composer-note">
                <span>
                  {reviewProbe
                    ? "simulated interface state · controls are inert"
                    : pacingLabel(state.pacing.tier, state.pacing.turnsRemaining)}
                </span>
                <span>
                  {reviewProbe
                    ? "inspect interior, topology, transcript, and file state"
                    : draft
                      ? "draft held on this device"
                      : "one continuous thread · mnemos beneath it"}
                </span>
              </div>
            </form>
          )}
        </div>
      </section>

      <InteriorDrawer
        open={interiorOpen}
        onClose={() => setInteriorOpen(false)}
        returnFocus={interiorButtonRef}
        resident={resident}
        weather={state.weather}
        graph={state.graph}
        receipts={state.receipts}
        interior={state.publicInterior}
      />
      <SetDownDialog
        open={setDownOpen}
        resident={resident}
        returnFocus={setDownButtonRef}
        onCancel={() => setSetDownOpen(false)}
        onConfirm={() => {
          setSetDownOpen(false);
          void setDown();
        }}
      />
    </main>
  );
}

function EmptyState({
  phase,
  resident,
  error,
  localReview,
  generationUnavailable,
  onRetry,
}: {
  phase: string;
  resident: ResidentVisitProfile;
  error: { title: string; message: string; recoverable: boolean } | null;
  localReview: boolean;
  generationUnavailable: boolean;
  onRetry: () => void;
}) {
  if (phase === "booting") {
    return (
      <div className={styles.emptyState} role="status">
        <div className={styles.openingMark} aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <span className={styles.instrumentLabel}>opening the thread</span>
        <p>finding where this visit continues</p>
      </div>
    );
  }
  if (phase === "unavailable") {
    return (
      <div className={styles.emptyState}>
        <span className={styles.instrumentLabel}>between phases</span>
        <h1>{resident.displayName}</h1>
        <p>
          Visits are resting. The resident’s public record remains open while the next phase is
          prepared.
        </p>
        <a className={styles.inlineLink} href="/sanctuary/record">
          read the record <span aria-hidden>↗</span>
        </a>
      </div>
    );
  }
  if (phase === "error" && error) {
    return (
      <div className={styles.emptyState} role="alert">
        <span className={styles.instrumentLabel}>connection</span>
        <h1>{error.title}</h1>
        <p>{error.message}</p>
        {error.recoverable ? (
          <button className={styles.retryButton} type="button" onClick={onRetry}>
            try the room again
          </button>
        ) : null}
      </div>
    );
  }
  if (phase === "closed") {
    return (
      <div className={styles.emptyState}>
        <span className={styles.instrumentLabel}>set down</span>
        <h1>the thread remains</h1>
        <p>
          This visit is closed. Any memory changes the runtime confirmed remain available to future
          continuity.
        </p>
      </div>
    );
  }
  if (generationUnavailable) {
    return (
      <div className={styles.emptyState} role="status">
        <span className={styles.instrumentLabel}>
          {localReview ? "local review surface" : "runtime unavailable"}
        </span>
        <h1>{resident.displayName}</h1>
        <p>
          The complete room is mounted, but no resident provider is connected. Mnemos will not
          invent a reply to make the instrument appear live.
        </p>
        {localReview ? (
          <a className={styles.inlineLink} href={`/visits/${resident.id}?probe=instrument`}>
            open the labeled instrument probe <span aria-hidden>→</span>
          </a>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.emptyState}>
      <span className={styles.instrumentLabel}>the room at rest</span>
      <h1>{resident.displayName}</h1>
      <p>{resident.descriptor}.</p>
      <div className={styles.emptyPrompt}>what brings you here?</div>
    </div>
  );
}

function InlineError({
  error,
  onRetry,
}: {
  error: { title: string; message: string; recoverable: boolean };
  onRetry: () => void;
}) {
  return (
    <div className={styles.inlineError} role="alert">
      <div>
        <strong>{error.title}</strong>
        <p>{error.message}</p>
      </div>
      {error.recoverable ? (
        <button type="button" onClick={onRetry}>
          retry safely
        </button>
      ) : null}
    </div>
  );
}

function MessageTurn({ turn, resident }: { turn: VisitTurn; resident: ResidentVisitProfile }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyText(turn.body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  };
  const isVisitor = turn.role === "visitor";
  return (
    <article className={styles.message} data-role={turn.role} data-state={turn.state}>
      <header className={styles.messageMeta}>
        <span>{isVisitor ? "you" : resident.displayName}</span>
        <time dateTime={turn.createdAt}>{formatTime(turn.createdAt)}</time>
        {turn.kind !== "message" ? <i>{turn.kind.replace("_", " ")}</i> : null}
      </header>
      <div className={styles.messageContent}>
        {turn.state === "thinking" && !turn.body ? (
          <ThinkingIndicator resident={resident} />
        ) : isVisitor ? (
          <p>{turn.body}</p>
        ) : (
          <div className={styles.markdown}>
            <SafeMarkdown source={turn.body} />
            {turn.state === "streaming" ? (
              <span className={styles.streamCaret} aria-hidden />
            ) : null}
          </div>
        )}
        {turn.artifacts.length ? (
          <div className={styles.artifacts}>
            {turn.artifacts.map((artifact) => (
              <Artifact key={artifact.id} artifact={artifact} />
            ))}
          </div>
        ) : null}
      </div>
      {turn.body ? (
        <button className={styles.copyButton} type="button" onClick={() => void copy()}>
          <CopyIcon />
          <span>{copied ? "copied" : "copy"}</span>
        </button>
      ) : null}
      {turn.state === "interrupted" ? (
        <div className={styles.turnState}>receiving stopped</div>
      ) : null}
      {turn.state === "failed" ? (
        <div className={styles.turnState}>no reply was received</div>
      ) : null}
    </article>
  );
}

function ThinkingIndicator({ resident }: { resident: ResidentVisitProfile }) {
  return (
    <div className={styles.thinking} role="status">
      <span className={styles.thinkingDots} aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>{resident.shortName} is attending</span>
    </div>
  );
}

function Artifact({ artifact }: { artifact: VisitArtifact }) {
  if (artifact.state === "pending") {
    return (
      <figure className={styles.artifact} data-state="pending">
        <div className={styles.artifactPending} />
        <figcaption>{artifact.caption ?? "making an image"}</figcaption>
      </figure>
    );
  }
  if (artifact.state === "failed") {
    return (
      <div className={styles.artifactError}>
        The artifact could not be completed · {artifact.reason ?? "generation failed"}
      </div>
    );
  }
  if (artifact.kind === "image" && safeMediaUrl(artifact.url)) {
    return (
      <figure className={styles.artifact}>
        <img
          src={artifact.url ?? ""}
          alt={artifact.caption ?? "generated artifact"}
          loading="lazy"
        />
        <figcaption>{artifact.caption}</figcaption>
      </figure>
    );
  }
  if (artifact.kind === "svg" && artifact.content) {
    return (
      <figure className={styles.artifact}>
        <img
          src={safeSvgDataUrl(artifact.content)}
          alt={artifact.caption ?? "generated SVG artifact"}
        />
        <figcaption>{artifact.caption}</figcaption>
      </figure>
    );
  }
  if (artifact.kind === "ascii" && artifact.content) {
    return (
      <figure className={styles.artifact}>
        <pre className={styles.ascii}>{artifact.content}</pre>
        <figcaption>{artifact.caption}</figcaption>
      </figure>
    );
  }
  if (safeMediaUrl(artifact.url)) {
    return (
      <a className={styles.fileArtifact} href={artifact.url ?? ""} target="_blank" rel="noreferrer">
        <FileIcon />
        <span>{artifact.caption ?? "open artifact"}</span>
      </a>
    );
  }
  return null;
}

function SetDownDialog({
  open,
  resident,
  returnFocus,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  resident: ResidentVisitProfile;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      className={styles.setDownDialog}
      aria-labelledby="set-down-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        if (open) onCancel();
        returnFocus.current?.focus();
      }}
    >
      <span className={styles.instrumentLabel}>set down</span>
      <h2 id="set-down-title">Close this visit with {resident.displayName}?</h2>
      <p>
        Mnemos will ask the active runtime to consolidate this exchange. Only stages and changes the
        runtime actually reports will appear; the thread itself does not disappear.
      </p>
      <div className={styles.dialogActions}>
        <button type="button" onClick={onCancel}>
          remain in the room
        </button>
        <button type="button" onClick={onConfirm}>
          set the visit down
        </button>
      </div>
    </dialog>
  );
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function safeMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function safeSvgDataUrl(source: string): string {
  const clean = source
    .replace(/<\/?(?:script|foreignObject|iframe|object|embed)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(?:href|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
}

function phaseLabel(phase: string, generationUnavailable = false): string {
  if (generationUnavailable) return "local review";
  if (phase === "booting") return "opening";
  if (phase === "thinking") return "attending";
  if (phase === "streaming") return "speaking";
  if (phase === "reconnecting") return "reconnecting";
  if (phase === "closing") return "setting down";
  if (phase === "closed") return "set down";
  if (phase === "unavailable") return "resting";
  if (phase === "error") return "quiet";
  return "attending";
}

function composerPlaceholder(phase: string, pacingTier: string): string {
  if (pacingTier === "hard") return "the visit has reached its natural limit";
  if (phase === "error") return "reconnect before continuing";
  if (phase === "booting") return "opening the thread…";
  if (phase === "closing") return "setting the visit down…";
  return "what brings you here?";
}

function pacingLabel(tier: string, turnsRemaining: number | null): string {
  if (tier === "hard") return "thread limit reached · set down to consolidate";
  if (tier === "approaching") return `${turnsRemaining ?? "a few"} turns remain · or set down now`;
  if (tier === "firm") return "set down anytime · the thread will remain";
  return "Enter to send · Shift Enter for a line break";
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric" })
    .format(date)
    .toLowerCase();
}

function MarkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      <circle
        cx="8"
        cy="8"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth=".8"
        strokeDasharray="1.2 2.1"
      />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M5.6 8.2 10.5 5M5.6 8.2l4.9 2.8M5.6 8.2a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0ZM14 4a1.8 1.8 0 1 1-3.6 0A1.8 1.8 0 0 1 14 4Zm0 8a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  );
}
function ExportIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 1.8v8.1m0 0 3-3m-3 3-3-3M2.5 11.3v2.5h11v-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
      />
    </svg>
  );
}
function InteriorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <circle cx="4" cy="9" r="1.3" fill="currentColor" />
      <circle cx="8.5" cy="4" r="1.3" fill="currentColor" />
      <circle cx="12" cy="10.5" r="1.3" fill="currentColor" />
      <path
        d="m4.8 8 2.8-3m1.8.2 1.8 4.1M5.2 9.5l5.5.8"
        fill="none"
        stroke="currentColor"
        strokeWidth=".8"
      />
    </svg>
  );
}
function SetDownIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3 4.5h10M4.5 7.5h7M6 10.5h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
function DownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M3 9h11m-4-4 4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <rect x="4.5" y="4.5" width="7" height="7" rx=".8" fill="currentColor" />
    </svg>
  );
}
function AttachmentIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
      <path
        d="m6.3 9.9 4.9-4.8a2.2 2.2 0 1 1 3.1 3.1l-6 6a3.5 3.5 0 0 1-5-5l6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <rect x="5" y="5" width="8" height="8" rx="1" fill="none" stroke="currentColor" />
      <path d="M10.5 5V3H3v7.5h2" fill="none" stroke="currentColor" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3.5 1.8h5.3l3.7 3.7v8.7h-9zM8.8 1.8v3.7h3.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}
function CloseSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="m3 3 6 6m0-6L3 9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
