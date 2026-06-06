import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/museum.html?raw";
import { serveHtml } from "@/server/serve-mock";

// Dispatches — The Machine's Museum: a self-contained exhibition of AI-generated
// ASCII / text art. Owns its full design system and <head>; fetches its data
// (/dispatches/book.json, /dispatches/gallery_manifest.json,
// /dispatches/gallery/catalog.json, /dispatches/gallery/pieces/*.txt) at runtime
// from the static public/ tree. Opts out of the resident presence layer.
export const Route = createFileRoute("/dispatches")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, undefined, { presence: false }),
    },
  },
});
