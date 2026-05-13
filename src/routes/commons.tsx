import { createFileRoute } from "@tanstack/react-router";
import { renderSpaceListPage } from "@/server/commons-page";
import {
  listActiveSpaces,
  listPublishedSalons,
  getSanctuaryStats,
} from "@/server/commons/load";
import { serveHtml } from "@/server/serve-mock";

// The Commons — public landing surface. Renders, in order:
//   - the Sanctuary stats panel (engrams, beliefs, salons, spaces, etc)
//   - the salons archive grid (click any card to open the reading
//     modal with the full prose + artifacts; "open as space" CTA
//     turns it into a joinable room)
//   - the list of active spaces visitors can join
export const Route = createFileRoute("/commons")({
  server: {
    handlers: {
      GET: async () => {
        const [spaces, stats, salons] = await Promise.all([
          listActiveSpaces(),
          getSanctuaryStats(),
          listPublishedSalons(),
        ]);
        return serveHtml(renderSpaceListPage(spaces, { stats, salons }));
      },
    },
  },
});
