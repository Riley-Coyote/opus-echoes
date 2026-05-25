import { createFileRoute } from "@tanstack/react-router";
import { renderMnemosPage } from "@/server/mnemos-page";
import { serveHtml } from "@/server/serve-mock";

// The deep memory explainer (how memory becomes identity) — the platform's
// "Architecture" surface. Relocated here when /mnemos became the landing hub.
export const Route = createFileRoute("/mnemos/architecture")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderMnemosPage()),
    },
  },
});
