import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/arrival.html?raw";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/arrival")({
  server: {
    handlers: {
      GET: async () => serveHtml(html),
    },
  },
});
