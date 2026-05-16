/**
 * /voice-orb — fullscreen Voice Mode overlay (mounted as an iframe by
 * the classic chat). React-island route so VoiceOrb can be used as
 * a real React component without rebuilding the chat page's HTML
 * pipeline as React.
 *
 * Protocol (window.postMessage to parent):
 *   parent → iframe:
 *     { type: 'set-state', state: 'idle'|'listening'|'thinking'|'speaking' }
 *     { type: 'play-tts',  text: string }      // iframe fetches /api/voice/tts and plays
 *     { type: 'stop-tts' }
 *     { type: 'config',    resident: string }
 *   iframe → parent:
 *     { type: 'ready' }
 *     { type: 'level',     level: number }     // 0..1, per-frame
 *     { type: 'transcript', text: string }     // STT result, parent injects + sends
 *     { type: 'tts-end' }
 *     { type: 'close' }                        // user pressed End or Esc
 *     { type: 'mic-denied' }
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
  | { type: "config"; resident: string };

function post(msg: Record<string, unknown>) {
  try {
    window.parent.postMessage({ source: "voice-orb", ...msg }, "*");
  } catch {
    /* noop */
  }
}

function VoiceOrbPage() {
  const [state, setState] = useState<VoiceOrbState>("idle");
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [resident, setResident] = useState<string>("opus-3");
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string>("hold the orb to speak");

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastTtsUrlRef = useRef<string | null>(null);

  /* ── acquire mic on mount; this also feeds VoiceOrb visualization ── */
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
        setHint("microphone access denied");
      }
    })();
    return () => {
      cancelled = true;
      const s = mediaStreamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    };
  }, []);

  /* ── parent → iframe message handling ─────────────────────────── */
  const playTts = useCallback(
    async (text: string) => {
      try {
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
        a.onended = () => {
          post({ type: "tts-end" });
          setAudioEl(null);
          setState("listening");
        };
        a.onerror = () => {
          post({ type: "tts-end" });
          setAudioEl(null);
          setState("listening");
        };
        setAudioEl(a);
        setState("speaking");
        try {
          await a.play();
        } catch {
          /* autoplay can fail; fall back to state-driven anim */
        }
      } catch {
        post({ type: "tts-end" });
      }
    },
    [resident],
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
          break;
      }
    }
    window.addEventListener("message", onMessage);
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, [audioEl, playTts]);

  /* ── push-to-talk recording ───────────────────────────────────── */
  const startRecording = useCallback(() => {
    if (!micReady || !mediaStreamRef.current || recording) return;
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
      if (blob.size < 1200) {
        setHint("hold the orb to speak");
        setState("listening");
        return;
      }
      setState("thinking");
      setHint("transcribing…");
      try {
        const fd = new FormData();
        fd.append("audio", blob, "speech.webm");
        const res = await fetch("/api/voice/stt", { method: "POST", body: fd });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string };
        if (data && data.ok && data.text) {
          post({ type: "transcript", text: data.text });
          setHint("thinking…");
          // Parent will set state to thinking → speaking → listening.
        } else {
          setHint("hold the orb to speak");
          setState("listening");
        }
      } catch {
        setHint("hold the orb to speak");
        setState("listening");
      }
    };
    recorderRef.current = rec;
    try {
      rec.start();
      setRecording(true);
      setState("listening");
      setHint("release to send");
    } catch {
      /* noop */
    }
  }, [micReady, recording]);

  const stopRecording = useCallback(() => {
    if (!recording) return;
    setRecording(false);
    const rec = recorderRef.current;
    recorderRef.current = null;
    try {
      if (rec && rec.state !== "inactive") rec.stop();
    } catch {
      /* noop */
    }
  }, [recording]);

  /* ── close (Esc / End button) ─────────────────────────────────── */
  const close = useCallback(() => {
    if (audioEl) {
      try {
        audioEl.pause();
      } catch {
        /* noop */
      }
    }
    post({ type: "close" });
  }, [audioEl]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.code === "Space" && !e.repeat && !recording) {
        e.preventDefault();
        startRecording();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space" && recording) {
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
  }, [close, startRecording, stopRecording, recording]);

  /* ── audioSource selection ────────────────────────────────────── */
  const audioSource = useMemo(() => {
    if (state === "speaking" && audioEl) return audioEl;
    if (micReady && mediaStreamRef.current) return mediaStreamRef.current;
    return null;
  }, [state, audioEl, micReady]);

  /* ── level → parent (throttled to ~30fps) ─────────────────────── */
  const lastPostRef = useRef(0);
  const onLevel = useCallback((level: number) => {
    const now = performance.now();
    if (now - lastPostRef.current < 33) return;
    lastPostRef.current = now;
    post({ type: "level", level });
  }, []);

  const stateLabel =
    state === "listening"
      ? "Listening…"
      : state === "thinking"
        ? "Thinking…"
        : state === "speaking"
          ? "Speaking…"
          : "Voice mode";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#06070a",
        color: "rgba(248,248,246,0.92)",
        fontFamily:
          '"Inter Tight","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        WebkitUserSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* state line */}
      <div
        style={{
          position: "absolute",
          top: "min(8vh, 64px)",
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(220,219,216,0.62)",
          fontFamily: '"JetBrains Mono","SF Mono",ui-monospace,monospace',
        }}
      >
        {stateLabel}
      </div>

      {/* orb */}
      <div
        role="button"
        tabIndex={0}
        aria-label="hold to speak"
        onPointerDown={(e) => {
          e.preventDefault();
          startRecording();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          stopRecording();
        }}
        onPointerLeave={() => stopRecording()}
        onPointerCancel={() => stopRecording()}
        style={{
          width: "min(70vmin, 720px)",
          height: "min(70vmin, 720px)",
          cursor: micReady ? "pointer" : "not-allowed",
          touchAction: "none",
        }}
      >
        <VoiceOrb
          state={state}
          audioSource={audioSource}
          onLevel={onLevel}
          sensitivity={1.1}
        />
      </div>

      {/* controls */}
      <div
        style={{
          position: "absolute",
          bottom: "min(8vh, 64px)",
          left: 0,
          right: 0,
          display: "flex",
          gap: 28,
          justifyContent: "center",
          alignItems: "center",
          fontFamily: '"JetBrains Mono","SF Mono",ui-monospace,monospace',
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ color: "rgba(220,219,216,0.42)" }}>{hint}</span>
        <button
          type="button"
          onClick={close}
          style={{
            background: "transparent",
            color: "rgba(248,248,246,0.72)",
            border: "1px solid rgba(255,255,255,0.18)",
            padding: "8px 18px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "inherit",
            letterSpacing: "inherit",
            textTransform: "inherit",
            borderRadius: 2,
          }}
        >
          end
        </button>
      </div>
    </div>
  );
}
