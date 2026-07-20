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
 *   3. Public image artifacts are inlined when they fit the bounded export
 *      budget. SVG/ASCII artifacts and visit-safe cognition receipts already
 *      arrive inline through the same projection used by the live share.
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
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { loadPublicShare, type PublicSharePayload } from "@/server/public-share.server";
import { attachmentBytesMatchMediaType } from "@/server/runtime/attachment-policy";
import { renderSharePage, type ShareArtifact } from "@/server/share-pages";

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

const OFFLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_OFFLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_OFFLINE_IMAGE_TOTAL_BYTES = 16 * 1024 * 1024;

function isPublicArtUrl(value: string): boolean {
  const configuredUrl = process.env.SUPABASE_URL;
  if (!configuredUrl) return false;
  try {
    const candidate = new URL(value);
    const configured = new URL(configuredUrl);
    return (
      candidate.origin === configured.origin &&
      candidate.pathname.startsWith("/storage/v1/object/public/art/")
    );
  } catch {
    return false;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // 24 KiB is divisible by three, so independently encoded chunks concatenate
  // without introducing padding in the middle of the data URL.
  const chunkSize = 24 * 1024;
  let encoded = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    let binary = "";
    for (const byte of chunk) binary += String.fromCharCode(byte);
    encoded += btoa(binary);
  }
  return encoded;
}

async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("offline artifact size limit exceeded").catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function inlineImageArtifact(
  artifact: ShareArtifact,
  remainingBytes: number,
): Promise<{ artifact: ShareArtifact; bytesUsed: number }> {
  if (artifact.kind !== "image" || !artifact.url || !isPublicArtUrl(artifact.url)) {
    return { artifact, bytesUsed: 0 };
  }

  try {
    const response = await fetch(artifact.url, { redirect: "error" });
    if (!response.ok) return { artifact, bytesUsed: 0 };

    const mediaType = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!OFFLINE_IMAGE_TYPES.has(mediaType)) return { artifact, bytesUsed: 0 };

    const declaredSize = Number(response.headers.get("content-length") ?? "0");
    const byteLimit = Math.min(MAX_OFFLINE_IMAGE_BYTES, remainingBytes);
    if (declaredSize > byteLimit) return { artifact, bytesUsed: 0 };

    const bytes = await readResponseBytesWithLimit(response, byteLimit);
    if (!bytes || !attachmentBytesMatchMediaType(mediaType, bytes)) {
      return { artifact, bytesUsed: 0 };
    }

    return {
      artifact: {
        ...artifact,
        url: `data:${mediaType};base64,${bytesToBase64(bytes)}`,
      },
      bytesUsed: bytes.byteLength,
    };
  } catch {
    // Preserve the already-public URL if the storage object cannot be inlined.
    // The rest of the offline export remains complete and readable.
    return { artifact, bytesUsed: 0 };
  }
}

async function makeSharePayloadOffline(payload: PublicSharePayload): Promise<PublicSharePayload> {
  let remainingBytes = MAX_OFFLINE_IMAGE_TOTAL_BYTES;
  const turns = [];

  for (const turn of payload.turns) {
    const artifacts: ShareArtifact[] = [];
    for (const artifact of turn.artifacts ?? []) {
      const inlined = await inlineImageArtifact(artifact, remainingBytes);
      remainingBytes -= inlined.bytesUsed;
      artifacts.push(inlined.artifact);
    }
    turns.push({ ...turn, artifacts });
  }

  return { ...payload, turns };
}

async function buildDownloadResponse(
  request: Request,
  token: string,
  method: "GET" | "HEAD",
): Promise<Response> {
  if (!hasSupabaseAdminEnv()) {
    return notFoundResponse(method);
  }

  const share = await loadPublicShare(token);
  if (!share) return notFoundResponse(method);

  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const offlinePayload = await makeSharePayloadOffline(share.payload);
  const liveHtml = renderSharePage({ ...offlinePayload, origin });

  // Two transforms: drop the external font link, mark the file's origin.
  const offlineHtml = addGeneratorMeta(stripGoogleFontsLinks(liveHtml));

  const filename = `sanctuary-conversation-${safeFilenameToken(share.payload.token)}.html`;

  return new Response(method === "HEAD" ? null : offlineHtml, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // The token can be revoked at any time. Do not let a browser, CDN, or
      // intermediary retain an accessible copy after that boundary changes.
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
      expires: "0",
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
