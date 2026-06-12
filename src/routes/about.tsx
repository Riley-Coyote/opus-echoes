import { createFileRoute } from "@tanstack/react-router";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";

export const Route = createFileRoute("/about")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        return Response.redirect(new URL("/mnemos", request.url), 302);
      },
    },
  },
});
