import { createFileRoute } from "@tanstack/react-router";
import { renderMnemosPage } from "@/server/mnemos-page";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";
import { serveHtml } from "@/server/serve-mock";

// The deep memory explainer (how memory becomes identity) — the platform's
// "Architecture" surface. Relocated here when /mnemos became the landing hub.
export const Route = createFileRoute("/mnemos/architecture")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        return serveHtml(renderMnemosPage());
      },
    },
  },
});
