import { createFileRoute } from "@tanstack/react-router";
import { renderMenuPage } from "@/server/menu-page";
import { serveHtml } from "@/server/serve-mock";

// UI/UX mockup — the front door reimagined as a retro "start screen": the
// pixel-art Sanctuary wallpaper with a centered, pixel-font main menu and a
// Mario-style mosaic transition. Self-contained; opts out of the presence layer.
// Links are stubs (mockup only).
export const Route = createFileRoute("/menu")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderMenuPage(), undefined, { presence: false }),
    },
  },
});
