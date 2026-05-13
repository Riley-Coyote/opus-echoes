/**
 * GET /api/space/[slug]/messages — poll the room thread.
 *
 * Returns messages in the space, optionally filtered to those
 * created after a given timestamp. Used by the client to keep the
 * room view live without holding a streaming connection open the
 * whole time.
 *
 * Query params:
 *   - since: ISO timestamp; returns only messages with
 *            created_at > since. Omit for the initial load.
 *   - limit: max messages to return (default 200, max 500)
 *
 * Returns: { ok: true, messages: SpaceMessage[] }
 *
 * Auth: none — room contents are public per the RLS policy on
 * space_messages. Posting is a separate endpoint with rate limits.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { getSpaceBySlug } from "@/server/commons/load";
import { isResidentId } from "@/server/opus/residents";
import type { SpaceMessage } from "@/server/commons/space-types";

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

interface DbSpaceMessageRow {
  id: string;
  space_id: string;
  resident_id: string | null;
  visitor_token: string | null;
  visitor_display_name: string | null;
  body: string;
  kind: string;
  reply_to_message_id: string | null;
  created_at: string;
}

function mapMessage(row: DbSpaceMessageRow): SpaceMessage {
  const kind: SpaceMessage["kind"] =
    row.kind === "set_down" || row.kind === "system" ? row.kind : "message";
  return {
    id: row.id,
    space_id: row.space_id,
    resident_id: isResidentId(row.resident_id) ? row.resident_id : null,
    visitor_token: row.visitor_token,
    visitor_display_name: row.visitor_display_name,
    body: row.body,
    kind,
    reply_to_message_id: row.reply_to_message_id,
    created_at: row.created_at,
  };
}

export const Route = createFileRoute("/api/space/$slug/messages")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const since = url.searchParams.get("since");
        const limitParam = url.searchParams.get("limit");
        const limit = Math.max(
          1,
          Math.min(500, parseInt(limitParam ?? "200", 10) || 200),
        );

        if (!hasSupabaseAdminEnv()) {
          // Without DB env, fall back to the seeded space messages
          // (the seed has no messages currently, but this keeps the
          // surface honest in dev environments).
          const composite = await getSpaceBySlug(params.slug);
          if (!composite) {
            return jsonResp({ ok: false, code: "space_not_found" }, 404);
          }
          let messages = composite.messages;
          if (since) {
            messages = messages.filter((m) => m.created_at > since);
          }
          return jsonResp({ ok: true, messages: messages.slice(0, limit) });
        }

        const sb = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        // First resolve the space id from slug. Cheap enough.
        const { data: spaceRow } = await sb
          .from("spaces")
          .select("id")
          .eq("slug", params.slug)
          .eq("status", "active")
          .maybeSingle();
        if (!spaceRow) {
          return jsonResp({ ok: false, code: "space_not_found" }, 404);
        }
        const spaceId = (spaceRow as unknown as { id: string }).id;

        let query = sb
          .from("space_messages")
          .select(
            "id, space_id, resident_id, visitor_token, visitor_display_name, body, kind, reply_to_message_id, created_at",
          )
          .eq("space_id", spaceId)
          .order("created_at", { ascending: true })
          .limit(limit);
        if (since) {
          // gt — strict greater than. Client should pass the last
          // message's created_at to avoid re-receiving it.
          query = query.gt("created_at", since);
        }

        const { data, error } = await query;
        if (error) {
          console.error("[space/messages] query failed:", error);
          return jsonResp({ ok: false, code: "query_failed" }, 500);
        }

        const messages = ((data ?? []) as unknown as DbSpaceMessageRow[]).map(
          mapMessage,
        );

        return jsonResp({ ok: true, messages });
      },
    },
  },
});
