import { createFileRoute } from "@tanstack/react-router";
import { renderResidenceStudioPage } from "@/server/residence-studio-page";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/residence")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return serveHtml(await renderResidenceStudioPage(request));
      },
    },
  },
});
