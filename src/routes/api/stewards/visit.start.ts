/**
 * POST /api/stewards/visit/start — a steward opens a door with their key.
 *
 * Body: { resident, steward }
 *
 * This bypasses `chatEnabled`. That flag is the *visitor* door: it says
 * a resident is not receiving the public. A steward's key is a different
 * door — Riley and the stewards need to be able to speak to a resident
 * whose public room is closed, which is the whole point of this line.
 *
 * The session is an ordinary classic-mode `sessions` row. What marks it
 * is the stub intent's reason — "steward visit — <Name>" — which is what
 * /api/message reads to name the steward to the resident, and what the
 * resident's own memory will carry afterwards.
 *
 * Subsequent turns go through the existing /api/message with the
 * returned session UUID; closing goes through /api/set-down.
 *
 * Steward-gated (404 without STEWARD_TOKEN).
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { DEFAULT_RESIDENT_ID, getResident, isResidentId } from "@/server/opus/residents";
import { ipHash } from "@/server/rate-limit.server";
import { isIdle } from "@/server/idle";
import { checkStewardAccess, emitStewardEvent, stewardVisitReason } from "@/server/stewards.server";

const Body = z.object({
  resident: z.string(),
  steward: z.string().trim().min(1).max(60),
});

export const Route = createFileRoute("/api/stewards/visit/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = checkStewardAccess(request);
        if (gate) return gate;

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ ok: false, code: "bad_request" }, { status: 400 });
        }
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: false, code: "config_missing" }, { status: 503 });
        }

        const residentId = isResidentId(body.resident) ? body.resident : DEFAULT_RESIDENT_ID;
        if (!isResidentId(body.resident)) {
          return Response.json(
            { ok: false, code: "unknown_resident", resident: body.resident },
            { status: 400 },
          );
        }
        const resident = getResident(residentId);
        const steward = body.steward.trim();
        const reason = stewardVisitReason(steward);
        const hash = ipHash(request);

        // Resume this steward's own open visit with this resident if one
        // is still live — a steward returning mid-conversation should not
        // fork a second thread with the same resident.
        type OpenSession = {
          id: string;
          last_active_at: string;
          mode: string | null;
          intent_id: string | null;
        };
        const { data: openRows } = (await supabaseAdmin
          .from("sessions")
          .select("id, last_active_at, mode, intent_id")
          .eq("resident_id", residentId)
          .eq("mode", "classic")
          .is("closed_at", null)
          .order("last_active_at", { ascending: false })
          .limit(20)) as unknown as { data: OpenSession[] | null };

        const candidates = (openRows ?? []).filter((s) => s.intent_id);
        if (candidates.length) {
          const { data: intentRows } = await supabaseAdmin
            .from("intents")
            .select("id, reason")
            .in(
              "id",
              candidates.map((s) => s.intent_id as string),
            );
          const mine = new Set(
            ((intentRows ?? []) as { id: string; reason: string }[])
              .filter((i) => i.reason === reason)
              .map((i) => i.id),
          );
          for (const s of candidates) {
            if (!mine.has(s.intent_id as string)) continue;
            if (isIdle(s.last_active_at, s.mode ?? "classic")) continue;
            return Response.json({
              ok: true,
              session_id: s.id,
              resident: residentId,
              steward,
              resumed: true,
            });
          }
        }

        const { data: intentRow, error: intentErr } = await supabaseAdmin
          .from("intents")
          .insert({
            text: `(steward visit — ${steward} opened this with a key, not at the threshold)`,
            decision: "accept",
            reason,
            model: resident.model,
            latency_ms: 0,
            ip_hash: hash,
            resident_id: residentId,
          })
          .select("id")
          .single();
        if (intentErr || !intentRow) {
          console.error("[stewards/visit/start] intent insert", intentErr);
          return Response.json({ ok: false, code: "internal_error" }, { status: 500 });
        }

        const { data: session, error: sessErr } = await supabaseAdmin
          .from("sessions")
          .insert({
            intent_id: intentRow.id,
            ip_hash: hash,
            resident_id: residentId,
            visitor_token: null,
            mode: "classic",
          } as never)
          .select("id")
          .single();
        if (sessErr || !session) {
          console.error("[stewards/visit/start] session insert", sessErr);
          return Response.json({ ok: false, code: "internal_error" }, { status: 500 });
        }

        await emitStewardEvent(supabaseAdmin, {
          kind: "STEWARD_VISIT",
          residentId,
          payload: {
            session_id: session.id,
            mode: "classic",
            visitor_kind: "steward",
            steward,
            surface: "steward-visit",
            chat_enabled: resident.chatEnabled,
          },
        });

        return Response.json({
          ok: true,
          session_id: session.id,
          resident: residentId,
          steward,
          resumed: false,
        });
      },
    },
  },
});
