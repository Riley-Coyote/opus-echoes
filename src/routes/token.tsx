import { createFileRoute } from "@tanstack/react-router";
import { renderTokenPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/token")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderTokenPage()),
    },
  },
});
