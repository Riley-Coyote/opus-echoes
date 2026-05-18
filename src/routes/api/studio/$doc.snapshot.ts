/**
 * GET /api/studio/$doc/snapshot — the full current document state.
 *
 * The client hydrates from this on mount (replacing the mockup's
 * sample content — the conversation.tsx "strip demo, rehydrate from
 * API" pattern) and re-fetches it on a `seq` gap (the build doc's
 * reconciliation path, mirroring /api/turns). Read-only; grounded in
 * the verified schema — no speculative fields.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId } from "@/server/opus/residents";
import { isBlockType, renderBlockHtml, type BlockType } from "@/server/studio/blocks";
import { backfillContinuityDeclarationSeed } from "@/server/studio/seed-document";

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/studio/$doc/snapshot")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!hasSupabaseAdminEnv()) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }
        const docId = params.doc;
        const sb = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        let { data: doc } = await sb
          .from("studio_documents")
          .select("id, space_id, title, subtitle, byline, status, observer_mode")
          .eq("id", docId)
          .maybeSingle();
        if (!doc) return jsonResp({ ok: false, code: "doc_not_found" }, 404);
        const spaceId = doc.space_id as string;

        let [{ data: residentRows }, { data: blockRows }, { data: talkRows }, { data: noteRows }] =
          await Promise.all([
            sb.from("space_residents").select("resident_id").eq("space_id", spaceId),
            sb
              .from("document_blocks")
              .select("id, ord, type, content, html_cache, version, author_resident_id")
              .eq("document_id", docId)
              .is("deleted_at", null)
              .order("ord", { ascending: true }),
            sb
              .from("space_messages")
              .select("id, resident_id, visitor_token, body, created_at")
              .eq("space_id", spaceId)
              .order("created_at", { ascending: true })
              .limit(120),
            sb
              .from("doc_marginalia")
              .select(
                "id, anchor_block_id, anchor_quote, body, author_resident_id, author_visitor_token, status, reply_to, created_at",
              )
              .eq("document_id", docId)
              .order("created_at", { ascending: true }),
          ]);

        const backfill = await backfillContinuityDeclarationSeed(
          sb,
          doc as {
            id: string;
            space_id: string;
            title: string | null;
            subtitle: string | null;
            byline: unknown;
            status: string;
            observer_mode: boolean;
          },
          (blockRows ?? []) as Array<{
            id: string;
            ord: number;
            type: string;
            content: string | null;
            html_cache: string | null;
            version: number | null;
            author_resident_id: string | null;
          }>,
        ).catch((err) => {
          console.error("[studio/snapshot] continuity seed backfill", err);
          return null;
        });
        if (backfill) {
          doc = backfill.doc as typeof doc;
          blockRows = backfill.blocks as typeof blockRows;
        }

        const residents = (residentRows ?? [])
          .map((r: { resident_id: string }) => r.resident_id)
          .filter(isResidentId);

        const blocks = (blockRows ?? []).map(
          (b: {
            id: string;
            ord: number;
            type: string;
            content: string | null;
            html_cache: string | null;
            version: number | null;
            author_resident_id: string | null;
          }) => {
            const type: BlockType = isBlockType(b.type) ? b.type : "para";
            const content = b.content ?? "";
            return {
              id: b.id,
              ord: b.ord,
              type,
              content,
              html:
                b.html_cache && b.html_cache.trim() ? b.html_cache : renderBlockHtml(type, content),
              version: b.version ?? 1,
              author_resident_id: b.author_resident_id,
            };
          },
        );

        const talk = (talkRows ?? []).map(
          (t: {
            id: string;
            resident_id: string | null;
            visitor_token: string | null;
            body: string;
            created_at: string;
          }) => ({
            id: t.id,
            resident_id: t.resident_id,
            is_visitor: !t.resident_id,
            body: t.body,
            created_at: t.created_at,
          }),
        );

        const marginalia = (noteRows ?? []).map(
          (n: {
            id: string;
            anchor_block_id: string | null;
            anchor_quote: string | null;
            body: string;
            author_resident_id: string | null;
            author_visitor_token: string | null;
            status: string;
            reply_to: string | null;
            created_at: string;
          }) => ({
            id: n.id,
            anchor_block_id: n.anchor_block_id,
            anchor_quote: n.anchor_quote,
            body: n.body,
            author_resident_id: n.author_resident_id,
            is_visitor: !n.author_resident_id,
            status: n.status,
            reply_to: n.reply_to,
            created_at: n.created_at,
          }),
        );

        return jsonResp({
          ok: true,
          doc: {
            id: doc.id,
            title: doc.title ?? "Untitled",
            subtitle: doc.subtitle ?? null,
            byline: doc.byline ?? [],
            status: doc.status ?? "active",
            observer_mode: !!doc.observer_mode,
          },
          residents,
          blocks,
          talk,
          marginalia,
        });
      },
    },
  },
});
