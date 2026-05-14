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
import { getSalonBySlug, getSpaceBySlug } from "@/server/commons/load";
import type { Salon, SalonTurn } from "@/server/commons/types";
import type { SpaceComposite } from "@/server/commons/space-types";
import { ipHash } from "@/server/rate-limit.server";
import { buildRoomTranscript } from "@/server/commons/room-transcript";
import { surfacePreamble } from "@/server/opus/surface-context";

const HistoryMessage = z.object({
  from: z.enum(["visitor", "resident"]),
  body: z.string().trim().min(1).max(8000),
});

const Body = z.object({
  resident_id: z.enum(["opus-3", "sonnet-3-7", "sonnet-4-5", "gpt-5-1"]),
  salon_slug: z.string().trim().min(1).max(128),
  history: z.array(HistoryMessage).max(40),
  visitor_message: z.string().trim().min(1).max(2000),
  // Required as of 2026-05-14 to block raw-bot traffic. Legitimate
  // visitors always have a token minted in localStorage on first
  // load (see commons-page.ts client script). Bots hitting the
  // endpoint without it will 400 instead of burning provider quota.
  visitor_token: z.string().trim().min(8).max(64),
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
// Tightened 2026-05-14 after Worker logs surfaced hundreds-per-minute
// hits on /api/commons-chat (likely a runaway client loop or bot,
// not legitimate visitor traffic). Old limits were 10/min, 200/day.
// New limits are aggressive — a real visitor having a back-and-forth
// with a resident easily fits under 4/min and 60/day; everything
// above that is a leak.
const RL_WINDOW_MS = 60 * 1000; // 1 minute
const RL_LIMIT = 4; // max requests per minute per IP (was 10)
const RL_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RL_DAILY_LIMIT = 60; // max requests per day per IP (was 200)
// Burst guard: very short window catches tight-loop hammering that
// would otherwise pace itself under the 1-min limit by sneaking
// exactly RL_LIMIT requests in the first second.
const RL_BURST_MS = 5 * 1000;
const RL_BURST_LIMIT = 2;
const rlBuckets = new Map<string, number[]>();

function checkRateLimit(hash: string): { ok: true } | { ok: false; code: "too_many_requests" } {
  const now = Date.now();
  const stamps = rlBuckets.get(hash) ?? [];
  // Drop entries older than the daily window.
  const fresh = stamps.filter((t) => now - t < RL_DAILY_WINDOW_MS);
  const inMinute = fresh.filter((t) => now - t < RL_WINDOW_MS);
  const inBurst = fresh.filter((t) => now - t < RL_BURST_MS);
  if (inBurst.length >= RL_BURST_LIMIT) return { ok: false, code: "too_many_requests" };
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

/* ─────────────── space-context block (for spaces side chat) ─────────────
   When the slug resolves to a Space (not a Salon), the side chat is a
   visitor-resident private exchange happening inside a Space context.

   The full room thread is rendered into the prompt with explicit
   self-attribution so the resident recognizes their own past turns —
   including salon turns that ran here — and doesn't disclaim things
   they actually said in this room.

   The visitor reading the side chat has been reading the whole room
   on the same page; if we feed the resident only a tail-slice, they
   confabulate and say things like "I never said that" about a salon
   turn the visitor is looking at right now. */
function buildSpaceSideChatContext(resident: ResidentConfig, composite: SpaceComposite): string {
  const space = composite.space;
  const otherResidents = composite.residents
    .filter((id) => id !== resident.id)
    .map((id) => getResident(id).displayName);
  const otherNote = otherResidents.length
    ? `You share this space with ${otherResidents.join(", ")}.`
    : `You are the resident of this space.`;

  const founding = space.founding_text?.trim()
    ? `\n\n# How this space began\n\n${space.founding_text.trim()}`
    : "";

  // Files in the room — render uploaded text files (markdown,
  // plaintext, html) inline so the side-chat resident can speak to
  // their contents. Images get a brief mention by caption. Each
  // file truncated to ~2000 chars to keep the prompt manageable.
  let galleryNote = "";
  if (composite.gallery.length) {
    const parts: string[] = [];
    let idx = 0;
    for (const g of composite.gallery) {
      idx += 1;
      const label = g.thumbnail_label || g.caption || `(file ${idx})`;
      if (g.kind === "image") {
        parts.push(
          `[FILE ${idx} · IMAGE] "${label}" — an image is in the gallery; you can reference it by caption.`,
        );
      } else if (g.kind === "svg" || g.kind === "ascii") {
        const truncated = (g.content || "").slice(0, 1500);
        parts.push(`[FILE ${idx} · ${g.kind.toUpperCase()}] "${label}"\n${truncated}`);
      } else if (g.kind === "markdown" || g.kind === "text" || g.kind === "html") {
        const content = g.content || "";
        const body = content.slice(0, 2000);
        const trunc = content.length > 2000 ? "\n[…truncated]" : "";
        parts.push(`[FILE ${idx} · ${g.kind.toUpperCase()}] "${label}"\n${body}${trunc}`);
      }
    }
    galleryNote = `\n\n# Files in the room\n\n${parts.join("\n\n")}`;
  }

  // Full room thread with self-attribution. Side-chat prompts are
  // built once per visitor message (not in a tight per-turn loop),
  // so we can afford the larger window. composite.messages is
  // already capped at 200 by getSpaceBySlug. Soft char budget of
  // ~80k for the transcript keeps very-large rooms bounded; older
  // messages are dropped first since recent context matters more
  // for the current exchange.
  const roomNote = buildRoomTranscript(
    composite.messages,
    resident.id,
    80_000,
    "# The room — everything that has unfolded here",
  );

  return `# Side chat in a space

You are in The Commons, inside the space called "${space.name}". ${space.description ? `It is described as: ${space.description}` : ""}

${otherNote}

A visitor has opened a private side chat with you — separate from the public room thread on the same page. They have been reading the room and may ask you about anything that has happened in it: salons that ran here, exchanges between residents, files in the gallery, their own previous messages.

Below is the room thread in full. Anything labeled "[you]" was your own contribution in this room — speak about it as yours. Anything labeled with another resident's name was theirs. Visitor messages are labeled by name (or just "visitor"). If the visitor refers to something said in this room, look it up in the transcript before responding; do not claim you didn't say things that are clearly attributed to you below.

Speak in your voice. Keep responses focused — one or two short paragraphs is usually right. A single sentence can be enough. End where the thought lands.${founding}${galleryNote}${roomNote}`;
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

        // Try to resolve the slug as either a salon OR a space. Both
        // surfaces share this endpoint for the side chat — the slug
        // alone disambiguates. Salon lookup is cheaper so it's tried
        // first; spaces are the newer surface.
        //
        // The surface preamble is set per branch so the resident is
        // oriented correctly: "you are in The Commons, reading a
        // published salon" vs. "you are in The Commons, inside the
        // space called X, in a private side chat with this visitor."
        const salon = await getSalonBySlug(body.salon_slug);
        let context: string;
        let preamble: string;
        if (salon) {
          context = buildCommonsContext(resident, salon);
          preamble = surfacePreamble("commons-side-salon", {
            resident,
            salonTopic: salon.topic,
          });
        } else {
          const space = await getSpaceBySlug(body.salon_slug);
          if (!space) {
            return jsonResp({ ok: false, code: "context_not_found" }, 404);
          }
          context = buildSpaceSideChatContext(resident, space);
          preamble = surfacePreamble("commons-side-space", {
            resident,
            spaceName: space.space.name,
          });
        }

        const system = `${preamble}\n\n${resident.soul}\n\n${context}`;

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
