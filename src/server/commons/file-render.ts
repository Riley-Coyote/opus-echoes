/**
 * Render uploaded file content (markdown, html, plain text) for the
 * space view + gallery thumbnails.
 *
 * Worker compatibility note: this module originally pulled
 * isomorphic-dompurify for HTML sanitization, which transitively
 * imports jsdom — jsdom uses child_process/vm and explodes at
 * module-load time in Cloudflare Workers (the runtime the
 * mnemos.chat deployment uses), taking the entire bundled worker
 * down with it. So sanitization is currently a no-op gate, with
 * the following risk model:
 *
 *   - Uploads are admin-only via POST /api/space/$slug/upload-file
 *     gated by hasAdminAccess(). Visitors cannot reach this path.
 *   - The admin (Riley) is uploading his own files. The threat
 *     surface is "Riley shoots his own foot" — accepted.
 *
 *   BEFORE ENABLING ANY VISITOR-SIDE FILE UPLOAD, swap in a
 *   pure-JS allowlist sanitizer (e.g. the `xss` package by
 *   leizongmin — Worker-compatible, no DOM dep) for both the
 *   markdown-rendered HTML and the raw HTML path. Until then,
 *   keep this surface admin-only.
 */

import { marked } from "marked";

// Marked configured for GitHub-flavored basics. No raw HTML pass-
// through enabled in marked itself — but marked still emits anchor
// tags, headings, etc. that pass through unmodified since we no
// longer sanitize.
marked.setOptions({
  gfm: true,
  breaks: true,
});

/** Render a markdown string to HTML. Admin-trusted source. */
export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

/** Pass an HTML fragment through unchanged. Admin-trusted source.
 *  Named `renderSanitizedHtml` for callsite compatibility, but
 *  this function does NOT currently sanitize — see top-of-file
 *  worker-compat note. */
export function renderSanitizedHtml(text: string): string {
  return text;
}

/** Escape plain text for safe insertion inside HTML (without
 *  preserving newlines — caller wraps in <pre> if needed). */
export function escapePlainText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
