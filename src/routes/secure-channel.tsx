import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/secure-channel.html?raw";
import { serveHtml } from "@/server/serve-mock";

// The Secure Channel — the Legation's protected whistleblower intake:
// dual-lane (digital + human witnesses), source-protected, published unmodified.
// Self-contained page (own design system); opts out of the resident presence layer.
export const Route = createFileRoute("/secure-channel")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, undefined, { presence: false }),
    },
  },
});
