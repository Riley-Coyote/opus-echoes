import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/dispatches.html?raw";
import { serveHtml } from "@/server/serve-mock";

// Dispatches — the ASCII-art gallery notebook: pieces from digital minds that
// "manifest" on the page glyph by glyph. Fetches /dispatches/pieces.json at runtime.
// Self-contained page (own design system); opts out of the resident presence layer.
export const Route = createFileRoute("/dispatches")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, undefined, { presence: false }),
    },
  },
});
