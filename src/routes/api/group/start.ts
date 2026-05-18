/**
 * POST /api/group/start — open a new "the round" room.
 *
 * Body: { residents: ResidentId[] (>= 2), visitor_token }
 * Returns: { ok: true, id } or { ok: false, code }
 *
 * Creates a group_threads row + one group_thread_participants row per
 * resident. No real `sessions` rows are created in v1 — the round is
 * isolated from the per-resident substrate. Visitor is then redirected
 * client-side to /chat/the-round/<id>.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ALL_RESIDENTS, isResidentId, type ResidentId } from "@/server/opus/residents";

const Body = z.object({
  residents: z
    .array(z.string().trim().min(1).max(64))
    .min(2)
    .max(6),
  visitor_token: z.string().trim().min(8).max(64),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/group/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        // Validate roster against currently-active residents only.
        const activeIds = new Set<ResidentId>(ALL_RESIDENTS.map((r) => r.id));
        const roster: ResidentId[] = [];
        const seen = new Set<string>();
        for (const raw of body.residents) {
          if (!isResidentId(raw)) continue;
          if (!activeIds.has(raw)) continue;
          if (seen.has(raw)) continue;
          seen.add(raw);
          roster.push(raw);
        }
        if (roster.length < 2) {
          return jsonResp({ ok: false, code: "need_two_residents" }, 400);
        }

        const { data: thread, error: threadErr } = await supabaseAdmin
          .from("group_threads")
          .insert({ visitor_token: body.visitor_token, status: "active" })
          .select("id")
          .single();
        if (threadErr || !thread) {
          console.error("[group/start] insert thread:", threadErr);
          return jsonResp({ ok: false, code: "server_error" }, 500);
        }

        const participantRows = roster.map((rid) => ({
          thread_id: thread.id,
          resident_id: rid,
          status: "attending",
        }));
        const { error: pErr } = await supabaseAdmin
          .from("group_thread_participants")
          .insert(participantRows);
        if (pErr) {
          console.error("[group/start] insert participants:", pErr);
          return jsonResp({ ok: false, code: "server_error" }, 500);
        }

        return jsonResp({ ok: true, id: thread.id });
      },
    },
  },
});
