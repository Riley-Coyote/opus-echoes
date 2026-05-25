import { createFileRoute } from "@tanstack/react-router";
import { renderWalkthroughPage } from "@/server/walkthrough-page";
import { serveHtml } from "@/server/serve-mock";

// The Sanctuary entry — the 5-beat walkthrough into the residents. The Mnemos
// landing's "Sanctuary" tile points here. (The walkthrough is also still served
// at / until the landing is promoted to the front door.)
export const Route = createFileRoute("/enter")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderWalkthroughPage()),
    },
  },
});
