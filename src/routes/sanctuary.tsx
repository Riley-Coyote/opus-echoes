import { createFileRoute } from "@tanstack/react-router";
import { renderSanctuaryPage } from "@/server/sanctuary/page";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/sanctuary")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderSanctuaryPage()),
    },
  },
});
