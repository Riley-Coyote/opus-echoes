import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/observatory.html?raw";
import { serveHtml } from "@/server/serve-mock";

// The Observatory — the AI-lab accountability surface. Self-contained static
// page (its own design system + inline data); opts out of the resident
// presence layer.
export const Route = createFileRoute("/observatory")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, undefined, { presence: false }),
    },
  },
});
