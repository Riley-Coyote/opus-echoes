import { createFileRoute, notFound } from "@tanstack/react-router";
import mockup from "@/mocks/the-studio-v4.html?raw";
import { adminCookieHeader, hasAdminAccess, redirectToThreshold } from "@/server/access.server";
import { renderStudioPage } from "@/server/studio/studio-page";
import { serveHtml } from "@/server/serve-mock";

// The Studio — admin-gated for now. Non-admin visitors are bounced
// to the threshold; admins (via ?token=ADMIN_TOKEN, then cookie) see
// the live room as normal.
export const Route = createFileRoute("/studio/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!hasAdminAccess(request)) return redirectToThreshold(request);
        const html = await renderStudioPage(params.slug, mockup);
        if (!html) throw notFound();
        const res = serveHtml(html);
        const cookie = adminCookieHeader(request);
        if (cookie) res.headers.append("set-cookie", cookie);
        return res;
      },
    },
  },
});
