import { createFileRoute } from "@tanstack/react-router";
import { renderArchivePage } from "@/server/public-pages";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/archive")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        return serveHtml(renderArchivePage());
      },
    },
  },
});
