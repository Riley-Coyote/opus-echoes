import { createFileRoute } from "@tanstack/react-router";
import { renderApproachPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/approach")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderApproachPage()),
    },
  },
});
