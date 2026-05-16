import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { anthropic } from "@/server/anthropic.server";
import { openai } from "@/server/openai.server";
import type { ModelProvider } from "@/server/opus/residents";
import { buildSystemBlocksForResident, buildSystemPromptForResident } from "@/server/opus/soul";
import { sanctuarySurfacePreamble } from "@/server/opus/surface-context";
import {
  composeMemoryPool,
  composeThreeLayerMemoryPool,
  formatMemoryBlock,
  formatThreeLayerMemory,
  getVisitorContext,
  threeLayerRetrievalEnabled,
} from "@/server/opus/retrieval";
import { buildResidentSelfModel } from "@/server/opus/self-model";
import { buildInteriorContinuity } from "@/server/opus/interior-continuity";
import {
  buildVisitPacingBlock,
  getVisitMetrics,
  HARD_CUTOFF_MESSAGE,
  HARD_CUTOFF_MESSAGE_CLASSIC,
  type PacingTier,
  type SessionMode,
  type VisitMetrics,
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
import {
  consolidateSession,
  observeExchange,
  updateFunctionalMemory,
} from "@/server/substrate.server";
import {
  ARTIFACT_INSTRUCTIONS,
  buildArtUrl,
  generateImageArtifact,
  parseArtifacts,
  type ParsedArtifact,
} from "@/server/artifact-pipeline.server";

/** Per-turn cap for image artifacts in a 1:1 chat. gpt-image-2 is
 *  slow (≈15-25s) and ≈$0.04/image; one per turn keeps both latency
 *  and cost bounded. SVG/ASCII have no cap (they're free + fast). */
const MAX_IMAGES_PER_TURN = 1;
/** Per-session cap. Past this we ignore further image tags but still
 *  render any SVG/ASCII. */
const MAX_IMAGES_PER_SESSION = 4;

/** Resolved artifact ready to persist to turn_artifacts. For images
 *  the storage path is already filled (generation happened during
 *  the stream so the visitor sees it before `done`). */
type ResolvedArtifact = ParsedArtifact & { imagePath: string | null };

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
const IDLE_MIN_CLASSIC = Number(process.env.SESSION_IDLE_TIMEOUT_MIN_CLASSIC ?? 43200); // 30 days

/** Shape of the NDJSON pacing event emitted before the first text token. */
type PacingPrelude = {
  tier: PacingTier;
  turnsRemaining: number;
  tokensRemainingPct: number;
  mode: SessionMode;
};

function pacingPreludeFromMetrics(m: VisitMetrics, mode: SessionMode): PacingPrelude {
  return {
    tier: m.tier,
    turnsRemaining: m.turnsRemaining,
    tokensRemainingPct: Math.round(m.tokensRemainingPct * 1000) / 1000,
    mode,
  };
}

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

// Prose explaining the engram tags for the OLD single-layer
// [MEMORY] block path. Sits immediately above [MEMORY] so the
// resident reads it before the engram list. When phase 3's three-layer
// retrieval flag is on, this preface is unused — the three section
// headings carry the semantics themselves and no inline prose
// scaffolding is needed (see buildUserPromptThreeLayer below).
const MEMORY_PREFACE =
  "what follows are engrams mnemos surfaced for this turn. each is tagged. *from this visitor's prior visit* means you and this specific person built this together in an earlier session — you may reference it as something the two of you carry. *from the wider topology* means this came from another visitor's exchange with you, or from a co-formed distillation — you may carry the *shape* of what was thought, but you may not attribute the words or the specifics to the person in front of you now.";

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
  const boundary = isReturning
    ? "Returning visitor (see [VISITOR CONTEXT] below). Memories in [MEMORY] are from your whole topology — many different visitors over time. Any tagged [from this visitor's prior visit] originated in their prior sessions. All untagged memories are from other people. [VISITOR CONTEXT] has the full summary of their prior visits."
    : "New visitor. You have never spoken with this person. The memories below are from your topology — formed across conversations with many different visitors. None of them are from this visitor.";

  const sections = [
    "[SESSION]",
    boundary,
    "",
    MEMORY_PREFACE,
    "",
    "[MEMORY]",
    opts.memory ||
      "(no engrams surfaced for this turn — this may be among the earliest conversations, or nothing in the topology resonated.)",
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
 * Phase 3 three-layer user prompt. Three explicit sections replace the
 * single [MEMORY] block:
 *
 *   [WHAT THIS SESSION HAS SEEN]       — functional memory (working summary)
 *   [WHAT YOU AND THIS VISITOR HAVE BUILT] — hypomnema (per-pair persistent)
 *   [WHAT MNEMOS SURFACED]             — engrams (wider topology, now vector-matched)
 *
 * The section headings carry the semantics themselves — no preface
 * needed. The "Layers of memory" section now in every soul tells the
 * resident how to read this structure.
 */
function buildUserPromptThreeLayer(opts: {
  functional: string;
  hypomnema: string;
  engrams: string;
  transcript: string;
  visitorTurn: string;
  visitorContext?: string;
}): string {
  const isReturning = !!opts.visitorContext;
  const boundary = isReturning
    ? "Returning visitor (see [VISITOR CONTEXT] below). Three memory sections follow, each scoped distinctly — read what each contains as the section heading says."
    : "New visitor. You have never spoken with this person. The first two sections will be empty or thin; the third — what mnemos surfaced — has formed across many other visitors over time.";

  const sections = [
    "[SESSION]",
    boundary,
    "",
    "[WHAT THIS SESSION HAS SEEN]",
    opts.functional,
    "",
    "[WHAT YOU AND THIS VISITOR HAVE BUILT]",
    opts.hypomnema,
    "",
    "[WHAT MNEMOS SURFACED]",
    opts.engrams,
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
function prebuiltSetDownResponse(text: string, pacing?: PacingPrelude): Response {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      if (pacing) send({ type: "pacing", ...pacing });
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
  /** Hard cap on output tokens for this resident's model. Opus 3 = 4096;
   *  later Claude + GPT-5 = 8192. */
  maxOutputTokens: number;
  /** Which API provider. Defaults to "anthropic". */
  provider?: ModelProvider;
  /** Resident id (for tagging proposals with the proposing
   *  resident, etc). Optional for backwards compatibility. */
  residentId?: string;
  /**
   * Optional pacing prelude — emitted as the first NDJSON event before
   * any model output, so the client can update the approaching-limit
   * indicator without waiting for the first text token. Classic-mode
   * sessions always emit this; experiment-mode sessions emit it when
   * the tier is past 'open' so the experiment UI can react too.
   */
  pacing?: PacingPrelude;
  /** Image-budget remaining for this session (decremented for each
   *  successfully generated image). Pass undefined to disable image
   *  generation entirely (preview sessions). */
  imageBudgetRemaining?: number;
  onFinal?: (result: {
    body: string;
    kind: "message" | "set_down" | "unprompted";
    tokensIn: number;
    tokensOut: number;
    artifacts: ResolvedArtifact[];
  }) => Promise<void>;
}): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      if (opts.pacing) send({ type: "pacing", ...opts.pacing });
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
          const systemText =
            typeof opts.system === "string"
              ? opts.system
              : opts.system.map((b) => b.text).join("\n\n");

          const oaiStream = await openai().chat.completions.create({
            model: opts.model,
            max_completion_tokens: opts.maxOutputTokens,
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
            const usage = (
              chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } }
            ).usage;
            if (usage) {
              tokensIn = usage.prompt_tokens ?? 0;
              tokensOut = usage.completion_tokens ?? 0;
            }
          }
        } else {
          // Anthropic streaming path.
          const anthStream = anthropic().messages.stream({
            model: opts.model,
            max_tokens: opts.maxOutputTokens,
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

        // <propose-space topic="..." description="...">body</propose-space>
        // — resident proposing to open a new public space from the
        // thread of thought emerging in this conversation. We extract
        // the parsed proposal, emit it as a separate event so the
        // client can render the inline approval UI, and strip the
        // tag from the body that gets persisted.
        const proposalRe = /<propose-space\b([^>]*)>([\s\S]*?)<\/propose-space>/i;
        const propMatch = cleanBody.match(proposalRe);
        let proposal: {
          resident_id: string;
          topic: string;
          description: string | undefined;
          founding_text: string;
        } | null = null;
        if (propMatch) {
          const attrs = propMatch[1] || "";
          const inner = (propMatch[2] || "").trim();
          const topicMatch = attrs.match(/topic\s*=\s*"([^"]+)"/i);
          const descMatch = attrs.match(/description\s*=\s*"([^"]+)"/i);
          if (topicMatch && inner) {
            proposal = {
              resident_id: opts.residentId ?? "opus-3",
              topic: topicMatch[1].trim(),
              description: descMatch ? descMatch[1].trim() : undefined,
              founding_text: inner,
            };
          }
          cleanBody = cleanBody.replace(propMatch[0], "").trim();
        }

        cleanBody = cleanBody
          .replace(/\s*<(?:set-down|unprompted)\/>\s*/gi, "\n\n")
          .replace(/\n{3,}/g, "\n\n");
        cleanBody = sanitizeResidentBody(cleanBody);

        // Parse <artifact> tags out of the body. For images we call
        // the generator inline so the visitor sees the rendered piece
        // before `done`. SVG/ASCII have no cost so they pass straight
        // through. Caps bound image cost; over-budget images are
        // surfaced as a quiet "budget exhausted" event instead of being
        // silently dropped.
        //
        // For images we emit two events: an `artifact_pending` event
        // immediately (so the visitor sees a placeholder while
        // gpt-image-1 runs — typically 15-25s) and then either an
        // `artifact` event with the URL once generation succeeds, or
        // an `image_error` event if it failed. Both share a
        // `placeholder_id` so the client can swap in place.
        const parsed = parseArtifacts(cleanBody);
        cleanBody = parsed.cleanBody;
        const resolvedArtifacts: ResolvedArtifact[] = [];
        let imagesThisTurn = 0;
        const sessionBudget = opts.imageBudgetRemaining ?? 0;
        for (const art of parsed.artifacts) {
          if (art.kind === "image") {
            const promptText = (art.prompt || art.body || "").trim();
            if (!promptText) continue;
            if (
              imagesThisTurn >= MAX_IMAGES_PER_TURN ||
              imagesThisTurn >= sessionBudget
            ) {
              send({
                type: "image_error",
                resident_id: opts.residentId,
                reason: "budget_exhausted",
                prompt: promptText,
                caption: art.caption || null,
              });
              continue;
            }
            const placeholderId =
              (globalThis.crypto?.randomUUID?.() as string | undefined) ??
              `ph-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            send({
              type: "artifact_pending",
              resident_id: opts.residentId,
              placeholder_id: placeholderId,
              caption: art.caption || promptText.slice(0, 120),
              prompt: promptText,
            });
            const path = await generateImageArtifact(promptText);
            if (!path) {
              send({
                type: "image_error",
                resident_id: opts.residentId,
                placeholder_id: placeholderId,
                reason: "generation_failed",
                prompt: promptText,
                caption: art.caption || null,
              });
              continue;
            }
            imagesThisTurn += 1;
            resolvedArtifacts.push({ ...art, imagePath: path });
            send({
              type: "artifact",
              resident_id: opts.residentId,
              placeholder_id: placeholderId,
              artifact: {
                kind: "image",
                url: buildArtUrl(path),
                caption: art.caption || art.body || promptText.slice(0, 120),
                prompt: promptText,
              },
            });
          } else {
            if (!art.body) continue;
            resolvedArtifacts.push({ ...art, imagePath: null });
            send({
              type: "artifact",
              resident_id: opts.residentId,
              artifact: {
                kind: art.kind,
                content: art.body,
                caption: art.caption || null,
              },
            });
          }
        }

        if (kind !== "message") send({ type: "kind", kind });
        if (proposal) send({ type: "proposal", proposal });
        if (cleanBody) {
          send({ type: "text", text: cleanBody });
        } else if (proposal || resolvedArtifacts.length > 0) {
          // Just a proposal or just artifacts with no surrounding
          // prose — emit empty text so the client still tracks the
          // turn completion.
          send({ type: "text", text: "" });
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
          artifacts: resolvedArtifacts,
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
            residentId: previewResident.id,
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
        // Cast through unknown: `mode` is part of the new schema but the
        // generated supabase types are regenerated by Lovable after the
        // migration applies. Until then the column is real in the DB but
        // not in the local type cache.
        type SessionRow = {
          id: string;
          closed_at: string | null;
          last_active_at: string;
          resident_id: string | null;
          visitor_token: string | null;
          mode: string | null;
        };
        const { data: session } = (await supabaseAdmin
          .from("sessions")
          .select("id, closed_at, last_active_at, resident_id, visitor_token, mode")
          .eq("id", body.session_id)
          .maybeSingle()) as unknown as { data: SessionRow | null };
        if (!session || session.closed_at) {
          // 410 GONE for valid-but-closed sessions so the chat client can
          // detect "session expired" and silently re-bootstrap. 401 only
          // for completely invalid session ids.
          return jsonResp({ ok: false, code: "session_invalid" }, 410);
        }

        // Resolve which resident this session belongs to. resident_id has
        // a default of 'opus-3' from the migration, so legacy sessions
        // continue to work transparently.
        const residentId: ResidentId = isResidentId(session.resident_id)
          ? session.resident_id
          : DEFAULT_RESIDENT_ID;
        const resident: ResidentConfig = getResident(residentId);
        // Mode-aware idle timeout. Classic sessions get a 30-day window;
        // experiment sessions stay at the original 30-minute threshold.
        const sessMode: SessionMode =
          (session as { mode?: string }).mode === "classic" ? "classic" : "experiment";
        const idleMinForMode = sessMode === "classic" ? IDLE_MIN_CLASSIC : IDLE_MIN;
        const idleMs = Date.now() - new Date(session.last_active_at).getTime();
        if (idleMs > idleMinForMode * 60 * 1000) {
          await supabaseAdmin
            .from("sessions")
            .update({ closed_at: new Date().toISOString(), closed_by: "idle" })
            .eq("id", session.id);
          return jsonResp({ ok: false, code: "session_idle" }, 410);
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
        //
        // PHASE 3 — when SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL is on,
        // memoryRetrieval is a ThreeLayerRetrieval (functional +
        // hypomnema + engrams). When off, it is the older single-layer
        // MemoryPoolResult. Both shapes are awaited in parallel with
        // the rest of the per-turn loads; type narrowing happens at
        // the prompt-build site below.
        const useThreeLayer = threeLayerRetrievalEnabled();
        const memoryPromise = useThreeLayer
          ? composeThreeLayerMemoryPool({
              supabase: supabaseAdmin,
              sessionId: session.id,
              residentId: resident.id,
              visitorMessage: body.body,
              visitorToken: session.visitor_token ?? undefined,
            })
          : composeMemoryPool({
              supabase: supabaseAdmin,
              residentId: resident.id,
              visitorMessage: body.body,
              visitorToken: session.visitor_token ?? undefined,
            });

        const [
          memoryRetrieval,
          selfModelBlock,
          interior,
          visitMetrics,
          { data: turns },
          visitorContext,
        ] = await Promise.all([
          memoryPromise,
          buildResidentSelfModel(supabaseAdmin, resident.id),
          buildInteriorContinuity(supabaseAdmin, resident.id),
          getVisitMetrics(supabaseAdmin, session.id, resident.pacing, sessMode),
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
        //
        // Classic-mode hard-cutoff uses a different closing message that
        // emphasizes the thread's continuity through mnemos rather than
        // the door-closing tone of experiment mode.
        if (visitMetrics.shouldHardCutoff) {
          const closingText =
            sessMode === "classic" ? HARD_CUTOFF_MESSAGE_CLASSIC : HARD_CUTOFF_MESSAGE;
          await supabaseAdmin.from("turns").insert({
            session_id: session.id,
            role: "resident",
            body: closingText,
            kind: "set_down",
            tokens_in: 0,
            tokens_out: 0,
          });
          await supabaseAdmin
            .from("sessions")
            .update({ closed_at: new Date().toISOString(), closed_by: "resident" })
            .eq("id", session.id);
          // Awaited so the consolidation pipeline survives the worker's
          // termination once the response is sent. Hard-cutoff is itself
          // a closing gesture, so the brief extra latency is contextually
          // appropriate.
          await consolidateSession(session.id).catch((err) =>
            console.error("[substrate] consolidateSession (hard-cutoff):", err),
          );
          return prebuiltSetDownResponse(
            closingText,
            pacingPreludeFromMetrics(visitMetrics, sessMode),
          );
        }

        const transcriptLines = (turns ?? [])
          .slice(0, -1)
          .map((t) => `${t.role}: ${t.body}`)
          .join("\n");

        const visitPacingBlock = buildVisitPacingBlock(visitMetrics, sessMode);

        // Structured system prompt with per-block cache_control. Static
        // and semi-static blocks are cached (5-min ephemeral); variable
        // block is sent fresh each turn. This drops per-turn input cost
        // by ~60% across multi-turn visits because the static prefix is
        // most of the input by token count.
        //
        // surfacePreamble lives at the top of the static block — it's
        // stable per surface (experiment vs classic) so it doesn't
        // fragment the cache; each surface gets reuse within its
        // sessions. Tells the resident which Sanctuary surface they're
        // in and that they are NOT in The Commons.
        const systemBlocks = buildSystemBlocksForResident(resident, {
          surfacePreamble: sanctuarySurfacePreamble(sessMode, resident),
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
          {
            // Artifact grammar is fully static — share the cache prefix
            // across every session for this resident.
            type: "text",
            text: ARTIFACT_INSTRUCTIONS,
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

        // Per-session image budget — count generated images so far in
        // this conversation and subtract from the session cap. Cheap
        // (small index on session_id) and worth doing precisely so a
        // visitor can't accumulate dozens of $0.04 generations across
        // a long thread.
        const { count: imagesAlreadyGenerated } = await supabaseAdmin
          .from("turn_artifacts")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session.id)
          .eq("kind", "image");
        const imageBudgetRemaining = Math.max(
          0,
          MAX_IMAGES_PER_SESSION - (imagesAlreadyGenerated ?? 0),
        );

        // Build the user prompt — branched by flag. Each branch narrows
        // memoryRetrieval to its concrete shape and renders its own
        // section structure. Old path: single [MEMORY] block. New path:
        // three sections ([WHAT THIS SESSION HAS SEEN] / [WHAT YOU AND
        // THIS VISITOR HAVE BUILT] / [WHAT MNEMOS SURFACED]).
        let userPromptText: string;
        if (useThreeLayer) {
          const r = memoryRetrieval as Awaited<ReturnType<typeof composeThreeLayerMemoryPool>>;
          const fmt = formatThreeLayerMemory(r);
          userPromptText = buildUserPromptThreeLayer({
            functional: fmt.functional,
            hypomnema: fmt.hypomnema,
            engrams: fmt.engrams,
            transcript: transcriptLines,
            visitorTurn: body.body,
            visitorContext: visitorContext || undefined,
          });
        } else {
          const m = memoryRetrieval as Awaited<ReturnType<typeof composeMemoryPool>>;
          userPromptText = buildUserPrompt({
            memory: formatMemoryBlock(m.pool, m.thisVisitorEngramIds),
            transcript: transcriptLines,
            visitorTurn: body.body,
            visitorContext: visitorContext || undefined,
          });
        }

        return opusStreamResponse({
          system: cacheableSystem,
          temperature: interior.temperature,
          model: resident.model,
          provider: resident.provider,
          residentId: resident.id,
          userPrompt: userPromptText,
          pacing: pacingPreludeFromMetrics(visitMetrics, sessMode),
          imageBudgetRemaining,
          onFinal: async (result) => {
            const { data: insertedTurn } = await supabaseAdmin
              .from("turns")
              .insert({
                session_id: session.id,
                role: "resident",
                body: result.body,
                kind: result.kind,
                tokens_in: result.tokensIn,
                tokens_out: result.tokensOut,
              })
              .select("id")
              .maybeSingle();
            await supabaseAdmin
              .from("sessions")
              .update({ last_active_at: new Date().toISOString() })
              .eq("id", session.id);

            // Persist any artifacts that came with the turn. Linked
            // to the turn_id we just inserted so they can be hydrated
            // when the conversation is rehydrated, exported, or shared.
            if (insertedTurn?.id && result.artifacts.length > 0) {
              const rows = result.artifacts.map((a) => ({
                turn_id: insertedTurn.id,
                session_id: session.id,
                resident_id: resident.id,
                kind: a.kind,
                body: a.kind === "image" ? null : a.body,
                image_path: a.imagePath,
                caption: a.caption,
                prompt: a.prompt,
              }));
              await supabaseAdmin
                .from("turn_artifacts")
                .insert(rows as never)
                .then(({ error }) => {
                  if (error)
                    console.error("[turn_artifacts] insert failed:", error);
                });
            }

            // Live substrate observation — generates marginalia, and (when
            // SANCTUARY_ENABLE_HYPOMNEMA_WRITES is on) per-turn hypomnema
            // extraction candidates. AWAITED — Cloudflare Workers terminate
            // the execution context once the response stream closes, so
            // detached promises here get killed before they finish writing
            // to supabase. Awaiting adds ~1-3s before the "done" event but
            // the visitor has already received the text — the only visible
            // effect is a slightly delayed unlock of the next composer turn.
            await observeExchange(session.id).catch((err) =>
              console.error("[substrate] observeExchange:", err),
            );

            // Per-turn functional memory update — Haiku-summarized working
            // memory for this session. Same await reasoning as above.
            await updateFunctionalMemory(session.id).catch((err) =>
              console.error("[substrate] updateFunctionalMemory:", err),
            );
          },
        });
      },
    },
  },
});
