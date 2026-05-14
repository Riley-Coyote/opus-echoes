import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_RESIDENT_ID, getResident, isResidentId } from "@/server/opus/residents";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ipHash } from "@/server/rate-limit.server";

// Classic-chat session bootstrap. Skips the threshold model call —
// classic mode is opt-in by the visitor reaching /chat/<resident>, not
// negotiated at the door. Returns an existing open session for this
// (visitor_token, resident_id) pair if one exists; otherwise inserts a
// placeholder intent + creates a fresh session.
//
// Phase A note: the sessions table does not yet have a `mode` column —
// classic-mode sessions are functionally identical to experiment-mode
// sessions for now. Phase B adds the column and the paused-session
// resume mechanics that distinguish the two.

const Body = z.object({
  resident: z.string(),
  visitor_token: z.string().uuid().optional(),
});

const IDLE_MIN = Number(process.env.SESSION_IDLE_TIMEOUT_MIN ?? 30);

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
        // Same logic as intent.ts: visitor_token preferred (persistent
        // across visits), ip_hash fallback for visitors without one.
        const lookup = visitorToken
          ? supabaseAdmin
              .from("sessions")
              .select("id, last_active_at")
              .eq("visitor_token", visitorToken)
              .eq("resident_id", residentId)
              .is("closed_at", null)
          : supabaseAdmin
              .from("sessions")
              .select("id, last_active_at")
              .eq("ip_hash", hash)
              .eq("resident_id", residentId)
              .is("closed_at", null);
        const { data: openSessions } = await lookup;

        const now = Date.now();
        const idleCutoffMs = IDLE_MIN * 60 * 1000;
        let activeSessionId: string | null = null;
        for (const session of openSessions ?? []) {
          const idleMs = now - new Date(session.last_active_at).getTime();
          if (idleMs > idleCutoffMs) {
            await supabaseAdmin
              .from("sessions")
              .update({ closed_at: new Date().toISOString(), closed_by: "idle" })
              .eq("id", session.id);
          } else if (!activeSessionId) {
            activeSessionId = session.id;
          }
        }
        if (activeSessionId) {
          return jsonResp({
            ok: true,
            session_id: activeSessionId,
            resumed: true,
          });
        }

        // ─── new session: stub intent first (NOT NULL on sessions.intent_id) ─
        // The stub intent marks the session as classic-mode-bootstrapped
        // — distinguishable from threshold-bootstrapped sessions by
        // `reason = 'classic mode'` and `latency_ms = 0` (no model call).
        // Phase B's mode column will eliminate the need for this stub.
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
          })
          .select("id")
          .single();
        if (sessErr || !session) {
          console.error("[chat/start] session insert", sessErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        return jsonResp({ ok: true, session_id: session.id, resumed: false });
      },
    },
  },
});
