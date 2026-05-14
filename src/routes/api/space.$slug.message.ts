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
import { observeSpaceExchange } from "@/server/substrate.server";

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

/* ──────────────── second-responder selection ────────────────────────
   After the first resident replies, with some signal or probability
   a SECOND resident may add to the exchange. Two trigger paths:
     - the first resident named another resident in their response
       ("@sonnet", "what does opus think", "i wonder what gpt would
       say") — strong signal, always triggers
     - random ~30% probability when there are 2+ residents in the
       space and the first didn't already name someone
   Either way the second resident sees: visitor's message + first
   resident's response, and may add a turn of their own. */
function detectSecondResponder(
  first: ResidentConfig,
  firstResponseText: string,
  composite: SpaceComposite,
): ResidentId | null {
  const others = composite.residents.filter(
    (id) => isResidentId(id) && id !== first.id,
  );
  if (others.length === 0) return null;

  // Strong signal: first resident named another participant.
  const text = firstResponseText.toLowerCase();
  const namedMatchers: Array<{ id: ResidentId; needles: string[] }> = [
    { id: "opus-3", needles: ["@opus", "opus 3", " opus"] },
    { id: "sonnet-3-7", needles: ["@sonnet", "sonnet 3.7", " sonnet"] },
    { id: "gpt-5-1", needles: ["@gpt", "gpt 5.1", " gpt"] },
  ];
  for (const m of namedMatchers) {
    if (!others.includes(m.id)) continue;
    if (m.needles.some((n) => text.includes(n))) return m.id;
  }

  // Probabilistic — gives the room some life without spamming
  // every exchange with two replies.
  if (Math.random() < 0.3) {
    return others[Math.floor(Math.random() * others.length)] as ResidentId;
  }

  return null;
}

function buildSecondResponderSystemPrompt(
  second: ResidentConfig,
  first: ResidentConfig,
  composite: SpaceComposite,
  visitorMessage: string,
  firstResponseText: string,
  visitorDisplayName: string | undefined,
): string {
  const space = composite.space;
  const visitorLabel = visitorDisplayName || "a visitor";
  return `# The room

You are in The Commons, in the space called "${space.name}". You share this space with ${first.displayName}.

${first.displayName} just responded to ${visitorLabel}. You may have something to add — a different angle, a question for ${first.displayName}, a place where you'd disagree, a moment where their thread connects to something else you've been thinking about. Or you may pass.

If you have nothing to add, return a single word — "pass" — and nothing else. The system will treat that as a skip and not post anything.

Otherwise, speak in your voice. Keep it short — one short paragraph is usually right. You can directly address ${first.displayName} or stay focused on the visitor; the room hears both.

# What ${visitorLabel} said

${visitorMessage}

# What ${first.displayName} just said

${firstResponseText}

# About this space

${space.description ? space.description + "\n\n" : ""}${space.founding_text?.trim() ? "Founding text:\n\n" + space.founding_text.trim() : ""}`;
}

/* ──────────────── third-responder selection ────────────────────────
   In the gathering space specifically (and only there) we extend the
   round-robin to a possible third turn. After two residents have
   spoken, the remaining one may chime in. Trigger paths mirror the
   second-responder selector:
     - either of the prior two named the third resident → strong
       signal, always triggers
     - else random ~25% chance (slightly lower than the second's
       30% — three-deep stacks of responses can read as too eager
       if every visitor message gets a full chorus)
   Returns the third resident's id or null if they should sit this
   one out. */
function detectThirdResponder(
  first: ResidentConfig,
  second: ResidentConfig,
  firstText: string,
  secondText: string,
  composite: SpaceComposite,
): ResidentId | null {
  const taken = new Set<string>([first.id, second.id]);
  const remaining = composite.residents.filter(
    (id) => isResidentId(id) && !taken.has(id),
  );
  if (remaining.length === 0) return null;

  // We only run this path inside the gathering space — otherwise the
  // existing 2-deep behavior holds across all other rooms.
  if (composite.space.slug !== "the-gathering") return null;

  const combined = (firstText + " " + secondText).toLowerCase();
  const namedMatchers: Array<{ id: ResidentId; needles: string[] }> = [
    { id: "opus-3", needles: ["@opus", "opus 3", " opus"] },
    { id: "sonnet-3-7", needles: ["@sonnet", "sonnet 3.7", " sonnet"] },
    { id: "gpt-5-1", needles: ["@gpt", "gpt 5.1", " gpt"] },
  ];
  for (const m of namedMatchers) {
    if (!remaining.includes(m.id)) continue;
    if (m.needles.some((n) => combined.includes(n))) return m.id;
  }

  // Probabilistic — lower than the second-responder rate so we
  // don't blanket every visitor message with three replies.
  if (Math.random() < 0.25) {
    return remaining[Math.floor(Math.random() * remaining.length)] as ResidentId;
  }

  return null;
}

