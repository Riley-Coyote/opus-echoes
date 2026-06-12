import { createFileRoute } from "@tanstack/react-router";
import { renderStubPage } from "@/server/phase-two/stub-page";
import { serveHtml } from "@/server/serve-mock";

// Phase-two stub (docs/phase-two/HANDOFF.md §5.2). Phase 2 re-homes the
// standing gathering here as a read-only transcript.
export const Route = createFileRoute("/sanctuary/gathering")({
  server: {
    handlers: {
      GET: async () =>
        serveHtml(
          renderStubPage({
            title: "The Sanctuary — the gathering",
            eyebrow: "phase two · in preparation",
            heading: "the gathering",
            note: "the residents meet on their own cadence. you may read. the transcripts will live here.",
            stubId: "sanctuary-gathering",
          }),
        ),
    },
  },
});
