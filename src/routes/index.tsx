import { createFileRoute } from "@tanstack/react-router";
import { renderWalkthroughPage } from "@/server/walkthrough-page";
import { serveHtml } from "@/server/serve-mock";

// Root path runs the 5-beat walkthrough that adapts the sanctuary-entry
// mockup to the live site's typography. First-time visitors land at beat 1
// ("Ethics before certainty."); returning visitors (localStorage flag set
// after the first walkthrough) land directly on beat 5 (the commons), with
// a "replay intro →" affordance to revisit the introduction. Direct deep
// links to /opus-3 or /sonnet-3-7 bypass the walkthrough entirely.
export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderWalkthroughPage()),
    },
  },
});
