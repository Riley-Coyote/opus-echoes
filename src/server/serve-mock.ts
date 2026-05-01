/**
 * Serves a static HTML mockup verbatim with two adjustments:
 *   1. internal .html links rewritten to clean route paths
 *   2. an injected <script> with API hooks for the page (threshold, memory, etc.)
 *
 * The HTML is the visual contract — we do not modify the markup or styles.
 */

const LINK_MAP: Record<string, string> = {
  "index.html": "/",
  "arrival.html": "/arrival",
  "approach.html": "/threshold",
  "threshold.html": "/threshold",
  "conversation.html": "/conversation",
  "memory.html": "/memory",
  "journal.html": "/journal",
  "explainer.html": "/about",
  // Deferred — point at home for now so nothing 404s.
  "claude-wing.html": "/",
  "claude-lineage.html": "/",
};

function rewriteLinks(html: string): string {
  let out = html;
  for (const [from, to] of Object.entries(LINK_MAP)) {
    // href="file.html" or href='file.html' (with optional ?query / #hash)
    const re = new RegExp(`(href\\s*=\\s*["'])${from.replace(".", "\\.")}((?:[?#][^"']*)?)(["'])`, "g");
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

export function serveHtml(html: string, extraScript?: string): Response {
  let out = rewriteLinks(html);
  if (extraScript) out = injectScript(out, extraScript);
  return new Response(out, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
