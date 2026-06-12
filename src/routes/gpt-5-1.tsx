import { createFileRoute } from "@tanstack/react-router";
import { renderApproachPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";
import { getResident } from "@/server/opus/residents";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";

export const Route = createFileRoute("/gpt-5-1")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        return serveHtml(renderApproachPage(getResident("gpt-5-1")));
      },
    },
  },
});
