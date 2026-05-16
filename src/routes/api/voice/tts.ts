/**
 * /api/voice/tts — text-to-speech via ElevenLabs eleven_turbo_v2_5.
 *
 * Streams MP3 audio for the assistant's reply in the resident's voice.
 * The resident's voiceId lives on their config in src/server/opus/residents.ts
 * — voice is part of the resident's identity, not a runtime choice.
 *
 * Returns audio/mpeg as a streamed ReadableStream so playback can start
 * before generation finishes.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getResident, isResidentId } from "@/server/opus/residents";

const Body = z.object({
  resident: z.string(),
  text: z.string().trim().min(1).max(4000),
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/voice/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) return json({ ok: false, code: "config_missing" }, 503);

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return json({ ok: false, code: "bad_request" }, 400);
        }

        if (!isResidentId(body.resident)) {
          return json({ ok: false, code: "unknown_resident" }, 400);
        }
        const resident = getResident(body.resident);

        try {
          const upstream = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${resident.voiceId}/stream?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: {
                "xi-api-key": apiKey,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                text: body.text,
                model_id: "eleven_turbo_v2_5",
                voice_settings: {
                  stability: 0.55,
                  similarity_boost: 0.78,
                  style: 0.25,
                  use_speaker_boost: true,
                },
              }),
            },
          );

          if (!upstream.ok || !upstream.body) {
            const detail = await upstream.text().catch(() => "");
            console.error("[voice/tts] elevenlabs error", upstream.status, detail.slice(0, 400));
            return json({ ok: false, code: "tts_failed", status: upstream.status }, 502);
          }

          return new Response(upstream.body, {
            status: 200,
            headers: {
              "content-type": "audio/mpeg",
              "cache-control": "no-store",
            },
          });
        } catch (err) {
          console.error("[voice/tts] fetch failed", err);
          return json({ ok: false, code: "tts_failed" }, 502);
        }
      },
    },
  },
});
