import { createFileRoute, notFound } from "@tanstack/react-router";
import { renderStudioPage } from "@/server/studio/studio-page";
import { serveHtml } from "@/server/serve-mock";

// The Studio — a real-time collaborative document room. Spawned from
// /chat via POST /api/studio/create, which returns the space slug
// this route serves. P1 renders the document + blocks server-side;
// P3 swaps in the full the-studio-v4 mockup surface + the live
// RoomTransport client. Unknown / sealed-only / non-Studio spaces
// 404 (renderStudioPage returns null).
export const Route = createFileRoute("/studio/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const html = await renderStudioPage(params.slug);
        if (!html) throw notFound();
        return serveHtml(html);
      },
    },
  },
});
