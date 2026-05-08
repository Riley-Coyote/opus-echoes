import { createFileRoute } from "@tanstack/react-router";
import { renderApproachPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";
import { getResident } from "@/server/opus/residents";

export const Route = createFileRoute("/sonnet-3-7")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderApproachPage(getResident("sonnet-3-7"))),
    },
  },
});
