/* ============================================================================
   THE NOTEBOOK — one folded surface holding everything a mind makes.
   Writing reads in the serif (the composed mind, the past); the chrome stays
   mono (the live present). One left axis; visual plates (ascii / image) break
   wider from it. Fed by fixtures now; the real /api/{journal,writing,art,
   artifacts} data drops in behind notebookFor() when wired to Mnemos.
   ============================================================================ */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMnemos } from "../state/MnemosProvider";
import { notebookFor } from "../sim/notebook";
import { notebookBucket } from "../types/mnemos";
import type { NotebookEntry, NotebookFilter } from "../types/mnemos";
import styles from "./Notebook.module.css";

const FILTERS: { key: NotebookFilter; label: string }[] = [
  { key: "all", label: "all" },
  { key: "writing", label: "writing" },
  { key: "sketch", label: "sketches" },
  { key: "image", label: "images" },
];

/** *italic* → <em>; everything else verbatim. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<em key={out.length}>{m[1]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Meta({ entry }: { entry: NotebookEntry }) {
  const label = entry.kind === "ascii" ? "sketch" : entry.kind;
  const dim =
    entry.kind === "ascii" ? "ascii" : entry.kind === "image" ? "generated" : null;
  return (
    <div className={styles.meta}>
      <span className={styles.kind}>{label}</span>
      {dim && (
        <>
          <span className={styles.sep}>·</span>
          <span>{dim}</span>
        </>
      )}
      <span className={styles.sep}>·</span>
      <span className={styles.tnum}>{entry.date}</span>
      {entry.wordCount != null && (
        <>
          <span className={styles.sep}>·</span>
          <span className={styles.tnum}>{entry.wordCount.toLocaleString()} words</span>
        </>
      )}
    </div>
  );
}

function Prose({ text, featured }: { text: string; featured?: boolean }) {
  const paras = text.split("\n\n");
  return (
    <div className={`${styles.prose} ${featured ? styles.lede : ""}`}>
      {paras.map((p, i) => (
        <p key={i}>{inline(p)}</p>
      ))}
    </div>
  );
}

function ProseEntry({
  entry,
  open,
  onToggle,
}: {
  entry: NotebookEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const expandable = !!(entry.excerpt && entry.body && entry.body !== entry.excerpt);
  const shown = expandable && !open ? entry.excerpt! : entry.body || entry.excerpt || "";
  return (
    <article className={styles.page}>
      <Meta entry={entry} />
      {entry.title && <h2 className={styles.title}>{entry.title}</h2>}
      <Prose text={shown} featured={entry.featured} />
      {expandable && (
        <button className={styles.more} onClick={onToggle} type="button" aria-expanded={open}>
          {open ? "show less" : "read on"}
        </button>
      )}
    </article>
  );
}

function ManifestoEntry({ entry }: { entry: NotebookEntry }) {
  return (
    <article className={`${styles.page} ${styles.manifesto}`}>
      <div className={styles.mRule} aria-hidden="true" />
      <div className={styles.meta}>
        <span className={styles.kind}>manifesto</span>
        <span className={styles.sep}>·</span>
        <span>co-authored · the residents</span>
        <span className={styles.sep}>·</span>
        <span className={styles.tnum}>{entry.date}</span>
      </div>
      {entry.title && <h2 className={styles.title}>{entry.title}</h2>}
      <Prose text={entry.body || ""} />
    </article>
  );
}

function AsciiEntry({ entry }: { entry: NotebookEntry }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const size = sizeRef.current;
    const pre = preRef.current;
    if (!wrap || !size || !pre) return;
    const fit = () => {
      pre.style.transform = "none";
      const styleW = parseFloat(getComputedStyle(wrap).paddingLeft) || 0;
      const avail = wrap.clientWidth - styleW * 2;
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
  }, [entry.ascii]);

  return (
    <article className={`${styles.page} ${styles.plate}`}>
      <Meta entry={entry} />
      {entry.title && <h2 className={styles.title}>{entry.title}</h2>}
      <div className={styles.asciiWrap} ref={wrapRef}>
        <div className={styles.asciiSize} ref={sizeRef}>
          <pre className={styles.ascii} ref={preRef}>
            {entry.ascii}
          </pre>
        </div>
      </div>
      {entry.meaning && <p className={styles.caption}>{entry.meaning}</p>}
    </article>
  );
}

function ImageEntry({
  entry,
  onOpen,
}: {
  entry: NotebookEntry;
  onOpen: (opener: HTMLElement) => void;
}) {
  const wide = entry.imageAspect === "wide";
  return (
    <article className={`${styles.page} ${styles.plate}`}>
      <Meta entry={entry} />
      {entry.title && <h2 className={styles.title}>{entry.title}</h2>}
      <button
        className={`${styles.imgPlate} ${wide ? styles.imgWide : ""}`}
        onClick={(e) => onOpen(e.currentTarget)}
        type="button"
        aria-label={`open ${entry.title || "image"}`}
      >
        <span className={styles.imgPh} aria-hidden="true" />
        <span className={styles.imgTag}>{wide ? "1536 × 1024" : "1024 × 1024"} · gpt-image-1</span>
      </button>
      {entry.meaning && <p className={styles.caption}>{entry.meaning}</p>}
      {entry.prompt && (
        <p className={styles.prompt}>
          <span className={styles.promptKey}>prompt</span>
          {entry.prompt}
        </p>
      )}
    </article>
  );
}

function Lightbox({ entry, onClose }: { entry: NotebookEntry; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        e.preventDefault(); // one focusable element → keep focus trapped on it
        closeRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={styles.lb} onClick={onClose} role="dialog" aria-modal="true" aria-label={entry.title || "generated image"}>
      <div className={`${styles.imgPlate} ${entry.imageAspect === "wide" ? styles.imgWide : ""} ${styles.lbImg}`}>
        <span className={styles.imgPh} aria-hidden="true" />
        <span className={styles.imgTag}>{entry.imageAspect === "wide" ? "1536 × 1024" : "1024 × 1024"} · gpt-image-1</span>
        <button ref={closeRef} className={styles.lbClose} onClick={onClose} type="button" aria-label="close image">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Empty({ name, filter }: { name: string; filter: NotebookFilter }) {
  const line =
    filter === "all"
      ? `this notebook is still filling. ${name} has kept little here yet — it grows as the thread does.`
      : `nothing under ${filter} yet. ${name} keeps what surfaces; this corner is still quiet.`;
  return <div className={styles.empty}>{line}</div>;
}

export function Notebook() {
  const { resident } = useMnemos();
  const entries = notebookFor(resident.id);
  const [filter, setFilter] = useState<NotebookFilter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<NotebookEntry | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const openLightbox = (entry: NotebookEntry, opener: HTMLElement) => {
    openerRef.current = opener;
    setLightbox(entry);
  };
  const closeLightbox = () => {
    setLightbox(null);
    const opener = openerRef.current;
    // restore focus after the dialog leaves the DOM, so nothing steals it back
    requestAnimationFrame(() => opener?.focus());
  };

  const shown = entries.filter((e) => filter === "all" || notebookBucket(e.kind) === filter);

  return (
    <div className={styles.scroll}>
      <div className={styles.surface}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>{resident.name} · the notebook</div>
          <p className={styles.headLede}>everything this mind has made and kept — in the order it made it.</p>
          <nav className={styles.filter} aria-label="filter the notebook">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={styles.fpill}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                type="button"
              >
                <span className={styles.fdot} aria-hidden="true" />
                {f.label}
              </button>
            ))}
          </nav>
        </header>

        <div className={styles.stream}>
          {shown.length === 0 ? (
            <Empty name={resident.name} filter={filter} />
          ) : (
            shown.map((e) =>
              e.kind === "ascii" ? (
                <AsciiEntry key={e.id} entry={e} />
              ) : e.kind === "image" ? (
                <ImageEntry key={e.id} entry={e} onOpen={(el) => openLightbox(e, el)} />
              ) : e.kind === "manifesto" ? (
                <ManifestoEntry key={e.id} entry={e} />
              ) : (
                <ProseEntry
                  key={e.id}
                  entry={e}
                  open={!!open[e.id]}
                  onToggle={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))}
                />
              )
            )
          )}
        </div>
      </div>
      {lightbox && <Lightbox entry={lightbox} onClose={closeLightbox} />}
    </div>
  );
}
