/**
 * POST /api/studio/create — spawn a Studio from the classic chat.
 *
 * "Begin a document" in /chat/<resident> posts here. Each spawn is a
 * NEW document (a distinct authored artifact), so it creates a fresh
 * `spaces` row (slug `studio-<short>`) rather than reusing one — the
 * one-active-document-per-space invariant is enforced by the partial
 * unique index in 20260517120000_studio_documents.sql. The
 * collaborative resident set is ALL_RESIDENTS (the Studio is the
 * multi-resident room, unlike the single-resident chat it spawned
 * from); the originating chat session is recorded on
 * studio_documents.created_from_session_id for continuity + the P5
 * consolidation hook.
 *
 * Auth note: P1 gates on supabase env + a durable visitor_token and
 * records the peer in space_participants. Deep per-message
 * server-side validation of every transport action against
 * space_participants is P4 (the dedicated auth phase) — not
 * front-loaded here.
 *
 * Every column written is grounded in the verified migrations
 * (spaces: 20260513000000 + later ADD COLUMNs; studio_*:
 * 20260517120000) — no speculative columns.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import {
  ALL_RESIDENTS,
  DEFAULT_RESIDENT_ID,
  getResident,
  isResidentId,
} from "@/server/opus/residents";
import { CONTINUITY_DECLARATION_SEED, studioSeedBlockRows } from "@/server/studio/seed-document";

const Body = z.object({
  resident: z.string().optional(),
  visitor_token: z.string().uuid(),
  session_id: z.string().uuid().optional(),
  seed: z.enum(["continuity-declaration", "blank"]).optional(),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/studio/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (!hasSupabaseAdminEnv()) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }

        // Dynamic-table escape hatch — the same cast getSpaceBySlug
        // uses. The studio_* tables land in the generated Database
        // type only after the migration is applied (Lovable owns
        // regen); this keeps tsc honest without depending on it.
        const sb = supabaseAdmin as unknown as {
          from: (name: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        const residentId =
          body.resident && isResidentId(body.resident) ? body.resident : DEFAULT_RESIDENT_ID;
        const resident = getResident(residentId);
        const seed = body.seed === "blank" ? null : CONTINUITY_DECLARATION_SEED;

        // Fresh space per document. slug collision on the UNIQUE
        // spaces.slug is astronomically unlikely (8 hex chars); a
        // single attempt is the right P1 cost/robustness tradeoff.
        const slug = `studio-${crypto.randomUUID().slice(0, 8)}`;

        const { data: spaceRow, error: spaceErr } = await sb
          .from("spaces")
          .insert({
            slug,
            name: seed?.spaceName ?? `Studio · ${resident.displayName}`,
            description: seed?.spaceDescription ?? "A collaborative document room.",
            founding_text: null,
            status: "active",
            created_by_resident_id: null,
          })
          .select("id, slug")
          .single();
        if (spaceErr || !spaceRow) {
          console.error("[studio/create] space insert", spaceErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }
        const spaceId = spaceRow.id as string;

        // The Studio is the multi-resident room — seed every resident.
        const { error: residentsErr } = await sb
          .from("space_residents")
          .insert(ALL_RESIDENTS.map((r) => ({ space_id: spaceId, resident_id: r.id })));
        if (residentsErr) {
          console.error("[studio/create] space_residents insert", residentsErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        const { data: docRow, error: docErr } = await sb
          .from("studio_documents")
          .insert({
            space_id: spaceId,
            title: seed?.title ?? "Untitled",
            subtitle: seed?.subtitle ?? null,
            byline: seed?.byline ?? [],
            status: "active",
            created_from_session_id: body.session_id ?? null,
            created_by_visitor_token: body.visitor_token,
            observer_mode: false,
          })
          .select("id")
          .single();
        if (docErr || !docRow) {
          console.error("[studio/create] studio_documents insert", docErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }
        const docId = docRow.id as string;

        // Launch seed: the first public Studio room opens on the
        // Continuity Declaration the residents made locally. `blank`
        // remains available for future callers/tests, but the chat
        // affordance intentionally illustrates the feature with a real
        // manuscript on the table instead of an empty block.
        const blockRows = seed
          ? studioSeedBlockRows(docId, seed)
          : [
              {
                document_id: docId,
                ord: 1,
                type: "para",
                content: "",
                html_cache: "<p></p>",
                version: 1,
              },
            ];
        const { error: blockErr } = await sb.from("document_blocks").insert(blockRows);
        if (blockErr) {
          console.error("[studio/create] seed block insert", blockErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        const { error: partErr } = await sb.from("space_participants").insert({
          space_id: spaceId,
          visitor_token: body.visitor_token,
          role: "peer",
          display_name: null,
        });
        if (partErr) {
          console.error("[studio/create] space_participants insert", partErr);
          return jsonResp({ ok: false, code: "internal_error" }, 500);
        }

        return jsonResp({
          ok: true,
          space_slug: spaceRow.slug,
          doc_id: docId,
        });
      },
    },
  },
});
