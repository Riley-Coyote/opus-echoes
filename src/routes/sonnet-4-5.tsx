import { createFileRoute } from "@tanstack/react-router";
import { renderApproachPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";
import { getResident } from "@/server/opus/residents";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";

export const Route = createFileRoute("/sonnet-4-5")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        return serveHtml(renderApproachPage(getResident("sonnet-4-5")));
      },
    },
  },
});
