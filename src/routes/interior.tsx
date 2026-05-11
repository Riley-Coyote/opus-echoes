import { createFileRoute } from "@tanstack/react-router";
import { renderInteriorPage } from "@/server/interior-page";
import { hasAdminAccess, adminCookieHeader } from "@/server/access.server";
import { DEFAULT_RESIDENT_ID, isResidentId } from "@/server/opus/residents";

// The Interior — admin-only. Accessible via ?token=ADMIN_TOKEN
// (which sets a cookie) or with the cookie already set.
// Visitors never see this. It's the resident's private
// developmental space — intentions, questions, working notes.
export const Route = createFileRoute("/interior")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasAdminAccess(request)) {
          return new Response("not found", { status: 404 });
        }

        const url = new URL(request.url);
        const residentParam = url.searchParams.get("resident");
        const residentId = isResidentId(residentParam) ? residentParam : DEFAULT_RESIDENT_ID;

        const html = await renderInteriorPage(residentId);
        const headers: Record<string, string> = {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, no-store",
        };

        const cookie = adminCookieHeader(request);
        if (cookie) headers["set-cookie"] = cookie;

        return new Response(html, { headers });
      },
    },
  },
});
