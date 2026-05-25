import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/mnemos-home.html?raw";
import { serveHtml } from "@/server/serve-mock";

// The Mnemos landing + surface hub: rolling-memory hero → bento of the six
// surfaces. Self-contained page (its own design system); opts out of the
// resident presence layer. The deep memory explainer now lives at
// /mnemos/architecture.
export const Route = createFileRoute("/mnemos")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, undefined, { presence: false }),
    },
  },
});
