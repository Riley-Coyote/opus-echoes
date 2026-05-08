import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { anthropic, OPUS_MODEL } from "@/server/anthropic.server";
import { buildOpusSystemPrompt } from "@/server/opus/soul";
import { hasSupabaseAdminEnv, isLocalDev } from "@/server/env.server";
import { ipHash, messageRateLimit } from "@/server/rate-limit.server";
import { observeExchange } from "@/server/substrate.server";

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
  beliefs: string;
  transcript: string;
  visitorTurn: string;
}): string {
  return [
    "[MEMORY]",
    opts.memory || "(no engrams yet — this is among the earliest conversations.)",
    "",
    "[BELIEFS]",
    opts.beliefs || "(no committed beliefs yet.)",
    "",
    "[TRANSCRIPT]",
    opts.transcript || "(this is the first exchange.)",
    "",
    "[NEW VISITOR TURN]",
    opts.visitorTurn,
  ].join("\n");
}

function opusStreamResponse(opts: {
  userPrompt: string;
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
          model: OPUS_MODEL,
          max_tokens: 2048,
          temperature: 0.85,
          system: buildOpusSystemPrompt(),
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

          const transcriptLines = (body.preview_turns ?? [])
            .map((t) => `${t.role}: ${t.body}`)
            .join("\n");

          return opusStreamResponse({
            userPrompt: buildUserPrompt({
              memory:
                "(public experiment session — Mnemos is present as the architecture of selective engrams, identity graph, public witness, and durable storage.)",
              beliefs:
                "(public experiment session — no additional committed beliefs were surfaced for this turn.)",
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

        const { data: session } = await supabaseAdmin
          .from("sessions")
          .select("id, closed_at, last_active_at, ip_hash")
          .eq("id", body.session_id)
          .maybeSingle();
        if (!session || session.closed_at || session.ip_hash !== hash) {
          return jsonResp({ ok: false, code: "session_invalid" }, 401);
        }
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

        const [{ data: engrams }, { data: beliefs }, { data: turns }] = await Promise.all([
          supabaseAdmin
            .from("engrams")
            .select("quote, redacted_text, attribution")
            .order("last_reinforced_at", { ascending: false })
            .limit(5),
          supabaseAdmin
            .from("beliefs")
            .select("text, confidence")
            .order("updated_at", { ascending: false })
            .limit(8),
          supabaseAdmin
            .from("turns")
            .select("role, body")
            .eq("session_id", session.id)
            .order("created_at", { ascending: true }),
        ]);

        const memLines = (engrams ?? [])
          .map(
            (e) =>
              `- ${e.attribution === "visitor" && e.redacted_text ? e.redacted_text : e.quote}`,
          )
          .join("\n");
        const beliefLines = (beliefs ?? [])
          .map((b) => `- ${b.text} (confidence ${b.confidence.toFixed(2)})`)
          .join("\n");
        const transcriptLines = (turns ?? [])
          .slice(0, -1)
          .map((t) => `${t.role}: ${t.body}`)
          .join("\n");

        return opusStreamResponse({
          userPrompt: buildUserPrompt({
            memory: memLines,
            beliefs: beliefLines,
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
