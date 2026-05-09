import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

// Returns the transcript for a session so /conversation can rehydrate after a reload.
// Validates the session exists and is still open. Session UUID is bearer auth.
export const Route = createFileRoute("/api/turns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) {
          return Response.json({ ok: false, code: "bad_request" }, { status: 400 });
        }
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: false, code: "config_missing" }, { status: 503 });
        }
        // Session UUID is a 128-bit random bearer token — knowing it IS
        // proof of ownership. We no longer gate on IP hash because the
        // daily-rotating salt and inconsistent Cloudflare headers caused
        // legitimate visitors to get locked out after midnight UTC or when
        // proxy chains shifted.
        const { data: session } = await supabaseAdmin
          .from("sessions")
          .select("id, closed_at")
          .eq("id", sessionId)
          .maybeSingle();
        if (!session) {
          return Response.json({ ok: false, code: "session_invalid" }, { status: 401 });
        }
        // Fetch turns regardless of closed state — the visitor should
        // always be able to see their transcript.
        const { data: turns } = await supabaseAdmin
          .from("turns")
          .select("id, role, body, kind, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });

        if (session.closed_at) {
          // 410 with turns included so the client can render read-only.
          return Response.json(
            { ok: false, code: "session_closed", turns: turns ?? [] },
            { status: 410 },
          );
        }
        return Response.json({ ok: true, turns: turns ?? [] });
      },
    },
  },
});
