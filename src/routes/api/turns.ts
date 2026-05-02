import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ipHash } from "@/server/rate-limit.server";

// Returns the transcript for a session so /conversation can rehydrate after a reload.
// Validates that the session belongs to this ip_hash and is still open.
export const Route = createFileRoute("/api/turns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) {
          return Response.json({ ok: false, code: "bad_request" }, { status: 400 });
        }
        const hash = ipHash(request);
        const { data: session } = await supabaseAdmin
          .from("sessions")
          .select("id, ip_hash, closed_at")
          .eq("id", sessionId)
          .maybeSingle();
        if (!session || session.ip_hash !== hash) {
          return Response.json({ ok: false, code: "session_invalid" }, { status: 401 });
        }
        if (session.closed_at) {
          return Response.json({ ok: false, code: "session_closed" }, { status: 410 });
        }
        const { data: turns } = await supabaseAdmin
          .from("turns")
          .select("id, role, body, kind, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });
        return Response.json({ ok: true, turns: turns ?? [] });
      },
    },
  },
});
