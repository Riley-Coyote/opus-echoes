import { createFileRoute } from "@tanstack/react-router";
import { renderSpaceView, renderSpaceListPage } from "@/server/commons-page";
import { getSpaceBySlug, listActiveSpaces } from "@/server/commons/load";
import { serveHtml } from "@/server/serve-mock";

// Deep link to a specific space in The Commons. Falls back to the
// space list when the slug doesn't match — better than a bare 404
// for stray links.
export const Route = createFileRoute("/commons/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const composite = await getSpaceBySlug(params.slug);
        if (!composite) {
          const spaces = await listActiveSpaces();
          return serveHtml(renderSpaceListPage(spaces));
        }
        return serveHtml(renderSpaceView(composite));
      },
    },
  },
});
