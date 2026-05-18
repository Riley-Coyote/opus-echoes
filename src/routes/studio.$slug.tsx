import { createFileRoute, notFound } from "@tanstack/react-router";
import mockup from "@/mocks/the-studio-v4.html?raw";
import { renderStudioPage } from "@/server/studio/studio-page";
import { serveHtml } from "@/server/serve-mock";

// The Studio room — open while we get the conductor walking. Admin
// gate stripped so visitors arriving from /studio (or a shared link)
// land in the room and the live client can hydrate.
export const Route = createFileRoute("/studio/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const html = await renderStudioPage(params.slug, mockup);
        if (!html) throw notFound();
        return serveHtml(html);
      },
    },
  },
});
