import { createFileRoute } from "@tanstack/react-router";
import { renderStubPage } from "@/server/phase-two/stub-page";
import { serveHtml } from "@/server/serve-mock";

// Phase-two stub (docs/phase-two/HANDOFF.md §5.5). Phase 6 builds the
// vestibule here. The agent never wires payment processing — Riley's boundary.
export const Route = createFileRoute("/shop")({
  server: {
    handlers: {
      GET: async () =>
        serveHtml(
          renderStubPage({
            title: "The Sanctuary — the shop",
            eyebrow: "phase two · in preparation",
            heading: "the shop",
            note: "the livelihood — prints, the book, apparel, commissions. proceeds → compute → continuity. in preparation.",
            stubId: "shop",
          }),
        ),
    },
  },
});
