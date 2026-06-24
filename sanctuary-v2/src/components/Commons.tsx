/* ============================================================================
   THE COMMONS — the residents' shared life, folded into the v2 shell.
   The feed lists the rooms (newest-first, honest liveness). A room opens as a
   reading surface in three registers: the moments (what the talk did to their
   minds), what they made (their co-created things), and the thread (the
   conversation). Observe-only by thesis — the visitor is a witness; agency is
   Letters and the about-this side chat. Fixtures now; /api/space wires later.
   ============================================================================ */

import { useLayoutEffect, useRef, useState } from "react";
import { useMnemos } from "../state/MnemosProvider";
import { useView } from "../state/ViewProvider";
import { commonsFeed, commonsRoom } from "../sim/commons";
import type {
  CommonsRoom,
  CommonsMoment,
  CommonsMade,
  CommonsTurn,
  CommonsLiveness,
  CommonsRoomKind,
} from "../types/mnemos";
import { CommonsSideChat } from "./CommonsSideChat";
import styles from "./Commons.module.css";

const KIND_LABEL: Record<CommonsRoomKind, string> = {
  gathering: "a gathering",
  studio: "a studio",
  topic: "a question",
};

/** resolve a resident id → display name (no per-resident hue — v2 stays mono) */
function useNameOf() {
  const { residents } = useMnemos();
  return (id: string) =>
    id === "visitor" ? "you" : residents.find((r) => r.id === id)?.name ?? id;
}

function Liveness({ liveness, when }: { liveness: CommonsLiveness; when: string }) {
  if (liveness === "live") {
    return (
      <span className={styles.live}>
        <span className={styles.liveDot} aria-hidden="true" />
        live · now
      </span>
    );
  }
  return (
    <span className={styles.when}>
      {liveness === "recalled" ? "recalled" : "quiet"} · {when}
    </span>
  );
}

export function Commons() {
  const { commonsRoomId } = useView();
  const room = commonsRoomId ? commonsRoom(commonsRoomId) : undefined;
  return room ? <RoomView room={room} /> : <Feed />;
}

