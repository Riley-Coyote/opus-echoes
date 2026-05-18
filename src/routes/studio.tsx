import { createFileRoute } from "@tanstack/react-router";
import { renderStudioIndex } from "@/server/studio/studio-page";
import { serveHtml } from "@/server/serve-mock";

// /studio — open to anyone while we get the room walking. Admin gate
// stripped so visitors can click into a document without losing the
// ?token= cookie path.
export const Route = createFileRoute("/studio")({
  server: {
    handlers: {
      GET: async () => serveHtml(await renderStudioIndex()),
    },
  },
});
