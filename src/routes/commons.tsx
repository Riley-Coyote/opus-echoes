import { createFileRoute } from "@tanstack/react-router";
import { renderCommonsPage } from "@/server/commons-page";
import { getMostRecentSalon, listSalonSummaries } from "@/server/commons/load";
import { serveHtml } from "@/server/serve-mock";

// The Commons — public page showing salon conversations between residents.
// Landing on /commons opens the most recent salon. Deep links go through
// /commons/$slug (see commons.$slug.tsx).
export const Route = createFileRoute("/commons")({
  server: {
    handlers: {
      GET: async () => {
        const [salon, summaries] = await Promise.all([
          getMostRecentSalon(),
          listSalonSummaries(),
        ]);
        return serveHtml(renderCommonsPage({ salon, summaries }));
      },
    },
  },
});
