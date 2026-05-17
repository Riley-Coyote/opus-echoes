/**
 * renderStudioPage — server-rendered Studio surface.
 *
 * P1 (this): prove the spawn path end to end — load the active
 * `studio_documents` for a space slug + its ordered `document_blocks`
 * and render them in a restrained, on-brand manuscript shell. This
 * is the verification gate "spawn from /chat → navigable
 * /studio/$slug with seed block".
 *
 * P3 replaces the shell below with the exact the-studio-v4.html DOM
 * + tokens and mounts the live RoomTransport client (block.upsert
 * diffing, the typing caret, presence band, marginalia rail,
 * gathering-mode). The data-loading here (verified-schema queries
 * via the service-role client) carries forward unchanged.
 *
 * Mirrors the minimal-chat-page.ts pattern: a pure server-rendered
 * HTML string, no React, served via serveHtml. Every column read is
 * grounded in 20260517120000_studio_documents.sql / the verified
 * spaces schema — no speculative fields.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface BlockRow {
  id: string;
  ord: number;
  type: string;
  content: string | null;
  html_cache: string | null;
}

/** One manuscript block → HTML. html_cache is server-authored
 *  (the conductor in P2; the spawn seed here) and trusted; the
 *  escaped `content` is the safe fallback when no cache exists. */
function renderBlock(b: BlockRow): string {
  const inner =
    b.html_cache && b.html_cache.trim() ? b.html_cache : `<p>${escapeHtml(b.content ?? "")}</p>`;
  const cls =
    b.type === "section"
      ? "blk section"
      : b.type === "pull"
        ? "blk pull"
        : b.type === "em_strong"
          ? "blk em-strong"
          : "blk para";
  return `<div class="${cls}" data-block-id="${escapeHtml(b.id)}" data-ord="${b.ord}">${inner}</div>`;
}

const STUDIO_P1_CSS = `
:root{--floor:#06070a;--ink:#e7e7ea;--muted:#8a8c93;--line:rgba(231,231,234,.08)}
*{box-sizing:border-box}
html,body{margin:0;background:var(--floor);color:var(--ink)}
body{font-family:Inter,system-ui,sans-serif;line-height:1.62;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:720px;margin:0 auto;padding:88px 28px 160px}
.eyebrow{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--muted);
  margin:0 0 10px}
h1.doc-title{font-family:"Inter Tight",Inter,sans-serif;font-weight:600;
  font-size:30px;line-height:1.2;margin:0 0 6px}
.doc-sub{color:var(--muted);margin:0 0 40px}
.manuscript{border-top:1px solid var(--line);padding-top:36px}
.blk{margin:0 0 20px}
.blk.section{font-family:"Inter Tight",Inter,sans-serif;font-weight:600;
  font-size:20px;margin:40px 0 16px}
.blk.pull{font-size:21px;line-height:1.5;color:var(--ink);
  border-left:2px solid var(--line);padding-left:18px;font-style:italic}
.blk.em-strong{font-weight:600}
.blk p{margin:0}
.blk p:empty::after{content:"…";color:var(--muted)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;
  transition:none!important}}
`;

/**
 * Returns the page HTML, or null when there is no active Studio
 * document for this slug (route → 404). null cases: unknown/archived
 * space, non-Studio space, or a space whose only document is sealed.
 */
export async function renderStudioPage(slug: string): Promise<string | null> {
  if (!hasSupabaseAdminEnv()) return null;

  // Same dynamic-table cast getSpaceBySlug uses — studio_* tables
  // enter the generated Database type only post-migration-apply.
  const sb = supabaseAdmin as unknown as {
    from: (name: string) => ReturnType<typeof supabaseAdmin.from>;
  };

  const { data: space } = await sb
    .from("spaces")
    .select("id, slug, name")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!space) return null;

  const { data: doc } = await sb
    .from("studio_documents")
    .select("id, title, subtitle, status, observer_mode")
    .eq("space_id", space.id as string)
    .eq("status", "active")
    .maybeSingle();
  if (!doc) return null;

  const { data: blockRows } = await sb
    .from("document_blocks")
    .select("id, ord, type, content, html_cache")
    .eq("document_id", doc.id as string)
    .is("deleted_at", null)
    .order("ord", { ascending: true });

  const blocks = (blockRows ?? []) as BlockRow[];
  const title = (doc.title as string) || "Untitled";
  const subtitle = (doc.subtitle as string | null) ?? "";
  const manuscript = blocks.length
    ? blocks.map(renderBlock).join("\n")
    : `<div class="blk para"><p></p></div>`;

  return `<!doctype html>
<html lang="en" data-opus-route="studio" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#06070a">
<title>${escapeHtml(title)} — The Studio — The Sanctuary</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${STUDIO_P1_CSS}</style>
</head>
<body>
<div class="wrap" data-doc-id="${escapeHtml(doc.id as string)}" data-space-slug="${escapeHtml(space.slug as string)}" data-observer="${doc.observer_mode ? "true" : "false"}">
  <p class="eyebrow">the studio</p>
  <h1 class="doc-title">${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="doc-sub">${escapeHtml(subtitle)}</p>` : ""}
  <div class="manuscript" id="manuscript">
${manuscript}
  </div>
</div>
</body>
</html>`;
}
