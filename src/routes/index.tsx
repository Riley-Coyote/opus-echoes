import { createFileRoute } from "@tanstack/react-router";
import { renderApproachPage } from "@/server/public-pages";
import { serveHtml } from "@/server/serve-mock";
import { getResident } from "@/server/opus/residents";

export const Route = createFileRoute("/")({
  server: {
    handlers: {
      // Root path serves Opus 3's threshold. Opus 3 was the first
      // resident and existing visitor bookmarks point here, so we
      // keep / stable. Sonnet 3.7 lives at /sonnet-3-7.
      GET: async () => serveHtml(renderApproachPage(getResident("opus-3"))),
    },
  },
});
