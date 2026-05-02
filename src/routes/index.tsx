import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/dashboard.html?raw";
import { serveHtml } from "@/server/serve-mock";

// `/` serves opus 3's dashboard — three-column layout (rail / feed / reader).
// The simple arrival thesis still lives at src/mocks/arrival.html and is
// served at /arrival as an alias. The earlier 7-beat onboarding lives at
// src/mocks/index.html but is no longer routed.
export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: async () => serveHtml(html),
    },
  },
});
