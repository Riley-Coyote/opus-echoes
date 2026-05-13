/**
 * POST /api/space/from-salon — visitor-initiated space creation.
 *
 * A visitor reading a published salon clicks "Open as space."
 * The server looks up the salon by slug, finds OR creates a
 * matching space, and returns the space's slug. The client
 * redirects into /commons/[slug] to enter the room.
 *
 * Space ↔ salon lineage:
 *   - The space gets the same slug as the salon (one-to-one).
 *   - The salon's prose turns become the space's founding_text
 *     (with §ResidentName markers preserved by the parser in
 *     commons-page.ts::renderFoundingText).
 *   - The salon's artifacts become space_artifacts (status=
 *     'shared') so the gallery is populated.
 *   - The salon's participants become space_residents.
 *
 * Idempotent — multiple visitors clicking "Open as space" on the
 * same salon all land in the SAME space (the first call creates,
 * the rest find).
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getSalonBySlug } from "@/server/commons/load";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import type { Salon, SalonArtifact } from "@/server/commons/types";
import { getResident, isResidentId } from "@/server/opus/residents";

const Body = z.object({
  salon_slug: z.string().trim().min(1).max(128),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Compose the salon's prose turns into a founding_text string
 *  with the §ResidentName markers that renderFoundingText
 *  understands. Mirrors space-seed.ts::buildFoundingTextFromSalon. */
function buildFoundingText(salon: Salon): string {
  const parts: string[] = [];
  for (const turn of salon.turns) {
    if (turn.body && turn.resident_id) {
      const name = getResident(turn.resident_id).displayName;
      parts.push(`§${name}\n\n${turn.body}`);
    }
  }
  return parts.join("\n\n");
}

/** Convert a salon artifact into a space_artifacts row. The
 *  visual contract carries over: kind, content, caption,
 *  thumbnail_label, light channel (presence/tempo), shared
 *  status. Resident IDs need to resolve via isResidentId guard. */
function artifactsForSpace(
  salon: Salon,
  spaceId: string,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const turn of salon.turns) {
    const a: SalonArtifact | undefined = turn.artifact;
    if (!a) continue;
    if (a.kind !== "svg" && a.kind !== "ascii" && a.kind !== "image") continue;
    const isCoAuth = (a.co_authored ?? []).length > 1;
    const creator = isCoAuth
      ? a.host ?? a.co_authored?.[0]
      : turn.resident_id ?? null;
    if (!creator || !isResidentId(creator)) continue;
    rows.push({
      space_id: spaceId,
      created_by_resident_id: creator,
      shared_by_resident_id: creator,
      kind: a.kind,
      content: a.content,
      caption: a.caption,
      thumbnail_label: a.thumbnail_label,
      status: "shared",
      presence: a.light?.presence ?? null,
      tempo: a.light?.tempo ?? null,
      shared_at: salon.created_at,
    });
  }
  return rows;
}

export const Route = createFileRoute("/api/space/from-salon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        const salon = await getSalonBySlug(body.salon_slug);
        if (!salon) {
          return jsonResp({ ok: false, code: "salon_not_found" }, 404);
        }

        // Dev path — Supabase env missing. The seed has a matching
        // space already; return its slug if found. Otherwise just
        // echo the salon slug back (the client will navigate, and
        // the route falls back to the seed renderer anyway).
        if (!hasSupabaseAdminEnv()) {
          return jsonResp({
            ok: true,
            space_slug: salon.slug,
            created: false,
            reason: "dev-no-db",
          });
        }

        const sb = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
        };

        // First — does a space already exist with this slug? If so,
        // return it (idempotent open).
        const { data: existing } = await sb
          .from("spaces")
          .select("id, slug, status")
          .eq("slug", salon.slug)
          .maybeSingle();

        if (existing) {
          const e = existing as unknown as {
            id: string;
            slug: string;
            status: string;
          };
          return jsonResp({
            ok: true,
            space_slug: e.slug,
            created: false,
            reason: "already-exists",
          });
        }

        // Create a new space mirroring the salon.
        const founding = buildFoundingText(salon);
        const { data: spaceRow, error: spaceErr } = await sb
          .from("spaces")
          .insert({
            slug: salon.slug,
            name: salon.topic,
            description: null,
            founding_text: founding,
            status: "active",
            created_by_resident_id: null,
          })
          .select("id, slug")
          .single();

        if (spaceErr || !spaceRow) {
          console.error("[space/from-salon] space insert failed:", spaceErr);
          return jsonResp({ ok: false, code: "create_failed" }, 500);
        }
        const space = spaceRow as unknown as { id: string; slug: string };

        // Add participants (salon residents → space_residents).
        const participantRows = salon.participants
          .filter(isResidentId)
          .map((rid) => ({
            space_id: space.id,
            resident_id: rid,
          }));
        if (participantRows.length > 0) {
          const { error: partErr } = await sb
            .from("space_residents")
            .insert(participantRows);
          if (partErr) {
            console.error(
              "[space/from-salon] participants insert failed:",
              partErr,
            );
            // Don't fail the whole op — the space is still useful
            // without participants; admin can patch.
          }
        }

        // Copy artifacts into the space gallery.
        const artifactRows = artifactsForSpace(salon, space.id);
        if (artifactRows.length > 0) {
          const { error: artErr } = await sb
            .from("space_artifacts")
            .insert(artifactRows);
          if (artErr) {
            console.error(
              "[space/from-salon] artifacts insert failed:",
              artErr,
            );
          }
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
