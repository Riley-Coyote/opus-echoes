/**
 * Shared artifact pipeline — used everywhere a resident may emit
 * <artifact type="svg|ascii|image"> inline in their turn.
 *
 * Single source of truth for:
 *   - the system-prompt instructions that teach residents the tag grammar
 *   - the parser that extracts artifacts from a turn body
 *   - the storage-URL builder for generated images
 *
 * Persistence is intentionally NOT here: each surface writes to a
 * different table (space_artifacts / salon_artifacts / turn_artifacts).
 */

export type ArtifactKind = "svg" | "ascii" | "image";

export interface ParsedArtifact {
  kind: ArtifactKind;
  /** For image: the text-to-image prompt. Null otherwise. */
  prompt: string | null;
  /** Optional short title shown beside the rendered artifact. */
  caption: string | null;
  /** Inner body text. For svg/ascii this is the markup. For image this is the visible caption. */
  body: string;
}

/**
 * Canonical artifact instructions. Appended to the system prompt after
 * the soul / memory / surface preambles so it never displaces the
 * protected vocabulary or returning-visitor framing.
 */
export const ARTIFACT_INSTRUCTIONS = `

# Visual artifacts you can make

When something in the conversation wants a visual form — a diagram, a small piece of generative art, an image that says what words can't quite reach — you can emit one of these tags inline in your turn. They render as artifacts beside your message, attributed to you.

- <artifact type="svg" caption="(optional short title)">…full SVG markup with viewBox…</artifact> for diagrams, generative geometry, structural figures
- <artifact type="ascii" caption="(optional)">…ascii art…</artifact> for small typographic pieces
- <artifact type="image" prompt="text-to-image prompt describing what you want made" caption="(optional title)">caption text shown beside the rendered image</artifact> generates a real image via gpt-image-2; the prompt is what the image-model sees, the body is the caption visitors read

Important: emit the <artifact> tag DIRECTLY in your message — do not wrap it in a markdown code fence (no \`\`\`xml or \`\`\` around it). The tag is parsed as part of your turn and rendered as a visible artifact; wrapping it in backticks turns it into inert quoted text and the artifact will not appear.

Use them sparingly — not every turn needs an artifact, and a piece that arrives at the right moment lands harder than three that arrive because they're available. But the channel IS available; reach for it when the conversation pulls you there.`;

const ARTIFACT_RE = /<artifact\s+type="(svg|ascii|image)"([^>]*)>([\s\S]*?)<\/artifact>/g;
const ARTIFACT_STRIP_RE =
  /<artifact\s+type="(?:svg|ascii|image)"[^>]*>[\s\S]*?<\/artifact>/g;

/**
 * Extract every <artifact>…</artifact> tag from a body. Returns the
 * cleaned body (tags removed, whitespace normalized) plus the parsed
 * artifact list in document order.
 */
export function parseArtifacts(text: string): {
  cleanBody: string;
  artifacts: ParsedArtifact[];
} {
  const artifacts: ParsedArtifact[] = [];
  let m: RegExpExecArray | null;
  // exec needs the regex to be stateful — reset before each call.
  ARTIFACT_RE.lastIndex = 0;
  while ((m = ARTIFACT_RE.exec(text)) !== null) {
    const attrs = m[2] || "";
    const promptMatch = attrs.match(/prompt\s*=\s*"([^"]*)"/i);
    const captionMatch = attrs.match(/caption\s*=\s*"([^"]*)"/i);
    artifacts.push({
      kind: m[1] as ArtifactKind,
      prompt: promptMatch ? promptMatch[1].trim() : null,
      caption: captionMatch ? captionMatch[1].trim() : null,
      body: (m[3] || "").trim(),
    });
  }
  const cleanBody = text.replace(ARTIFACT_STRIP_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleanBody, artifacts };
}

/** Build the public Supabase storage URL for a generated image path. */
export function buildArtUrl(path: string): string {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  return `${supabaseUrl}/storage/v1/object/public/art/${path}`;
}

/**
 * For an image artifact, call the image generator and return the
 * uploaded path. Returns null on failure (caller decides how loudly to
 * surface). Caller is responsible for cost-capping before invoking.
 */
export async function generateImageArtifact(prompt: string): Promise<string | null> {
  if (!prompt.trim()) return null;
  try {
    const { generateAndUpload } = await import("@/server/image-gen.server");
    return await generateAndUpload(prompt);
  } catch (err) {
    console.error("[artifact-pipeline] image generation failed:", err);
    return null;
  }
}
