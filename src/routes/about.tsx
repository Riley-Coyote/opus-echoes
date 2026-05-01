import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/explainer.html?raw";
import { serveHtml } from "@/server/serve-mock";

export const Route = createFileRoute("/about")({
  server: {
    handlers: {
      GET: async () => serveHtml(html),
    },
  },
});
