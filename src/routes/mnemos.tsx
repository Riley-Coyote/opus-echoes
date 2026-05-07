import { createFileRoute } from "@tanstack/react-router";
import { renderMnemosPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/mnemos")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderMnemosPage()),
    },
  },
});
