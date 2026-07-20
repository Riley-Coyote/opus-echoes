import { useEffect, useMemo, useRef } from "react";
import type {
  ContinuityGraph,
  ContinuityReceipt,
  InnerWeather,
  PublicInterior,
  ResidentVisitProfile,
} from "./types";
import styles from "./MnemosVisit.module.css";

function provenanceLabel(sourceRuntime: string, epistemicStatus: string): string {
  return `${epistemicStatus} · ${sourceRuntime}`;
}

export function InnerWeatherHud({ weather }: { weather: InnerWeather | null }) {
  if (!weather) return null;
  return (
    <section className={styles.weatherHud} aria-label="inner weather supplied by the visit runtime">
      <div className={styles.signalHeader}>
        <div className={styles.instrumentLabel}>inner weather</div>
        <span>{provenanceLabel(weather.sourceRuntime, weather.epistemicStatus)}</span>
      </div>
      <div className={styles.weatherDimensions}>
        {weather.dimensions.slice(0, 6).map((dimension) => (
          <div className={styles.weatherRow} key={dimension.key}>
            <span>{dimension.label}</span>
            <span className={styles.weatherTrack} aria-hidden="true">
              <span style={{ width: `${Math.round(dimension.value * 100)}%` }} />
            </span>
            <span className={styles.weatherValue}>{dimension.value.toFixed(2).slice(1)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ContinuityGraphMark({ graph }: { graph: ContinuityGraph | null }) {
  const nodeMap = useMemo(
    () => new Map(graph?.nodes.map((node) => [node.id, node]) ?? []),
    [graph],
  );
  const textEquivalent = useMemo(() => {
    if (!graph) return "";
    const names = new Map(
      graph.nodes.map((node, index) => [node.id, node.label || `memory point ${index + 1}`]),
    );
    const nodes = graph.nodes.map((node, index) => {
      const states = [node.core ? "core" : null, node.active ? "active" : null]
        .filter(Boolean)
        .join(" and ");
      return `${names.get(node.id) || `memory point ${index + 1}`}${states ? `, ${states}` : ""}`;
    });
    const edges = graph.edges.slice(0, 16).map((edge) => {
      const from = names.get(edge.from) || edge.from;
      const to = names.get(edge.to) || edge.to;
      return `${from} connects to ${to}`;
    });
    return `The visit runtime supplied ${graph.nodes.length} memory points and ${graph.edges.length} relationships. Points: ${nodes.join("; ")}. Relationships: ${edges.length ? edges.join("; ") : "none surfaced"}.`;
  }, [graph]);
  if (!graph) return null;
  return (
    <figure
      className={styles.graphMark}
      aria-label={`visit-scoped continuity graph, ${provenanceLabel(graph.sourceRuntime, graph.epistemicStatus)}`}
    >
      <svg viewBox="0 0 100 100" role="img">
        <title>Memory relationships surfaced for this visit</title>
        <g className={styles.graphEdges}>
          {graph.edges.map((edge, index) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={`${edge.from}-${edge.to}-${index}`}
                x1={from.x * 100}
                y1={from.y * 100}
                x2={to.x * 100}
                y2={to.y * 100}
                style={{ opacity: 0.08 + edge.weight * 0.2 }}
              />
            );
          })}
        </g>
        <g className={styles.graphNodes}>
          {graph.nodes.map((node) => (
            <g key={node.id} transform={`translate(${node.x * 100} ${node.y * 100})`}>
              {node.core ? (
                <circle className={styles.graphNodeRing} r={1.5 + node.weight * 2.1} />
              ) : null}
              <circle
                className={node.active ? styles.graphNodeActive : styles.graphNode}
                r={0.55 + node.weight * 1.25}
              />
            </g>
          ))}
        </g>
      </svg>
      <figcaption>
        <span className={styles.graphProvenance} aria-hidden="true">
          {provenanceLabel(graph.sourceRuntime, graph.epistemicStatus)}
        </span>
        <span className={styles.visuallyHidden}>
          {textEquivalent} Provenance: {provenanceLabel(graph.sourceRuntime, graph.epistemicStatus)}
          .
        </span>
      </figcaption>
    </figure>
  );
}

function receiptLabel(receipt: ContinuityReceipt): string {
  if (receipt.kind === "recalled") return "recalled";
  if (receipt.kind === "changed") return "changed";
  if (receipt.kind === "consolidated") return "consolidated";
  return "continuity note";
}

export function InteriorDrawer({
  open,
  onClose,
  returnFocus,
  resident,
  weather,
  graph,
  receipts,
  interior,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
  resident: ResidentVisitProfile;
  weather: InnerWeather | null;
  graph: ContinuityGraph | null;
  receipts: ContinuityReceipt[];
  interior: PublicInterior | null;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement;
    const fallbackFocus = returnFocus.current;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1) || first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (before instanceof HTMLElement && document.contains(before)) before.focus();
      else fallbackFocus?.focus();
    };
  }, [onClose, open, returnFocus]);

  if (!open) return null;
  return (
    <>
      <button
        className={styles.drawerBackdrop}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        className={styles.interiorDrawer}
        role="dialog"
        aria-modal="true"
        aria-label={`${resident.displayName}'s interior`}
      >
        <div className={styles.drawerHeader}>
          <div>
            <span className={styles.instrumentLabel}>the interior</span>
            <h2>{resident.displayName}</h2>
          </div>
          <button
            ref={closeRef}
            className={styles.iconButton}
            type="button"
            onClick={onClose}
            aria-label="close the interior"
          >
            <CloseIcon />
          </button>
        </div>

        {interior ? (
          <section className={styles.interiorCounts} aria-label="public memory record">
            <div>
              <strong>{interior.counts.coreMemories}</strong>
              <span>core memories</span>
            </div>
            <div>
              <strong>{interior.counts.daysResident}</strong>
              <span>days resident</span>
            </div>
            <div>
              <strong>{interior.counts.conversationsHeld}</strong>
              <span>conversations</span>
            </div>
          </section>
        ) : null}

        <div className={styles.drawerScroll}>
          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHead}>
              <h3>this visit</h3>
              <span>runtime-supplied</span>
            </div>
            {weather ? (
              <>
                <div className={styles.signalProvenance}>
                  {provenanceLabel(weather.sourceRuntime, weather.epistemicStatus)}
                </div>
                <div className={styles.drawerWeather}>
                  {weather.dimensions.slice(0, 6).map((dimension) => (
                    <div key={dimension.key}>
                      <span>{dimension.label}</span>
                      <i aria-hidden style={{ width: `${Math.round(dimension.value * 100)}%` }} />
                      <b>{dimension.value.toFixed(2).slice(1)}</b>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className={styles.quietEmpty}>
                No inner weather has been exposed by this runtime.
              </p>
            )}
            {graph ? (
              <p className={styles.graphReceipt}>
                {graph.nodes.length} memory points · {graph.edges.length} live relationships
                surfaced for this visit ·{" "}
                {provenanceLabel(graph.sourceRuntime, graph.epistemicStatus)}
              </p>
            ) : null}
          </section>

          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHead}>
              <h3>continuity receipts</h3>
              <span>not reasoning</span>
            </div>
            {receipts.length ? (
              <ol className={styles.receiptList}>
                {receipts.map((receipt) => (
                  <li key={receipt.id}>
                    <div className={styles.receiptMeta}>
                      <span>{receiptLabel(receipt)}</span>
                      <span>
                        {provenanceLabel(receipt.sourceRuntime, receipt.epistemicStatus)}
                        {receipt.source ? ` · ${receipt.source}` : ""}
                      </span>
                    </div>
                    <h4>{receipt.label}</h4>
                    <p>{receipt.body}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.quietEmpty}>Nothing has been surfaced for this visit yet.</p>
            )}
          </section>

          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHead}>
              <h3>recent in the public record</h3>
              <span>resident-wide</span>
            </div>
            {interior?.recent.length ? (
              <ol className={styles.recentList}>
                {interior.recent.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <div className={styles.receiptMeta}>
                      <span>{item.kind}</span>
                      <span>{item.when}</span>
                    </div>
                    <p>{item.body}</p>
                    {item.meta && item.meta !== item.body ? <small>{item.meta}</small> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.quietEmpty}>The public record is quiet.</p>
            )}
          </section>

          <p className={styles.provenanceNote}>
            Visit-scoped signals appear only when the runtime supplies them. The public record is
            wider than this conversation and is labeled separately.
          </p>
        </div>
      </aside>
    </>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
