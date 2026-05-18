import { createFileRoute } from "@tanstack/react-router";
import { hasAdminAccess, redirectToThreshold } from "@/server/access.server";
import { renderStudioIndex } from "@/server/studio/studio-page";
import { serveHtml } from "@/server/serve-mock";

// /studio — admin-gated while in development. Non-admin visitors are
// bounced to the threshold so the surface stays unlisted publicly
// while the live deploy keeps it wired to the real backend.
export const Route = createFileRoute("/studio")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasAdminAccess(request)) return redirectToThreshold(request);
        return serveHtml(await renderStudioIndex());
      },
    },
  },
});
