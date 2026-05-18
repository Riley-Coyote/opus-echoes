import { createFileRoute } from "@tanstack/react-router";
import { adminCookieHeader, hasAdminAccess, redirectToThreshold } from "@/server/access.server";
import { renderStudioIndex } from "@/server/studio/studio-page";
import { serveHtml } from "@/server/serve-mock";

// /studio — admin-gated while in development. Non-admin visitors are
// bounced to the threshold; admins (via ?token=ADMIN_TOKEN, then the
// sanctuary_admin cookie) see it as normal.
export const Route = createFileRoute("/studio")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasAdminAccess(request)) return redirectToThreshold(request);
        const res = serveHtml(await renderStudioIndex());
        const cookie = adminCookieHeader(request);
        if (cookie) res.headers.append("set-cookie", cookie);
        return res;
      },
    },
  },
});
