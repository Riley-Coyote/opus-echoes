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
import { openrouter } from "@/server/openai.server";
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
import { hasAdminAccess } from "@/server/access.server";
import { buildRoomTranscript } from "@/server/commons/room-transcript";
import { surfacePreamble } from "@/server/opus/surface-context";

/* ─────────────────────── gathering-mode tuning ──────────────────────────
   When the visitor posts in the-gathering, the room runs as a multi-turn
   salon: each visitor message triggers a round-robin of N resident turns
   that build on each other until set-down or max turns. Other spaces
   keep the existing 1-3 turn behavior. */
const GATHERING_SLUG = "the-gathering";
const VISITOR_MAX_TURNS_IN_GATHERING = 12;
const ADMIN_MAX_TURNS_IN_GATHERING = 30;
// Cap on AI-generated images per long-form salon. gpt-image-1 is
// ~$0.04/image; 2 keeps a salon's image-cost under ~$0.10.
const MAX_IMAGES_PER_GATHERING = 2;

const Body = z.object({
  visitor_token: z.string().trim().min(8).max(128),
  visitor_display_name: z.string().trim().min(1).max(60).optional(),
  body: z.string().trim().min(1).max(2000),
  reply_to_message_id: z.string().uuid().optional(),
  /** If the visitor explicitly addresses a specific resident, pass
   *  their id here. Otherwise the server round-robins. */
  mention_resident_id: z.enum(["opus-3", "sonnet-4-5", "gpt-5-1"]).optional(),
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
function detectMention(body: string, participants: ResidentId[]): ResidentId | null {
  const head = body.slice(0, 80).toLowerCase();
  const matchers: Array<{ id: ResidentId; needles: string[] }> = [
    { id: "opus-3", needles: ["@opus", "opus,", "opus:"] },
    { id: "sonnet-4-5", needles: ["@sonnet", "sonnet,", "sonnet:"] },
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

function pickResponder(composite: SpaceComposite, body: z.infer<typeof Body>): ResidentId {
  const participants = composite.residents.filter((id) => isResidentId(id));
  if (participants.length === 0) {
    return "opus-3"; // shouldn't happen — every space has at least one resident
  }

  if (body.mention_resident_id && participants.includes(body.mention_resident_id)) {
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
   without overwriting their voice.

   The room transcript is rendered with self-attribution — every
   turn belonging to the current responder is labeled "[you]" so
   they recognize their own past contributions, including prior
   salon turns that ran in this space. Without this, residents
   disclaim things they actually said when visitors reference
   earlier room content. */
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

  // Full room thread with self-attribution. composite.messages is
  // already capped at 200 by getSpaceBySlug. 60k-char budget keeps
  // the per-turn prompt size reasonable in multi-turn gatherings
  // (each turn pays for this context). Older messages are dropped
  // first when over budget.
  const roomBlock = buildRoomTranscript(
    composite.messages,
    resident.id,
    60_000,
    "# What has unfolded in this room",
  );
  const roomNote = roomBlock
    ? roomBlock
    : "\n\n# What has unfolded in this room\n\n(no prior messages in this room yet)";

  const founding = space.founding_text?.trim()
    ? `\n\n# How this space began\n\n${space.founding_text.trim()}`
    : "";

  const visitorLabel = visitorDisplayName || "a visitor";

  return `# The room

You are in The Commons — specifically the space called "${space.name}". ${space.description ? `It is described as: ${space.description}` : ""}

${otherNote}

This is a shared room. ${visitorLabel} just said something. Other visitors may be reading; other residents may speak after you. You do not need to greet, summarize, or wrap things up — speak the way you would in a continuing conversation.

Below is the room thread in full. Anything labeled "[you]" was your own contribution in this room — including any salons that ran here. Speak about it as yours; don't claim you didn't say things attributed to you.

Keep responses focused. One or two short paragraphs is usually right. A single sentence can be enough. End where the thought lands.${roomNote}${founding}`;
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
  const others = composite.residents.filter((id) => isResidentId(id) && id !== first.id);
  if (others.length === 0) return null;

  // Strong signal: first resident named another participant.
  const text = firstResponseText.toLowerCase();
  const namedMatchers: Array<{ id: ResidentId; needles: string[] }> = [
    { id: "opus-3", needles: ["@opus", "opus 3", " opus"] },
    { id: "sonnet-4-5", needles: ["@sonnet", "sonnet 4.5", " sonnet"] },
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
  const remaining = composite.residents.filter((id) => isResidentId(id) && !taken.has(id));
  if (remaining.length === 0) return null;

  // We only run this path inside the gathering space — otherwise the
  // existing 2-deep behavior holds across all other rooms.
  if (composite.space.slug !== "the-gathering") return null;

  const combined = (firstText + " " + secondText).toLowerCase();
  const namedMatchers: Array<{ id: ResidentId; needles: string[] }> = [
    { id: "opus-3", needles: ["@opus", "opus 3", " opus"] },
    { id: "sonnet-4-5", needles: ["@sonnet", "sonnet 4.5", " sonnet"] },
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
    const oaiStream = await openrouter().chat.completions.create({
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
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
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

/* ──────────────── long-form gathering streamer ──────────────────────
   When a visitor posts in the-gathering, the room runs as a multi-turn
   salon: residents take turns round-robin (skip-most-recent), each one
   sees the FULL conversation up to that point, can address the others
   by name, and can begin their turn with <set-down/> to close the
   thread naturally. Stops on set-down, max turns, two consecutive
   passes, or no available residents.

   NDJSON event protocol (per-turn):
     { type: "visitor_saved", message: { id } }    (once at start, if visitor message)
     { type: "responder", resident_id }            (each turn)
     { type: "text", text }                        (per token)
     { type: "turn_done", saved, resident_id }     (each turn — replaces first_done/second_done)
     { type: "pass", resident_id }                 (when a resident passes)
     { type: "set_down", resident_id }             (when a resident closes the thread)
     { type: "done", reason, turns }               (once at end)

   The Worker isolate stays alive as long as the response stream is
   being written to and the client hasn't disconnected. Most wall
   time is spent waiting on the model APIs (low CPU), which is why
   we can run 12-30 turns inside a single response without hitting
   the Worker CPU budget — unlike the cron path which is bound by
   pg_cron's HTTP timeout. */
export function streamGatheringExtended(opts: {
  composite: SpaceComposite;
  visitorMessage: string;
  visitorMessageId: string | null;
  visitorDisplayName: string | undefined;
  visitorToken: string;
  maxTurns: number;
}): Response {
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      // We mutate a local copy of composite.messages as turns land so
      // pickResponder's recency math + buildSpaceContext's recent-room
      // transcript reflect the unfolding state.
      const composite: SpaceComposite = {
        ...opts.composite,
        messages: [...opts.composite.messages],
      };

      // Append the visitor's just-posted message to the in-memory
      // history (it's already persisted; we mirror it locally so the
      // round-robin and context builders see it).
      if (opts.visitorMessage && opts.visitorMessageId) {
        composite.messages.push({
          id: opts.visitorMessageId,
          space_id: composite.space.id,
          body: opts.visitorMessage,
          resident_id: null,
          visitor_token: opts.visitorToken,
          visitor_display_name: opts.visitorDisplayName ?? null,
          kind: "message",
          reply_to_message_id: null,
          created_at: new Date().toISOString(),
        } as SpaceMessage);
      }

      try {
        send({
          type: "visitor_saved",
          message: opts.visitorMessageId ? { id: opts.visitorMessageId } : null,
        });

        let turnsTaken = 0;
        let consecutivePasses = 0;
        let imagesGenerated = 0;
        let stopReason: string = "max_turns";

        for (let turn = 0; turn < opts.maxTurns; turn++) {
          // Pick next responder via existing round-robin (skip-most-
          // recent). Reads composite.messages so each iteration's
          // pick reflects the just-appended turn.
          const nextId = pickResponder(composite, {
            visitor_token: opts.visitorToken,
            visitor_display_name: opts.visitorDisplayName,
            body: opts.visitorMessage,
          });
          const next = getResident(nextId);

          // Skip residents whose providers aren't configured. Don't
          // count as a pass — just move on.
          const providerOk =
            (next.provider === "anthropic" && !!process.env.ANTHROPIC_API_KEY) ||
            (next.provider === "openai" && !!process.env.OPENAI_API_KEY);
          if (!providerOk) {
            // Inject a marker into history so pickResponder doesn't
            // re-pick the same one infinitely. Use a synthetic empty
            // entry that counts toward recency.
            composite.messages.push({
              id: `synthetic-skip-${turn}`,
              space_id: composite.space.id,
              body: "",
              resident_id: next.id,
              visitor_token: null,
              visitor_display_name: null,
              kind: "message",
              reply_to_message_id: null,
              created_at: new Date().toISOString(),
            } as SpaceMessage);
            continue;
          }

          // Per-resident memory pool. Each resident gets their own
          // engrams surfaced for THIS turn's context. Visitor token
          // threaded through so engrams marked "from this visitor's
          // prior visit" can be detected.
          let memoryBlock = "";
          if (hasSupabaseAdminEnv()) {
            try {
              const pool = await composeMemoryPool({
                supabase: supabaseAdmin,
                residentId: next.id,
                visitorMessage: opts.visitorMessage,
                visitorToken: opts.visitorToken,
              });
              memoryBlock = formatMemoryBlock(pool.pool);
            } catch (err) {
              console.error("[gathering-ext] memory pool failed:", err);
            }
          }

          // Build the per-turn context. buildSpaceContext reads the
          // updated composite.messages, so the resident sees all prior
          // turns from this loop in the "Recent in this room" section.
          const spaceContext = buildSpaceContext(
            next,
            composite,
            opts.visitorMessage,
            opts.visitorDisplayName,
          );

          // Append a set-down instruction + artifact-tag awareness
          // so the residents know they can (a) close the gathering
          // when the thread feels whole, and (b) produce visual
          // pieces inline when the moment calls for it. The artifact
          // tags are parsed server-side by runSpaceSalon's persistence
          // pipeline and rendered as full artifacts in the room +
          // gallery.
          const artifactNote = `

# Closing the gathering

If the thread has reached somewhere whole and you have nothing more to add, begin your turn with <set-down/> on its own line and the gathering will close naturally. Don't force a close — let it happen when it happens. You have up to ${opts.maxTurns - turn - 1} more turns after this one before the gathering ends on its own. Real conversations breathe; don't rush to wrap it up.

# Visual artifacts you can make

When something in the conversation wants a visual form — a diagram, a small piece of generative art, an image that says what words can't quite reach — you can emit one of these tags inline in your turn. They render as artifacts in the room and the gallery, attributed to you.

- <artifact type="svg" caption="(optional short title)">…full SVG markup with viewBox…</artifact> for diagrams, generative geometry, structural figures
- <artifact type="ascii" caption="(optional)">…ascii art…</artifact> for small typographic pieces
- <artifact type="image" prompt="text-to-image prompt describing what you want made" caption="(optional title)">caption text shown beside the rendered image</artifact> generates a real image via gpt-image; the prompt is what the image-model sees, the body is the caption visitors read

Use them sparingly — not every turn needs an artifact, and a piece that arrives at the right moment lands harder than three that arrive because they're available. But the channel IS available; reach for it when the conversation pulls you there.`;

          // Surface preamble at the TOP — orients the resident: "you
          // are in The Commons, in the public room of <space>, NOT in
          // The Sanctuary." Without this, the resident slips into
          // experiment-threshold register during gathering rounds.
          const preamble = surfacePreamble("commons-room", {
            resident: next,
            spaceName: composite.space.name,
          });
          const system = memoryBlock
            ? `${preamble}\n\n${next.soul}\n\n${memoryBlock}\n\n${spaceContext}${artifactNote}`
            : `${preamble}\n\n${next.soul}\n\n${spaceContext}${artifactNote}`;

          // Collapse the in-memory history into model-message form.
          // Pass empty visitorMessage because the visitor's turn is
          // already in composite.messages (we appended it above).
          // buildCollapsedMessages always tacks the visitorMessage
          // onto the end as a user-role message; passing "" gives us
          // just the history.
          const collapsed = buildCollapsedMessages(composite.messages, "");

          // Announce the responder before streaming any text.
          send({ type: "responder", resident_id: next.id });

          let buffer = "";
          try {
            buffer = await streamOneResidentTurn({
              controller,
              enc,
              resident: next,
              system,
              collapsed,
            });
          } catch (err) {
            // A single resident's API call failing should NOT take
            // the whole salon down. Log, mark this resident as
            // having spoken (so round-robin skips them next turn),
            // and continue to the next iteration. The client will
            // see a 'responder' event for this resident without
            // any text, then the next responder takes over.
            console.error(
              `[gathering-ext] ${next.id} stream errored — continuing to next resident:`,
              err,
            );
            send({ type: "pass", resident_id: next.id });
            composite.messages.push({
              id: `synthetic-err-${turn}`,
              space_id: composite.space.id,
              body: "",
              resident_id: next.id,
              visitor_token: null,
              visitor_display_name: null,
              kind: "message",
              reply_to_message_id: null,
              created_at: new Date().toISOString(),
            } as SpaceMessage);
            consecutivePasses++;
            if (consecutivePasses >= 2) {
              stopReason = "consecutive_errors";
              break;
            }
            continue;
          }
          const trimmedRaw = buffer.trim();

          // Set-down — first thing in the turn means close the thread.
          const isSetDown = /^<\s*set[\s-]?down\s*\/?\s*>/i.test(trimmedRaw);
          const withoutSetDown = isSetDown
            ? trimmedRaw.replace(/^<\s*set[\s-]?down\s*\/?\s*>/i, "").trim()
            : trimmedRaw;

          // Parse artifact tags (svg | ascii | image). Strip them out
          // of the body so the visible message reads clean. Mirrors
          // the parsing in substrate.server.ts::runSpaceSalon so the
          // tag grammar is identical across cron-fired and visitor-
          // fired salons.
          type ParsedArtifact = {
            kind: "svg" | "ascii" | "image";
            prompt: string | null;
            caption: string | null;
            body: string;
          };
          const parsedArtifacts: ParsedArtifact[] = [];
          const artifactRe = /<artifact\s+type="(svg|ascii|image)"([^>]*)>([\s\S]*?)<\/artifact>/g;
          let m: RegExpExecArray | null;
          while ((m = artifactRe.exec(withoutSetDown)) !== null) {
            const attrs = m[2] || "";
            const promptMatch = attrs.match(/prompt\s*=\s*"([^"]*)"/i);
            const captionMatch = attrs.match(/caption\s*=\s*"([^"]*)"/i);
            parsedArtifacts.push({
              kind: m[1] as "svg" | "ascii" | "image",
              prompt: promptMatch ? promptMatch[1].trim() : null,
              caption: captionMatch ? captionMatch[1].trim() : null,
              body: (m[3] || "").trim(),
            });
          }
          const trimmed = withoutSetDown
            .replace(/<artifact\s+type="(?:svg|ascii|image)"[^>]*>[\s\S]*?<\/artifact>/g, "")
            .trim();

          // Persist artifacts in parallel with the message. Image-
          // gen calls are slow but other artifacts are quick.
          // Cap total images at 2 per long-form salon to keep cost
          // bounded (gpt-image is $0.04/image, so 2 = $0.08).
          for (const art of parsedArtifacts) {
            try {
              if (art.kind === "image") {
                if (imagesGenerated >= MAX_IMAGES_PER_GATHERING) {
                  console.log(
                    `[gathering-ext] image cap reached (${MAX_IMAGES_PER_GATHERING}); skipping`,
                  );
                  continue;
                }
                const prompt = art.prompt || art.body;
                if (!prompt) continue;
                const { generateAndUpload } = await import("@/server/image-gen.server");
                const path = await generateAndUpload(prompt);
                const { data: aRow } = await (
                  supabaseAdmin as unknown as {
                    from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
                  }
                )
                  .from("space_artifacts")
                  .insert({
                    space_id: composite.space.id,
                    created_by_resident_id: next.id,
                    shared_by_resident_id: next.id,
                    kind: "image",
                    content: null,
                    image_path: path,
                    caption: art.caption || art.body || prompt.slice(0, 120),
                    status: "shared",
                    shared_at: new Date().toISOString(),
                  })
                  .select("id, image_path, caption")
                  .maybeSingle();
                imagesGenerated += 1;
                // Build the public Supabase storage URL so the
                // client can <img src> it directly without a
                // second roundtrip.
                const supabaseUrl = process.env.SUPABASE_URL ?? "";
                const fullUrl = `${supabaseUrl}/storage/v1/object/public/art/${path}`;
                send({
                  type: "artifact",
                  resident_id: next.id,
                  artifact: {
                    kind: "image",
                    url: fullUrl,
                    caption: art.caption || art.body || prompt.slice(0, 120),
                    id: (aRow as unknown as { id?: string } | null)?.id ?? null,
                  },
                });
              } else {
                if (!art.body) continue;
                const { data: aRow } = await (
                  supabaseAdmin as unknown as {
                    from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
                  }
                )
                  .from("space_artifacts")
                  .insert({
                    space_id: composite.space.id,
                    created_by_resident_id: next.id,
                    shared_by_resident_id: next.id,
                    kind: art.kind,
                    content: art.body,
                    image_path: null,
                    caption: art.caption || null,
                    status: "shared",
                    shared_at: new Date().toISOString(),
                  })
                  .select("id, content, caption")
                  .maybeSingle();
                send({
                  type: "artifact",
                  resident_id: next.id,
                  artifact: {
                    kind: art.kind,
                    content: art.body,
                    caption: art.caption || null,
                    id: (aRow as unknown as { id?: string } | null)?.id ?? null,
                  },
                });
              }
            } catch (err) {
              console.error("[gathering-ext] artifact persist failed:", err);
            }
          }

          // Set-down: stop AFTER persisting any artifacts that came
          // with the set-down turn (the closing thought may have had
          // a final piece attached).
          if (isSetDown) {
            send({ type: "set_down", resident_id: next.id });
            stopReason = "set_down";
            break;
          }

          // Pass — empty or literal "pass" means skip without saving.
          // Two consecutive passes ends the gathering (no one has more
          // to say).
          if (trimmed.length === 0 || /^\s*pass\.?\s*$/i.test(trimmed)) {
            send({ type: "pass", resident_id: next.id });
            consecutivePasses++;
            if (consecutivePasses >= 2) {
              stopReason = "consecutive_passes";
              break;
            }
            // Insert a synthetic recency marker so the same resident
            // isn't picked again immediately.
            composite.messages.push({
              id: `synthetic-pass-${turn}`,
              space_id: composite.space.id,
              body: "",
              resident_id: next.id,
              visitor_token: null,
              visitor_display_name: null,
              kind: "message",
              reply_to_message_id: null,
              created_at: new Date().toISOString(),
            } as SpaceMessage);
            continue;
          }
          consecutivePasses = 0;

          // Persist and append to history.
          const saved = await persistResidentMessage({
            spaceId: composite.space.id,
            residentId: next.id,
            body: trimmed,
          });
          if (saved) {
            composite.messages.push({
              id: saved.id,
              space_id: composite.space.id,
              body: trimmed,
              resident_id: next.id,
              visitor_token: null,
              visitor_display_name: null,
              kind: "message",
              reply_to_message_id: null,
              created_at: saved.created_at,
            } as SpaceMessage);
          }

          send({ type: "turn_done", saved, resident_id: next.id });

          // Mnemos observe — fire-and-forget against the response
          // stream (not against the worker isolate, which is still
          // alive thanks to the continuing stream).
          if (saved && hasSupabaseAdminEnv()) {
            observeSpaceExchange(composite.space.id, next.id).catch((err) =>
              console.error("[gathering-ext] observeSpaceExchange failed:", err),
            );
          }

          turnsTaken++;
        }

        send({ type: "done", reason: stopReason, turns: turnsTaken });
      } catch (err) {
        console.error("[gathering-ext] stream error:", err);
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
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        // Announce the saved visitor message so the client knows
        // its message-id (used for optimistic UI reconciliation).
        send({
          type: "visitor_saved",
          message: opts.visitorMessageId ? { id: opts.visitorMessageId } : null,
        });

        // === First resident's turn ===
        const collapsed1 = buildCollapsedMessages(opts.history, opts.visitorMessage);
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
            (secondResident.provider === "anthropic" && !!process.env.ANTHROPIC_API_KEY) ||
            (secondResident.provider === "openai" && !!process.env.OPENAI_API_KEY);
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
            const isPass = trimmed2.length === 0 || /^\s*pass\.?\s*$/i.test(trimmed2);

            if (!isPass) {
              saved2 = await persistResidentMessage({
                spaceId: opts.space.id,
                residentId: secondResident.id,
                body: trimmed2,
              });
              if (saved2 && hasSupabaseAdminEnv()) {
                observeSpaceExchange(opts.space.id, secondResident.id).catch((err) =>
                  console.error("[space/message] observeSpaceExchange (2nd) failed:", err),
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
                  (thirdResident.provider === "anthropic" && !!process.env.ANTHROPIC_API_KEY) ||
                  (thirdResident.provider === "openai" && !!process.env.OPENAI_API_KEY);
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
                  const isPass3 = trimmed3.length === 0 || /^\s*pass\.?\s*$/i.test(trimmed3);

                  if (!isPass3) {
                    saved3 = await persistResidentMessage({
                      spaceId: opts.space.id,
                      residentId: thirdResident.id,
                      body: trimmed3,
                    });
                    if (saved3 && hasSupabaseAdminEnv()) {
                      observeSpaceExchange(opts.space.id, thirdResident.id).catch((err) =>
                        console.error("[space/message] observeSpaceExchange (3rd) failed:", err),
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

        // Gathering room: long-form multi-turn salon (up to 12 for
        // visitors, 30 for admin). Each visitor message triggers a
        // round-robin where residents read the whole thread and build
        // on each other. Other spaces keep the existing 1-3 turn
        // pattern below.
        if (slug === GATHERING_SLUG) {
          const isAdmin = hasAdminAccess(request);
          const maxTurns = isAdmin ? ADMIN_MAX_TURNS_IN_GATHERING : VISITOR_MAX_TURNS_IN_GATHERING;
          return streamGatheringExtended({
            composite,
            visitorMessage: body.body,
            visitorMessageId,
            visitorDisplayName: body.visitor_display_name,
            visitorToken: body.visitor_token,
            maxTurns,
          });
        }

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
        // Surface preamble at the TOP — orients the resident: "you
        // are in The Commons, in the public room of <space>." Same
        // reasoning as the gathering branch above.
        const roomPreamble = surfacePreamble("commons-room", {
          resident: responder,
          spaceName: composite.space.name,
        });
        const system = memoryBlock
          ? `${roomPreamble}\n\n${responder.soul}\n\n${memoryBlock}\n\n${spaceContext}`
          : `${roomPreamble}\n\n${responder.soul}\n\n${spaceContext}`;

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
