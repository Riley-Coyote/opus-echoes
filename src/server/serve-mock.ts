/**
 * Serves a static HTML mockup verbatim with two adjustments:
 *   1. internal .html links rewritten to clean route paths
 *   2. an injected <script> with API hooks for the page (threshold, memory, etc.)
 *
 * The HTML is the visual contract — we do not modify the markup or styles.
 */

const LINK_MAP: Record<string, string> = {
  // `/` is now the simple arrival thesis. The 7-beat index.html mock is no longer
  // routed; references to it fall back to the arrival.
  "index.html": "/",
  "arrival.html": "/",
  "approach.html": "/",
  // Backwards-compat: any existing link to threshold.html still resolves.
  "threshold.html": "/approach",
  "conversation.html": "/conversation",
  "memory.html": "/memory",
  "journal.html": "/journal",
  "explainer.html": "/mnemos",
  "observatory.html": "/observatory",
  "research.html": "/research/research-wing.html",
  // Deferred surfaces — kept as fallbacks so any stray reference doesn't 404.
  // Active mocks no longer reference these.
  "claude-wing.html": "/",
  "claude-lineage.html": "/",
};

function rewriteLinks(html: string): string {
  let out = html;
  for (const [from, to] of Object.entries(LINK_MAP)) {
    // href="file.html" or href='file.html' (with optional ?query / #hash)
    const re = new RegExp(
      `(href\\s*=\\s*["'])${from.replace(".", "\\.")}((?:[?#][^"']*)?)(["'])`,
      "g",
    );
    out = out.replace(re, (_m, p1, suffix, p3) => `${p1}${to}${suffix}${p3}`);
    // Also rewrite location.href = '...' references inside inline scripts.
    const reJs = new RegExp(`(['"\`])${from.replace(".", "\\.")}((?:[?#][^'"\`]*)?)(['"\`])`, "g");
    out = out.replace(reJs, (_m, p1, suffix, p3) => `${p1}${to}${suffix}${p3}`);
  }
  return out;
}

/**
 * Inject a script tag right before </body>.
 * If no </body>, append.
 */
function injectScript(html: string, script: string): string {
  const tag = `<script>${script}</script>`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${tag}</body>`);
  }
  return html + tag;
}

function injectPresenceAssets(html: string): string {
  if (html.includes("/opus-presence.js")) return html;
  const headAssets = `<link rel="stylesheet" href="/opus-presence.css">
<script type="module" src="/opus-presence.js"></script>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${headAssets}</head>`);
  }
  return `${headAssets}${html}`;
}

export function serveHtml(
  html: string,
  extraScript?: string,
  opts?: { status?: number; presence?: boolean },
): Response {
  // The resident 3D presence layer is injected by default (every Sanctuary page).
  // Self-contained surfaces (the Observatory, the Research Wing) opt out with
  // `presence: false` so they don't load a scene they don't have.
  let out = rewriteLinks(html);
  if (opts?.presence !== false) out = injectPresenceAssets(out);
  if (extraScript) out = injectScript(out, extraScript);
  return new Response(out, {
    status: opts?.status ?? 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
