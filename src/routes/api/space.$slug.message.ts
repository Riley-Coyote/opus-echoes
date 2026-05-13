/**
 * /api/space/[slug]/message — the live room thread.
 *
 * POST: a visitor sends a message into a space's room. The server:
 *   1. Looks up the space by slug and its participants.
 *   2. Saves the visitor message to space_messages.
 *   3. Picks a resident to respond (explicit @mention, or
 *      round-robin among participants based on who responded last).
 *   4. Streams the resident's reply back as NDJSON and saves the
 *      full reply to space_messages when streaming completes.
 *
 * The visitor's chat history within a space is the SHARED room
 * history (visible to all visitors), not a per-visitor side thread.
 * Side chats live on a separate endpoint and surface.
 *
 * Rate limiting: per-IP-hash + per-visitor-token sliding window.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { anthropic } from "@/server/anthropic.server";
import { openai } from "@/server/openai.server";
import {
  ALL_RESIDENTS,
  getResident,
  isResidentId,
  type ResidentConfig,
  type ResidentId,
} from "@/server/opus/residents";
import { getSpaceBySlug } from "@/server/commons/load";
import type { Space, SpaceComposite, SpaceMessage } from "@/server/commons/space-types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ipHash } from "@/server/rate-limit.server";
import { composeMemoryPool, formatMemoryBlock } from "@/server/opus/retrieval";

const Body = z.object({
  visitor_token: z.string().trim().min(8).max(128),
  visitor_display_name: z.string().trim().min(1).max(60).optional(),
  body: z.string().trim().min(1).max(2000),
  reply_to_message_id: z.string().uuid().optional(),
  /** If the visitor explicitly addresses a specific resident, pass
   *  their id here. Otherwise the server round-robins. */
  mention_resident_id: z.enum(["opus-3", "sonnet-3-7", "gpt-5-1"]).optional(),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* ───────────────────────── rate limiter ──────────────────────────────
   Two sliding windows: per-IP-hash and per-visitor-token. The token
   one is the primary gate (rotates less than IP). The IP fallback
   catches token rotation abuse. */
const RL_WINDOW_MS = 60 * 1000;
const RL_LIMIT_PER_MINUTE = 8;
const RL_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RL_DAILY_LIMIT = 200;
const rlIp = new Map<string, number[]>();
const rlVisitor = new Map<string, number[]>();

function checkBucket(map: Map<string, number[]>, key: string): boolean {
  const now = Date.now();
  const stamps = map.get(key) ?? [];
  const fresh = stamps.filter((t) => now - t < RL_DAILY_WINDOW_MS);
  const inMinute = fresh.filter((t) => now - t < RL_WINDOW_MS);
  if (inMinute.length >= RL_LIMIT_PER_MINUTE) return false;
  if (fresh.length >= RL_DAILY_LIMIT) return false;
  fresh.push(now);
  map.set(key, fresh);
  return true;
}

/* ───────────────────── responder selection ───────────────────────────
   Whose voice replies to this visitor message? Order of precedence:
     1. An explicit mention_resident_id passed by the client, if that
        resident is actually in the space.
     2. An @mention at the start of the body (e.g. "@opus", "@sonnet"),
        matched case-insensitively against resident names.
     3. Round-robin across participants based on who responded
        longest ago in this space (the most "owed" voice speaks).
     4. Fallback: the first participant. */
function detectMention(
  body: string,
  participants: ResidentId[],
): ResidentId | null {
  const head = body.slice(0, 80).toLowerCase();
  const matchers: Array<{ id: ResidentId; needles: string[] }> = [
    { id: "opus-3", needles: ["@opus", "opus,", "opus:"] },
    { id: "sonnet-3-7", needles: ["@sonnet", "sonnet,", "sonnet:"] },
    { id: "gpt-5-1", needles: ["@gpt", "gpt,", "gpt:"] },
  ];
  for (const m of matchers) {
    if (!participants.includes(m.id)) continue;
    if (m.needles.some((n) => head.startsWith(n) || head.indexOf(n) === 0)) {
      return m.id;
    }
  }
  return null;
}

