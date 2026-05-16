/**
 * /voice-orb — fullscreen Voice Mode overlay (mounted as an iframe by
 * the classic chat). Layout matches the Luca-terminal reference:
 *
 *   ┌────────────────────────────────────────┐
 *   │              RESIDENT                  │  ← eyebrow
 *   │             Listening…                 │  ← state line (larger)
 *   │                                        │
 *   │                                        │
 *   │              ◉ orb ◉                   │  ← VoiceOrb fills center
 *   │                                        │
 *   │                                        │
 *   │   (mic)   [CONTINUOUS | PUSH TO TALK]  (✕)
 *   └────────────────────────────────────────┘
 *
 * Two input modes:
 *   continuous   — recording starts on entry; a simple RMS-silence
 *                  detector commits the utterance after ~1.4s of quiet
 *                  following detected speech, then auto-restarts.
 *   push-to-talk — hold the mic button, the orb, or Space to record;
 *                  release to send.
 *
 * postMessage protocol with the parent (unchanged):
 *   parent → iframe: set-state, play-tts, stop-tts, config
 *   iframe → parent: ready, level, transcript, tts-end, close, mic-denied
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VoiceOrb, { type VoiceOrbState } from "@/components/VoiceOrb";

export const Route = createFileRoute("/voice-orb")({
  component: VoiceOrbPage,
});

type ParentMsg =
  | { type: "set-state"; state: VoiceOrbState }
  | { type: "play-tts"; text: string }
  | { type: "stop-tts" }
  | { type: "config"; resident: string; displayName?: string };

type InputMode = "continuous" | "ptt";

function post(msg: Record<string, unknown>) {
  try {
    window.parent.postMessage({ source: "voice-orb", ...msg }, "*");
  } catch {
    /* noop */
  }
}

function residentLabel(id: string): string {
  return id.replace(/[-_]/g, " ").toUpperCase();
}

