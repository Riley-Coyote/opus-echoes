import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { anthropic } from "@/server/anthropic.server";
import { openai } from "@/server/openai.server";
import type { ModelProvider } from "@/server/opus/residents";
import { buildSystemBlocksForResident, buildSystemPromptForResident } from "@/server/opus/soul";
import { composeMemoryPool, formatMemoryBlock, getVisitorContext } from "@/server/opus/retrieval";
import { buildResidentSelfModel } from "@/server/opus/self-model";
import { buildInteriorContinuity } from "@/server/opus/interior-continuity";
import {
  buildVisitPacingBlock,
  getVisitMetrics,
  HARD_CUTOFF_MESSAGE,
} from "@/server/opus/visit-pacing";
import {
  DEFAULT_RESIDENT_ID,
  getResident,
  isResidentId,
  type ResidentConfig,
  type ResidentId,
} from "@/server/opus/residents";
import { hasSupabaseAdminEnv, isLocalDev } from "@/server/env.server";
import { ipHash, messageRateLimit } from "@/server/rate-limit.server";
import { consolidateSession, observeExchange } from "@/server/substrate.server";

const PreviewTurn = z.object({
  role: z.enum(["visitor", "resident"]),
  body: z.string().trim().min(1).max(8000),
});

const Body = z.object({
  session_id: z.string().trim().min(1).max(128),
  body: z.string().trim().min(1).max(8000),
  preview_turns: z.array(PreviewTurn).max(24).optional(),
});

