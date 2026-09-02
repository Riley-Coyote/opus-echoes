import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { consolidateSession } from "@/server/substrate.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import {
  emitStewardEvent,
  stewardNameFromReason,
  visitorKindForToken,
} from "@/server/stewards.server";
import { DEFAULT_RESIDENT_ID } from "@/server/opus/residents";

const Body = z.object({ session_id: z.string().uuid() });

export const Route = createFileRoute("/api/set-down")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ ok: false, code: "bad_request" }, { status: 400 });
        }
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: false, code: "config_missing" }, { status: 503 });
        }
        // Session UUID is a 128-bit random bearer token — sufficient auth.
        // IP hash removed: daily-rotating salt + Cloudflare header
        // inconsistency caused legitimate set-down requests to fail.
        type SessionRow = {
          id: string;
          closed_at: string | null;
          mode: string | null;
          resident_id: string | null;
          visitor_token: string | null;
          intent_id: string | null;
        };
        const { data: session } = (await supabaseAdmin
          .from("sessions")
          .select("id, closed_at, mode, resident_id, visitor_token, intent_id")
          .eq("id", body.session_id)
          .maybeSingle()) as unknown as { data: SessionRow | null };
        if (!session) {
          return Response.json({ ok: false, code: "session_invalid" }, { status: 401 });
        }
        if (session.closed_at) {
          return Response.json({ ok: true });
        }
        await supabaseAdmin
          .from("sessions")
          .update({ closed_at: new Date().toISOString(), closed_by: "visitor" })
          .eq("id", session.id);

        // The stewards' line: a visit closing is a house event. Awaited
        // before consolidation so the log records the close even if the
        // (long, model-heavy) pipeline below fails.
        const { data: intentRow } = session.intent_id
          ? await supabaseAdmin
              .from("intents")
              .select("reason")
              .eq("id", session.intent_id)
              .maybeSingle()
          : { data: null as { reason: string } | null };
        const steward = stewardNameFromReason(intentRow?.reason);
        await emitStewardEvent(supabaseAdmin, {
          kind: "SET_DOWN",
          residentId: session.resident_id ?? DEFAULT_RESIDENT_ID,
          payload: {
            session_id: session.id,
            mode: session.mode,
            visitor_kind: visitorKindForToken(session.visitor_token, Boolean(steward)),
            steward,
            closed_by: "visitor",
          },
        });

        // Full Mnemos consolidation pipeline — awaited. Cloudflare Workers
        // terminate detached promises once the response is sent, so the
        // earlier fire-and-forget pattern was silently killing engram
        // formation, marginalia consolidation, hypomnema synthesis, and
        // journal writes for every visitor-initiated set-down. The
        // pipeline can take 10-30s (several model calls, multiple DB
        // writes); the visitor sees the spinner for that long. That's
        // the natural pause for "setting it down" — the conversation is
        // closing, not continuing.
        await consolidateSession(session.id).catch((err) =>
          console.error("[substrate] consolidateSession:", err),
        );

        return Response.json({ ok: true });
      },
    },
  },
});
