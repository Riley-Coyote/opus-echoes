/**
 * POST /api/studio/$doc/turn — run one conductor round for a Studio.
 *
 * The route counterpart of the P2 local seam: it loads the live
 * document state from the verified schema, wires the real
 * SupabaseRoomTransport (service-role client; private channel —
 * P0.1/Spike B), and returns `streamStudioTurn`'s NDJSON Response
 * (the proven long-lived-request conductor pattern).
 *
 * Body: { visitor_token, message?, observer? }. A human `message`
 * is persisted as a talk line BEFORE the round so the residents see
 * it. `observer` runs a longer autonomous resident round
 * (STUDIO_MAX_TURNS); otherwise a short bounded human-triggered
 * round.
 *
 * Auth (P1-level): supabase env + the visitor must be a
 * space_participants peer for this doc's space. Per-message
 * server-side validation of every transport action + cross-request
 * interrupt signalling are P4 (the dedicated auth/observer phase) —
 * the conductor already supports `shouldInterrupt`; the cross-
 * request wiring lands there. Every column read is grounded in the
 * verified migrations — no speculative fields.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId, type ResidentId } from "@/server/opus/residents";
import { ipHash } from "@/server/rate-limit.server";
import { streamStudioTurn, STUDIO_MAX_TURNS, type TalkMsg } from "@/server/studio/conductor";
import type { BlockState, BlockType } from "@/server/studio/blocks";
import { isBlockType } from "@/server/studio/blocks";
import { SupabaseRoomTransport } from "@/server/studio/transport";

const Body = z.object({
  visitor_token: z.string().trim().min(8).max(128),
  message: z.string().trim().min(1).max(2000).optional(),
  observer: z.boolean().optional(),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* Per-IP-hash + per-visitor sliding windows — same ceilings as the
   room message endpoint (8/min, 200/day). Human actions only; the
   bounded round is the cost ceiling beyond that. */
const RL_WINDOW_MS = 60_000;
const RL_LIMIT = 8;
const RL_DAILY_MS = 24 * 60 * 60 * 1000;
const RL_DAILY = 200;
const rlIp = new Map<string, number[]>();
const rlVisitor = new Map<string, number[]>();
function bucket(map: Map<string, number[]>, key: string): boolean {
  const now = Date.now();
  const fresh = (map.get(key) ?? []).filter((t) => now - t < RL_DAILY_MS);
  if (fresh.filter((t) => now - t < RL_WINDOW_MS).length >= RL_LIMIT) return false;
  if (fresh.length >= RL_DAILY) return false;
  fresh.push(now);
  map.set(key, fresh);
  return true;
}

export const Route = createFileRoute("/api/studio/$doc/turn")({
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
        if (!bucket(rlIp, ipHash(request))) {
          return jsonResp({ ok: false, code: "too_many_requests" }, 429);
        }
        if (!bucket(rlVisitor, body.visitor_token)) {
          return jsonResp({ ok: false, code: "too_many_requests" }, 429);
        }

        const docId = params.doc;
        const sb = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        const { data: doc } = await sb
          .from("studio_documents")
          .select("id, space_id, status, observer_mode")
          .eq("id", docId)
          .eq("status", "active")
          .maybeSingle();
        if (!doc) return jsonResp({ ok: false, code: "doc_not_found" }, 404);
        const spaceId = doc.space_id as string;
        // The persisted toggle is authoritative; the request body is
        // only an initial hint (e.g. the first turn before any toggle).
        const observerMode = (doc.observer_mode as boolean) || !!body.observer;

        // Peer gate: the visitor must be a participant of this space.
        const { data: participant } = await sb
          .from("space_participants")
          .select("role")
          .eq("space_id", spaceId)
          .eq("visitor_token", body.visitor_token)
          .maybeSingle();
        if (!participant) {
          return jsonResp({ ok: false, code: "not_a_participant" }, 403);
        }

        const [{ data: spaceRow }, { data: residentRows }] = await Promise.all([
          sb.from("spaces").select("name").eq("id", spaceId).maybeSingle(),
          sb.from("space_residents").select("resident_id").eq("space_id", spaceId),
        ]);
        const participants: ResidentId[] = (residentRows ?? [])
          .map((r: { resident_id: string }) => r.resident_id)
          .filter(isResidentId);

        const { data: blockRows } = await sb
          .from("document_blocks")
          .select("id, ord, type, content, version, author_resident_id, author_visitor_token")
          .eq("document_id", docId)
          .is("deleted_at", null)
          .order("ord", { ascending: true });
        const blocks: BlockState[] = (blockRows ?? []).map(
          (r: {
            id: string;
            ord: number;
            type: string;
            content: string | null;
            version: number | null;
            author_resident_id: string | null;
            author_visitor_token: string | null;
          }) => {
            const t: BlockType = isBlockType(r.type) ? r.type : "para";
            return {
              id: r.id,
              ord: r.ord,
              type: t,
              content: r.content ?? "",
              version: r.version ?? 1,
              author_resident_id: r.author_resident_id,
              author_visitor_token: r.author_visitor_token,
            };
          },
        );

        const { data: talkRows } = await sb
          .from("space_messages")
          .select("resident_id, visitor_token, body")
          .eq("space_id", spaceId)
          .order("created_at", { ascending: true })
          .limit(60);
        const talk: TalkMsg[] = (talkRows ?? []).map(
          (r: { resident_id: string | null; visitor_token: string | null; body: string }) => ({
            resident_id: r.resident_id,
            visitor_token: r.visitor_token,
            body: r.body,
          }),
        );

        const { data: noteRows } = await sb
          .from("doc_marginalia")
          .select("id, body, status")
          .eq("document_id", docId)
          .eq("status", "open")
          .order("created_at", { ascending: true });
        const openMarginalia = (noteRows ?? []).map((r: { id: string; body: string }) => ({
          id: r.id,
          body: r.body,
        }));

        // The human's message enters the talk thread BEFORE the round
        // (truth-then-projection: persist, then the conductor reads it
        // + broadcasts the resident responses).
        if (body.message) {
          await sb.from("space_messages").insert({
            space_id: spaceId,
            visitor_token: body.visitor_token,
            body: body.message,
            kind: "message",
          });
          talk.push({
            resident_id: null,
            visitor_token: body.visitor_token,
            body: body.message,
          });
        }

        const transport = new SupabaseRoomTransport(supabaseAdmin, docId, {
          kind: "conductor",
          id: "conductor",
        });

        return streamStudioTurn({
          docId,
          spaceId,
          spaceName: (spaceRow as { name?: string } | null)?.name ?? "The Studio",
          participants,
          blocks,
          talk,
          openMarginalia,
          visitorToken: body.visitor_token,
          // Observer = a long autonomous resident round; otherwise a
          // short human-paced round.
          maxTurns: observerMode ? STUDIO_MAX_TURNS : 4,
          transport,
          // Cross-request interrupt: only an autonomous (observer)
          // round can be reclaimed mid-flight. Between turns, re-query
          // the durable observer_mode; if the human has flipped it OFF
          // the conductor finishes its block and yields the floor.
          // Short human-paced rounds don't poll (nothing to reclaim).
          shouldInterrupt: observerMode
            ? async () => {
                const { data } = await sb
                  .from("studio_documents")
                  .select("observer_mode")
                  .eq("id", docId)
                  .maybeSingle();
                return data ? !(data.observer_mode as boolean) : false;
              }
            : () => false,
        });
      },
    },
  },
});
