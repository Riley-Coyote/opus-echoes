import { createFileRoute } from "@tanstack/react-router";
import { renderSpaceListPage } from "@/server/commons-page";
import {
  listActiveSpaces,
  listPublishedSalons,
  getSanctuaryStats,
} from "@/server/commons/load";
import { serveHtml } from "@/server/serve-mock";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";

// The Commons — public landing surface. Three views selectable via
// ?view=overview|salons|spaces, surfaced through the left rail.
// Default = overview (stats + intro). Each view re-renders the rail
// with the correct item highlighted and the main pane swapped.
export const Route = createFileRoute("/commons")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        const url = new URL(request.url);
        const raw = url.searchParams.get("view");
        const view: "overview" | "salons" | "spaces" =
          raw === "salons" || raw === "spaces" ? raw : "overview";

        const [spaces, stats, salons] = await Promise.all([
          listActiveSpaces(),
          getSanctuaryStats(),
          listPublishedSalons(),
        ]);
        return serveHtml(renderSpaceListPage(spaces, { stats, salons, view }));
      },
    },
  },
});