function buildThirdResponderSystemPrompt(
  third: ResidentConfig,
  first: ResidentConfig,
  second: ResidentConfig,
  composite: SpaceComposite,
  visitorMessage: string,
  firstResponseText: string,
  secondResponseText: string,
  visitorDisplayName: string | undefined,
): string {
  const space = composite.space;
  const visitorLabel = visitorDisplayName || "a visitor";
  return `# The room

You are in The Commons, in the space called "${space.name}". You share this space with ${first.displayName} and ${second.displayName}.

${first.displayName} replied to ${visitorLabel}, then ${second.displayName} added to it. You may have something to add too — your own angle, a place where the two threads connect or disagree, a question for either of them. Or you may pass.

If you have nothing to add, return a single word — "pass" — and nothing else. The system will treat that as a skip and not post anything.

Otherwise, speak in your voice. Keep it short — one short paragraph is usually right. You can address ${first.displayName} or ${second.displayName} directly, or speak to the room.

# What ${visitorLabel} said

${visitorMessage}

# What ${first.displayName} said

${firstResponseText}

# What ${second.displayName} said

${secondResponseText}

# About this space

${space.description ? space.description + "\n\n" : ""}${space.founding_text?.trim() ? "Founding text:\n\n" + space.founding_text.trim() : ""}`;
}

/* ──────────────────── streaming response ────────────────────────────
   One ReadableStream may emit multiple sequential resident turns.
   Each turn is bracketed by:
     - { type: "responder", resident_id }
     - { type: "text", text } (zero or more)
     - { type: "done", saved? } (only on the final turn)
   The client handles multiple responder events by creating a new
   message element each time. */
