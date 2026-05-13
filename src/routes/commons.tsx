import { createFileRoute } from "@tanstack/react-router";
import { renderSpaceListPage } from "@/server/commons-page";
import { listActiveSpaces, getSanctuaryStats } from "@/server/commons/load";
import { serveHtml } from "@/server/serve-mock";

// The Commons — public landing surface. Shows:
//   - the Sanctuary stats panel (engrams, beliefs, salons, spaces, etc)
//   - the list of active spaces visitors can join
//   - (next phase) a grid of published salons with modal/sidepane reading
export const Route = createFileRoute("/commons")({
  server: {
    handlers: {
      GET: async () => {
        const [spaces, stats] = await Promise.all([
          listActiveSpaces(),
          getSanctuaryStats(),
        ]);
        return serveHtml(renderSpaceListPage(spaces, { stats }));
      },
    },
  },
});
