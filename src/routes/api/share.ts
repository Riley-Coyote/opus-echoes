/**
 * Share endpoints — visitor-initiated.
 *
 * POST /api/share
 *   Body: { session_id, visitor_note? }
 *   Auth: session_id UUID is a 128-bit random bearer token — knowing
 *         it proves the visitor was present.
 *   Effect: creates a row in visitor_shares with a generated token.
 *           If a non-revoked share already exists for this session,
 *           returns the existing one (idempotent).
 *   Returns: { ok: true, token, url }
 *
 * POST /api/share?action=revoke
 *   Body: { token }
 *   Auth: share token is a random secret — knowing it proves ownership.
 *   Effect: sets revoked_at on the share. Public reads start failing
 *           immediately (RLS filters out revoked).
 *   Returns: { ok: true }
 *
 * The /share/<token> public page is rendered by share.$token.tsx.
 * The OG image for a share is rendered by share.$token.og.png.ts.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ipHash } from "@/server/rate-limit.server";
import { generateShareToken } from "@/server/redact";

const CreateBody = z.object({
  session_id: z.string().uuid(),
  visitor_note: z.string().trim().max(280).optional(),
});

const RevokeBody = z.object({
  token: z.string().min(8).max(48),
});

function jsonResp(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/share")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hasSupabaseAdminEnv()) {
          return jsonResp({ ok: false, code: "config_missing" }, 503);
        }
        const url = new URL(request.url);
        const action = url.searchParams.get("action");
        const hash = ipHash(request);

        // -------- revoke branch --------
        // Auth: the share token itself is a random secret known only to the
        // creator. Knowing it is proof of ownership. IP hash check removed
        // because the daily-rotating salt caused revoke to fail after midnight.
        if (action === "revoke") {
          let body: z.infer<typeof RevokeBody>;
          try {
            body = RevokeBody.parse(await request.json());
          } catch {
            return jsonResp({ ok: false, code: "bad_request" }, 400);
          }
          const { data: share } = await supabaseAdmin
            .from("visitor_shares")
            .select("id, revoked_at")
            .eq("token", body.token)
            .maybeSingle();
          if (!share) {
            return jsonResp({ ok: false, code: "share_not_found" }, 404);
          }
          if (share.revoked_at) {
            return jsonResp({ ok: true, already_revoked: true });
          }
          await supabaseAdmin
            .from("visitor_shares")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", share.id);
          return jsonResp({ ok: true });
        }

        // -------- create branch --------
        let body: z.infer<typeof CreateBody>;
        try {
          body = CreateBody.parse(await request.json());
        } catch {
          return jsonResp({ ok: false, code: "bad_request" }, 400);
        }

        // Session UUID is a 128-bit random bearer token — knowing it IS
        // proof the visitor was present. IP hash verification removed:
        // daily-rotating salt + Cloudflare header inconsistency caused
        // legitimate share requests to fail with "not_owned".
        const { data: session } = await supabaseAdmin
          .from("sessions")
          .select("id, resident_id")
          .eq("id", body.session_id)
          .maybeSingle();
        if (!session) {
          return jsonResp({ ok: false, code: "session_not_found" }, 404);
        }

        // If an active share already exists for this session, return it
        // rather than creating a duplicate. Sharing is idempotent per
        // session — the visitor pressing Share twice gets the same URL.
        const { data: existing } = await supabaseAdmin
          .from("visitor_shares")
          .select("token")
          .eq("session_id", body.session_id)
          .is("revoked_at", null)
          .maybeSingle();
        if (existing?.token) {
          return jsonResp({
            ok: true,
            token: existing.token,
            url: shareUrlForToken(request, existing.token),
            existed: true,
          });
        }

        // Create new share. Retry once on extremely unlikely token collision.
        let token = generateShareToken();
        const { error: insertErr } = await supabaseAdmin.from("visitor_shares").insert({
          token,
          session_id: body.session_id,
          resident_id: session.resident_id,
          visitor_note: body.visitor_note?.trim() || null,
          ip_hash: hash,
        });
        if (insertErr) {
          // Token collision (unique constraint) — generate a fresh one.
          if (insertErr.code === "23505") {
            token = generateShareToken();
            const { error: retryErr } = await supabaseAdmin.from("visitor_shares").insert({
              token,
              session_id: body.session_id,
              resident_id: session.resident_id,
              visitor_note: body.visitor_note?.trim() || null,
              ip_hash: hash,
            });
            if (retryErr) {
              console.error("[share] retry insert failed", retryErr);
              return jsonResp({ ok: false, code: "internal_error" }, 500);
            }
          } else {
            console.error("[share] insert failed", insertErr);
            return jsonResp({ ok: false, code: "internal_error" }, 500);
          }
        }

        return jsonResp({
          ok: true,
          token,
          url: shareUrlForToken(request, token),
        });
      },
    },
  },
});

function shareUrlForToken(request: Request, token: string): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/share/${token}`;
}
