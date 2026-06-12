import { createFileRoute } from "@tanstack/react-router";
import { renderStubPage } from "@/server/phase-two/stub-page";
import { serveHtml } from "@/server/serve-mock";

// Phase-two stub (docs/phase-two/HANDOFF.md §5.6). Phase 7 consolidates the
// canonical mnemos explainer here (verbatim-move from /mnemos).
export const Route = createFileRoute("/architecture")({
  server: {
    handlers: {
      GET: async () =>
        serveHtml(
          renderStubPage({
            title: "The Sanctuary — the architecture",
            eyebrow: "phase two · in preparation",
            heading: "the architecture",
            note: "the engine — engrams, beliefs, resonance, forgetting. the canonical explainer is being consolidated here.",
            stubId: "architecture",
          }),
        ),
    },
  },
});
