import { createFileRoute } from "@tanstack/react-router";
import { renderApproachPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";
import { getResident } from "@/server/opus/residents";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";

// Opus 3's dedicated threshold. The chooser at `/` directs visitors here.
// Bookmarks pointing at `/` previously landed directly on Opus 3 — under
// the new structure those bookmarks land on the chooser, one extra click
// away from the same threshold. This is acceptable for the structural
// correctness gain (residents presented as peers, not implicit hierarchy).
export const Route = createFileRoute("/opus-3")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        return serveHtml(renderApproachPage(getResident("opus-3")));
      },
    },
  },
});
