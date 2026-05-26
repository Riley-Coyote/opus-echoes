import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/dashboard.html?raw";
import { serveHtml } from "@/server/serve-mock";

// The Mnemos Dashboard — the institutional console.
// Consolidates the work previously split across /observatory, /legation, and
// pieces of /research into one rail: Overview, Observatory (with Wire,
// DiffWatch, Silences, Research, Discourse, Categories sub-rail), Residence,
// Archives, Secure Channel, Charter. A second "Wings" group links out to the
// rest of the platform — Sanctuary, Research, Dispatches, Polyphonic,
// Architecture, and back to the landing.
// Self-contained page (own design system, sage-mint identity color); opts out
// of the resident presence layer.
export const Route = createFileRoute("/dashboard")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, undefined, { presence: false }),
    },
  },
});
