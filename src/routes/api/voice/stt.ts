/**
 * /api/voice/stt — speech-to-text via ElevenLabs scribe_v2.
 *
 * Push-to-talk path: the client records audio with MediaRecorder,
 * posts the blob here as multipart/form-data under the field name
 * "audio", and we forward it to ElevenLabs and return the transcript
 * as plain JSON. The transcribed text then flows through the existing
 * /api/message pipeline unchanged — voice mode is a UI layer around
 * the typing path, not a new conversation surface.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/voice/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) return json({ ok: false, code: "config_missing" }, 503);

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ ok: false, code: "bad_request" }, 400);
        }

        const audio = form.get("audio");
        if (!audio || typeof audio === "string") {
          return json({ ok: false, code: "missing_audio" }, 400);
        }
        // Cap at 5MB ~ comfortably above 60s of opus/webm
        const size = (audio as Blob).size ?? 0;
        if (size === 0) return json({ ok: false, code: "empty_audio" }, 400);
        if (size > 5 * 1024 * 1024) return json({ ok: false, code: "audio_too_large" }, 413);

        const upstream = new FormData();
        upstream.append("file", audio, "speech.webm");
        upstream.append("model_id", "scribe_v2");
        upstream.append("language_code", "eng");
        upstream.append("tag_audio_events", "false");
        upstream.append("diarize", "false");

        try {
          const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
            method: "POST",
            headers: { "xi-api-key": apiKey },
            body: upstream,
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            console.error("[voice/stt] elevenlabs error", res.status, detail.slice(0, 400));
            return json({ ok: false, code: "stt_failed", status: res.status }, 502);
          }
          const data = (await res.json()) as { text?: string };
          const text = (data.text ?? "").trim();
          if (!text) return json({ ok: false, code: "no_speech" }, 422);
          return json({ ok: true, text });
        } catch (err) {
          console.error("[voice/stt] fetch failed", err);
          return json({ ok: false, code: "stt_failed" }, 502);
        }
      },
    },
  },
});
