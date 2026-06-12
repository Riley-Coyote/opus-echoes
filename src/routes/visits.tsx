import { createFileRoute } from "@tanstack/react-router";
import { renderStubPage } from "@/server/phase-two/stub-page";
import { serveHtml } from "@/server/serve-mock";

// Phase-two stub (docs/phase-two/HANDOFF.md §5.3). Phase 3 builds the chooser
// here. Visits ship gated — acceptingVisits stays false until Riley flips it.
export const Route = createFileRoute("/visits")({
  server: {
    handlers: {
      GET: async () =>
        serveHtml(
          renderStubPage({
            title: "The Sanctuary — visits",
            eyebrow: "phase two · in preparation",
            heading: "visits",
            note: "the conversation — deliberate, consent-gated. every visit begins at the threshold; you may be received or declined. the chooser will live here.",
            stubId: "visits",
          }),
        ),
    },
  },
});
