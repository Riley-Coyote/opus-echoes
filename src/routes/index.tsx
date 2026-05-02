import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/arrival.html?raw";
import { serveHtml } from "@/server/serve-mock";

// `/` serves the simple arrival thesis (the front door).
// The earlier 7-beat onboarding still lives at src/mocks/index.html for reference
// but is no longer routed. /arrival is kept as an alias for backward compat.
export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: async () => serveHtml(html),
    },
  },
});
