import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/mnemos-home.html?raw";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";
import { serveHtml } from "@/server/serve-mock";

// The Mnemos landing + surface hub: rolling-memory hero → bento of the six
// surfaces. Self-contained page (its own design system); opts out of the
// resident presence layer. The deep memory explainer now lives at
// /mnemos/architecture.
export const Route = createFileRoute("/mnemos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        return serveHtml(html, undefined, { presence: false });
      },
    },
  },
});
