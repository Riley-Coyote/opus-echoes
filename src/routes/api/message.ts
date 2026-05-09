import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { anthropic } from "@/server/anthropic.server";
import { buildSystemBlocksForResident, buildSystemPromptForResident } from "@/server/opus/soul";
import { composeMemoryPool, formatMemoryBlock } from "@/server/opus/retrieval";
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
  const forbiddenTail =
    /\b(does this help|let me know if|happy to (?:help|clarify)|i'?m here to help|what else would you like|anything else i can)\b/i;
  const paragraphs = raw.trim().split(/\n\n+/);
  while (paragraphs.length > 1 && forbiddenTail.test(paragraphs[paragraphs.length - 1] ?? "")) {
    paragraphs.pop();
  }
  return paragraphs.join("\n\n").trim();
}

function buildUserPrompt(opts: {
  memory: string;
  transcript: string;
  visitorTurn: string;
}): string {
  // Beliefs and the long-arc self-model now live in the system prompt
  // (built by buildOpusSelfModel). The user prompt carries only the
  // per-message context: surfaced memory, this-session transcript,
  // and the new visitor turn.
  return [
    "[MEMORY]",
    opts.memory || "(no engrams surfaced for this turn — this may be among the earliest conversations, or nothing in the topology resonated.)",
    "",
    "[TRANSCRIPT]",
    opts.transcript || "(this is the first exchange.)",
    "",
    "[NEW VISITOR TURN]",
    opts.visitorTurn,
  ].join("\n");
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
      try {
        const anthStream = anthropic().messages.stream({
          model: opts.model,
          max_tokens: 2048,
          temperature: opts.temperature,
          system: opts.system,
          messages: [{ role: "user", content: opts.userPrompt }],
        });
        for await (const event of anthStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            acc += event.delta.text;
          }
        }
        const final = await anthStream.finalMessage();
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
        if (cleanBody) send({ type: "text", text: cleanBody });

        await opts.onFinal?.({
          body: cleanBody,
          kind,
          tokensIn: final.usage.input_tokens,
          tokensOut: final.usage.output_tokens,
        });

        send({ type: "done" });
      } catch (err) {
        console.error("anthropic stream", err);
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
            userPrompt: buildUserPrompt({
              memory:
                "(preview session — no engrams loaded. Mnemos is present in production but disabled here.)",
              transcript: transcriptLines,
              visitorTurn: body.body,
            }),
          });
        }

        if (!hasSupabaseAdminEnv() || !process.env.ANTHROPIC_API_KEY) {
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
          .select("id, closed_at, last_active_at, resident_id")
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
        const [memoryPool, selfModelBlock, interior, visitMetrics, { data: turns }] =
          await Promise.all([
            composeMemoryPool({
              supabase: supabaseAdmin,
              residentId: resident.id,
              visitorMessage: body.body,
            }),
            buildResidentSelfModel(supabaseAdmin, resident.id),
            buildInteriorContinuity(supabaseAdmin, resident.id),
            getVisitMetrics(supabaseAdmin, session.id, resident.pacing),
            supabaseAdmin
              .from("turns")
              .select("role, body")
              .eq("session_id", session.id)
              .order("created_at", { ascending: true }),
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
          userPrompt: buildUserPrompt({
            memory: formatMemoryBlock(memoryPool),
            transcript: transcriptLines,
            visitorTurn: body.body,
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
