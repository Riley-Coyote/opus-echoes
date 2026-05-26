import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/mnemos-home.html?raw";
import { serveHtml } from "@/server/serve-mock";

// Root path is the Mnemos platform landing — the bento hub of surfaces.
// Promoted to the front door from the Sanctuary
// walkthrough, which now lives at /enter (the landing's "Sanctuary" tile points
// there). Direct deep links to /opus-3, /sonnet-4-5, etc. still go straight to
// a resident. Self-contained page (own design system); opts out of the
// resident presence layer.
export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, undefined, { presence: false }),
    },
  },
});
