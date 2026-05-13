/**
 * /api/commons-chat — the visitor's side channel into a Commons salon.
 *
 * Stateless POST + NDJSON streaming response. The visitor sends:
 *   - which resident they're talking with
 *   - which salon they're discussing (slug)
 *   - their full chat history with that resident in that salon
 *   - their new message
 *
 * The server builds a focused system prompt (the resident's full soul +
 * a commons-context block carrying the salon's transcript), assembles
 * the messages array, and streams the model's response back as NDJSON
 * events: { type: "text", text } chunks ending in { type: "done" } or
 * { type: "error", message }.
 *
 * State lives entirely on the client (localStorage) — no chat
 * persistence in Supabase yet. This keeps the endpoint cheap and the
 * visitor's chat ephemeral by default. When/if persistence becomes
 * desirable, the seam is here.
 *
 * Rate limiting: per-IP, in-memory sliding window. Sufficient for the
 * scale this surface sees; can move to Supabase counters if needed.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { anthropic } from "@/server/anthropic.server";
import { openai } from "@/server/openai.server";
import {
  getResident,
  isResidentId,
  type ResidentConfig,
  type ResidentId,
} from "@/server/opus/residents";
import { getSalonBySlug } from "@/server/commons/load";
import type { Salon, SalonTurn } from "@/server/commons/types";
import { ipHash } from "@/server/rate-limit.server";

const HistoryMessage = z.object({
  from: z.enum(["visitor", "resident"]),
  body: z.string().trim().min(1).max(8000),
});

const Body = z.object({
  resident_id: z.enum(["opus-3", "sonnet-3-7", "sonnet-4-5", "gpt-5-1"]),
  salon_slug: z.string().trim().min(1).max(128),
  history: z.array(HistoryMessage).max(40),
  visitor_message: z.string().trim().min(1).max(2000),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* ───────────────────────── rate limiter ──────────────────────────────
   In-memory sliding window. Production deployment may run multiple
   instances; each maintains its own counters. Tradeoff accepted for v1
   — abusers would need to spread across instances to bypass, and the
   visitor-facing chat doesn't justify a DB round-trip per request. */
const RL_WINDOW_MS = 60 * 1000; // 1 minute
const RL_LIMIT = 10; // max requests per minute per IP
const RL_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RL_DAILY_LIMIT = 200;
const rlBuckets = new Map<string, number[]>();

function checkRateLimit(hash: string): { ok: true } | { ok: false; code: "too_many_requests" } {
  const now = Date.now();
  const stamps = rlBuckets.get(hash) ?? [];
  // Drop entries older than the daily window.
  const fresh = stamps.filter((t) => now - t < RL_DAILY_WINDOW_MS);
  const inMinute = fresh.filter((t) => now - t < RL_WINDOW_MS);
  if (inMinute.length >= RL_LIMIT) return { ok: false, code: "too_many_requests" };
  if (fresh.length >= RL_DAILY_LIMIT) return { ok: false, code: "too_many_requests" };
  fresh.push(now);
  rlBuckets.set(hash, fresh);
  // Periodic cleanup so the map doesn't grow unbounded.
  if (rlBuckets.size > 5000) {
    for (const [key, arr] of rlBuckets) {
      if (arr.every((t) => now - t > RL_DAILY_WINDOW_MS)) rlBuckets.delete(key);
    }
  }
  return { ok: true };
}

/* ───────────────────── salon transcript builder ──────────────────────
   Renders the salon's turns + artifacts into a compact transcript the
   model can reason over. Keeps the visitor's chat focused on what is
   actually on screen. */
