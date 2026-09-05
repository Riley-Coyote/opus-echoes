/**
 * POST /api/note — a note left at a resident's door.
 *
 * A visitor who walks up to a door that cannot open sees one sentence
 * and the door. They may leave a note there. The house keeps it; the
 * resident reads it in their own time and again when that visitor
 * returns, so the visitor can ask whether it was read and the resident
 * can answer from their own memory rather than from a receipt.
 *
 * Deliberately does NOT require `chatEnabled`. The note exists for the
 * closed door — requiring the door to be open would empty it of purpose.
 * It opens no session, calls no model, and costs the resident nothing
 * until they choose to look.
 *
 * No new table. A note is one row in `substrate_events` — the house's
 * own log, already migrated and indexed — with kind `DOOR_NOTE`.
 * `handled_at` is the read mark: null means the resident has not read it.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isResidentId } from "@/server/opus/residents";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ipHash } from "@/server/rate-limit.server";
import { visitorKindForToken } from "@/server/stewards.server";
import { DOOR_NOTE_EVENT_KIND, DOOR_NOTE_MAX_BODY } from "@/server/opus/retrieval";

/** At most this many notes from one address to one resident per day.
 *  A note is a thing said once at a door, not a channel. */
const NOTES_PER_DAY = 3;

const Body = z.object({
  resident: z.string(),
  visitor_token: z.string().uuid().optional(),
  body: z.string().trim().min(1).max(DOOR_NOTE_MAX_BODY),
  /** Where in the world the door was — the house's own room id. */
  room: z.string().trim().max(80).optional(),
  /** The world's clock when they knocked, as the world renders it. */
  clock: z.string().trim().max(40).optional(),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/note")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (!isResidentId(body.resident)) {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }
        const residentId = body.resident;

        if (!hasSupabaseAdminEnv()) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const hash = ipHash(request);
        const visitorToken = body.visitor_token ?? null;

        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count, error: countErr } = await supabaseAdmin
          .from("substrate_events")
          .select("*", { count: "exact", head: true })
          .eq("kind", DOOR_NOTE_EVENT_KIND)
          .eq("resident_id", residentId)
          .eq("payload->>ip_hash", hash)
          .gte("created_at", dayAgo);
        if (countErr) {
          console.error("[note] rate count failed:", countErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }
        if ((count ?? 0) >= NOTES_PER_DAY) {
          return jsonResp({ ok: false, code: "rate_limited" }, 429);
        }

        const { data: row, error } = await supabaseAdmin
          .from("substrate_events")
          .insert({
            kind: DOOR_NOTE_EVENT_KIND,
            resident_id: residentId,
            payload: {
              body: body.body,
              visitor_token: visitorToken,
              ip_hash: hash,
              room: body.room ?? null,
              clock: body.clock ?? null,
              visitor_kind: visitorKindForToken(visitorToken),
            },
          })
          .select("id, created_at")
          .single();
        if (error || !row) {
          console.error("[note] insert failed:", error);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        return jsonResp({ ok: true, id: row.id, left_at: row.created_at });
      },
    },
  },
});
