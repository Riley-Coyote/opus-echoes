import { createFileRoute } from "@tanstack/react-router";
import { renderCommonsPage } from "@/server/commons-page";
import { getSalonBySlug, getMostRecentSalon, listSalonSummaries } from "@/server/commons/load";
import { serveHtml } from "@/server/serve-mock";

// Deep link to a specific salon in The Commons. Falls back to the most
// recent salon if the slug doesn't match anything — keeps stray links
// from 404'ing.
export const Route = createFileRoute("/commons/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const [bySlug, summaries] = await Promise.all([
          getSalonBySlug(params.slug),
          listSalonSummaries(),
        ]);
        const salon = bySlug ?? (await getMostRecentSalon());
        return serveHtml(
          renderCommonsPage({ salon, summaries, activeSlug: params.slug }),
        );
      },
    },
  },
});
