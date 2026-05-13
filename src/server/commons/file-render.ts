/**
 * Render uploaded file content (markdown, html, plain text) for the
 * space view + gallery thumbnails. Kept isolated so the dependency
 * surface (marked, isomorphic-dompurify) lives in one place and the
 * rest of commons-page.ts stays renderer-pure.
 */

import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

// Marked configured for GitHub-flavored basics. No raw HTML pass-
// through — anything that comes back through DOMPurify is the
// surface available to admin-uploaded markdown.
marked.setOptions({
  gfm: true,
  breaks: true,
});

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "strong", "em", "u", "s", "del", "ins", "code", "pre",
    "ul", "ol", "li",
    "a",
    "blockquote", "hr",
    "table", "thead", "tbody", "tr", "th", "td",
    "span", "div",
    "img",
  ],
  ALLOWED_ATTR: ["href", "title", "alt", "src", "class", "id", "target", "rel"],
  ALLOW_DATA_ATTR: false,
  // Force-add rel=noopener noreferrer to anchors and target=_blank
  // via hooks below.
  RETURN_TRUSTED_TYPE: false,
};

// Lazy: apply hook only once.
let hookInstalled = false;
function ensureHook() {
  if (hookInstalled) return;
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (node.nodeName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  hookInstalled = true;
}

/** Render a markdown string to safe HTML. */
export function renderMarkdown(text: string): string {
  ensureHook();
  const raw = marked.parse(text, { async: false }) as string;
  return String(DOMPurify.sanitize(raw, PURIFY_CONFIG));
}

/** Sanitize a user-provided HTML fragment. */
export function renderSanitizedHtml(text: string): string {
  ensureHook();
  return String(DOMPurify.sanitize(text, PURIFY_CONFIG));
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