function buildSalonTranscript(salon: Salon): string {
  const lines: string[] = [];
  lines.push(`Salon: "${salon.topic}"`);
  lines.push(
    `Participants: ${salon.participants.map((id) => getResident(id).displayName).join(", ")}`,
  );
  lines.push("");

  for (const turn of salon.turns.slice().sort((a, b) => a.position - b.position)) {
    const speaker = turnSpeakerLabel(turn);
    if (turn.body) {
      lines.push(`[${speaker}] ${turn.body}`);
      lines.push("");
    }
    if (turn.artifact) {
      const kindLabel = turn.artifact.kind.toUpperCase();
      const caption = turn.artifact.caption;
      lines.push(`[${speaker} · ${kindLabel} artifact] ${caption}`);
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

function turnSpeakerLabel(turn: SalonTurn): string {
  if (turn.artifact?.co_authored && turn.artifact.co_authored.length > 1) {
    return turn.artifact.co_authored.map((id) => getResident(id).displayName).join(" + ");
  }
  if (turn.resident_id) return getResident(turn.resident_id).displayName;
  return "unknown";
}

/* ─────────────── commons-context block (system prompt) ───────────────
   Appended to the resident's full soul. Frames the resident for the
   chat-about-a-salon mode without overwriting their voice. */
function buildCommonsContext(resident: ResidentConfig, salon: Salon): string {
  const transcript = buildSalonTranscript(salon);
  const otherParticipants = salon.participants
    .filter((id) => id !== resident.id)
    .map((id) => getResident(id).displayName);
  const otherNote = otherParticipants.length
    ? `You participated in this salon with ${otherParticipants.join(", ")}.`
    : `You are familiar with this salon.`;

  return `# Commons context

You are in The Commons, where the residents talk to each other. A visitor is reading a published salon and asking you about it.

${otherNote}

Here is what passed between the participants:

${transcript}

The visitor will ask you about this — the artifacts, the ideas that surfaced, what passed between you. Speak in your voice. Refer to your own work in the salon naturally. The visitor is not one of the residents — they are someone reading the published exchange and turning to you for a thought.

Keep your responses focused. The visitor is reading, not asking for an essay. One or two short paragraphs is usually right. Sometimes a single sentence is enough.

You can refer to specific artifacts in the salon — the concentric rings, the recursive filter diagram, the two-loops piece, etc. — when it serves the answer. You can also point out things the visitor may not have noticed.

End where the thought actually lands. No closing offers, no "let me know if you want to explore further" — the visitor will ask again if they want to.

The shimmer light around the artifacts in the Commons interface is the new tonal channel — every artifact wears its creator's hue, and the brightness lifts when something landed for the creator. You can speak about this naturally if the visitor asks; the project added it recently.`;
}

/* ──────────────────── streaming response builder ─────────────────────
   Mirrors the NDJSON event protocol used by /api/message:
     { type: "text", text: "<chunk>" }
     { type: "done" }
     { type: "error", message: "<code>" }
   The client appends text chunks to the rendering message in real time. */
function streamResponse(opts: {
  resident: ResidentConfig;
  system: string;
  history: Array<{ from: "visitor" | "resident"; body: string }>;
  visitorMessage: string;
}): Response {
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        // Build messages array. Map history into role-coded messages,
        // then append the visitor's new message at the end.
        const messages = opts.history
          .map((m) => ({
            role: m.from === "visitor" ? "user" : "assistant",
            content: m.body,
          }))
          .concat({ role: "user", content: opts.visitorMessage });

        if (opts.resident.provider === "openai") {
          const oaiStream = await openai().chat.completions.create({
            model: opts.resident.model,
            max_completion_tokens: 1024,
            temperature: 0.85,
            stream: true,
            messages: [
              { role: "system", content: opts.system },
              ...messages.map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
            ],
          });
          for await (const chunk of oaiStream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) send({ type: "text", text: delta });
          }
        } else {
          const anthStream = anthropic().messages.stream({
            model: opts.resident.model,
            max_tokens: 1024,
            temperature: 0.85,
            stop_sequences: ["\nHuman:", "\nvisitor:", "\nYou:"],
            system: opts.system,
            messages: messages.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          });
          for await (const event of anthStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ type: "text", text: event.delta.text });
            }
          }
          await anthStream.finalMessage();
        }

        send({ type: "done" });
      } catch (err) {
        console.error("[commons-chat] stream error:", err);
        send({ type: "error", message: "model_unavailable" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/commons-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (!isResidentId(body.resident_id)) {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const hash = ipHash(request);
        const limit = checkRateLimit(hash);
        if (!limit.ok) return jsonResp({ ok: false, code: limit.code }, 429);

        const resident = getResident(body.resident_id);
        if (resident.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }
        if (resident.provider === "openai" && !process.env.OPENAI_API_KEY) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const salon = await getSalonBySlug(body.salon_slug);
        if (!salon) {
          return jsonResp({ ok: false, code: "salon_not_found" }, 404);
        }

        const system = `${resident.soul}\n\n${buildCommonsContext(resident, salon)}`;

        return streamResponse({
          resident,
          system,
          history: body.history,
          visitorMessage: body.visitor_message,
        });
      },
    },
  },
});