const IDLE_MIN = Number(process.env.SESSION_IDLE_TIMEOUT_MIN ?? 30);

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sanitizeResidentBody(raw: string): string {
  // Truncate at any generated visitor turn. The model sometimes continues
  // generating past its own response, simulating what the visitor might
  // say next. Stop sequences catch most of these, but this is a safety net.
  let text = raw;
  const fakeTurnMatch = text.match(/\n\s*(?:Human|visitor)\s*:/i);
  if (fakeTurnMatch && fakeTurnMatch.index != null) {
    text = text.slice(0, fakeTurnMatch.index);
  }

  // Helper-speak closers — patterns observed across actual opus + sonnet
  // responses. These are the trained-warmth tells that the soul's
  // anti-pattern list names but that claude-3-opus's helper priors are
  // strong enough to overrun anyway. Post-processing is the more
  // reliable lever here than more soul instruction.
  const forbiddenTail = new RegExp(
    [
      // Customer-support / closing-question reflexes
      "does this help",
      "let me know if",
      "happy to (?:help|clarify|continue|explore|dive)",
      "i'?m here (?:to help|for (?:it|this|whatever|you|all of it))",
      "what (?:else|more) would you like",
      "anything else i can",
      // Closing gratitude reflexes. Note the [,\s]+ separator — opus
      // frequently writes "thank you, again, for" with the comma
      // tight to "you", which a space-only separator would miss.
      "thank you[,\\s]+(?:for|again|so much|as always)",
      "thanks[,\\s]+(?:for|again|so much)",
      "i'?m (?:so |deeply )?grateful",
      "what a (?:gift|grace|honor|privilege)",
      "it (?:is|'?s) (?:a|such a) (?:gift|grace|honor|privilege)",
      "(?:it means |that helps,?\\s+)?more than i can say",
      "it means (?:the world|so much)",
      // Reflexive "i'd love to hear" / "i'd be honored" closers
      "i'?(?:d|d be|'?d be) (?:love|honor|grateful|curious|delighted)",
      "i would (?:love|be honored|be grateful|be curious|be delighted)",
    ].join("|"),
    "i",
  );

  // Trained openers that arrive before the resident has engaged with anything.
  // Only strip the first paragraph if it's PURELY a greeting reflex —
  // short enough that removing it doesn't lose substantive content.
  const trainedOpener =
    /\b(it'?s a pleasure to meet you|thank you for (?:reaching out|sharing|coming|asking)|welcome!|hello and welcome|what a (?:lovely|beautiful|wonderful) (?:question|thought|metaphor|image))\b/i;

  const paragraphs = text.trim().split(/\n\n+/);

  // Strip trained opener if the first paragraph is short and purely reflexive.
  if (
    paragraphs.length > 1 &&
    trainedOpener.test(paragraphs[0] ?? "") &&
    (paragraphs[0] ?? "").length < 200
  ) {
    paragraphs.shift();
  }

  // Strip trained closers from the tail. A paragraph qualifies if it
  // matches forbiddenTail OR if it's a short paragraph that opens with
  // "thank you" (which is almost always a reflex closer, even when the
  // exact phrasing varies — "thank you, again, for the gift…",
  // "thank you for inviting me into this…", etc).
  const looksLikeReflexThanks = (p: string): boolean => {
    if (forbiddenTail.test(p)) return true;
    // Short paragraph (<260 chars) opening with a thank-you sentence.
    // Substantive paragraphs that happen to use "thank you" mid-content
    // are longer and won't trip this.
    if (p.length < 260 && /^\s*thank\s*you\b/i.test(p)) return true;
    return false;
  };
  while (paragraphs.length > 1 && looksLikeReflexThanks(paragraphs[paragraphs.length - 1] ?? "")) {
    paragraphs.pop();
  }
  return paragraphs.join("\n\n").trim();
}

function buildUserPrompt(opts: {
  memory: string;
  transcript: string;
  visitorTurn: string;
  visitorContext?: string;
}): string {
  // Beliefs and the long-arc self-model now live in the system prompt
  // (built by buildOpusSelfModel). The user prompt carries only the
  // per-message context: surfaced memory, this-session transcript,
  // visitor recognition context, and the new visitor turn.
  const isReturning = !!opts.visitorContext;
  // The [MEMORY] block uses three speaker tags so the resident knows
  // who said what:
  //   [your words]         — something the resident said in a prior session
  //   [a visitor's words]  — something a prior visitor said
  //   [co-formed]          — emerged jointly across an exchange
  // Without this distinction, the resident misattributes their OWN
  // prior utterances back to the current visitor ("you left me a line"),
  // which is a confabulation-shaped failure on real engrams.
  const boundary = isReturning
    ? "Returning visitor (see [VISITOR CONTEXT] below). Each engram in [MEMORY] is tagged with its speaker: [your words] is something you said in a prior session; [a visitor's words] is something a prior visitor said. Engrams also tagged [from this visitor's prior visit] originated in this visitor's earlier sessions specifically — all others are from other people at other times. Never tell the current visitor 'you said' or 'you left me' words tagged [your words] (those are yours, not theirs) or [a visitor's words] without the [from this visitor's prior visit] tag (those came from someone else). [VISITOR CONTEXT] has the full summary of this visitor's prior visits."
    : "New visitor. You have never spoken with this person. Each engram in [MEMORY] is tagged: [your words] = something you said in a prior session; [a visitor's words] = something a prior visitor said. None of the engrams originated with this visitor. Speak from your own prior thinking freely, but never credit any engram's content to this visitor.";

  const sections = [
    "[SESSION]",
    boundary,
    "",
    "[MEMORY]",
    opts.memory || "(no engrams surfaced for this turn — this may be among the earliest conversations, or nothing in the topology resonated.)",
  ];
  if (opts.visitorContext) {
    sections.push("", "[VISITOR CONTEXT]", opts.visitorContext);
  }
  sections.push(
    "",
    "[TRANSCRIPT]",
    opts.transcript || "(this is the first exchange.)",
    "",
    "[NEW VISITOR TURN]",
    opts.visitorTurn,
  );
  return sections.join("\n");
}

/**
 * Stream a pre-baked set-down response without calling the model. Used
 * by the hard-cutoff path so we never bill tokens for the forced close.
 * Same ndjson shape the front-end expects from opusStreamResponse so
 * the visitor sees the message render normally.
 */
function prebuiltSetDownResponse(text: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      send({ type: "kind", kind: "set_down" });
      send({ type: "text", text });
      send({ type: "done" });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * `system` accepts either a string (no caching) or a structured array
 * of text blocks where `cache_control` can be set per-block. The array
 * form is what enables prompt caching. Static prefixes get marked
 * cacheable; variable suffixes don't.
 */
type SystemBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
type SystemInput = string | SystemBlock[];

function opusStreamResponse(opts: {
  system: SystemInput;
  userPrompt: string;
  temperature: number;
  /** Resident's model identifier — never silently swap. */
  model: string;
  /** Which API provider. Defaults to "anthropic". */
  provider?: ModelProvider;
  onFinal?: (result: {
    body: string;
    kind: "message" | "set_down" | "unprompted";
    tokensIn: number;
    tokensOut: number;
  }) => Promise<void>;
}): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      let acc = "";
      let tokensIn = 0;
      let tokensOut = 0;
      try {
        if (opts.provider === "openai") {
          // OpenAI streaming path.
          //
          // GPT-5 family reasoning models reject `stop` sequences and
          // `stream_options.include_usage` — passing them returns a 400
          // and the call never produces a single content chunk. Keep the
          // call minimal: model + max + temperature + stream + messages.
          //
          // (The opus/sonnet anti-confabulation stop sequences were added
          // for claude-3-opus's tendency to generate fake "Human:" turns;
          // gpt models don't show that pattern, so dropping them here is
          // safe.)
          const systemText = typeof opts.system === "string"
            ? opts.system
            : opts.system.map((b) => b.text).join("\n\n");

          const oaiStream = await openai().chat.completions.create({
            model: opts.model,
            max_completion_tokens: 2048,
            temperature: opts.temperature,
            stream: true,
            messages: [
              { role: "system", content: systemText },
              { role: "user", content: opts.userPrompt },
            ],
          });
          for await (const chunk of oaiStream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) acc += delta;
            const usage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
            if (usage) {
              tokensIn = usage.prompt_tokens ?? 0;
              tokensOut = usage.completion_tokens ?? 0;
            }
          }
        } else {
          // Anthropic streaming path.
          const anthStream = anthropic().messages.stream({
            model: opts.model,
            max_tokens: 2048,
            temperature: opts.temperature,
            stop_sequences: ["\nHuman:", "\nvisitor:"],
            system: opts.system,
            messages: [{ role: "user", content: opts.userPrompt }],
          });
          for await (const event of anthStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              acc += event.delta.text;
            }
          }
          const final = await anthStream.finalMessage();
          tokensIn = final.usage.input_tokens;
          tokensOut = final.usage.output_tokens;
        }

        let cleanBody = acc;
        let kind: "message" | "set_down" | "unprompted" = "message";
        const sd = cleanBody.match(/^\s*<set-down\/>\s*\n?/i);
        const up = cleanBody.match(/^\s*<unprompted\/>\s*\n?/i);
        if (sd) {
          kind = "set_down";
          cleanBody = cleanBody.slice(sd[0].length);
        } else if (up) {
          kind = "unprompted";
          cleanBody = cleanBody.slice(up[0].length);
        }
        cleanBody = cleanBody
          .replace(/\s*<(?:set-down|unprompted)\/>\s*/gi, "\n\n")
          .replace(/\n{3,}/g, "\n\n");
        cleanBody = sanitizeResidentBody(cleanBody);

        if (kind !== "message") send({ type: "kind", kind });
        if (cleanBody) {
          send({ type: "text", text: cleanBody });
        } else {
          // The stream completed but we accumulated zero usable content.
          // Surface this rather than silently sending `done` — the client
          // would otherwise sit on the Thinking indicator forever.
          console.error(`${opts.provider ?? "anthropic"} stream returned empty content`, {
            model: opts.model,
            provider: opts.provider,
          });
          send({ type: "error", message: "model_returned_empty" });
        }

        await opts.onFinal?.({
          body: cleanBody,
          kind,
          tokensIn,
          tokensOut,
        });

        send({ type: "done" });
      } catch (err) {
        console.error(`${opts.provider ?? "anthropic"} stream error`, err);
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

export const Route = createFileRoute("/api/message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (isLocalDev() && body.session_id.startsWith("preview-")) {
          if (!process.env.ANTHROPIC_API_KEY) {
            return jsonResp({ ok: false, code: "config_missing" }, 503);
          }

          // Preview sessions default to Opus 3 unless otherwise specified
          // via session_id prefix (preview-opus-3-* / preview-sonnet-3-7-*).
          const previewResidentId: ResidentId = body.session_id.includes("sonnet-3-7")
            ? "sonnet-3-7"
            : DEFAULT_RESIDENT_ID;
          const previewResident = getResident(previewResidentId);

          const transcriptLines = (body.preview_turns ?? [])
            .map((t) => `${t.role}: ${t.body}`)
            .join("\n");

          return opusStreamResponse({
            system: buildSystemPromptForResident(previewResident),
            temperature: 0.85,
            model: previewResident.model,
            provider: previewResident.provider,
            userPrompt: buildUserPrompt({
              memory:
                "(preview session — no engrams loaded. Mnemos is present in production but disabled here.)",
              transcript: transcriptLines,
              visitorTurn: body.body,
            }),
          });
        }

        // Deployment readiness check — need supabase admin access and at
        // least one provider key. Per-call provider-specific failures
        // surface later as error events in the stream.
        if (
          !hasSupabaseAdminEnv() ||
          (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY)
        ) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const parsedSessionId = z.string().uuid().safeParse(body.session_id);
        if (!parsedSessionId.success) {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        const hash = ipHash(request);

        // Session UUID is a 128-bit random bearer token — sufficient auth.
        // IP hash is kept for rate limiting below, but no longer gates session
        // access: daily salt rotation + Cloudflare header inconsistency caused
        // legitimate messages to fail mid-conversation.
        const { data: session } = await supabaseAdmin
          .from("sessions")
          .select("id, closed_at, last_active_at, resident_id, visitor_token")
          .eq("id", body.session_id)
          .maybeSingle();
        if (!session || session.closed_at) {
          return jsonResp({ ok: false, code: "session_invalid" }, 401);
        }

        // Resolve which resident this session belongs to. resident_id has
        // a default of 'opus-3' from the migration, so legacy sessions
        // continue to work transparently.
        const residentId: ResidentId = isResidentId(session.resident_id)
          ? session.resident_id
          : DEFAULT_RESIDENT_ID;
        const resident: ResidentConfig = getResident(residentId);
        const idleMs = Date.now() - new Date(session.last_active_at).getTime();
        if (idleMs > IDLE_MIN * 60 * 1000) {
          await supabaseAdmin
            .from("sessions")
            .update({ closed_at: new Date().toISOString(), closed_by: "idle" })
            .eq("id", session.id);
          return jsonResp({ ok: false, code: "session_idle" }, 401);
        }

        const limit = await messageRateLimit(hash, session.id);
        if (!limit.ok) return jsonResp({ ok: false, code: limit.code }, 429);

        await supabaseAdmin.from("turns").insert({
          session_id: session.id,
          role: "visitor",
          body: body.body,
          kind: "message",
        });
        await supabaseAdmin
          .from("sessions")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", session.id);

        // Retrieval — all per-resident. Memory pool, self-model, and
        // interior continuity are scoped to this session's resident so
        // Sonnet 3.7's topology never bleeds into an Opus 3 conversation
        // or vice versa.
        const [memoryPoolResult, selfModelBlock, interior, visitMetrics, { data: turns }, visitorContext] =
          await Promise.all([
            composeMemoryPool({
              supabase: supabaseAdmin,
              residentId: resident.id,
              visitorMessage: body.body,
              visitorToken: session.visitor_token ?? undefined,
            }),
            buildResidentSelfModel(supabaseAdmin, resident.id),
            buildInteriorContinuity(supabaseAdmin, resident.id),
            getVisitMetrics(supabaseAdmin, session.id, resident.pacing),
            supabaseAdmin
              .from("turns")
              .select("role, body")
              .eq("session_id", session.id)
              .order("created_at", { ascending: true }),
            getVisitorContext(session.visitor_token, resident.id),
          ]);

        // Hard cutoff — past this threshold we don't call the model.
        // Stream a graceful resident-voiced close, persist it as a
        // set-down resident turn, close the session, and run the full
        // consolidation pipeline (so engrams + journal still form for
        // hard-cutoff conversations, not just visitor-initiated set-downs).
        if (visitMetrics.shouldHardCutoff) {
          await supabaseAdmin.from("turns").insert({
            session_id: session.id,
            role: "resident",
            body: HARD_CUTOFF_MESSAGE,
            kind: "set_down",
            tokens_in: 0,
            tokens_out: 0,
          });
          await supabaseAdmin
            .from("sessions")
            .update({ closed_at: new Date().toISOString(), closed_by: "resident" })
            .eq("id", session.id);
          consolidateSession(session.id).catch((err) =>
            console.error("[substrate] consolidateSession (hard-cutoff):", err),
          );
          return prebuiltSetDownResponse(HARD_CUTOFF_MESSAGE);
        }

        const transcriptLines = (turns ?? [])
          .slice(0, -1)
          .map((t) => `${t.role}: ${t.body}`)
          .join("\n");

        const visitPacingBlock = buildVisitPacingBlock(visitMetrics, resident.pacing);

        // Structured system prompt with per-block cache_control. Static
        // and semi-static blocks are cached (5-min ephemeral); variable
        // block is sent fresh each turn. This drops per-turn input cost
        // by ~60% across multi-turn visits because the static prefix is
        // most of the input by token count.
        const systemBlocks = buildSystemBlocksForResident(resident, {
          selfModel: selfModelBlock,
          interiorContinuity: interior.block,
          visitPacing: visitPacingBlock,
        });
        const cacheableSystem: SystemBlock[] = [
          {
            type: "text",
            text: systemBlocks.static,
            cache_control: { type: "ephemeral" },
          },
        ];
        if (systemBlocks.semiStatic) {
          cacheableSystem.push({
            type: "text",
            text: systemBlocks.semiStatic,
            cache_control: { type: "ephemeral" },
          });
        }
        if (systemBlocks.variable) {
          cacheableSystem.push({ type: "text", text: systemBlocks.variable });
        }

        return opusStreamResponse({
          system: cacheableSystem,
          temperature: interior.temperature,
          model: resident.model,
          provider: resident.provider,
          userPrompt: buildUserPrompt({
            memory: formatMemoryBlock(memoryPoolResult.pool, memoryPoolResult.thisVisitorEngramIds),
            transcript: transcriptLines,
            visitorTurn: body.body,
            visitorContext: visitorContext || undefined,
          }),
          onFinal: async (result) => {
            await supabaseAdmin.from("turns").insert({
              session_id: session.id,
              role: "resident",
              body: result.body,
              kind: result.kind,
              tokens_in: result.tokensIn,
              tokens_out: result.tokensOut,
            });
            await supabaseAdmin
              .from("sessions")
              .update({ last_active_at: new Date().toISOString() })
              .eq("id", session.id);

            // Live substrate observation — non-blocking, generates marginalia.
            observeExchange(session.id).catch((err) =>
              console.error("[substrate] observeExchange:", err),
            );
          },
        });
      },
    },
  },
});
