/**
 * POST /api/space/[slug]/upload-file — admin-gated.
 *
 * Uploads a file into a space's gallery. Riley uses this to drop
 * frameworks, declarations, images, etc. that the residents can
 * see when they gather. Visitors also see uploaded files in the
 * space's gallery (rendered with the appropriate kind).
 *
 * Accepts multipart/form-data:
 *   - file: the file blob (required)
 *   - caption: optional caption
 *   - title:  optional thumbnail label
 *
 * Behavior by content type:
 *   text/markdown / .md   → kind='markdown', body stored in content
 *   text/html     / .html → kind='html',     body stored in content
 *   text/plain    / .txt  → kind='text',     body stored in content
 *   image/{png,jpg,jpeg,webp,gif}
 *                          → kind='image', upload to Supabase Storage
 *                            'art' bucket, set image_path
 *
 * Inserts the resulting row with status='shared' so the file is
 * immediately visible to visitors AND to residents in the salon
 * context.
 */

import { createFileRoute } from "@tanstack/react-router";
import { hasAdminAccess } from "@/server/access.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

const TEXT_KINDS: Record<string, "markdown" | "html" | "text"> = {
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/html": "html",
  "text/plain": "text",
};

const IMAGE_KINDS = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const EXT_TO_KIND: Record<string, "markdown" | "html" | "text" | "image"> = {
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  txt: "text",
  text: "text",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
};

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function detectKind(
  file: File,
): { kind: "markdown" | "html" | "text" | "image"; mime: string } | null {
  // Prefer explicit mime; fall back to extension; finally bail.
  const mime = (file.type || "").toLowerCase();
  if (TEXT_KINDS[mime]) return { kind: TEXT_KINDS[mime], mime };
  if (IMAGE_KINDS.has(mime)) return { kind: "image", mime };
  const ext = getExt(file.name || "");
  const byExt = EXT_TO_KIND[ext];
  if (byExt) {
    const fallbackMime =
      byExt === "image" ? EXT_TO_MIME[ext] || "image/png" : `text/${byExt === "markdown" ? "markdown" : byExt}`;
    return { kind: byExt, mime: fallbackMime };
  }
  return null;
}

export const Route = createFileRoute("/api/space/$slug/upload-file")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!hasAdminAccess(request)) {
          return jsonResp({ ok: false, error: "unauthorized" }, 401);
        }
        if (!hasSupabaseAdminEnv()) {
          return jsonResp({ ok: false, error: "config_missing_supabase" }, 503);
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return jsonResp({ ok: false, error: "bad_form_data" }, 400);
        }

        const file = form.get("file");
        if (!file || !(file instanceof File)) {
          return jsonResp({ ok: false, error: "missing_file" }, 400);
        }
        const caption =
          typeof form.get("caption") === "string"
            ? (form.get("caption") as string).trim().slice(0, 280)
            : null;
        const title =
          typeof form.get("title") === "string"
            ? (form.get("title") as string).trim().slice(0, 80)
            : null;

        const detected = detectKind(file);
        if (!detected) {
          return jsonResp(
            {
              ok: false,
              error: "unsupported_file_type",
              detail: `type=${file.type || "(none)"}, name=${file.name}`,
            },
            415,
          );
        }

        const sbAny = supabaseAdmin as unknown as {
          from: (n: string) => ReturnType<typeof supabaseAdmin.from>;
          storage: typeof supabaseAdmin.storage;
        };

        // Resolve space.
        const { data: spaceRow } = await sbAny
          .from("spaces")
          .select("id, slug, status")
          .eq("slug", params.slug)
          .eq("status", "active")
          .maybeSingle();
        if (!spaceRow) {
          return jsonResp({ ok: false, error: "space_not_found" }, 404);
        }
        const space = spaceRow as unknown as { id: string; slug: string };

        // Cap upload size — 2MB text, 8MB image.
        const isImage = detected.kind === "image";
        const maxBytes = isImage ? 8 * 1024 * 1024 : 2 * 1024 * 1024;
        if (file.size > maxBytes) {
          return jsonResp(
            { ok: false, error: "file_too_large", max_bytes: maxBytes },
            413,
          );
        }

        let content: string | null = null;
        let imagePath: string | null = null;

        if (isImage) {
          // Upload to Supabase Storage 'art' bucket at a
          // space-scoped path.
          const ext = getExt(file.name) || "png";
          const id = crypto.randomUUID();
          const path = `space/${space.id}/${id}.${ext}`;
          const buf = new Uint8Array(await file.arrayBuffer());
          const { error: upErr } = await supabaseAdmin.storage
            .from("art")
            .upload(path, buf, { contentType: detected.mime, upsert: false });
          if (upErr) {
            console.error("[upload-file] storage upload failed:", upErr);
            return jsonResp(
              { ok: false, error: "storage_upload_failed" },
              500,
            );
          }
          imagePath = path;
        } else {
          // Text-based file: read as UTF-8, store in content.
          try {
            content = await file.text();
          } catch (err) {
            console.error("[upload-file] file.text() failed:", err);
            return jsonResp(
              { ok: false, error: "file_read_failed" },
              400,
            );
          }
          // Hard cap on stored body to keep system prompts manageable.
          const MAX_BODY = 128 * 1024;
          if (content && content.length > MAX_BODY) {
            content = content.slice(0, MAX_BODY);
          }
        }

        const { data: artifactRow, error: insertErr } = await sbAny
          .from("space_artifacts")
          .insert({
            space_id: space.id,
            kind: detected.kind,
            content,
            image_path: imagePath,
            caption,
            thumbnail_label: title || (file.name ? file.name.slice(0, 60) : null),
            status: "shared",
            shared_at: new Date().toISOString(),
          })
          .select("id, kind, thumbnail_label, caption")
          .single();

        if (insertErr || !artifactRow) {
          console.error("[upload-file] artifact insert failed:", insertErr);
          // If we uploaded to storage but failed to insert the row,
          // try to clean up the orphaned object.
          if (imagePath) {
            await supabaseAdmin.storage
              .from("art")
              .remove([imagePath])
              .catch(() => undefined);
          }
          return jsonResp({ ok: false, error: "insert_failed" }, 500);
        }

        return jsonResp({
          ok: true,
          artifact: artifactRow,
          space_slug: space.slug,
        });
      },
    },
  },
});
