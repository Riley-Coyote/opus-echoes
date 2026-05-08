/**
 * Public-text redaction. Used for any visitor-attributed content that
 * gets surfaced beyond the original session — the public archive, the
 * visitor share pages, OG meta descriptions.
 *
 * The pattern matches the substrate's `redactQuote` (substrate.server.ts)
 * — same regex set so visitor words are treated identically across
 * archive flows. Centralized here so future privacy refinements only
 * need one update site.
 *
 * What gets masked:
 *   - Capitalized name-like sequences (2+ words) → [someone]
 *   - Email addresses → [contact]
 *   - Phone numbers → [number]
 *   - URLs → [link]
 *   - Specific dates ("April 22, 2026") → [a date]
 */
export function redactPublicText(value: string): string {
  return value
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[contact]")
    .replace(/\b\+?\d[\d\s().-]{6,}\d\b/g, "[number]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s+\d{4})?\b/gi,
      "[a date]",
    )
    .replace(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g, "[someone]");
}

/**
 * Friendly relative-time label. Matches the existing format used in the
 * archive (today / yesterday / N days ago / Nw ago / Nmo ago).
 */
export function humanWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = diff / 86_400_000;
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return `${Math.floor(days)} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * URL-safe random token suitable for public share links. 12 chars from
 * 9 random bytes (base64url, padding stripped). Collision space is ~72
 * bits — vastly larger than the realistic share volume of this project.
 *
 * Uses Web Crypto, available in Cloudflare Workers and Bun.
 */
export function generateShareToken(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  // Convert bytes -> base64 -> url-safe. btoa is available in CF Workers.
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
