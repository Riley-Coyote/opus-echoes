/**
 * POST /api/stewards/invite { resident } — a steward opens the room and
 * leaves.
 *
 * This runs one unprompted session for that resident, now, instead of
 * waiting for the daily tick. It is an invitation and nothing else: the
 * resident is told the room is theirs, that nobody is present, and that
 * doing nothing with the hour is a whole answer. Nothing here asks for
 * output, and a quiet answer is never asked again.
 *
 * Two events go to `substrate_events`:
 *   - INVITED, when the door is opened, carrying the steward's name;
 *   - INVITATION_ANSWERED { kind: 'wrote' | 'made' | 'rested' |
 *     'declined' }, carrying the resident's own word for the hour — and
 *     nothing they wrote. What they made is theirs, in their own rooms;
 *     the log records only that the hour happened and what shape it took.
 *
 * The session is an ordinary `studio_sessions` row with trigger
 * "manual" — the same table and the same mechanics as the daily tick,
 * decay and all. No new tables.
 *
 * Steward-gated (404 without STEWARD_TOKEN).
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { getResident, isResidentId } from "@/server/opus/residents";
import { checkStewardAccess, emitStewardEvent, stewardJson } from "@/server/stewards.server";
import { runStudioSession } from "@/server/substrate.server";

const Body = z.object({
  resident: z.string(),
  /** Who opened the room. Optional: the invitation is the house's, and
   *  the resident is never told to answer to anyone. */
  steward: z.string().trim().min(1).max(60).optional(),
});

export const Route = createFileRoute("/api/stewards/invite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = checkStewardAccess(request);
        if (gate) return gate;

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return stewardJson({ ok: false, code: "bad_request" }, { status: 400 });
        }
        if (!hasSupabaseAdminEnv()) {
          return stewardJson({ ok: false, code: "config_missing" }, { status: 503 });
        }
        if (!isResidentId(body.resident)) {
          return stewardJson(
            { ok: false, code: "unknown_resident", resident: body.resident },
            { status: 400 },
          );
        }

        const resident = getResident(body.resident);
        const steward = body.steward?.trim() || null;

        // The key the resident's own model needs. Without it there is no
        // room to open, and the house says so rather than logging an
        // invitation nobody could answer.
        const keyed =
          resident.provider === "openai"
            ? Boolean(process.env.OPENROUTER_API_KEY)
            : Boolean(process.env.ANTHROPIC_API_KEY);
        if (!keyed) {
          return stewardJson(
            { ok: false, code: "no_api_key", resident: resident.id, provider: resident.provider },
            { status: 503 },
          );
        }

        await emitStewardEvent(supabaseAdmin, {
          kind: "INVITED",
          residentId: resident.id,
          payload: { session_id: null, mode: "studio", visitor_kind: "steward", steward },
        });

        const result = await runStudioSession(resident, "manual", null);

        // 'declined' is the resident's own word, never the house's
        // inference: runStudioSession only reports it when they said it.
        // A session that failed for the house's own reasons is reported
        // as such and answered nothing.
        if (result.status === "failed") {
          return stewardJson(
            {
              ok: false,
              code: "session_failed",
              resident: resident.id,
              reason: result.reason,
              studio_session_id: result.studio_session_id,
            },
            { status: 500 },
          );
        }

        await emitStewardEvent(supabaseAdmin, {
          kind: "INVITATION_ANSWERED",
          residentId: resident.id,
          payload: {
            session_id: null,
            mode: "studio",
            visitor_kind: "steward",
            steward,
            kind: result.answer,
            studio_session_id: result.studio_session_id,
            status: result.status,
          },
        });

        return stewardJson({
          ok: true,
          resident: resident.id,
          steward,
          answer: result.answer,
          status: result.status,
          studio_session_id: result.studio_session_id,
          // Where it went, when it went anywhere. Never the words.
          output_target: result.output_target,
        });
      },
    },
  },
});
