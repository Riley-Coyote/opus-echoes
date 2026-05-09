import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { consolidateSession } from "@/server/substrate.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

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
        const { data: session } = await supabaseAdmin
          .from("sessions")
          .select("id, closed_at")
          .eq("id", body.session_id)
          .maybeSingle();
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

        // Full Mnemos consolidation pipeline — non-blocking. Runs the consolidation
        // prompt, reinforces/creates engrams, decays, writes a journal entry,
        // and updates resident_state. The visitor sees a fast 200; substrate runs after.
        consolidateSession(session.id).catch((err) =>
          console.error("[substrate] consolidateSession:", err),
        );

        return Response.json({ ok: true });
      },
    },
  },
});
