/**
 * POST /api/studio/$doc/observer — flip observer mode.
 *
 * The human toggles whether the residents work autonomously among
 * themselves (observer = true: the conductor runs longer resident-
 * only rounds; the client suppresses the human's write affordances)
 * or human-paced (observer = false: shorter rounds, the human
 * drives). Durable on studio_documents.observer_mode — which the
 * conductor also polls as the interrupt signal: flipping observer
 * OFF mid-autonomous-round makes the conductor yield the floor
 * (the human reclaiming it), no separate signal/column needed.
 *
 * Peer-gated (space_participants) — same model as the turn
 * endpoint. The human's participant rights never change; observer
 * only gates conductor autonomy + client affordances.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ensureStudioParticipant } from "@/server/studio/seed-document";

const Body = z.object({
  visitor_token: z.string().trim().min(8).max(128),
  observer: z.boolean(),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/studio/$doc/observer")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }
        if (!hasSupabaseAdminEnv()) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const docId = params.doc;
        const sb = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        const { data: doc } = await sb
          .from("studio_documents")
          .select("id, space_id, status")
          .eq("id", docId)
          .eq("status", "active")
          .maybeSingle();
        if (!doc) return jsonResp({ ok: false, code: "doc_not_found" }, 404);

        try {
          await ensureStudioParticipant(sb, doc.space_id as string, body.visitor_token);
        } catch (err) {
          console.error("[studio/observer] participant join failed", err);
          return jsonResp({ ok: false, code: "participant_unavailable" }, 500);
        }

        const { error } = await sb
          .from("studio_documents")
          .update({ observer_mode: body.observer })
          .eq("id", docId);
        if (error) {
          console.error("[studio/observer] update failed", error);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        return jsonResp({ ok: true, observer: body.observer });
      },
    },
  },
});
