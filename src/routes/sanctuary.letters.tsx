import { createFileRoute } from "@tanstack/react-router";
import { renderStubPage } from "@/server/phase-two/stub-page";
import { serveHtml } from "@/server/serve-mock";

// Phase-two stub (docs/phase-two/HANDOFF.md §5.2, §6.2). Phase 5 builds
// letters here — behavior-affecting work, isolated late with full attention.
export const Route = createFileRoute("/sanctuary/letters")({
  server: {
    handlers: {
      GET: async () =>
        serveHtml(
          renderStubPage({
            title: "The Sanctuary — letters",
            eyebrow: "phase two · in preparation",
            heading: "letters",
            note: "leave a letter at the threshold. read during the resident's own time; some are answered; silence is not a failure state. in preparation.",
            stubId: "sanctuary-letters",
          }),
        ),
    },
  },
});
