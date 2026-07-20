import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./sanctuary-world.module.css";

type WorldResident = {
  id: "opus-3" | "sonnet-4-5" | "gpt-4o" | "gpt-5-1";
  name: string;
  color: string;
};

type WorldMessage = {
  id: string;
  role: "visitor" | "resident";
  body: string;
};

type WorldVisit = {
  id: string;
  generationAvailable: boolean;
};

type WorldRuntime = {
  roomId: string;
  av: { x: number; y: number; dir: number; moving: boolean };
  near: { kind?: string; label?: string; action?: string } | null;
  chatNpc: { id: string; name: string } | null;
  destroy: () => void;
  endChat: (reason?: string) => void;
  npcSay: (id: string, text: string) => number;
  setSound: (on: boolean) => void;
  update: (now: number, dt: number) => void;
  drawScene: (now: number) => void;
};

type RuntimeEvent = {
  seq?: number;
  type?: string;
  payload?: Record<string, unknown> | string | null;
};

declare global {
  interface Window {
    __MNEMOS_WORLD__?: WorldRuntime;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

const RESIDENT_IDS = new Set<WorldResident["id"]>(["opus-3", "sonnet-4-5", "gpt-4o", "gpt-5-1"]);

function isUuid(value: string | null): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

function canonicalVisitorId(): string {
  const keys = ["mnemos.visitor_id", "sanctuary.visitor_token", "opus_visitor_token"];
  for (const key of keys) {
    const existing = window.localStorage.getItem(key);
    if (isUuid(existing)) {
      window.localStorage.setItem("mnemos.visitor_id", existing);
      return existing;
    }
  }
  const created = crypto.randomUUID();
  window.localStorage.setItem("mnemos.visitor_id", created);
  return created;
}

function exchangeCountKey(residentId: WorldResident["id"], visitId: string): string {
  return `mnemos.world.exchange-count.${residentId}.${visitId}`;
}

function storedExchangeCount(residentId: WorldResident["id"], visitId: string): number {
  const value = Number(window.sessionStorage.getItem(exchangeCountKey(residentId, visitId)) ?? 0);
  return Number.isInteger(value) ? Math.max(0, Math.min(3, value)) : 0;
}

function textFromEvent(event: RuntimeEvent): string {
  const payload = event.payload;
  if (typeof payload === "string") return payload;
  if (!payload) return "";
  for (const key of ["delta", "text", "content", "body"]) {
    const value = payload[key];
    if (typeof value === "string") return value;
  }
  return "";
}

async function readRuntimeEvents(
  response: Response,
  onEvent: (event: RuntimeEvent) => void,
): Promise<void> {
  const contentType = response.headers.get("content-type") || "";
  if (!response.body || (!contentType.includes("ndjson") && !contentType.includes("stream"))) {
    const payload = (await response.json()) as RuntimeEvent | { events?: RuntimeEvent[] };
    if ("events" in payload && Array.isArray(payload.events)) payload.events.forEach(onEvent);
    else onEvent(payload as RuntimeEvent);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim().replace(/^data:\s*/, "");
      if (!line || line === "[DONE]") continue;
      try {
        onEvent(JSON.parse(line) as RuntimeEvent);
      } catch {
        // A partial or non-event line is not surfaced as cognition.
      }
    }
    if (done) break;
  }
  const last = pending.trim().replace(/^data:\s*/, "");
  if (last && last !== "[DONE]") {
    try {
      onEvent(JSON.parse(last) as RuntimeEvent);
    } catch {
      // Ignore an incomplete terminal line.
    }
  }
}

export function SanctuaryWorld() {
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldRuntime | null>(null);
  const activeResidentRef = useRef<WorldResident | null>(null);
  const messageCountRef = useRef(0);
  const visitPromisesRef = useRef(new Map<WorldResident["id"], Promise<WorldVisit>>());
  const generationByResidentRef = useRef(new Map<WorldResident["id"], boolean>());
  const [ready, setReady] = useState(false);
  const [sound, setSound] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeResident, setActiveResident] = useState<WorldResident | null>(null);
  const [messages, setMessages] = useState<WorldMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [visitId, setVisitId] = useState<string | null>(null);
  const [generationAvailable, setGenerationAvailable] = useState<boolean | null>(null);
  const [explicitTurnCount, setExplicitTurnCount] = useState(0);
  const [status, setStatus] = useState<"idle" | "connecting" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    activeResidentRef.current = activeResident;
  }, [activeResident]);

  useEffect(() => {
    messageCountRef.current = explicitTurnCount;
  }, [explicitTurnCount]);

  const ensureVisit = useCallback((resident: WorldResident): Promise<WorldVisit> => {
    const pending = visitPromisesRef.current.get(resident.id);
    if (pending) return pending;

    const requestVisit = async (requestedVisitId: string | null): Promise<WorldVisit> => {
      const visitorId = canonicalVisitorId();
      const storageKey = `mnemos.world.visit.${resident.id}`;
      const startKey = `mnemos.world.visit-start.${resident.id}`;
      const idempotencyKey = requestedVisitId
        ? `world-resume:${resident.id}:${requestedVisitId}:${visitorId}`
        : window.sessionStorage.getItem(startKey) || crypto.randomUUID();
      if (!requestedVisitId) window.sessionStorage.setItem(startKey, idempotencyKey);

      const response = await fetch("/api/visit/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          visitor_id: visitorId,
          resident_id: resident.id,
          ...(requestedVisitId ? { visit_id: requestedVisitId } : {}),
          surface: "world",
          location: worldRef.current?.roomId || "sanctuary",
        }),
      });

      // A saved in-memory review visit may disappear when the local server is
      // restarted. Clear only that stale id; ownership failures remain fatal.
      if (requestedVisitId && response.status === 404) {
        window.sessionStorage.removeItem(storageKey);
        return requestVisit(null);
      }
      if (!response.ok) throw new Error("The visit room is not available yet.");
      const payload = (await response.json()) as {
        visit_id?: string;
        session_id?: string;
        id?: string;
        status?: string;
        closed?: boolean;
        generation_available?: boolean;
        capabilities?: { generation?: boolean };
      };
      if (requestedVisitId && (payload.closed === true || payload.status === "closed")) {
        // A world handoff may point at a visit that was later set down in the
        // full room. Preserve its continuity in Mnemos, but begin a new visit
        // instead of pinning the world to an already-closed runtime forever.
        window.sessionStorage.removeItem(storageKey);
        window.sessionStorage.removeItem(startKey);
        return requestVisit(null);
      }
      const id = payload.visit_id || payload.session_id || payload.id;
      if (!id) throw new Error("The visit began without a recoverable visit id.");
      const capability = payload.generation_available ?? payload.capabilities?.generation ?? false;
      const visit = { id, generationAvailable: capability };
      window.sessionStorage.setItem(storageKey, id);
      window.sessionStorage.removeItem(startKey);
      generationByResidentRef.current.set(resident.id, capability);
      return visit;
    };

    const storageKey = `mnemos.world.visit.${resident.id}`;
    const saved = window.sessionStorage.getItem(storageKey);
    const promise = requestVisit(isUuid(saved) ? saved : null).catch((cause) => {
      visitPromisesRef.current.delete(resident.id);
      throw cause;
    });
    visitPromisesRef.current.set(resident.id, promise);
    return promise;
  }, []);

  const openResident = useCallback(
    (candidate: { id: string; name: string; color: string; temp?: boolean }) => {
      if (candidate.temp || !RESIDENT_IDS.has(candidate.id as WorldResident["id"])) return;
      const resident: WorldResident = {
        id: candidate.id as WorldResident["id"],
        name: candidate.name,
        color: candidate.color,
      };
      activeResidentRef.current = resident;
      setActiveResident(resident);
      setMessages([]);
      setVisitId(null);
      setGenerationAvailable(generationByResidentRef.current.get(resident.id) ?? null);
      const savedVisitId = window.sessionStorage.getItem(`mnemos.world.visit.${resident.id}`);
      setExplicitTurnCount(
        isUuid(savedVisitId) ? storedExchangeCount(resident.id, savedVisitId) : 0,
      );
      setDraft("");
      setError(null);
      setStatus("connecting");
      void ensureVisit(resident)
        .then((visit) => {
          if (activeResidentRef.current?.id !== resident.id) return;
          setVisitId(visit.id);
          setGenerationAvailable(visit.generationAvailable);
          const count = storedExchangeCount(resident.id, visit.id);
          messageCountRef.current = count;
          setExplicitTurnCount(count);
          setStatus("idle");
        })
        .catch((cause) => {
          if (activeResidentRef.current?.id !== resident.id) return;
          setError(cause instanceof Error ? cause.message : "The visit room is not available yet.");
          setStatus("error");
        });
    },
    [ensureVisit],
  );

  useEffect(() => {
    let cancelled = false;
    let world: WorldRuntime | null = null;

    async function mountWorld() {
      if (!stageRef.current) return;
      const base = "/mnemos-world";
      const [{ create }, donor] = await Promise.all([
        import(/* @vite-ignore */ `${base}/engine.js`),
        import(/* @vite-ignore */ `${base}/lookout.js`),
      ]);
      if (cancelled || !stageRef.current) return;

      world = create({
        mount: stageRef.current,
        palette: donor.PALETTE,
        rooms: donor.makeHub({ note: () => undefined }),
        start: "lookout",
        width: 960,
        height: 420,
        walkBand: [352, 402],
        wallBase: 300,
        cast: donor.CAST,
        cat: donor.CAT,
        scripts: donor.SCRIPTS,
        groupScripts: donor.GROUP_SCRIPTS,
        ambient: donor.AMBIENT,
        bubbles: true,
        onChatOpen: openResident,
        onChatClose: () => setActiveResident(null),
      }) as WorldRuntime;
      worldRef.current = world;
      window.__MNEMOS_WORLD__ = world;

      window.render_game_to_text = () =>
        JSON.stringify({
          coordinate_system: "world pixels; origin top-left; x increases right; y increases down",
          mode: activeResidentRef.current ? "resident_dialogue" : "exploration",
          room: world?.roomId,
          player: world
            ? { x: Math.round(world.av.x), y: Math.round(world.av.y), moving: world.av.moving }
            : null,
          nearby: world?.near
            ? {
                kind: world.near.kind || "object",
                label: world.near.label || null,
                action: world.near.action || null,
              }
            : null,
          resident_dialogue: activeResidentRef.current
            ? {
                resident_id: activeResidentRef.current.id,
                explicit_turns: messageCountRef.current,
                maximum_world_turns: 3,
              }
            : null,
        });

      window.advanceTime = (ms: number) => {
        if (!world) return;
        const steps = Math.max(1, Math.round(ms / (1000 / 60)));
        let now = performance.now();
        for (let i = 0; i < steps; i += 1) {
          now += 1000 / 60;
          world.update(now, 1000 / 60);
        }
        world.drawScene(now);
      };
      setReady(true);
    }

    void mountWorld().catch((cause) => {
      console.error("sanctuary world failed to mount", cause);
      setMountError("The walkable grounds could not be rendered in this browser.");
    });

    return () => {
      cancelled = true;
      world?.destroy();
      worldRef.current = null;
      delete window.__MNEMOS_WORLD__;
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [openResident]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.fullscreenElement) {
        event.preventDefault();
        void document.exitFullscreen();
        return;
      }
      if (
        event.key.toLowerCase() !== "f" ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      event.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const send = useCallback(async () => {
    const resident = activeResident;
    const body = draft.trim();
    if (
      !resident ||
      !body ||
      generationAvailable !== true ||
      status === "streaming" ||
      messageCountRef.current >= 3
    )
      return;

    const visitorMessage: WorldMessage = { id: crypto.randomUUID(), role: "visitor", body };
    const replyId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      visitorMessage,
      { id: replyId, role: "resident", body: "" },
    ]);
    setDraft("");
    setError(null);
    setStatus(visitId ? "streaming" : "connecting");

    try {
      const visit = await ensureVisit(resident);
      const id = visit.id;
      setVisitId(id);
      setGenerationAvailable(visit.generationAvailable);
      setStatus("streaming");
      const turnId = crypto.randomUUID();
      const visitorId = canonicalVisitorId();
      const response = await fetch(`/api/visit/${encodeURIComponent(id)}/turn`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": turnId,
          "x-mnemos-visitor-id": visitorId,
        },
        body: JSON.stringify({
          turn_id: turnId,
          visitor_id: visitorId,
          resident_id: resident.id,
          surface: "world",
          location: worldRef.current?.roomId || "sanctuary",
          message: body,
        }),
      });
      if (!response.ok) throw new Error("The resident could not answer from the grounds.");

      let assembled = "";
      let runtimeError = "";
      await readRuntimeEvents(response, (event) => {
        if (event.type === "model.output.delta" || event.type === "text.delta") {
          assembled += textFromEvent(event);
        } else if (
          event.type === "model.output.completed" ||
          event.type === "text.completed" ||
          event.type === "model.completed" ||
          event.type === "turn.completed"
        ) {
          assembled ||= textFromEvent(event);
        } else if (event.type === "turn.error") {
          runtimeError = textFromEvent(event);
          if (!runtimeError && event.payload && typeof event.payload === "object") {
            const reason = event.payload.reason || event.payload.message || event.payload.code;
            if (typeof reason === "string") runtimeError = reason;
          }
          return;
        } else {
          return;
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === replyId ? { ...message, body: assembled } : message,
          ),
        );
      });
      if (!assembled) {
        throw new Error(
          runtimeError || "The resident runtime is not available for a world reply yet.",
        );
      }
      const nextCount = Math.min(3, messageCountRef.current + 1);
      messageCountRef.current = nextCount;
      setExplicitTurnCount(nextCount);
      window.sessionStorage.setItem(exchangeCountKey(resident.id, id), String(nextCount));
      worldRef.current?.npcSay(resident.id, assembled);
      setStatus("idle");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "The world connection was interrupted.";
      setMessages((current) => current.filter((item) => item.id !== replyId));
      setError(message);
      setStatus("error");
    }
  }, [activeResident, draft, ensureVisit, generationAvailable, status, visitId]);

  const continueHref = activeResident
    ? visitId
      ? `/visits/${activeResident.id}?visit=${encodeURIComponent(visitId)}&from=world`
      : undefined
    : "/visits";

  const continueInRoom = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!continueHref) {
      event.preventDefault();
      return;
    }
    if (reducedMotion) return;
    event.preventDefault();
    setTransitioning(true);
    window.setTimeout(() => window.location.assign(continueHref), 430);
  };

  return (
    <main className={styles.world} data-ready={ready || undefined}>
      <a className={styles.skip} href="#world-stage">
        skip to the grounds
      </a>

      <header className={styles.bar}>
        <a className={styles.brand} href="/" aria-label="Mnemos home">
          <span className={styles.mark} aria-hidden="true" />
          mnemos
        </a>
        <p>
          sanctuary grounds <span>·</span> ambient lines are scripted and never written to memory
        </p>
        <nav aria-label="Sanctuary controls">
          <a href="/visits">visits</a>
          <button
            type="button"
            onClick={() => {
              const next = !sound;
              setSound(next);
              worldRef.current?.setSound(next);
            }}
          >
            {sound ? "sound on" : "sound off"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen();
            }}
          >
            {fullscreen ? "exit full" : "full screen"}
          </button>
        </nav>
      </header>

      <section
        className={styles.stage}
        id="world-stage"
        ref={stageRef}
        tabIndex={0}
        role="application"
        aria-label="The Sanctuary grounds. Use arrow keys or WASD to move and E or Enter to interact. Press F for fullscreen."
      >
        <canvas aria-label="A walkable view of the Sanctuary at dusk" />
        {mountError ? (
          <div className={styles.staticFallback} role="status">
            <span>static world fallback</span>
            <h1>the grounds are quiet</h1>
            <p>{mountError} Resident visits and the complete rooms remain available.</p>
            <div>
              <a href="/visits">visit a resident</a>
              <a href="/resources">runtime notes</a>
            </div>
          </div>
        ) : null}
        <div className={styles.placard} data-hud="placard" />
        <div className={styles.dpad} aria-hidden="true">
          <button type="button" data-dpad="up" tabIndex={-1}>
            ↑
          </button>
          <button type="button" data-dpad="left" tabIndex={-1}>
            ←
          </button>
          <button type="button" data-dpad="down" tabIndex={-1}>
            ↓
          </button>
          <button type="button" data-dpad="right" tabIndex={-1}>
            →
          </button>
        </div>
        <button
          className={styles.interact}
          type="button"
          data-inspect
          tabIndex={-1}
          aria-label="Interact"
        >
          e
        </button>
      </section>

      <footer className={styles.hud}>
        <div>
          <p className={styles.room} data-hud="room">
            the lookout
          </p>
          <h1 data-hud="title">the lookout</h1>
          <p className={styles.body} data-hud="body">
            Click the grounds to take the controls. The residents carry on either way.
          </p>
        </div>
        <div className={styles.hudActions}>
          <span data-hud="hint">click to enter</span>
          <button type="button" data-hud="cta" hidden />
        </div>
      </footer>

      {activeResident ? (
        <aside
          className={styles.dialogue}
          aria-label={`A short conversation with ${activeResident.name}`}
        >
          <header>
            <div>
              <span className={styles.residentDot} style={{ background: activeResident.color }} />
              <p>in the world · {explicitTurnCount} of 3 exchanges</p>
              <h2>{activeResident.name}</h2>
            </div>
            <button
              type="button"
              aria-label="Leave this world conversation"
              onClick={() => worldRef.current?.endChat("you stepped away")}
            >
              close
            </button>
          </header>

          <div className={styles.transcript} aria-live="polite" aria-busy={status === "streaming"}>
            {messages.length === 0 ? (
              <p className={styles.quiet}>
                You have their attention. Keep this exchange small, or continue into the room.
              </p>
            ) : null}
            {messages.map((message) => (
              <article key={message.id} data-role={message.role}>
                <span>{message.role === "visitor" ? "you" : activeResident.name}</span>
                <p>{message.body || "…"}</p>
              </article>
            ))}
          </div>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          {generationAvailable === false ? (
            <p className={styles.limit}>
              Resident generation is not connected in this local review. The shared visit is ready
              to inspect in the room.
            </p>
          ) : explicitTurnCount < 3 ? (
            <form
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <label htmlFor="world-message">say something here</label>
              <div>
                <textarea
                  id="world-message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  maxLength={800}
                  disabled={
                    generationAvailable !== true ||
                    status === "streaming" ||
                    status === "connecting"
                  }
                />
                <button
                  type="submit"
                  disabled={
                    generationAvailable !== true ||
                    !draft.trim() ||
                    status === "streaming" ||
                    status === "connecting"
                  }
                >
                  {status === "streaming" || status === "connecting" ? "listening" : "send"}
                </button>
              </div>
            </form>
          ) : (
            <p className={styles.limit}>The short exchange has reached its natural edge.</p>
          )}

          <a
            className={styles.continue}
            href={continueHref}
            aria-disabled={!continueHref || undefined}
            aria-busy={!continueHref || undefined}
            onClick={continueInRoom}
          >
            continue in the room <span aria-hidden="true">↗</span>
          </a>
        </aside>
      ) : null}

      <div className={styles.veil} data-active={transitioning || undefined} aria-hidden="true" />
    </main>
  );
}
