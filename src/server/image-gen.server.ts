/**
 * Shared image generation via OpenAI gpt-image-2.
 *
 * Used by:
 *   - substrate.server.ts (post-consolidation art)
 *   - (future) routes/api/message.ts (in-conversation generation)
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { openai } from "./openai.server";

export interface GeneratedImage {
  bytes: Uint8Array;
  mime: string;
  ext: string;
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const resp = await openai().images.generate({
      model: "gpt-image-2",
      prompt,
      size: "1024x1024",
      quality: "auto",
      n: 1,
    });

    const b64 = resp.data?.[0]?.b64_json;
    if (!b64) throw new Error("openai_image_no_data");

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return { bytes, mime: "image/png", ext: "png" };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("openai_image_timeout (45s)");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateAndUpload(prompt: string): Promise<string> {
  const { bytes, mime, ext } = await generateImage(prompt);

  const id = crypto.randomUUID();
  const path = `${new Date().toISOString().slice(0, 10)}/${id}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from("art")
    .upload(path, bytes, { contentType: mime, upsert: false });

  if (error) throw new Error(`storage_upload: ${error.message}`);
  return path;
}
