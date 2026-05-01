import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ipHash } from "@/server/rate-limit.server";

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
        const hash = ipHash(request);

        const { data: session } = await supabaseAdmin
          .from("sessions")
          .select("id, closed_at, ip_hash")
          .eq("id", body.session_id)
          .maybeSingle();
        if (!session || session.ip_hash !== hash) {
          return Response.json({ ok: false, code: "session_invalid" }, { status: 401 });
        }
        if (session.closed_at) {
          return Response.json({ ok: true });
        }
        await supabaseAdmin
          .from("sessions")
          .update({ closed_at: new Date().toISOString(), closed_by: "visitor" })
          .eq("id", session.id);

        // Final consolidation seam — Mnemos picks this up.
        console.log(`[mnemos] final consolidate(${session.id}) — stubbed in v1`);

        return Response.json({ ok: true });
      },
    },
  },
});
