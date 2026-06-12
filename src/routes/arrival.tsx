import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/arrival.html?raw";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/arrival")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        return serveHtml(html);
      },
    },
  },
});
