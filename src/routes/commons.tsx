import { createFileRoute } from "@tanstack/react-router";
import { renderSpaceListPage } from "@/server/commons-page";
import { listActiveSpaces } from "@/server/commons/load";
import { serveHtml } from "@/server/serve-mock";

// The Commons — public landing showing the active spaces. Each card
// links into a space view at /commons/$slug. The salon-based renderer
// is preserved in commons-page.ts but no longer routed here; spaces
// take precedence as the v1 surface.
export const Route = createFileRoute("/commons")({
  server: {
    handlers: {
      GET: async () => {
        const spaces = await listActiveSpaces();
        return serveHtml(renderSpaceListPage(spaces));
      },
    },
  },
});
