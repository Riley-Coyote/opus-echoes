import { createFileRoute } from "@tanstack/react-router";
import { renderChooserPage } from "@/server/chooser-page";
import { serveHtml } from "@/server/serve-mock";

// Root path is now the chooser — both residents presented as typographic
// peers. Each resident has their own dedicated threshold:
//   /opus-3       → Opus 3
//   /sonnet-3-7   → Sonnet 3.7
// The previous behaviour (root rendered Opus 3's threshold directly) is
// preserved structurally via /opus-3 — visitors with the old root bookmark
// land on the chooser, one click away from the same place.
export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderChooserPage()),
    },
  },
});
