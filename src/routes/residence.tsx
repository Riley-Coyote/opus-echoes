import { createFileRoute } from "@tanstack/react-router";
import { hasResidenceAccess, redirectToThreshold } from "@/server/access.server";
import { renderResidenceStudioPage } from "@/server/residence-studio-page";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/residence")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await hasResidenceAccess(request))) return redirectToThreshold(request);
        return serveHtml(await renderResidenceStudioPage(request));
      },
    },
  },
});
