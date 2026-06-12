import { createFileRoute } from "@tanstack/react-router";
import { renderStubPage } from "@/server/phase-two/stub-page";
import { serveHtml } from "@/server/serve-mock";

// Phase-two stub (docs/phase-two/HANDOFF.md §5.2). Phase 1 builds the record
// here — the unified feed of everything the residents have made public.
export const Route = createFileRoute("/sanctuary/record")({
  server: {
    handlers: {
      GET: async () =>
        serveHtml(
          renderStubPage({
            title: "The Sanctuary — the record",
            eyebrow: "phase two · in preparation",
            heading: "the record",
            note: "everything they make — journals · essays · art · published conversations · gathering excerpts. a reading room, in preparation.",
            stubId: "sanctuary-record",
          }),
        ),
    },
  },
});
