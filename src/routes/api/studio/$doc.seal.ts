/**
 * POST /api/studio/$doc/seal — set the document down.
 *
 * The thesis-completing step: the finished work leaves the live room
 * and re-enters the Sanctuary substrate.
 *   1. render the ordered blocks → canonical Markdown
 *   2. write it as a space_artifacts row (kind='markdown',
 *      status='shared') — the existing gallery model owns the
 *      durable finished form (kind='markdown' is already permitted
 *      by 20260513200000_space_artifacts_file_kinds.sql — verified)
 *   3. studio_documents.status → sealed
 *   4. consolidate into Mnemos via the REAL pipeline:
 *      consolidateSession(created_from_session_id) +
 *      observeSpaceExchange(space, resident) per participating
 *      resident. (The build doc sketched a raw doc_marginalia →
 *      substrate `marginalia` fold; the actual marginalia schema is
 *      a Mnemos-internal signal table — session_id NOT NULL, a
 *      constrained `kind` enum — so a literal fold would require
 *      fabricating kind/session_id. observeSpaceExchange is how the
 *      deliberation properly reaches Mnemos; we use that, not a
 *      fabricated INSERT.)
 *
 * Peer-gated (space_participants) — any participant may set the
 * shared document down. Consolidation is best-effort (try/catch,
 * non-fatal): the artifact + sealed status are the durable truth;
 * Mnemos enrichment must never block or fail the seal. Synchronous
 * await-in-request (the conductor-pattern discipline).
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId, type ResidentId } from "@/server/opus/residents";
import { consolidateSession, observeSpaceExchange } from "@/server/substrate.server";
import { type BlockType, isBlockType } from "@/server/studio/blocks";
import { ensureStudioParticipant } from "@/server/studio/seed-document";
import { isLocalStudioDoc, sealLocalStudio } from "@/server/studio/local-studio";

const Body = z.object({
  visitor_token: z.string().trim().min(8).max(128),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Ordered blocks → canonical Markdown. */
function toMarkdown(
  title: string,
  subtitle: string | null,
  blocks: Array<{ ord: number; type: BlockType; content: string }>,
): string {
  const out: string[] = [`# ${title}`];
  if (subtitle) out.push(`_${subtitle}_`);
  for (const b of blocks.slice().sort((a, z2) => a.ord - z2.ord)) {
    const c = (b.content || "").trim();
    if (!c) continue;
    if (b.type === "section") out.push(`## ${c}`);
    else if (b.type === "pull") out.push(`> ${c}`);
    else if (b.type === "em_strong") out.push(`**${c}**`);
    else out.push(c);
  }
  return out.join("\n\n") + "\n";
}

export const Route = createFileRoute("/api/studio/$doc/seal")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }
        if (isLocalStudioDoc(params.doc)) {
          return jsonResp(sealLocalStudio());
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
          .select(
            "id, space_id, title, subtitle, status, created_from_session_id, created_by_visitor_token",
          )
          .eq("id", docId)
          .eq("status", "active")
          .maybeSingle();
        if (!doc) {
          return jsonResp({ ok: false, code: "doc_not_found_or_sealed" }, 404);
        }
        const spaceId = doc.space_id as string;

        try {
          await ensureStudioParticipant(sb, spaceId, body.visitor_token);
        } catch (err) {
          console.error("[studio/seal] participant join failed", err);
          return jsonResp({ ok: false, code: "participant_unavailable" }, 500);
        }

        const [{ data: blockRows }, { data: residentRows }] = await Promise.all([
          sb
            .from("document_blocks")
            .select("ord, type, content")
            .eq("document_id", docId)
            .is("deleted_at", null)
            .order("ord", { ascending: true }),
          sb.from("space_residents").select("resident_id").eq("space_id", spaceId),
        ]);

        const blocks = (blockRows ?? []).map(
          (b: { ord: number; type: string; content: string | null }) => ({
            ord: b.ord,
            type: (isBlockType(b.type) ? b.type : "para") as BlockType,
            content: b.content ?? "",
          }),
        );
        const markdown = toMarkdown(
          (doc.title as string) || "Untitled",
          (doc.subtitle as string | null) ?? null,
          blocks,
        );

        // (2) durable finished form in the gallery model.
        const { error: artErr } = await sb.from("space_artifacts").insert({
          space_id: spaceId,
          created_by_visitor_token: doc.created_by_visitor_token,
          kind: "markdown",
          content: markdown,
          caption: (doc.title as string) || "Untitled",
          status: "shared",
          shared_at: new Date().toISOString(),
        });
        if (artErr) {
          console.error("[studio/seal] artifact insert", artErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        // (3) freeze the live document.
        const { error: sealErr } = await sb
          .from("studio_documents")
          .update({ status: "sealed", sealed_at: new Date().toISOString() })
          .eq("id", docId);
        if (sealErr) {
          console.error("[studio/seal] seal update", sealErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        // (4) Mnemos consolidation — best-effort, never fatal.
        const sessionId = doc.created_from_session_id as string | null;
        if (sessionId) {
          try {
            await consolidateSession(sessionId);
          } catch (err) {
            console.error("[studio/seal] consolidateSession", err);
          }
        }
        const residents: ResidentId[] = (residentRows ?? [])
          .map((r: { resident_id: string }) => r.resident_id)
          .filter(isResidentId);
        for (const rid of residents) {
          try {
            await observeSpaceExchange(spaceId, rid);
          } catch (err) {
            console.error("[studio/seal] observeSpaceExchange", rid, err);
          }
        }

        return jsonResp({ ok: true, sealed: true, blocks: blocks.length });
      },
    },
  },
});
