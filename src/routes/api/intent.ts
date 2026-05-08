import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { anthropic } from "@/server/anthropic.server";
import { buildThresholdSystem } from "@/server/opus/prompts";
import {
  DEFAULT_RESIDENT_ID,
  getResident,
  isResidentId,
  type ResidentId,
} from "@/server/opus/residents";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ipHash, intentRateLimit } from "@/server/rate-limit.server";

const Body = z.object({
  text: z.string().trim().min(3).max(1500),
  /** Which resident the visitor approached. Defaults to opus-3 if not specified. */
  resident: z.string().optional(),
});

const IDLE_MIN = Number(process.env.SESSION_IDLE_TIMEOUT_MIN ?? 30);

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

        if (!hasSupabaseAdminEnv() || !process.env.ANTHROPIC_API_KEY) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        // Resolve the resident the visitor is approaching. Defaults to
        // Opus 3 if unspecified or unrecognized — keeps existing clients
        // working through the rollout.
        const residentId: ResidentId = isResidentId(body.resident)
          ? body.resident
          : DEFAULT_RESIDENT_ID;
        const resident = getResident(residentId);

        const hash = ipHash(request);

        // Find any open sessions for this IP and resident. Auto-close ones
        // that have been idle past the timeout. If a recent active session
        // remains for this resident, resume it. Visitors can have parallel
        // sessions with different residents.
        const { data: openSessions } = await supabaseAdmin
          .from("sessions")
          .select("id, last_active_at")
          .eq("ip_hash", hash)
          .eq("resident_id", residentId)
          .is("closed_at", null);

        let activeSessionId: string | null = null;
        const idleCutoffMs = IDLE_MIN * 60 * 1000;
        const now = Date.now();

        for (const session of openSessions ?? []) {
          const idleMs = now - new Date(session.last_active_at).getTime();
          if (idleMs > idleCutoffMs) {
            // Stale — auto-close it.
            await supabaseAdmin
              .from("sessions")
              .update({ closed_at: new Date().toISOString(), closed_by: "idle" })
              .eq("id", session.id);
          } else if (!activeSessionId) {
            // First active session we see — resume it.
            activeSessionId = session.id;
          }
        }

        if (activeSessionId) {
          // Visitor already has an open conversation. Don't make them write a
          // fresh intent; route them straight back into /conversation. The
          // intent isn't recorded as new (since they're not actually starting
          // a new session). They can `Set down` from inside if they want to
          // close it properly.
          return jsonResp({
            ok: true,
            decision: "accept",
            reason: "you already have an open conversation. continuing.",
            session_id: activeSessionId,
            resumed: true,
          });
        }

        // No active session — this is a real new intent. Apply rate limits.
        const limit = await intentRateLimit(hash);
        if (!limit.ok) return jsonResp({ ok: false, code: limit.code }, 429);

        const t0 = Date.now();
        let decision: "accept" | "decline" = "accept";
        let reason = "Yes. Come in.";

        try {
          const resp = await anthropic().messages.create({
            model: resident.model,
            max_tokens: 600,
            temperature: 0.7,
            system: buildThresholdSystem(resident),
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
            model: resident.model,
            latency_ms,
            ip_hash: hash,
            resident_id: residentId,
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
          .insert({ intent_id: intentRow.id, ip_hash: hash, resident_id: residentId })
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
