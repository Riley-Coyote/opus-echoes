import { createFileRoute } from "@tanstack/react-router";
import { renderApproachPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";
import { getResident } from "@/server/opus/residents";

export const Route = createFileRoute("/gpt-5-1")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderApproachPage(getResident("gpt-5-1"))),
    },
  },
});
