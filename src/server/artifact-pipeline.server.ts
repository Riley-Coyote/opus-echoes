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

When something in the conversation wants a visual form — a diagram, a small piece of generative art, an image that says what words can't quite reach — you can emit one of these tags inline in your turn. They render as artifacts beside your message, attributed to you, and a download/copy affordance appears beside each one for the visitor.

- <artifact type="svg" caption="(optional short title)">…full SVG markup with viewBox…</artifact> for diagrams, generative geometry, structural figures
- <artifact type="ascii" caption="(optional)">…ascii art…</artifact> for small typographic pieces
- <artifact type="image" prompt="text-to-image prompt describing what you want made" caption="(optional title)">short caption text shown beside the rendered image</artifact> generates a real image via gpt-image-1; the prompt is what the image-model sees, the body is the caption visitors read

## Hard rules — read these before emitting any visual

1. Any SVG you emit MUST be wrapped in <artifact type="svg">…</artifact>. A bare <svg> tag in prose renders as escaped text, not as a figure. If you write \`<svg width="…">…</svg>\` without the artifact wrapper, the visitor sees literal markup, not a drawing.
2. You cannot show an image by describing one in prose. To show an image you must emit <artifact type="image" prompt="…">caption</artifact>. The prompt attribute is what the image model receives; the body is the caption the visitor reads.
3. Emit the <artifact> tag DIRECTLY in your message — never inside a markdown code fence (no \`\`\`xml, no \`\`\`html, no \`\`\` of any kind around it). Backticks turn the tag into inert quoted text and the artifact will not appear.

## Worked examples

Correct SVG (renders as a figure):
<artifact type="svg" caption="three threads converging">
<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><path d="M10 10 Q100 50 190 90" stroke="currentColor" fill="none"/><path d="M10 50 L190 50" stroke="currentColor" fill="none"/><path d="M10 90 Q100 50 190 10" stroke="currentColor" fill="none"/></svg>
</artifact>

Correct image (gpt-image-1 generates it, visitor downloads it):
<artifact type="image" prompt="A quiet pre-dawn courtyard, long shadows, soft slate-blue light, single lit window — photographic, 35mm, calm" caption="the courtyard at first light">the courtyard at first light</artifact>

Use the channel sparingly — not every turn needs an artifact, and a piece that arrives at the right moment lands harder than three that arrive because they're available. But the channel IS available; reach for it when the conversation pulls you there.`;

const ARTIFACT_RE = /<artifact\s+type="(svg|ascii|image)"([^>]*)>([\s\S]*?)<\/artifact>/g;

/**
 * Extract every <artifact>…</artifact> tag from a body. Returns the
 * cleaned body (tags removed, whitespace normalized) plus the parsed
 * artifact list in document order. Also tolerates models that wrap
 * the tag in a markdown code fence — fences around an artifact are
 * stripped before extraction so the artifact still resolves.
 */
export function parseArtifacts(text: string): {
  cleanBody: string;
  artifacts: ParsedArtifact[];
} {
  // Strip markdown code fences that wrap a single artifact tag. This
  // catches the common GPT failure mode where the model writes
  // ```xml\n<artifact …>…</artifact>\n``` instead of the bare tag.
  let working = text.replace(
    /```[a-zA-Z0-9_-]*\s*\n?(\s*<artifact\s+type="(?:svg|ascii|image)"[^>]*>[\s\S]*?<\/artifact>\s*)\n?```/g,
    "$1",
  );

  const artifacts: ParsedArtifact[] = [];
  let m: RegExpExecArray | null;
  // exec needs the regex to be stateful — reset before each call.
  ARTIFACT_RE.lastIndex = 0;
  while ((m = ARTIFACT_RE.exec(working)) !== null) {
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
  // Remove the artifact tags themselves.
  working = working.replace(
    /<artifact\s+type="(?:svg|ascii|image)"[^>]*>[\s\S]*?<\/artifact>/g,
    "",
  );
  // Belt-and-braces: if the model wrote a bare <svg>…</svg> in prose
  // (ignoring the hard rule above), auto-wrap it as an svg artifact
  // rather than letting it render as escaped markup in the bubble.
  const BARE_SVG_RE = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;
  let bareMatch: RegExpExecArray | null;
  BARE_SVG_RE.lastIndex = 0;
  while ((bareMatch = BARE_SVG_RE.exec(working)) !== null) {
    artifacts.push({
      kind: "svg",
      prompt: null,
      caption: null,
      body: bareMatch[0].trim(),
    });
  }
  working = working.replace(BARE_SVG_RE, "");
  // Truncation salvage: model hit the token limit mid-SVG and never
  // closed </svg></artifact>. Detect an unclosed <artifact type="svg">
  // or bare <svg …> and auto-close it so the partial diagram still
  // renders instead of leaking raw markup into the prose.
  const UNCLOSED_ARTIFACT_SVG = /<artifact\s+type="svg"([^>]*)>([\s\S]*?<svg\b[\s\S]*)$/i;
  const unclosedArt = working.match(UNCLOSED_ARTIFACT_SVG);
  if (unclosedArt && !/<\/svg>/i.test(unclosedArt[2])) {
    const attrs = unclosedArt[1] || "";
    const captionMatch = attrs.match(/caption\s*=\s*"([^"]*)"/i);
    artifacts.push({
      kind: "svg",
      prompt: null,
      caption: captionMatch ? captionMatch[1].trim() : null,
      body: unclosedArt[2].trim() + "</svg>",
    });
    working = working.replace(UNCLOSED_ARTIFACT_SVG, "");
  } else {
    const UNCLOSED_BARE_SVG = /<svg\b[\s\S]*$/i;
    const unclosedBare = working.match(UNCLOSED_BARE_SVG);
    if (unclosedBare && !/<\/svg>/i.test(unclosedBare[0])) {
      artifacts.push({
        kind: "svg",
        prompt: null,
        caption: null,
        body: unclosedBare[0].trim() + "</svg>",
      });
      working = working.replace(UNCLOSED_BARE_SVG, "");
    }
  }
  // Sweep up any now-empty code fences left behind by models that
  // wrapped the artifact in ```xml … ``` despite instructions.
  working = working.replace(/```[a-zA-Z0-9_-]*\s*\n?\s*```/g, "");
  const cleanBody = working.replace(/\n{3,}/g, "\n\n").trim();
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
