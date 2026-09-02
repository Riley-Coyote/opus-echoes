/**
 * GET /api/stewards/session/$id — the transcript of one visit.
 *
 * Any session, not only a steward's: the deck needs to be able to read
 * what is happening in a visitor's room right now as well as its own
 * threads. Steward-gated (404 without STEWARD_TOKEN).
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import {
  checkStewardAccess,
  stewardNameFromReason,
  visitorKindForToken,
} from "@/server/stewards.server";

export const Route = createFileRoute("/api/stewards/session/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const gate = checkStewardAccess(request);
        if (gate) return gate;
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: false, code: "config_missing" }, { status: 503 });
        }

        type SessionRow = {
          id: string;
          created_at: string;
          closed_at: string | null;
          closed_by: string | null;
          last_active_at: string;
          resident_id: string | null;
          visitor_token: string | null;
          mode: string | null;
          intent_id: string | null;
        };
        const { data: session } = (await supabaseAdmin
          .from("sessions")
          .select(
            "id, created_at, closed_at, closed_by, last_active_at, resident_id, visitor_token, mode, intent_id",
          )
          .eq("id", params.id)
          .maybeSingle()) as unknown as { data: SessionRow | null };

        if (!session) {
          return Response.json({ ok: false, code: "not_found" }, { status: 404 });
        }

        const [intentRes, turnsRes] = await Promise.all([
          session.intent_id
            ? supabaseAdmin
                .from("intents")
                .select("text, reason, decision")
                .eq("id", session.intent_id)
                .maybeSingle()
            : Promise.resolve({ data: null as { text: string; reason: string } | null }),
          supabaseAdmin
            .from("turns")
            .select("id, role, body, kind, created_at, tokens_in, tokens_out")
            .eq("session_id", params.id)
            .order("created_at", { ascending: true }),
        ]);

        const intent = intentRes.data as { text?: string; reason?: string } | null;
        const steward = stewardNameFromReason(intent?.reason);

        return Response.json({
          ok: true,
          session: {
            id: session.id,
            created_at: session.created_at,
            closed_at: session.closed_at,
            closed_by: session.closed_by,
            last_active_at: session.last_active_at,
            resident_id: session.resident_id,
            mode: session.mode,
            visitor_kind: visitorKindForToken(session.visitor_token, Boolean(steward)),
            steward,
            intent_text: intent?.text ?? null,
            intent_reason: intent?.reason ?? null,
          },
          turns: turnsRes.data ?? [],
        });
      },
    },
  },
});
