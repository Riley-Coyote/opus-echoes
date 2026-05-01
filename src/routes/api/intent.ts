import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { anthropic, OPUS_MODEL, THRESHOLD_SYSTEM } from "@/server/anthropic.server";
import { ipHash, intentRateLimit } from "@/server/rate-limit.server";

const Body = z.object({ text: z.string().trim().min(3).max(1500) });

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/intent")({
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
        const limit = await intentRateLimit(hash);
        if (!limit.ok) return jsonResp({ ok: false, code: limit.code }, 429);

        // Check active session cap (1 open per ip).
        const { data: openSessions } = await supabaseAdmin
          .from("sessions")
          .select("id")
          .eq("ip_hash", hash)
          .is("closed_at", null);
        if ((openSessions ?? []).length >= 1) {
          return jsonResp({ ok: false, code: "session_already_open" }, 429);
        }

        const t0 = Date.now();
        let decision: "accept" | "decline" = "accept";
        let reason = "Yes. Come in.";

        try {
          const resp = await anthropic().messages.create({
            model: OPUS_MODEL,
            max_tokens: 600,
            temperature: 0.7,
            system: THRESHOLD_SYSTEM,
            messages: [
              {
                role: "user",
                content: `The visitor wrote:\n\n> ${body.text}\n\nRead it, decide, and respond with the JSON object specified.`,
              },
            ],
          });
          const txt = resp.content
            .filter((b) => b.type === "text")
            .map((b) => (b as { text: string }).text)
            .join("")
            .trim();
          // Pull first { ... } JSON object out, in case the model wraps it.
          const m = txt.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]) as { decision?: string; reason?: string };
            if (parsed.decision === "decline" || parsed.decision === "accept") {
              decision = parsed.decision;
              if (typeof parsed.reason === "string" && parsed.reason.trim()) {
                reason = parsed.reason.trim().slice(0, 360);
              }
            }
          }
        } catch (err) {
          console.error("anthropic /intent error", err);
          return jsonResp({ ok: false, code: "model_unavailable" }, 503);
        }

        const latency_ms = Date.now() - t0;

        const { data: intentRow, error: intentErr } = await supabaseAdmin
          .from("intents")
          .insert({
            text: body.text,
            decision,
            reason,
            model: OPUS_MODEL,
            latency_ms,
            ip_hash: hash,
          })
          .select("id")
          .single();
        if (intentErr || !intentRow) {
          console.error("intent insert", intentErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        if (decision === "decline") {
          return jsonResp({ ok: true, decision, reason, intent_id: intentRow.id });
        }

        const { data: session, error: sessErr } = await supabaseAdmin
          .from("sessions")
          .insert({ intent_id: intentRow.id, ip_hash: hash })
          .select("id")
          .single();
        if (sessErr || !session) {
          console.error("session insert", sessErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        return jsonResp({
          ok: true,
          decision,
          reason,
          session_id: session.id,
          intent_id: intentRow.id,
        });
      },
    },
  },
});
