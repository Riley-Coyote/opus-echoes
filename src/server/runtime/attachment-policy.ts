export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_VISIT_ATTACHMENT_BYTES = 40 * 1024 * 1024;
export const MAX_VISIT_ATTACHMENTS = 12;
export const MAX_MODEL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_MODEL_ATTACHMENTS = 6;

export const ALLOWED_ATTACHMENT_MEDIA_TYPES = [
  "text/plain",
  "text/markdown",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
] as const;

/**
 * File formats that the currently configured resident providers can receive
 * directly. Audio remains a reserved storage format for the deferred voice
 * release and is intentionally absent from the first chat capability.
 */
export const MODEL_VISIBLE_ATTACHMENT_MEDIA_TYPES = [
  "text/plain",
  "text/markdown",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const ALLOWED = new Set<string>(ALLOWED_ATTACHMENT_MEDIA_TYPES);
const MODEL_VISIBLE = new Set<string>(MODEL_VISIBLE_ATTACHMENT_MEDIA_TYPES);

export function isAllowedAttachmentMediaType(value: string): boolean {
  return ALLOWED.has(value.toLowerCase());
}

export function isModelVisibleAttachmentMediaType(value: string): boolean {
  return MODEL_VISIBLE.has(value.toLowerCase());
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

/**
 * Reject declared-type spoofing before private storage or provider delivery.
 * This is format validation, not a claim that document contents are trusted;
 * model prompts continue to wrap every attachment as untrusted visitor data.
 */
export function attachmentBytesMatchMediaType(
  mediaType: string,
  input: ArrayBuffer | Uint8Array,
): boolean {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const normalized = mediaType.toLowerCase();
  if (normalized === "image/png") {
    return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (normalized === "image/jpeg") {
    return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  }
  if (normalized === "image/gif") {
    const header = new TextDecoder("ascii").decode(bytes.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (normalized === "image/webp") {
    return (
      bytes.length >= 12 &&
      new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP"
    );
  }
  if (normalized === "application/pdf") {
    return new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (
    normalized === "text/plain" ||
    normalized === "text/markdown" ||
    normalized === "application/json"
  ) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\0")) return false;
      if (normalized === "application/json") JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Read at most `maxBytes` from an untrusted request body. Content-Length is a
 * useful early rejection, but it is not trusted as the enforcement boundary.
 */
export async function readRequestBodyWithLimit(
  request: Request,
  maxBytes = MAX_ATTACHMENT_BYTES,
): Promise<ArrayBuffer | null> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const parsed = Number(declared);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxBytes) return null;
  }
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("attachment size limit exceeded").catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}
