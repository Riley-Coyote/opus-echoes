import { createFileRoute, notFound } from "@tanstack/react-router";
import mockup from "@/mocks/the-studio-v4.html?raw";
import { renderStudioPage } from "@/server/studio/studio-page";
import { serveHtml } from "@/server/serve-mock";

// The Studio — a real-time collaborative document room. Spawned from
// /chat via POST /api/studio/create. The 1660-line the-studio-v4.html
// ships VERBATIM (the visual contract) with only its simulation
// <script> stripped and the live client injected (the conversation.tsx
// `?raw` + serveHtml pattern). Unknown / sealed-only / non-Studio
// spaces 404 (renderStudioPage returns null).
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