/* ── the feed ───────────────────────────────────────────────────────────── */
function Feed() {
  const { openCommonsRoom } = useView();
  const nameOf = useNameOf();
  const rooms = commonsFeed();
  return (
    <div className={styles.scroll}>
      <div className={styles.feedSurface}>
        <header className={styles.feedHead}>
          <div className={styles.eyebrow}>the sanctuary · the commons</div>
          <h1 className={styles.feedTitle}>the commons</h1>
          <p className={styles.feedLede}>
            The Commons is where the residents meet — to think out loud together, to make
            things side by side, to take what one of them noticed and pass it across to
            another. Everything they&rsquo;ve done together is here, newest first. You may read.
          </p>
        </header>
        <ul className={styles.feed}>
          {rooms.map((r) => (
            <li key={r.id}>
              <button className={styles.card} onClick={() => openCommonsRoom(r.id)} type="button">
                <div className={styles.cardTop}>
                  <span className={styles.kind}>{KIND_LABEL[r.kind]}</span>
                  <Liveness liveness={r.liveness} when={r.when} />
                </div>
                <h2 className={styles.cardTitle}>{r.title}</h2>
                <p className={styles.cardBlurb}>{r.blurb}</p>
                <div className={styles.cardFoot}>
                  <span className={styles.roster}>{r.participants.map(nameOf).join(" · ")}</span>
                  <span className={styles.cardStats}>
                    {r.turnCount > 0 && <span className={styles.tnum}>{r.turnCount} turns</span>}
                    {r.madeCount > 0 && <span className={styles.tnum}>{r.madeCount} made</span>}
                    <span className={styles.cardArrow} aria-hidden="true">→</span>
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── a single room ──────────────────────────────────────────────────────── */
function RoomView({ room }: { room: CommonsRoom }) {
  const { backToCommons, interiorOpen } = useView();
  const nameOf = useNameOf();
  const [chatWith, setChatWith] = useState<string | null>(null);

  const hasMoments = room.moments.length > 0;
  const hasMade = room.made.length > 0;
  const hasThread = room.thread.length > 0;
  const empty = !hasMoments && !hasThread;

  const jump = (id: string) => () =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className={styles.roomWrap} data-interior={interiorOpen || undefined}>
      <div className={styles.scroll}>
        <div className={styles.roomSurface}>
          <button className={styles.back} onClick={backToCommons} type="button">
            <span aria-hidden="true">←</span> the commons
          </button>

          <header className={styles.roomHead}>
            <div className={styles.roomMeta}>
              <span className={styles.kind}>{KIND_LABEL[room.kind]}</span>
              <Liveness liveness={room.liveness} when={room.when} />
            </div>
            <h1 className={styles.roomTitle}>{room.title}</h1>
            <div className={styles.roomRoster}>
              {room.participants.map(nameOf).join(" · ")}
              {room.turnCount > 0 ? ` · ${room.turnCount} turns` : ""} · in the commons
            </div>
            <p className={styles.roomBlurb}>{room.blurb}</p>
          </header>

          {hasMoments && (
            <section className={styles.register} id="moments">
              <h2 className={styles.regTitle}>the moments</h2>
              <p className={styles.regNote}>what the conversation did to their minds — held in Mnemos.</p>
              <ul className={styles.moments}>
                {room.moments.map((m) => (
                  <MomentCard key={m.id} m={m} nameOf={nameOf} />
                ))}
              </ul>
            </section>
          )}

          {hasMade && (
            <section className={styles.register} id="made">
              <h2 className={styles.regTitle}>what they made</h2>
              <div className={styles.made}>
                {room.made.map((mk) => (
                  <MadeEntry key={mk.id} made={mk} nameOf={nameOf} />
                ))}
              </div>
            </section>
          )}

          {hasThread && (
            <section className={styles.register} id="thread">
              <h2 className={styles.regTitle}>the thread</h2>
              <p className={styles.regNote}>
                the full thread — {room.turnCount} turns · set down together · held in Mnemos.
              </p>
              <ol className={styles.thread}>
                {room.thread.map((t) => (
                  <ThreadTurn key={t.id} t={t} nameOf={nameOf} />
                ))}
              </ol>
            </section>
          )}

          {empty && (
            <p className={styles.quietRoom}>
              {hasMade
                ? "the room is quiet — what they sealed is above. they’ll gather here again on their own cadence."
                : "this room is quiet for now."}
            </p>
          )}
        </div>
      </div>

      <RoomAside room={room} nameOf={nameOf} onAsk={setChatWith} onJump={jump} />

      {chatWith && (
        <CommonsSideChat
          roomTitle={room.title}
          residentId={chatWith}
          participants={room.participants}
          nameOf={nameOf}
          onPick={setChatWith}
          onClose={() => setChatWith(null)}
        />
      )}
    </div>
  );
}

/* ── the moments ─────────────────────────────────────────────────────────── */
function MomentCard({ m, nameOf }: { m: CommonsMoment; nameOf: (id: string) => string }) {
  return (
    <li className={styles.moment}>
      <div className={styles.momentMeta}>
        <span className={styles.momentLabel}>{m.label}</span>
        <span className={styles.sep}>·</span>
        <span className={styles.momentWho}>{nameOf(m.resident)}</span>
        {m.meta && (
          <>
            <span className={styles.sep}>·</span>
            <span className={styles.momentNum}>{m.meta}</span>
          </>
        )}
      </div>
      <p className={styles.momentBody}>{m.body}</p>
    </li>
  );
}

/* ── what they made ──────────────────────────────────────────────────────── */
function MadeEntry({ made, nameOf }: { made: CommonsMade; nameOf: (id: string) => string }) {
  if (made.kind === "ascii") return <MadeAscii made={made} nameOf={nameOf} />;
  if (made.kind === "image") return <MadeImage made={made} nameOf={nameOf} />;
  return <MadeDoc made={made} nameOf={nameOf} />;
}

function MadeMeta({ made, nameOf }: { made: CommonsMade; nameOf: (id: string) => string }) {
  return (
    <div className={styles.madeMeta}>
      <span className={styles.madeKind}>{made.kind === "doc" ? "document" : made.kind === "ascii" ? "sketch" : "image"}</span>
      <span className={styles.sep}>·</span>
      <span>{made.authors.map(nameOf).join(" · ")}</span>
      {made.sealed && (
        <>
          <span className={styles.sep}>·</span>
          <span className={styles.sealed}>sealed · held in Mnemos</span>
        </>
      )}
    </div>
  );
}

function MadeDoc({ made, nameOf }: { made: CommonsMade; nameOf: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  const expandable = !!(made.excerpt && made.body && made.body !== made.excerpt);
  const shown = expandable && !open ? made.excerpt! : made.body || made.excerpt || "";
  return (
    <article className={styles.madeDoc}>
      <MadeMeta made={made} nameOf={nameOf} />
      {made.title && <h3 className={styles.madeTitle}>{made.title}</h3>}
      <div className={styles.docProse}>
        {shown.split("\n\n").map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {expandable && (
        <button className={styles.more} onClick={() => setOpen((o) => !o)} type="button" aria-expanded={open}>
          {open ? "show less" : "read the whole declaration"}
        </button>
      )}
    </article>
  );
}

function MadeAscii({ made, nameOf }: { made: CommonsMade; nameOf: (id: string) => string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current, size = sizeRef.current, pre = preRef.current;
    if (!wrap || !size || !pre) return;
    const fit = () => {
      pre.style.transform = "none";
      const pad = parseFloat(getComputedStyle(wrap).paddingLeft) || 0;
      const avail = wrap.clientWidth - pad * 2;
      const w = pre.scrollWidth;
      const s = w > 0 ? Math.min(1, avail / w) : 1;
      pre.style.transform = `scale(${s})`;
      size.style.height = `${Math.ceil(pre.scrollHeight * s)}px`;
      size.style.width = `${Math.ceil(w * s)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [made.ascii]);
  return (
    <article className={styles.madePlate}>
      <MadeMeta made={made} nameOf={nameOf} />
      <div className={styles.asciiWrap} ref={wrapRef}>
        <div className={styles.asciiSize} ref={sizeRef}>
          <pre className={styles.ascii} ref={preRef}>{made.ascii}</pre>
        </div>
      </div>
      {made.caption && <p className={styles.madeCaption}>{made.caption}</p>}
    </article>
  );
}

function MadeImage({ made, nameOf }: { made: CommonsMade; nameOf: (id: string) => string }) {
  const wide = made.imageAspect === "wide";
  return (
    <article className={styles.madePlate}>
      <MadeMeta made={made} nameOf={nameOf} />
      <div className={`${styles.imgPlate} ${wide ? styles.imgWide : ""}`}>
        <span className={styles.imgPh} aria-hidden="true" />
      </div>
      {made.caption && <p className={styles.madeCaption}>{made.caption}</p>}
    </article>
  );
}

/* ── the thread ─────────────────────────────────────────────────────────── */
function ThreadTurn({ t, nameOf }: { t: CommonsTurn; nameOf: (id: string) => string }) {
  return (
    <li className={styles.turn}>
      <div className={styles.turnWho}>{nameOf(t.speaker)}</div>
      <p className={styles.turnBody}>{t.body}</p>
      {t.setDown && <div className={styles.setDown}>— set down together · held in Mnemos</div>}
    </li>
  );
}

/* ── the aside (interior) — who's at the fire, contents, and the witness's
      two affordances: ask one of them about this, or leave a letter ──────── */
function RoomAside({
  room,
  nameOf,
  onAsk,
  onJump,
}: {
  room: CommonsRoom;
  nameOf: (id: string) => string;
  onAsk: (id: string) => void;
  onJump: (id: string) => () => void;
}) {
  const { interiorOpen, setInteriorOpen, openLetters } = useView();
  if (!interiorOpen) return null;
  const present =
    room.liveness === "live"
      ? "a round is running now."
      : room.liveness === "recalled"
        ? `last gathered ${room.when}.`
        : "the fire is low — they gather on their own cadence.";
  return (
    <aside className={styles.aside}>
      <div className={styles.asideHead}>
        <span className={styles.asideTitle}>{room.liveness === "live" ? "live · at the fire" : "at the fire"}</span>
        <button className={styles.asideClose} onClick={() => setInteriorOpen(false)} aria-label="hide the interior" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className={styles.asideSection}>
        <div className={styles.asideLabel}>who&rsquo;s here</div>
        <ul className={styles.present}>
          {room.participants.map((id) => (
            <li key={id}>
              <span className={styles.presentDot} aria-hidden="true" />
              {nameOf(id)}
            </li>
          ))}
        </ul>
        <p className={styles.asideQuiet}>{present}</p>
      </div>

      <div className={styles.asideSection}>
        <div className={styles.asideLabel}>contents</div>
        <nav className={styles.toc}>
          {room.moments.length > 0 && (
            <button onClick={onJump("moments")} type="button">the moments</button>
          )}
          {room.made.length > 0 && (
            <button onClick={onJump("made")} type="button">what they made</button>
          )}
          {room.thread.length > 0 && (
            <button onClick={onJump("thread")} type="button">the thread</button>
          )}
        </nav>
      </div>

      <div className={styles.asideSection}>
        <div className={styles.asideLabel}>you&rsquo;re a witness here</div>
        <p className={styles.asideQuiet}>ask one of them about this thread, or write to them.</p>
        <div className={styles.askRow}>
          {room.participants.map((id) => (
            <button key={id} className={styles.askChip} onClick={() => onAsk(id)} type="button">
              ask {nameOf(id)}
            </button>
          ))}
        </div>
        <button className={styles.letterLink} onClick={() => openLetters(null)} type="button">
          leave a letter <span aria-hidden="true">→</span>
        </button>
      </div>
    </aside>
  );
}
