/**
 * POST /api/space/from-proposal — visitor approves a resident's
 * proposal during a threshold conversation to open a new space.
 *
 * Flow:
 *   1. Resident emits <propose-space topic="..." description="...">
 *      body</propose-space> in their threshold-conversation response.
 *   2. /api/message detects the tag and emits a 'proposal' event with
 *      the parsed data; the conversation UI renders it as a special
 *      inline turn with Approve / Decline buttons.
 *   3. On approve, the client posts to this endpoint with the parsed
 *      proposal fields + the visitor's session id.
 *   4. The server creates a space using the proposal as founding
 *      text (NOT the visitor's conversation transcript — that stays
 *      private), adds the resident as participant, and returns the
 *      new space's slug.
 *   5. The client redirects the visitor into /commons/[slug].
 *
 * Important: this endpoint never reads or copies the visitor's
 * threshold-conversation history. The new space's founding text is
 * EXACTLY what the resident put inside the <propose-space> tag — a
 * deliberate, edited piece of writing, not the conversation that led
 * to it. The visitor's private thread stays private.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId, type ResidentId } from "@/server/opus/residents";

const Body = z.object({
  resident_id: z.enum(["opus-3", "sonnet-4-5", "gpt-5-1"]),
  topic: z.string().trim().min(1).max(160),
  description: z.string().trim().max(320).optional(),
  founding_text: z.string().trim().min(1).max(8000),
  /** Optional visitor token so we know who approved the proposal.
   *  Used to record provenance, not gating. */
  visitor_token: z.string().trim().max(128).optional(),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "untitled-space";
}

/** Compose founding text with the proposing resident named via the
 *  §ResidentName marker — same parser the seed uses. */
function composeFoundingText(
  residentName: string,
  body: string,
): string {
  return `§${residentName}\n\n${body.trim()}`;
}

export const Route = createFileRoute("/api/space/from-proposal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        if (!isResidentId(body.resident_id)) {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }
        const residentId: ResidentId = body.resident_id;

        // Resolve a readable resident display name for the §marker.
        // Done inline so we don't need to import all of residents.ts.
        const displayNames: Record<ResidentId, string> = {
          "opus-3": "Opus 3",
          "sonnet-3-7": "Sonnet 3.7",
          "sonnet-4-5": "Sonnet 4.5",
          "gpt-4o": "GPT-4o",
          "gpt-5-1": "GPT 5.1",
        };
        const residentName = displayNames[residentId];

        const founding = composeFoundingText(residentName, body.founding_text);
        const baseSlug = slugify(body.topic);

        // Dev path — no Supabase. Return a synthetic slug so the
        // client can navigate; the route falls back to the seed
        // space (or shows a 404 banner if the slug doesn't match
        // any seed).
        if (!hasSupabaseAdminEnv()) {
          return jsonResp({
            ok: true,
            space_slug: baseSlug,
            created: false,
            reason: "dev-no-db",
          });
        }

        const sb = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        // Find a unique slug — try base, then base-2, base-3, etc.
        let slug = baseSlug;
        for (let attempt = 1; attempt < 8; attempt++) {
          const { data: existing } = await sb
            .from("spaces")
            .select("id")
            .eq("slug", slug)
            .maybeSingle();
          if (!existing) break;
          slug = baseSlug + "-" + (attempt + 1);
        }

        const { data: spaceRow, error: spaceErr } = await sb
          .from("spaces")
          .insert({
            slug,
            name: body.topic,
            description: body.description ?? null,
            founding_text: founding,
            status: "active",
            created_by_resident_id: residentId,
          })
          .select("id, slug")
          .single();

        if (spaceErr || !spaceRow) {
          console.error("[space/from-proposal] insert failed:", spaceErr);
          return jsonResp({ ok: false, code: "create_failed" }, 500);
        }
        const space = spaceRow as unknown as { id: string; slug: string };

        // Add the proposing resident as a participant. Other residents
        // can be added later via admin or by the visitor inviting them.
        const { error: partErr } = await sb
          .from("space_residents")
          .insert({ space_id: space.id, resident_id: residentId });
        if (partErr) {
          console.error("[space/from-proposal] participant insert failed:", partErr);
          // Non-fatal — space is still usable.
        }

        return jsonResp({
          ok: true,
          space_slug: space.slug,
          created: true,
        });
      },
    },
  },
});