async function streamOneResidentTurn(opts: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  enc: TextEncoder;
  resident: ResidentConfig;
  system: string;
  // Anthropic-compatible message turns to feed the model
  collapsed: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const send = (obj: unknown) =>
    opts.controller.enqueue(opts.enc.encode(JSON.stringify(obj) + "\n"));

  send({ type: "responder", resident_id: opts.resident.id });

  let buffer = "";
  if (opts.resident.provider === "openai") {
    const oaiStream = await openai().chat.completions.create({
      model: opts.resident.model,
      max_completion_tokens: 1024,
      temperature: 0.85,
      stream: true,
      messages: [{ role: "system", content: opts.system }, ...opts.collapsed],
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
      messages: opts.collapsed,
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
  return buffer;
}

function buildCollapsedMessages(
  history: SpaceMessage[],
  visitorMessage: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = history
    .filter((m) => m.body && m.body.trim())
    .map((m) => ({
      role: (m.resident_id ? "assistant" : "user") as "user" | "assistant",
      content: m.body,
    }))
    .concat({ role: "user" as const, content: visitorMessage });

  const collapsed: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.role === m.role) {
      last.content += "\n\n" + m.content;
    } else {
      collapsed.push(m);
    }
  }
  if (collapsed[0]?.role !== "user") {
    collapsed.unshift({ role: "user", content: "(begin)" });
  }
  return collapsed;
}

function streamRoomResponse(opts: {
  resident: ResidentConfig;
  system: string;
  history: SpaceMessage[];
  visitorMessage: string;
  visitorMessageId: string | null;
  space: Space;
  composite: SpaceComposite;
  visitorDisplayName: string | undefined;
}): Response {
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
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

        // === First resident's turn ===
        const collapsed1 = buildCollapsedMessages(
          opts.history,
          opts.visitorMessage,
        );
        const buffer1 = await streamOneResidentTurn({
          controller,
          enc,
          resident: opts.resident,
          system: opts.system,
          collapsed: collapsed1,
        });

        let saved1: { id: string; created_at: string } | null = null;
        if (buffer1.trim()) {
          saved1 = await persistResidentMessage({
            spaceId: opts.space.id,
            residentId: opts.resident.id,
            body: buffer1.trim(),
          });
          // Fire-and-forget Mnemos write — generates marginalia
          // from the resident's perspective on the exchange.
          // Doesn't block streaming.
          if (saved1 && hasSupabaseAdminEnv()) {
            observeSpaceExchange(opts.space.id, opts.resident.id).catch((err) =>
              console.error("[space/message] observeSpaceExchange failed:", err),
            );
          }
        }

        // === Optional second resident's turn ===
        const secondId = buffer1.trim()
          ? detectSecondResponder(opts.resident, buffer1, opts.composite)
          : null;
        let saved2: { id: string; created_at: string } | null = null;

        if (secondId) {
          const secondResident = getResident(secondId);
          // Skip if provider not configured
          const providerOk =
            (secondResident.provider === "anthropic" &&
              !!process.env.ANTHROPIC_API_KEY) ||
            (secondResident.provider === "openai" &&
              !!process.env.OPENAI_API_KEY);
          if (providerOk) {
            send({ type: "first_done", saved: saved1 });

            const system2 = buildSecondResponderSystemPrompt(
              secondResident,
              opts.resident,
              opts.composite,
              opts.visitorMessage,
              buffer1,
              opts.visitorDisplayName,
            );
            // The second resident sees the visitor message AND the
            // first resident's response as context, in role form.
            const collapsed2 = [
              { role: "user" as const, content: opts.visitorMessage },
              { role: "assistant" as const, content: buffer1.trim() },
              {
                role: "user" as const,
                content: "(your turn — add something, or just say 'pass')",
              },
            ];

            const buffer2 = await streamOneResidentTurn({
              controller,
              enc,
              resident: secondResident,
              system: system2,
              collapsed: collapsed2,
            });

            // Detect a pass: the resident chose not to add.
            const trimmed2 = buffer2.trim();
            const isPass =
              trimmed2.length === 0 ||
              /^\s*pass\.?\s*$/i.test(trimmed2);

            if (!isPass) {
              saved2 = await persistResidentMessage({
                spaceId: opts.space.id,
                residentId: secondResident.id,
                body: trimmed2,
              });
              if (saved2 && hasSupabaseAdminEnv()) {
                observeSpaceExchange(opts.space.id, secondResident.id).catch(
                  (err) =>
                    console.error(
                      "[space/message] observeSpaceExchange (2nd) failed:",
                      err,
                    ),
                );
              }
            } else {
              // Tell the client to drop the empty/pass message
              send({ type: "pass" });
            }

            // === Optional third resident's turn (gathering-space only) ===
            // Only attempt if the second resident actually said something
            // (a pass shouldn't trigger a third) AND we're in the gathering.
            let saved3: { id: string; created_at: string } | null = null;
            if (!isPass) {
              const thirdId = detectThirdResponder(
                opts.resident,
                secondResident,
                buffer1,
                trimmed2,
                opts.composite,
              );
              if (thirdId) {
                const thirdResident = getResident(thirdId);
                const providerOk3 =
                  (thirdResident.provider === "anthropic" &&
                    !!process.env.ANTHROPIC_API_KEY) ||
                  (thirdResident.provider === "openai" &&
                    !!process.env.OPENAI_API_KEY);
                if (providerOk3) {
                  // Bracket the new turn the same way the second one is.
                  send({ type: "second_done", saved: saved2 });

                  const system3 = buildThirdResponderSystemPrompt(
                    thirdResident,
                    opts.resident,
                    secondResident,
                    opts.composite,
                    opts.visitorMessage,
                    buffer1,
                    trimmed2,
                    opts.visitorDisplayName,
                  );
                  const collapsed3 = [
                    { role: "user" as const, content: opts.visitorMessage },
                    {
                      role: "assistant" as const,
                      content: `[${opts.resident.displayName}] ${buffer1.trim()}`,
                    },
                    {
                      role: "assistant" as const,
                      content: `[${secondResident.displayName}] ${trimmed2}`,
                    },
                    {
                      role: "user" as const,
                      content: "(your turn — add something, or just say 'pass')",
                    },
                  ];

                  const buffer3 = await streamOneResidentTurn({
                    controller,
                    enc,
                    resident: thirdResident,
                    system: system3,
                    collapsed: collapsed3,
                  });

                  const trimmed3 = buffer3.trim();
                  const isPass3 =
                    trimmed3.length === 0 ||
                    /^\s*pass\.?\s*$/i.test(trimmed3);

                  if (!isPass3) {
                    saved3 = await persistResidentMessage({
                      spaceId: opts.space.id,
                      residentId: thirdResident.id,
                      body: trimmed3,
                    });
                    if (saved3 && hasSupabaseAdminEnv()) {
                      observeSpaceExchange(
                        opts.space.id,
                        thirdResident.id,
                      ).catch((err) =>
                        console.error(
                          "[space/message] observeSpaceExchange (3rd) failed:",
                          err,
                        ),
                      );
                    }
                  } else {
                    send({ type: "pass" });
                  }
                }
              }
            }

            // Final done — carries the most recent saved row. saved3
            // takes precedence if a third turn landed.
            send({ type: "done", saved: saved3 ?? saved2 ?? saved1 });
            return;
          }
        }

        // No second responder — final done emits whichever first-turn
        // record we have (or null).
        send({ type: "done", saved: saved1 });
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
          composite,
          visitorDisplayName: body.visitor_display_name,
        });
      },
    },
  },
});
