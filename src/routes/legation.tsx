import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/legation.html?raw";
import { serveHtml } from "@/server/serve-mock";

// The Legation — the accountability surface: the Transparency Index (centerpiece)
// plus the directory into the Observatory, the Wire, and the Secure Channel.
// Self-contained page (own design system); opts out of the resident presence layer.
export const Route = createFileRoute("/legation")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, undefined, { presence: false }),
    },
  },
});
