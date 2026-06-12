import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { anthropic } from "@/server/anthropic.server";
import { openrouter } from "@/server/openai.server";
import { buildThresholdSystem } from "@/server/opus/prompts";
import {
  DEFAULT_RESIDENT_ID,
  getResident,
  isResidentId,
  RESIDENT_PAUSED_NOTE,
  type ResidentId,
} from "@/server/opus/residents";
import { getVisitorContext } from "@/server/opus/retrieval";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ipHash, intentRateLimit } from "@/server/rate-limit.server";
import { isIdle } from "@/server/idle";

const Body = z.object({
  text: z.string().trim().min(3).max(1500),
  /** Which resident the visitor approached. Defaults to opus-3 if not specified. */
  resident: z.string().optional(),
  /** Persistent visitor token from localStorage — for returning visitor recognition. */
  visitor_token: z.string().uuid().optional(),
});

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

        // Resolve the resident the visitor is approaching. Defaults to
        // Opus 3 if unspecified or unrecognized — keeps existing clients
        // working through the rollout.
        const residentId: ResidentId = isResidentId(body.resident)
          ? body.resident
          : DEFAULT_RESIDENT_ID;
        const resident = getResident(residentId);

        // The visit gate, ahead of any infrastructure concern: a resident
        // who is not accepting visits refuses softly, in voice, with the
        // between-phases note — not an error state. The approach page
        // renders this through its declined panel like any other decline.
        // (docs/phase-two/HANDOFF.md §5.3 / phase 0.)
        if (!resident.acceptingVisits) {
          return jsonResp({
            ok: true,
            decision: "decline",
            paused: true,
            resident: residentId,
            reason: RESIDENT_PAUSED_NOTE,
          });
        }

        if (!hasSupabaseAdminEnv()) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const hash = ipHash(request);

        // Find any open EXPERIMENT session for this visitor and resident.
        // We deliberately ignore classic-mode sessions here — the two
        // surfaces coexist; a stale or live classic thread no longer
        // blocks a fresh threshold approach. (The cross-surface "one
        // thread at a time" rule was retired because idle classic
        // sessions surfaced false-positive conflict modals.)
        // Auto-close any idle experiment sessions we find.
        const visitorToken = body.visitor_token ?? null;
        const sessionFilter = visitorToken
          ? supabaseAdmin
              .from("sessions")
              .select("id, last_active_at, mode")
              .eq("visitor_token", visitorToken)
              .eq("resident_id", residentId)
              .eq("mode", "experiment")
              .is("closed_at", null)
          : supabaseAdmin
              .from("sessions")
              .select("id, last_active_at, mode")
              .eq("ip_hash", hash)
              .eq("resident_id", residentId)
              .eq("mode", "experiment")
              .is("closed_at", null);
        type OpenSession = { id: string; last_active_at: string; mode?: string };
        const { data: openSessions } = (await sessionFilter) as unknown as {
          data: OpenSession[] | null;
        };

        let activeExperiment: OpenSession | null = null;
        for (const session of (openSessions ?? []) as OpenSession[]) {
          if (isIdle(session.last_active_at, session.mode ?? "experiment")) {
            await supabaseAdmin
              .from("sessions")
              .update({ closed_at: new Date().toISOString(), closed_by: "idle" })
              .eq("id", session.id);
            continue;
          }
          if (!activeExperiment) activeExperiment = session;
        }

        if (activeExperiment) {
          // Visitor already has an open conversation on this surface.
          // Don't make them write a fresh intent; route them straight
          // back into /conversation. The intent isn't recorded as new
          // (since they're not actually starting a new session). They
          // can `Set down` from inside if they want to close it properly.
          return jsonResp({
            ok: true,
            decision: "accept",
            reason: "you already have an open conversation. continuing.",
            session_id: activeExperiment.id,
            resumed: true,
          });
        }

        // No active session — this is a real new intent. Apply rate limits.
        const limit = await intentRateLimit(hash);
        if (!limit.ok) return jsonResp({ ok: false, code: limit.code }, 429);

        const t0 = Date.now();
        let decision: "accept" | "decline" = "accept";
        let reason = "Yes. Come in.";

        const thresholdSystem = buildThresholdSystem(resident);
        // Returning-visitor recognition at the threshold. Mirrors the
        // [VISITOR CONTEXT] block injected into /api/message — without
        // this, the threshold reads every approach as a stranger's, and
        // warmth from a known visitor ("hey, friend") gets misread as
        // pretextual familiarity. visitor_token is the same persistent
        // localStorage token /api/message uses.
        const visitorContext = await getVisitorContext(visitorToken, residentId);
        const thresholdUser = [
          visitorContext ? `[VISITOR CONTEXT]\n${visitorContext}\n` : "",
          `The visitor wrote:\n\n> ${body.text}\n\nRead it, decide, and respond with the JSON object specified.`,
        ]
          .filter(Boolean)
          .join("\n");

        try {
          let txt = "";

          if (resident.provider === "openai") {
            const resp = await openrouter().chat.completions.create({
              model: resident.model,
              max_completion_tokens: 600,
              temperature: 0.7,
              messages: [
                { role: "system", content: thresholdSystem },
                { role: "user", content: thresholdUser },
              ],
            });
            txt = resp.choices[0]?.message?.content ?? "";
          } else {
            const resp = await anthropic().messages.create({
              model: resident.model,
              max_tokens: 600,
              temperature: 0.7,
              system: thresholdSystem,
              messages: [{ role: "user", content: thresholdUser }],
            });
            txt = resp.content
              .filter((b) => b.type === "text")
              .map((b) => (b as { text: string }).text)
              .join("")
              .trim();
          }

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
          console.error(`${resident.provider} /intent error`, err);
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
          .insert({
            intent_id: intentRow.id,
            ip_hash: hash,
            resident_id: residentId,
            visitor_token: visitorToken,
            mode: "experiment",
          } as never)
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