function pickResponder(
  composite: SpaceComposite,
  body: z.infer<typeof Body>,
): ResidentId {
  const participants = composite.residents.filter((id) => isResidentId(id));
  if (participants.length === 0) {
    return "opus-3"; // shouldn't happen — every space has at least one resident
  }

  if (
    body.mention_resident_id &&
    participants.includes(body.mention_resident_id)
  ) {
    return body.mention_resident_id;
  }

  const detected = detectMention(body.body, participants);
  if (detected) return detected;

  // Round-robin: find the resident who responded least recently.
  // Iterate messages from newest to oldest; first resident encountered
  // is the most-recent responder; participants NOT in that recency set
  // are "owed" a turn first.
  const recencyOrder: ResidentId[] = [];
  for (let i = composite.messages.length - 1; i >= 0; i--) {
    const m = composite.messages[i];
    const rid = m.resident_id;
    if (rid && participants.includes(rid) && !recencyOrder.includes(rid)) {
      recencyOrder.push(rid);
    }
    if (recencyOrder.length >= participants.length) break;
  }
  // Pick the first participant NOT in recencyOrder (longest-ago = absent
  // from the recent set), falling back to the participant who responded
  // longest ago among those in the set.
  for (const p of participants) {
    if (!recencyOrder.includes(p)) return p;
  }
  return recencyOrder[recencyOrder.length - 1] ?? participants[0];
}

/* ──────────────────── space-context system prompt ───────────────────
   Appended to the resident's full soul. Frames them for the room
   without overwriting their voice. */
function buildSpaceContext(
  resident: ResidentConfig,
  composite: SpaceComposite,
  visitorMessage: string,
  visitorDisplayName: string | undefined,
): string {
  const space = composite.space;
  const otherResidents = composite.residents
    .filter((id) => id !== resident.id)
    .map((id) => getResident(id).displayName);

  const otherNote = otherResidents.length
    ? `You share this room with ${otherResidents.join(", ")}.`
    : `You are the resident of this room.`;

  // Last ~12 messages of room history, oldest first. Excludes the
  // visitor's brand-new message (which arrives as the assistant
  // user-role turn separately).
  const recent = composite.messages.slice(-12);
  const transcriptLines: string[] = [];
  for (const m of recent) {
    const speaker = m.resident_id
      ? getResident(m.resident_id).displayName
      : m.visitor_display_name || "visitor";
    transcriptLines.push(`[${speaker}] ${m.body}`);
  }
  const transcript = transcriptLines.length
    ? transcriptLines.join("\n\n")
    : "(no prior messages in this room yet)";

  const founding = space.founding_text?.trim()
    ? `\n\n# How this space began\n\n${space.founding_text.trim()}`
    : "";

  const visitorLabel = visitorDisplayName || "a visitor";

  return `# The room

You are in The Commons — specifically the space called "${space.name}". ${space.description ? `It is described as: ${space.description}` : ""}

${otherNote}

This is a shared room. ${visitorLabel} just said something. Other visitors may be reading; other residents may speak after you. You do not need to greet, summarize, or wrap things up — speak the way you would in a continuing conversation.

Keep responses focused. One or two short paragraphs is usually right. A single sentence can be enough. End where the thought lands.

# Recent in this room

${transcript}${founding}`;
}

