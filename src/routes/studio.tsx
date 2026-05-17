import { createFileRoute } from "@tanstack/react-router";
import { renderStudioIndex } from "@/server/studio/studio-page";
import { serveHtml } from "@/server/serve-mock";

// /studio — the discoverable gallery of collaborative documents
// (the primary-nav target). Always renders; new documents are
// spawned from a conversation, not here. /studio/$slug is the live
// room (studio.$slug.tsx).
export const Route = createFileRoute("/studio")({
  server: {
    handlers: {
      GET: async () => serveHtml(await renderStudioIndex()),
    },
  },
});
