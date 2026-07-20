const DANGEROUS_BLOCKS =
  /<(?:script|style|foreignObject|iframe|object|embed)\b[^>]*>[\s\S]*?<\/(?:script|style|foreignObject|iframe|object|embed)\s*>/gi;
const DANGEROUS_ELEMENTS =
  /<\/?(?:script|style|foreignObject|iframe|object|embed|link|meta|animate|animateMotion|animateTransform|set|mpath)\b[^>]*>/gi;
const EVENT_HANDLER_ATTRIBUTE = /\s+on[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// Model-authored SVG has no need to navigate, load subresources, or carry
// inline CSS. Remove every URI-bearing and style attribute regardless of
// quoting or protocol instead of trying to enumerate dangerous schemes.
const URI_OR_STYLE_ATTRIBUTE =
  /\s+(?:(?:[a-z_][a-z0-9_.-]*:)?href|src|style)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const STYLE_URL = /url\s*\([^)]*\)/gi;

/**
 * Defense-in-depth for model-authored SVG crossing the new API boundary.
 * The legacy renderer currently injects SVG with innerHTML; this compatibility
 * layer emits a constrained form without executable elements, handlers, or
 * external resource loads.
 */
export function sanitizeSvgMarkup(markup: string): string {
  const trimmed = markup.trim().slice(0, 128_000);
  if (!/^<svg\b/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) return "";
  return trimmed
    .replace(DANGEROUS_BLOCKS, "")
    .replace(DANGEROUS_ELEMENTS, "")
    .replace(EVENT_HANDLER_ATTRIBUTE, "")
    .replace(URI_OR_STYLE_ATTRIBUTE, "")
    .replace(STYLE_URL, "none");
}

export function sanitizeArtifactForVisitor(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const artifact = value as Record<string, unknown>;
  const kind = artifact.kind;
  if (kind === "svg") {
    const content = typeof artifact.content === "string" ? sanitizeSvgMarkup(artifact.content) : "";
    if (!content) return null;
    return {
      kind,
      content,
      caption: typeof artifact.caption === "string" ? artifact.caption : null,
      sanitized: true,
    };
  }
  if (kind === "ascii") {
    return {
      kind,
      content: typeof artifact.content === "string" ? artifact.content.slice(0, 64_000) : "",
      caption: typeof artifact.caption === "string" ? artifact.caption : null,
    };
  }
  if (kind === "image") {
    return {
      kind,
      url: typeof artifact.url === "string" ? artifact.url : null,
      caption: typeof artifact.caption === "string" ? artifact.caption : null,
      prompt: typeof artifact.prompt === "string" ? artifact.prompt : null,
    };
  }
  return null;
}