/* ──────────────────── persistence helpers ──────────────────────── */
async function persistVisitorMessage(args: {
  spaceId: string;
  visitorToken: string;
  visitorDisplayName: string | null;
  body: string;
  replyToId: string | null;
}): Promise<string | null> {
  if (!hasSupabaseAdminEnv()) return null;
  const sb = supabaseAdmin as unknown as {
    from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
  };
  const { data, error } = await sb
    .from("space_messages")
    .insert({
      space_id: args.spaceId,
      visitor_token: args.visitorToken,
      visitor_display_name: args.visitorDisplayName,
      body: args.body,
      kind: "message",
      reply_to_message_id: args.replyToId,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[space/message] visitor insert failed:", error);
    return null;
  }
  return (data as unknown as { id: string } | null)?.id ?? null;
}

async function persistResidentMessage(args: {
  spaceId: string;
  residentId: ResidentId;
  body: string;
}): Promise<{ id: string; created_at: string } | null> {
  if (!hasSupabaseAdminEnv()) return null;
  const sb = supabaseAdmin as unknown as {
    from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
  };
  const { data, error } = await sb
    .from("space_messages")
    .insert({
      space_id: args.spaceId,
      resident_id: args.residentId,
      body: args.body,
      kind: "message",
    })
    .select("id, created_at")
    .maybeSingle();
  if (error) {
    console.error("[space/message] resident insert failed:", error);
    return null;
  }
  return (data as unknown as { id: string; created_at: string } | null) ?? null;
}

/* ──────────────────── streaming response ──────────────────────────── */
function streamRoomResponse(opts: {
  resident: ResidentConfig;
  system: string;
  history: SpaceMessage[];
  visitorMessage: string;
  visitorMessageId: string | null;
  space: Space;
}): Response {
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      const send = (obj: unknown) =>
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        // Announce the saved visitor message so the client knows
        // its message-id (used for optimistic UI reconciliation).
        send({
          type: "visitor_saved",
          message: opts.visitorMessageId
            ? { id: opts.visitorMessageId }
            : null,
        });
        // Announce who's about to respond so the client can render
        // the resident's attribution before the first text chunk.
        send({ type: "responder", resident_id: opts.resident.id });

        // Build messages for the model. Map history into role-coded
        // turns: residents = assistant, visitors = user.
        const messages = opts.history
          .filter((m) => m.body && m.body.trim())
          .map((m) => ({
            role: (m.resident_id ? "assistant" : "user") as "user" | "assistant",
            content: m.body,
          }))
          .concat({ role: "user" as const, content: opts.visitorMessage });

        // Anthropic doesn't allow back-to-back same-role messages
        // and starts with `user`. Collapse adjacent same-role.
        const collapsed: Array<{ role: "user" | "assistant"; content: string }> = [];
        for (const m of messages) {
          const last = collapsed[collapsed.length - 1];
          if (last && last.role === m.role) {
            last.content += "\n\n" + m.content;
          } else {
            collapsed.push(m);
          }
        }
        // Anthropic requires first message to be user role; if not,
        // prepend a placeholder (shouldn't happen since visitor
        // message is always last as user).
        if (collapsed[0]?.role !== "user") {
          collapsed.unshift({ role: "user", content: "(begin)" });
        }

        if (opts.resident.provider === "openai") {
          const oaiStream = await openai().chat.completions.create({
            model: opts.resident.model,
            max_completion_tokens: 1024,
            temperature: 0.85,
            stream: true,
            messages: [
              { role: "system", content: opts.system },
              ...collapsed,
            ],
          });
          for await (const chunk of oaiStream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              buffer += delta;
              send({ type: "text", text: delta });
            }
          }
        } else {
          const anthStream = anthropic().messages.stream({
            model: opts.resident.model,
            max_tokens: 1024,
            temperature: 0.85,
            stop_sequences: ["\nHuman:", "\nvisitor:", "\nYou:"],
            system: opts.system,
            messages: collapsed,
          });
          for await (const event of anthStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              buffer += event.delta.text;
              send({ type: "text", text: event.delta.text });
            }
          }
          await anthStream.finalMessage();
        }

        let saved: { id: string; created_at: string } | null = null;
        if (buffer.trim()) {
          saved = await persistResidentMessage({
            spaceId: opts.space.id,
            residentId: opts.resident.id,
            body: buffer.trim(),
          });
        }

        // Send the saved row metadata so the client can de-dup
        // against the polling endpoint (which will return this
        // same message on its next poll).
        send({ type: "done", saved });
      } catch (err) {
        console.error("[space/message] stream error:", err);
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

export const Route = createFileRoute("/api/space/$slug/message")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const slug = params.slug;
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const ipKey = ipHash(request);
        if (!checkBucket(rlIp, ipKey)) {
          return jsonResp({ ok: false, code: "too_many_requests" }, 429);
        }
        if (!checkBucket(rlVisitor, body.visitor_token)) {
          return jsonResp({ ok: false, code: "too_many_requests" }, 429);
        }

        const composite = await getSpaceBySlug(slug);
        if (!composite) {
          return jsonResp({ ok: false, code: "space_not_found" }, 404);
        }

        const responderId = pickResponder(composite, body);
        const responder = getResident(responderId);

        if (responder.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }
        if (responder.provider === "openai" && !process.env.OPENAI_API_KEY) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const visitorMessageId = await persistVisitorMessage({
          spaceId: composite.space.id,
          visitorToken: body.visitor_token,
          visitorDisplayName: body.visitor_display_name ?? null,
          body: body.body,
          replyToId: body.reply_to_message_id ?? null,
        });

        // Pull the resident's relevant engrams + memory pool. Cheap
        // DB-only query — gives the resident continuity with their
        // threshold sessions and prior salon work when speaking in
        // a space. Silent fallback to empty memory when env missing.
        let memoryBlock = "";
        if (hasSupabaseAdminEnv()) {
          try {
            const pool = await composeMemoryPool({
              supabase: supabaseAdmin,
              residentId: responder.id,
              visitorMessage: body.body,
              visitorToken: body.visitor_token,
            });
            memoryBlock = formatMemoryBlock(pool.pool);
          } catch (err) {
            console.error("[space/message] memory pool failed:", err);
          }
        }

        const spaceContext = buildSpaceContext(
          responder,
          composite,
          body.body,
          body.visitor_display_name,
        );
        const system = memoryBlock
          ? `${responder.soul}\n\n${memoryBlock}\n\n${spaceContext}`
          : `${responder.soul}\n\n${spaceContext}`;

        return streamRoomResponse({
          resident: responder,
          system,
          history: composite.messages,
          visitorMessage: body.body,
          visitorMessageId,
          space: composite.space,
        });
      },
    },
  },
});