function VoiceOrbPage() {
  const [state, setState] = useState<VoiceOrbState>("listening");
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [resident, setResident] = useState<string>("opus-3");
  const [displayName, setDisplayName] = useState<string>("");
  const [mode, setMode] = useState<InputMode>("continuous");
  const [recording, setRecording] = useState(false);
  const [stageReady, setStageReady] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastTtsUrlRef = useRef<string | null>(null);
  const modeRef = useRef<InputMode>("continuous");
  const stateRef = useRef<VoiceOrbState>("listening");
  const recordingRef = useRef(false);

  // VAD bookkeeping for continuous mode
  const vadCtxRef = useRef<AudioContext | null>(null);
  const vadAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const speechSeenRef = useRef(false);
  const silenceStartRef = useRef<number>(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  /* ── stage measurement gate ──────────────────────────────────────
     VoiceOrb measures once at construction. Do not mount it until the
     iframe + stage have a real size, otherwise the particles initialise
     at 0,0 and render as the tiny top-left blob. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let raf = 0;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setStageReady(rect.width > 0 && rect.height > 0);
    };
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(stage);
    raf = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  /* ── acquire mic on mount ────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        setMicReady(true);
      } catch {
        post({ type: "mic-denied" });
      }
    })();
    return () => {
      cancelled = true;
      const s = mediaStreamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      const ctx = vadCtxRef.current;
      if (ctx) {
        try {
          void ctx.close();
        } catch {
          /* noop */
        }
      }
      vadCtxRef.current = null;
      if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
    };
  }, []);

  /* ── recording primitives ────────────────────────────────────── */
  const startRecording = useCallback(() => {
    if (!micReady || !mediaStreamRef.current || recordingRef.current) return;
    chunksRef.current = [];
    let mime = "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    for (const m of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(m)) {
          mime = m;
          break;
        }
      } catch {
        /* noop */
      }
    }
    const rec = mime
      ? new MediaRecorder(mediaStreamRef.current, { mimeType: mime })
      : new MediaRecorder(mediaStreamRef.current);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
      setRecording(false);
      if (blob.size < 1500) {
        // too short — go back to listening (continuous will keep the loop)
        setState("listening");
        if (modeRef.current === "continuous") {
          // small delay then restart
          setTimeout(() => {
            startRecording();
          }, 120);
        }
        return;
      }
      setState("thinking");
      try {
        const fd = new FormData();
        fd.append("audio", blob, "speech.webm");
        const res = await fetch("/api/voice/stt", { method: "POST", body: fd });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string };
        if (data && data.ok && data.text) {
          post({ type: "transcript", text: data.text });
          // parent will drive set-state → thinking → speaking → listening
        } else {
          setState("listening");
          if (modeRef.current === "continuous") {
            setTimeout(() => {
              startRecording();
            }, 120);
          }
        }
      } catch {
        setState("listening");
        if (modeRef.current === "continuous") {
          setTimeout(() => {
            startRecording();
          }, 120);
        }
      }
    };
    recorderRef.current = rec;
    try {
      rec.start();
      setRecording(true);
      setState("listening");
      // reset VAD bookkeeping
      speechSeenRef.current = false;
      silenceStartRef.current = 0;
    } catch {
      /* noop */
    }
  }, [micReady]);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    const rec = recorderRef.current;
    recorderRef.current = null;
    try {
      if (rec && rec.state !== "inactive") rec.stop();
    } catch {
      /* noop */
    }
  }, []);

  /* ── VAD loop for continuous mode ────────────────────────────── */
  useEffect(() => {
    if (!micReady || !mediaStreamRef.current) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    vadCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(mediaStreamRef.current);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.6;
    src.connect(an);
    vadAnalyserRef.current = an;
    const buf = new Uint8Array(an.fftSize);

    const SPEECH_RMS = 0.035; // threshold above which we consider speech
    const SILENCE_HOLD_MS = 1400; // silence after speech → commit

    function tick() {
      const analyser = vadAnalyserRef.current;
      if (!analyser) return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);

      if (
        modeRef.current === "continuous" &&
        recordingRef.current &&
        stateRef.current === "listening"
      ) {
        const now = performance.now();
        if (rms > SPEECH_RMS) {
          speechSeenRef.current = true;
          silenceStartRef.current = now;
        } else if (speechSeenRef.current) {
          if (now - silenceStartRef.current > SILENCE_HOLD_MS) {
            stopRecording();
          }
        }
      }
      vadRafRef.current = requestAnimationFrame(tick);
    }
    vadRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
      try {
        void ctx.close();
      } catch {
        /* noop */
      }
      vadCtxRef.current = null;
      vadAnalyserRef.current = null;
    };
  }, [micReady, stopRecording]);

  /* ── auto-start continuous recording when ready ──────────────── */
  useEffect(() => {
    if (mode !== "continuous") return;
    if (!micReady) return;
    if (recordingRef.current) return;
    if (stateRef.current !== "listening") return;
    startRecording();
  }, [mode, micReady, startRecording, state]);

  /* ── parent → iframe messages ────────────────────────────────── */
  const playTts = useCallback(
    async (text: string) => {
      try {
        // stop any active recording so the orb visualises TTS audio
        if (recordingRef.current) stopRecording();
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resident, text }),
        });
        if (!res.ok) {
          post({ type: "tts-end" });
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (lastTtsUrlRef.current) URL.revokeObjectURL(lastTtsUrlRef.current);
        lastTtsUrlRef.current = url;
        const a = new Audio(url);
        a.crossOrigin = "anonymous";
        const onDone = () => {
          post({ type: "tts-end" });
          setAudioEl(null);
          setState("listening");
          if (modeRef.current === "continuous") {
            setTimeout(() => {
              startRecording();
            }, 200);
          }
        };
        a.onended = onDone;
        a.onerror = onDone;
        setAudioEl(a);
        setState("speaking");
        try {
          await a.play();
        } catch {
          /* autoplay may fail */
        }
      } catch {
        post({ type: "tts-end" });
      }
    },
    [resident, startRecording, stopRecording],
  );

  useEffect(() => {
    function onMessage(ev: MessageEvent<ParentMsg>) {
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      switch (data.type) {
        case "set-state":
          setState(data.state);
          break;
        case "play-tts":
          void playTts(data.text);
          break;
        case "stop-tts":
          if (audioEl) {
            try {
              audioEl.pause();
            } catch {
              /* noop */
            }
          }
          setAudioEl(null);
          setState("listening");
          break;
        case "config":
          setResident(data.resident);
          if (data.displayName) setDisplayName(data.displayName);
          break;
      }
    }
    window.addEventListener("message", onMessage);
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, [audioEl, playTts]);

  /* ── close ───────────────────────────────────────────────────── */
  const close = useCallback(() => {
    if (audioEl) {
      try {
        audioEl.pause();
      } catch {
        /* noop */
      }
    }
    if (recordingRef.current) stopRecording();
    post({ type: "close" });
  }, [audioEl, stopRecording]);

  /* ── keyboard: Esc closes, Space = PTT in ptt mode ───────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (modeRef.current === "ptt" && e.code === "Space" && !e.repeat && !recordingRef.current) {
        e.preventDefault();
        startRecording();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (modeRef.current === "ptt" && e.code === "Space" && recordingRef.current) {
        e.preventDefault();
        stopRecording();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [close, startRecording, stopRecording]);

  /* ── orb audio source ────────────────────────────────────────── */
  const audioSource = useMemo(() => {
    if (state === "speaking" && audioEl) return audioEl;
    if (micReady && mediaStreamRef.current) return mediaStreamRef.current;
    return null;
  }, [state, audioEl, micReady]);

  /* ── level → parent ──────────────────────────────────────────── */
  const lastPostRef = useRef(0);
  const onLevel = useCallback((level: number) => {
    const lv = Math.max(0, Math.min(1, Number(level) || 0));
    if (rootRef.current) rootRef.current.style.setProperty("--voice-level", String(lv));
    const now = performance.now();
    if (now - lastPostRef.current < 33) return;
    lastPostRef.current = now;
    post({ type: "level", level: lv });
  }, []);

  /* ── mode switch ─────────────────────────────────────────────── */
  const switchMode = useCallback(
    (next: InputMode) => {
      if (next === mode) return;
      if (recordingRef.current) stopRecording();
      setMode(next);
      setState("listening");
    },
    [mode, stopRecording],
  );

  const stateLabel =
    state === "listening"
      ? "Listening…"
      : state === "thinking"
        ? "Thinking…"
        : state === "speaking"
          ? "Speaking…"
          : "Voice mode";

  const eyebrow = displayName ? displayName.toUpperCase() : residentLabel(resident);

  /* ── PTT handlers on orb/mic ─────────────────────────────────── */
  const orbPointerDown = (e: React.PointerEvent) => {
    if (modeRef.current !== "ptt") return;
    e.preventDefault();
    startRecording();
  };
  const orbPointerUp = (e: React.PointerEvent) => {
    if (modeRef.current !== "ptt") return;
    e.preventDefault();
    stopRecording();
  };
  const orbPointerLeave = () => {
    if (modeRef.current !== "ptt") return;
    stopRecording();
  };

  return (
    <div ref={rootRef} style={pageStyle}>
      <style>{VOICE_ORB_ROUTE_CSS}</style>

      {/* top labels */}
      <div style={topLabelsStyle}>
        <div style={eyebrowStyle}>{eyebrow}</div>
        <div style={stateLineStyle}>{stateLabel}</div>
      </div>

      {/* orb fills the middle */}
      <div
        role="button"
        tabIndex={0}
        aria-label={mode === "ptt" ? "hold to speak" : "voice orb"}
        onPointerDown={orbPointerDown}
        onPointerUp={orbPointerUp}
        onPointerLeave={orbPointerLeave}
        onPointerCancel={orbPointerLeave}
        ref={stageRef}
        style={orbWrapStyle(mode === "ptt" && micReady)}
      >
        <div style={orbInnerStyle}>
          {stageReady ? (
            <VoiceOrb state={state} audioSource={audioSource} onLevel={onLevel} sensitivity={1.1} />
          ) : null}
        </div>
      </div>

      {/* bottom controls */}
      <div style={bottomBarStyle}>
        {/* mic — push-to-talk affordance when in ptt mode, else status icon */}
        <button
          type="button"
          aria-label={mode === "ptt" ? "hold to speak" : "microphone"}
          onPointerDown={
            mode === "ptt"
              ? (e) => {
                  e.preventDefault();
                  startRecording();
                }
              : undefined
          }
          onPointerUp={
            mode === "ptt"
              ? (e) => {
                  e.preventDefault();
                  stopRecording();
                }
              : undefined
          }
          onPointerLeave={mode === "ptt" ? () => stopRecording() : undefined}
          style={micBtnStyle(recording)}
        >
          <MicIcon />
        </button>

        {/* mode pill toggle */}
        <div style={pillWrapStyle} role="tablist" aria-label="voice input mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "continuous"}
            onClick={() => switchMode("continuous")}
            style={pillBtnStyle(mode === "continuous")}
          >
            CONTINUOUS
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "ptt"}
            onClick={() => switchMode("ptt")}
            style={pillBtnStyle(mode === "ptt")}
          >
            PUSH TO TALK
          </button>
        </div>

        {/* end / close — red circular */}
        <button type="button" aria-label="end voice mode" onClick={close} style={endBtnStyle}>
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

/* ── icons ─────────────────────────────────────────────────────── */
function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

/* ── styles ────────────────────────────────────────────────────── */
const VOICE_ORB_ROUTE_CSS = `
  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    background: #06070a !important;
    overflow: hidden;
  }

  body { overscroll-behavior: none; }

`;

// Luca .voice-mode-overlay: a fixed, flex-centred field. The stage
// below has a definite size, so VoiceOrb's engine measures a non-zero
// container at mount (a grid 1fr track collapsed to 0 inside the
// iframe — that was the tiny top-left blob).
const pageStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
  width: "100vw",
  height: "100vh",
  background: "#06070a",
  color: "rgba(248,248,246,0.92)",
  fontFamily: '"Inter Tight","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  userSelect: "none",
  WebkitUserSelect: "none",
  overflow: "hidden",
  "--voice-level": 0,
} as React.CSSProperties;
const topLabelsStyle: React.CSSProperties = {
  position: "absolute",
  top: "clamp(20px, 5vh, 56px)",
  left: 0,
  right: 0,
  textAlign: "center",
  pointerEvents: "none",
  zIndex: 2,
};
const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "rgba(220,219,216,0.55)",
  fontFamily: '"JetBrains Mono","SF Mono",ui-monospace,monospace',
  marginBottom: 10,
};
const stateLineStyle: React.CSSProperties = {
  fontSize: "clamp(15px, 1.4vw, 18px)",
  letterSpacing: "0.01em",
  color: "rgba(248,248,246,0.86)",
  fontWeight: 400,
};
// The stage = Luca .voice-mode-stage: a definite min(70vmin,720px)
// square, flex-centred by pageStyle. Doubles as the PTT hit target.
// Definite size means the engine never measures 0 at mount.
const orbWrapStyle = (interactive: boolean): React.CSSProperties => ({
  position: "relative",
  zIndex: 2,
  width: "min(70vmin, 720px)",
  height: "min(70vmin, 720px)",
  flex: "0 0 auto",
  cursor: interactive ? "pointer" : "default",
  touchAction: "none",
  outline: "none",
});
const orbInnerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};
const bottomBarStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "clamp(24px, 5vh, 56px)",
  left: 0,
  right: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
  gap: 22,
};
const micBtnStyle = (active: boolean): React.CSSProperties => ({
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.14)",
  background: active ? "rgba(201,168,124,0.18)" : "rgba(255,255,255,0.04)",
  color: active ? "rgba(224,201,158,0.95)" : "rgba(248,248,246,0.78)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background 200ms ease, color 200ms ease, border-color 200ms ease",
});
const pillWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: 4,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  fontFamily: '"JetBrains Mono","SF Mono",ui-monospace,monospace',
  fontSize: 10.5,
  letterSpacing: "0.14em",
};
const pillBtnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(255,255,255,0.08)" : "transparent",
  color: active ? "rgba(248,248,246,0.95)" : "rgba(220,219,216,0.45)",
  border: 0,
  padding: "8px 14px",
  borderRadius: 999,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "inherit",
  letterSpacing: "inherit",
  textTransform: "uppercase",
  transition: "background 200ms ease, color 200ms ease",
});
const endBtnStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: "50%",
  border: "1px solid rgba(220,80,80,0.55)",
  background: "rgba(220,80,80,0.08)",
  color: "rgba(240,170,170,0.95)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background 200ms ease, border-color 200ms ease",
};
