import { createFileRoute } from "@tanstack/react-router";
import { renderApproachPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";
import { getResident } from "@/server/opus/residents";

export const Route = createFileRoute("/sonnet-4-5")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderApproachPage(getResident("sonnet-4-5"))),
    },
  },
});
