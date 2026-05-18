/**
 * POST /api/group/$id/message — visitor sends a message into the round.
 *
 * NDJSON streaming response. Envelopes:
 *   { type: "turn.begin", resident_id }
 *   { type: "text", resident_id, text }
 *   { type: "turn.end", resident_id, turn_id }
 *   { type: "done" }
 *   { type: "error", message }
 *
 * Flow per visitor message:
 *   1. Validate, rate-limit, load thread + active roster.
 *   2. Persist the visitor's turn.
 *   3. Determine first speakers via @mentions (in order).
 *   4. Loop up to MAX_REPLIES_PER_TURN:
 *      a. If mention queue non-empty, pop next; else ask the judge.
 *      b. If null/none, break.
 *      c. Stream that resident's reply, persist, append.
 *   5. Emit { type: "done" }.
 *
 * Per-resident in-memory rate limit caps abuse (the room is much more
 * expensive than the 1:1 chat — each visitor message can trigger up to
 * 4 model calls + judge calls).
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getResident, type ResidentId } from "@/server/opus/residents";
import { ipHash } from "@/server/rate-limit.server";
import {
  MAX_REPLIES_PER_TURN,
  parseMentions,
  pickNextSpeaker,
  streamResidentReply,
  type GroupTurnRow,
} from "@/server/group/conductor";

const Body = z.object({
  visitor_message: z.string().trim().min(1).max(4000),
  visitor_token: z.string().trim().min(8).max(64),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// In-memory rate limiter — per visitor_token + per IP-hash.
// The round is heavier per request than the 1:1 chat (up to ~8 model
// calls per visitor message including the judge), so the limits are
// tight. Production runs on a single Worker shard mostly; if we ever
// scale out, move this to Supabase counters.
const RL_MIN_MS = 60 * 1000;
const RL_MIN_LIMIT = 5; // 5 messages / minute
const RL_DAY_MS = 24 * 60 * 60 * 1000;
const RL_DAY_LIMIT = 80; // 80 messages / day
const rlBuckets = new Map<string, number[]>();

function rateLimit(key: string): boolean {
  const now = Date.now();
  const stamps = (rlBuckets.get(key) ?? []).filter((t) => now - t < RL_DAY_MS);
  const inMin = stamps.filter((t) => now - t < RL_MIN_MS);
  if (inMin.length >= RL_MIN_LIMIT) return false;
  if (stamps.length >= RL_DAY_LIMIT) return false;
  stamps.push(now);
  rlBuckets.set(key, stamps);
  if (rlBuckets.size > 5000) {
    for (const [k, arr] of rlBuckets) {
      if (arr.every((t) => now - t > RL_DAY_MS)) rlBuckets.delete(k);
    }
  }
  return true;
}

export const Route = createFileRoute("/api/group/$id/message")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const threadId = params.id;

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        // Rate limit by both visitor token and ip-hash, separately.
        const hash = ipHash(request);
        if (!rateLimit("v:" + body.visitor_token) || !rateLimit("i:" + hash)) {
          return jsonResp({ ok: false, code: "too_many_requests" }, 429);
        }

        // Load thread + active participants.
        const { data: thread } = await supabaseAdmin
          .from("group_threads")
          .select("id, visitor_token, status")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return jsonResp({ ok: false, code: "not_found" }, 404);
        if (thread.visitor_token !== body.visitor_token) {
          return jsonResp({ ok: false, code: "unauthorized" }, 401);
        }
        if (thread.status !== "active") {
          return jsonResp({ ok: false, code: "thread_closed" }, 409);
        }

        const { data: participants } = await supabaseAdmin
          .from("group_thread_participants")
          .select("resident_id, status")
          .eq("thread_id", threadId);
        const roster: ResidentId[] = (participants ?? [])
          .filter((p) => p.status === "attending")
          .map((p) => p.resident_id as ResidentId);
        if (roster.length === 0) {
          return jsonResp({ ok: false, code: "no_residents_attending" }, 409);
        }

        // Load recent transcript.
        const { data: prior } = await supabaseAdmin
          .from("group_turns")
          .select("speaker, body, ord")
          .eq("thread_id", threadId)
          .order("ord", { ascending: true })
          .limit(60);
        const turns: GroupTurnRow[] = (prior ?? []).map((t) => ({
          speaker: t.speaker as "visitor" | ResidentId,
          body: t.body,
        }));
        const lastOrd = prior && prior.length ? Number(prior[prior.length - 1].ord) : 0;

        // Persist the visitor's turn.
        let ord = lastOrd + 1;
        const { error: vErr } = await supabaseAdmin.from("group_turns").insert({
          thread_id: threadId,
          speaker: "visitor",
          body: body.visitor_message,
          ord,
        });
        if (vErr) {
          console.error("[group/message] insert visitor turn:", vErr);
          return jsonResp({ ok: false, code: "server_error" }, 500);
        }
        turns.push({ speaker: "visitor", body: body.visitor_message });

        // Determine first speakers from @mentions, then judge for any
        // remaining slots.
        const mentionedQueue = parseMentions(body.visitor_message, roster);

        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: unknown) =>
              controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

            try {
              const alreadySpoke: ResidentId[] = [];

              for (let i = 0; i < MAX_REPLIES_PER_TURN; i++) {
                let nextSpeaker: ResidentId | null = null;
                if (mentionedQueue.length > 0) {
                  nextSpeaker = mentionedQueue.shift()!;
                } else {
                  nextSpeaker = await pickNextSpeaker(turns, roster, alreadySpoke);
                }
                if (!nextSpeaker) break;
                if (!roster.includes(nextSpeaker)) break;

                const resident = getResident(nextSpeaker);

                send({ type: "turn.begin", resident_id: nextSpeaker });

                let assembled = "";
                try {
                  assembled = await streamResidentReply({
                    resident,
                    rosterIds: roster,
                    turns,
                    onText: (chunk) => {
                      send({ type: "text", resident_id: nextSpeaker, text: chunk });
                    },
                  });
                } catch (err) {
                  console.error("[group/message] resident stream:", err);
                  send({
                    type: "turn.end",
                    resident_id: nextSpeaker,
                    turn_id: null,
                    error: "model_unavailable",
                  });
                  break;
                }

                if (!assembled) {
                  send({ type: "turn.end", resident_id: nextSpeaker, turn_id: null });
                  break;
                }

                // Persist resident turn.
                ord += 1;
                const { data: turnRow, error: tErr } = await supabaseAdmin
                  .from("group_turns")
                  .insert({
                    thread_id: threadId,
                    speaker: nextSpeaker,
                    body: assembled,
                    ord,
                  })
                  .select("id")
                  .single();
                if (tErr) {
                  console.error("[group/message] insert resident turn:", tErr);
                }

                send({
                  type: "turn.end",
                  resident_id: nextSpeaker,
                  turn_id: turnRow?.id ?? null,
                });

                turns.push({ speaker: nextSpeaker, body: assembled });
                alreadySpoke.push(nextSpeaker);
              }

              send({ type: "done" });
            } catch (err) {
              console.error("[group/message] outer error:", err);
              try {
                send({ type: "error", message: "server_error" });
              } catch {}
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
