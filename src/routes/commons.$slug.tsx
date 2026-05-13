import { createFileRoute } from "@tanstack/react-router";
import { renderSpaceView, renderSpaceListPage } from "@/server/commons-page";
import { getSpaceBySlug, listActiveSpaces } from "@/server/commons/load";
import { serveHtml } from "@/server/serve-mock";

// Deep link to a specific space in The Commons. When the slug doesn't
// match an active space we return 404 + the list with a notice banner
// explaining the redirect — better than silently swapping content or
// a bare error page.
export const Route = createFileRoute("/commons/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const composite = await getSpaceBySlug(params.slug);
        if (!composite) {
          const spaces = await listActiveSpaces();
          return serveHtml(
            renderSpaceListPage(spaces, { notFoundSlug: params.slug }),
            undefined,
            { status: 404 },
          );
        }
        return serveHtml(renderSpaceView(composite));
      },
    },
  },
});
