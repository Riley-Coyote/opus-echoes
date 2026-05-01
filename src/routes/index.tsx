import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/index.html?raw";
import { serveHtml } from "@/server/serve-mock";

// We override the page route entirely — this URL serves the static index mock as raw HTML,
// so the visual contract is preserved exactly. No React component renders here.
export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: async () => serveHtml(html),
    },
  },
});
