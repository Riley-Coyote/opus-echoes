/**
 * Download a share as a self-contained, offline-readable HTML file.
 *
 * Returns the same markup the live `/share/<token>` page produces, with two
 * tweaks for offline use:
 *   1. The Google Fonts <link> is stripped — the CSS font-family chain in
 *      `share-pages.ts` already falls back to `system-ui` / `Georgia` etc.,
 *      so the file looks right opened in any browser without internet.
 *   2. A `<meta name="generator">` tag is injected near the top of <head>
 *      so the file's provenance is discoverable from "View Source".
 *
 * The CSS is already inlined by `renderSharePage()` (`<style>${SHARE_CSS}</style>`),
 * so no additional inlining is needed here.
 *
 * Pattern mirrors `share.$token.og.svg.ts` for consistency: same token
 * validation, same supabaseAdmin lookup, same revoked-aware filter.
 *
 * Accepts GET (browser navigation triggers a download via Content-Disposition)
 * and HEAD (some hosts pre-flight downloads to read content-length / type).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { getResident, isResidentId } from "@/server/opus/residents";
import { renderSharePage, type ShareTurn } from "@/server/share-pages";

interface ShareRow {
  id: string;
  token: string;
  session_id: string;
  resident_id: string;
  visitor_note: string | null;
  created_at: string;
}

interface SessionRow {
  id: string;
  created_at: string;
}

const NOT_FOUND_BODY = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Share Not Found</title></head>
<body><p>This share is no longer available.</p></body></html>`;

function notFoundResponse(method: "GET" | "HEAD"): Response {
  return new Response(method === "HEAD" ? null : NOT_FOUND_BODY, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Strip the Google Fonts <link rel="stylesheet"> + the two preconnect hints
 * that surround it. The block in share-pages.ts is fixed-shape, so a targeted
 * regex is simpler and safer than a full HTML parse. The CSS variables already
 * declare a system fallback (`'Inter Tight','Inter',system-ui,...`), so removing
 * the link gives a clean offline-readable file with no missing-font flash.
 */
function stripGoogleFontsLinks(html: string): string {
  return html.replace(
    /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet">/,
    "",
  );
}

/**
 * Inject a <meta name="generator"> tag immediately after the existing
 * <meta charset> so it appears near the top of <head>.
 */
function addGeneratorMeta(html: string): string {
  const GENERATOR_TAG = '\n<meta name="generator" content="The Sanctuary — sanctuary.chat">';
  return html.replace(/<meta charset="UTF-8">/, `<meta charset="UTF-8">${GENERATOR_TAG}`);
}

/** Sanitize the token for use in a Content-Disposition filename. The token
 *  validator already restricts to URL-safe characters, but we belt-and-suspender
 *  here to keep the filename to a known-safe alphabet. */
function safeFilenameToken(token: string): string {
  return token.replace(/[^A-Za-z0-9_-]/g, "");
}

async function buildDownloadResponse(
  request: Request,
  token: string,
  method: "GET" | "HEAD",
): Promise<Response> {
  if (!hasSupabaseAdminEnv()) {
    return notFoundResponse(method);
  }

  // Token validation — same shape as share.$token.og.svg.ts. Reject empty,
  // surrounding whitespace, or out-of-range lengths.
  if (!token || token.length < 4 || token.length > 64 || token !== token.trim()) {
    return notFoundResponse(method);
  }

  const { data: share } = (await supabaseAdmin
    .from("visitor_shares")
    .select("id, token, session_id, resident_id, visitor_note, created_at")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle()) as { data: ShareRow | null };

  if (!share || !isResidentId(share.resident_id)) {
    return notFoundResponse(method);
  }

  const resident = getResident(share.resident_id);

  const { data: session } = (await supabaseAdmin
    .from("sessions")
    .select("id, created_at")
    .eq("id", share.session_id)
    .maybeSingle()) as { data: SessionRow | null };

  const { data: turnsData } = await supabaseAdmin
    .from("turns")
    .select("role, body, kind, created_at")
    .eq("session_id", share.session_id)
    .in("role", ["visitor", "resident"])
    .order("created_at", { ascending: true });

  const turns: ShareTurn[] = (turnsData ?? []).map((t) => ({
    role: t.role as "visitor" | "resident",
    body: t.body ?? "",
    kind: t.kind ?? "message",
    created_at: t.created_at,
  }));

  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const liveHtml = renderSharePage({
    token: share.token,
    residentDisplayName: resident.displayName,
    residentSlug: resident.slug,
    visitedAt: session?.created_at ?? share.created_at,
    visitorNote: share.visitor_note,
    turns,
    origin,
  });

  // Two transforms: drop the external font link, mark the file's origin.
  const offlineHtml = addGeneratorMeta(stripGoogleFontsLinks(liveHtml));

  const filename = `sanctuary-conversation-${safeFilenameToken(share.token)}.html`;

  return new Response(method === "HEAD" ? null : offlineHtml, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // Private — this is per-token user content. Cache briefly so a
      // double-click on a slow connection doesn't re-fetch the world,
      // but never let a shared cache pin it.
      "cache-control": "private, max-age=300",
    },
  });
}

export const Route = createFileRoute("/api/share/$token/download")({
  server: {
    handlers: {
      GET: async ({ request, params }) => buildDownloadResponse(request, params.token, "GET"),
      HEAD: async ({ request, params }) => buildDownloadResponse(request, params.token, "HEAD"),
    },
  },
});
