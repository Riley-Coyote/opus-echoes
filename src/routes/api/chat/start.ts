import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_RESIDENT_ID, getResident, isResidentId } from "@/server/opus/residents";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ipHash } from "@/server/rate-limit.server";

// Classic-chat session bootstrap. Skips the threshold model call —
// classic mode is opt-in by the visitor reaching /chat/<resident>, not
// negotiated at the door. Returns an existing open classic-mode session
// for this (visitor_token, resident_id) pair if one exists; otherwise
// inserts a placeholder intent + creates a fresh classic-mode session.
//
// Cross-surface conflict detection: if the visitor already has an open
// experiment-mode session for this resident, returns 409 with the
// existing session's mode + the surface URL so the client can render
// an explicit choice modal ("continue there, or set it down and start
// fresh here"). Mirrors the same check on /api/intent for the reverse
// direction.

const Body = z.object({
  resident: z.string(),
  visitor_token: z.string().uuid().optional(),
});

const IDLE_MIN = Number(process.env.SESSION_IDLE_TIMEOUT_MIN ?? 30);
const IDLE_MIN_CLASSIC = Number(process.env.SESSION_IDLE_TIMEOUT_MIN_CLASSIC ?? 43200); // 30 days

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chat/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (!hasSupabaseAdminEnv()) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const residentId = isResidentId(body.resident) ? body.resident : DEFAULT_RESIDENT_ID;
        const resident = getResident(residentId);
        const hash = ipHash(request);
        const visitorToken = body.visitor_token ?? null;

        // ─── find existing open session for this pair, if any ────
        // Look across both modes — we need to detect cross-surface
        // conflicts as well as same-mode resumes. visitor_token preferred
        // (persistent across visits); ip_hash fallback for visitors without
        // one. The new `mode` column tells us which surface owns the
        // session.
        const lookup = visitorToken
          ? supabaseAdmin
              .from("sessions")
              .select("id, last_active_at, mode")
              .eq("visitor_token", visitorToken)
              .eq("resident_id", residentId)
              .is("closed_at", null)
          : supabaseAdmin
              .from("sessions")
              .select("id, last_active_at, mode")
              .eq("ip_hash", hash)
              .eq("resident_id", residentId)
              .is("closed_at", null);
        // Cast through unknown — `mode` is part of the new schema but
        // the generated supabase types lag until Lovable regenerates
        // after the migration applies.
        type OpenSession = { id: string; last_active_at: string; mode?: string };
        const { data: openSessions } = (await lookup) as unknown as {
          data: OpenSession[] | null;
        };

        const now = Date.now();
        let activeClassic: OpenSession | null = null;
        let activeExperiment: OpenSession | null = null;
        for (const session of (openSessions ?? []) as OpenSession[]) {
          const mode = session.mode ?? "experiment";
          const idleCutoffMs = (mode === "classic" ? IDLE_MIN_CLASSIC : IDLE_MIN) * 60 * 1000;
          const idleMs = now - new Date(session.last_active_at).getTime();
          if (idleMs > idleCutoffMs) {
            await supabaseAdmin
              .from("sessions")
              .update({ closed_at: new Date().toISOString(), closed_by: "idle" })
              .eq("id", session.id);
            continue;
          }
          if (mode === "classic" && !activeClassic) activeClassic = session;
          else if (mode === "experiment" && !activeExperiment) activeExperiment = session;
        }

        // Cross-surface conflict: visitor has an experiment session open.
        // Don't auto-merge — surface this to the client so they can choose.
        if (activeExperiment && !activeClassic) {
          return jsonResp(
            {
              ok: false,
              code: "conflict_experiment_session",
              resident_id: residentId,
              existing_mode: "experiment",
              existing_session_id: activeExperiment.id,
              experiment_url: `/${resident.slug}`,
            },
            409,
          );
        }

        // Same-surface resume.
        if (activeClassic) {
          return jsonResp({
            ok: true,
            session_id: activeClassic.id,
            resumed: true,
            mode: "classic",
          });
        }

        // ─── new session: stub intent first (NOT NULL on sessions.intent_id) ─
        // The stub intent marks the session as classic-mode-bootstrapped
        // — distinguishable from threshold-bootstrapped sessions by
        // `reason = 'classic mode'` and `latency_ms = 0` (no model call).
        const { data: intentRow, error: intentErr } = await supabaseAdmin
          .from("intents")
          .insert({
            text: "(classic chat — direct bootstrap, no threshold ceremony)",
            decision: "accept",
            reason: "classic mode",
            model: resident.model,
            latency_ms: 0,
            ip_hash: hash,
            resident_id: residentId,
          })
          .select("id")
          .single();
        if (intentErr || !intentRow) {
          console.error("[chat/start] intent insert", intentErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        const { data: session, error: sessErr } = await supabaseAdmin
          .from("sessions")
          .insert({
            intent_id: intentRow.id,
            ip_hash: hash,
            resident_id: residentId,
            visitor_token: visitorToken,
            mode: "classic",
          } as never)
          .select("id")
          .single();
        if (sessErr || !session) {
          console.error("[chat/start] session insert", sessErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        return jsonResp({
          ok: true,
          session_id: session.id,
          resumed: false,
          mode: "classic",
        });
      },
    },
  },
});
