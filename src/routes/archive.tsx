import { createFileRoute } from "@tanstack/react-router";
import { renderArchivePage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/archive")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderArchivePage()),
    },
  },
});
