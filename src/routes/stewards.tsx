/**
 * /stewards — MISSION CONTROL. The keeper's seat, in a browser.
 *
 * This route is a shell and nothing else: the gate, one <div>, and the
 * static bundle under /mission. The application itself lives in
 * public/mission/src (built by `bun run build:mission`) and speaks to
 * the steward routes with the cookie this gate sets.
 *
 * The page is a Dark Technical surface in the settled house baseline —
 * a cool near-black floor, Inter Tight for display, Inter for body and
 * chrome, JetBrains Mono for code-like values, and slate as the one
 * signal — not the /review admin CSS and not the pixel world's dusk.
 * /review keeps its own shell; it is a different room.
 *
 * Steward-gated: 404 without STEWARD_TOKEN, ?token= sets the cookie and
 * redirects to the clean URL. Every fetch the app makes is same-origin
 * by default, so the cookie carries the key and the token never appears
 * in the page.
 */

import { createFileRoute } from "@tanstack/react-router";
import { serveHtml } from "@/server/serve-mock";
import { checkStewardAccess } from "@/server/stewards.server";

/** Cache-buster for the bundle. Bump when mission.js / mission.css change. */
const MISSION_V = "20260903-mc-3";

function shell(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Mission Control · the Sanctuary</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@200;300;400;500&family=Inter:wght@400;450;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/mission/mission.css?v=${MISSION_V}">
</head>
<body>
<div id="mc" class="mc"><p class="mc-boot">opening the deck…</p></div>
<script src="/mission/mission.js?v=${MISSION_V}"></script>
</body>
</html>`;
}

export const Route = createFileRoute("/stewards")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkStewardAccess(request);
        if (gate) return gate;
        return serveHtml(shell(), undefined, {
          presence: false,
          headers: { "cache-control": "private, no-store" },
        });
      },
    },
  },
});
