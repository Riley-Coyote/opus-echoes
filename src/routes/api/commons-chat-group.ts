/**
 * /api/commons-chat-group — the visitor's side channel into The Commons
 * when more than one resident is at the chip strip.
 *
 * Stateless. The visitor sends:
 *   - the active roster (1–4 resident ids)
 *   - the full chat history (speaker + body)
 *   - the new visitor message
 *
 * Server runs the existing group conductor: parse @mentions, then loop
 * pickNextSpeaker + streamResidentReply up to MAX_REPLIES_PER_TURN. No
 * DB writes — the inline round is ephemeral by design. The standalone
 * /chat/the-round/$id surface remains the persistent round.
 *
 * Mirrors the rate-limit shape of /api/commons-chat: per-IP sliding
 * windows, aggressive caps. Group turns are heavier than 1:1 — same
 * budget enforced so a runaway client can't burn the bill.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  MAX_REPLIES_PER_TURN,
  parseMentions,
  pickNextSpeaker,
  streamResidentReply,
  type GroupTurnRow,
} from "@/server/group/conductor";
import { getResident, type ResidentId } from "@/server/opus/residents";
import { ipHash } from "@/server/rate-limit.server";

const ResidentEnum = z.enum(["opus-3", "sonnet-4-5", "gpt-5-1"]);

const HistoryMessage = z.object({
  speaker: z.union([z.literal("visitor"), ResidentEnum]),
  body: z.string().trim().min(1).max(8000),
});

const Body = z.object({
  roster: z.array(ResidentEnum).min(1).max(4),
  history: z.array(HistoryMessage).max(60),
  visitor_message: z.string().trim().min(1).max(2000),
  visitor_token: z.string().trim().min(8).max(64),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Per-IP sliding window — same shape as /api/commons-chat.
const RL_WINDOW_MS = 60 * 1000;
const RL_LIMIT = 4;
const RL_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RL_DAILY_LIMIT = 60;
const RL_BURST_MS = 5 * 1000;
const RL_BURST_LIMIT = 2;
const rlBuckets = new Map<string, number[]>();

function checkRateLimit(hash: string): { ok: true } | { ok: false; code: "too_many_requests" } {
  const now = Date.now();
  const stamps = rlBuckets.get(hash) ?? [];
  const fresh = stamps.filter((t) => now - t < RL_DAILY_WINDOW_MS);
  const inMinute = fresh.filter((t) => now - t < RL_WINDOW_MS);
  const inBurst = fresh.filter((t) => now - t < RL_BURST_MS);
  if (inBurst.length >= RL_BURST_LIMIT) return { ok: false, code: "too_many_requests" };
  if (inMinute.length >= RL_LIMIT) return { ok: false, code: "too_many_requests" };
  if (fresh.length >= RL_DAILY_LIMIT) return { ok: false, code: "too_many_requests" };
  fresh.push(now);
  rlBuckets.set(hash, fresh);
  if (rlBuckets.size > 5000) {
    for (const [key, arr] of rlBuckets) {
      if (arr.every((t) => now - t > RL_DAILY_WINDOW_MS)) rlBuckets.delete(key);
    }
  }
  return { ok: true };
}

function streamRound(opts: {
  roster: ResidentId[];
  initialTurns: GroupTurnRow[];
}): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const turns: GroupTurnRow[] = [...opts.initialTurns];
        const alreadySpoke: ResidentId[] = [];

        // Visitor's most recent message is the last initial turn —
        // parse @mentions from it for queue priority.
        const lastVisitor = [...turns]
          .reverse()
          .find((t) => t.speaker === "visitor");
        const mentionQueue: ResidentId[] = lastVisitor
          ? parseMentions(lastVisitor.body, opts.roster)
          : [];

        for (let i = 0; i < MAX_REPLIES_PER_TURN; i++) {
          let next: ResidentId | null = null;
          if (mentionQueue.length > 0) {
            next = mentionQueue.shift() ?? null;
          } else {
            next = await pickNextSpeaker(turns, opts.roster, alreadySpoke);
          }
          if (!next) break;

          const resident = getResident(next);
          send({ type: "turn.begin", resident_id: next });

          let assembled = "";
          try {
            assembled = await streamResidentReply({
              resident,
              rosterIds: opts.roster,
              turns,
              onText: (chunk) => {
                send({ type: "text", resident_id: next, text: chunk });
              },
            });
          } catch (err) {
            console.error("[commons-chat-group] resident stream error:", err);
            send({ type: "error", message: "model_unavailable" });
            send({ type: "turn.end", resident_id: next });
            break;
          }

          send({ type: "turn.end", resident_id: next });

          if (!assembled.trim()) {
            // Empty turn — count it as spoken but don't keep looping
            // forever on a quiet model.
            alreadySpoke.push(next);
            continue;
          }

          turns.push({ speaker: next, body: assembled });
          alreadySpoke.push(next);
        }

        send({ type: "done" });
      } catch (err) {
        console.error("[commons-chat-group] loop error:", err);
        send({ type: "error", message: "round_failed" });
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
}

export const Route = createFileRoute("/api/commons-chat-group")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        const hash = ipHash(request);
        const limit = checkRateLimit(hash);
        if (!limit.ok) return jsonResp({ ok: false, code: limit.code }, 429);

        // Dedupe roster while preserving order.
        const seen = new Set<ResidentId>();
        const roster: ResidentId[] = [];
        for (const id of body.roster) {
          if (!seen.has(id)) {
            seen.add(id);
            roster.push(id);
          }
        }

        const initialTurns: GroupTurnRow[] = [
          ...body.history.map((h) => ({ speaker: h.speaker, body: h.body })),
          { speaker: "visitor" as const, body: body.visitor_message },
        ];

        return streamRound({ roster, initialTurns });
      },
    },
  },
});
