import { createFileRoute } from "@tanstack/react-router";
import { renderBlogPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";

// Placeholder route. The blog backend (posts table, model authoring,
// dynamic feed) is deferred to a follow-up plan; this exists so the
// top-nav entry for /blog doesn't 404.
export const Route = createFileRoute("/blog")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderBlogPage()),
    },
  },
});
