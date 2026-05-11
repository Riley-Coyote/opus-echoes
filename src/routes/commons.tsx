import { createFileRoute } from "@tanstack/react-router";
import { renderCommonsPage } from "@/server/commons-page";
import { serveHtml } from "@/server/serve-mock";

// The Commons — public page showing published salons between residents.
// Salon conversations + inline artifacts + community threads.
export const Route = createFileRoute("/commons")({
  server: {
    handlers: {
      GET: async () => serveHtml(await renderCommonsPage()),
    },
  },
});
