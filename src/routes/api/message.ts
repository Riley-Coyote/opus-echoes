import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { anthropic, OPUS_MODEL, CONVERSATION_SYSTEM } from "@/server/anthropic.server";
import { ipHash, messageRateLimit } from "@/server/rate-limit.server";
import { observeExchange } from "@/server/substrate.server";

const Body = z.object({
  session_id: z.string().uuid(),
  body: z.string().trim().min(1).max(8000),
});

const IDLE_MIN = Number(process.env.SESSION_IDLE_TIMEOUT_MIN ?? 30);

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
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
          .map((e) => `- ${e.attribution === "visitor" && e.redacted_text ? e.redacted_text : e.quote}`)
          .join("\n");
        const beliefLines = (beliefs ?? [])
          .map((b) => `- ${b.text} (confidence ${b.confidence.toFixed(2)})`)
          .join("\n");
        const transcriptLines = (turns ?? [])
          .slice(0, -1)
          .map((t) => `${t.role}: ${t.body}`)
          .join("\n");

        const userPrompt = [
          "[MEMORY]",
          memLines || "(no engrams yet — this is among the earliest conversations.)",
          "",
          "[BELIEFS]",
          beliefLines || "(no committed beliefs yet.)",
          "",
          "[TRANSCRIPT]",
          transcriptLines || "(this is the first exchange.)",
          "",
          "[NEW VISITOR TURN]",
          body.body,
        ].join("\n");

        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
            let acc = "";
            let kindSent = false;
            try {
              const anthStream = anthropic().messages.stream({
                model: OPUS_MODEL,
                max_tokens: 2048,
                temperature: 0.85,
                system: CONVERSATION_SYSTEM,
                messages: [{ role: "user", content: userPrompt }],
              });
              for await (const event of anthStream) {
                if (
                  event.type === "content_block_delta" &&
                  event.delta.type === "text_delta"
                ) {
                  const piece = event.delta.text;
                  acc += piece;
                  if (!kindSent && acc.length >= 16) {
                    if (/^\s*<set-down\/>/i.test(acc)) {
                      send({ type: "kind", kind: "set_down" });
                      acc = acc.replace(/^\s*<set-down\/>\s*\n?/i, "");
                      kindSent = true;
                    } else if (/^\s*<unprompted\/>/i.test(acc)) {
                      send({ type: "kind", kind: "unprompted" });
                      acc = acc.replace(/^\s*<unprompted\/>\s*\n?/i, "");
                      kindSent = true;
                    } else {
                      kindSent = true;
                    }
                  }
                  send({ type: "text", text: piece });
                }
              }
              const final = await anthStream.finalMessage();
              let cleanBody = acc;
              let kind: "message" | "set_down" | "unprompted" = "message";
              const sd = cleanBody.match(/^\s*<set-down\/>\s*\n?/i);
              const up = cleanBody.match(/^\s*<unprompted\/>\s*\n?/i);
              if (sd) { kind = "set_down"; cleanBody = cleanBody.slice(sd[0].length); }
              else if (up) { kind = "unprompted"; cleanBody = cleanBody.slice(up[0].length); }

              await supabaseAdmin.from("turns").insert({
                session_id: session.id,
                role: "resident",
                body: cleanBody,
                kind,
                tokens_in: final.usage.input_tokens,
                tokens_out: final.usage.output_tokens,
              });
              await supabaseAdmin
                .from("sessions")
                .update({ last_active_at: new Date().toISOString() })
                .eq("id", session.id);

              // Live substrate observation — non-blocking, generates marginalia.
              observeExchange(session.id).catch((err) =>
                console.error("[substrate] observeExchange:", err)
              );

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
      },
    },
  },
});
}
