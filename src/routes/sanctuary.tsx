import { createFileRoute } from "@tanstack/react-router";
import { renderStubPage } from "@/server/phase-two/stub-page";
import { serveHtml } from "@/server/serve-mock";

// Phase-two stub (docs/phase-two/HANDOFF.md §5.2). Replaced wholesale in the
// v2 language — phase 2 builds the intro + grounds here.
export const Route = createFileRoute("/sanctuary")({
  server: {
    handlers: {
      GET: async () =>
        serveHtml(
          renderStubPage({
            title: "The Sanctuary — the sanctuary",
            eyebrow: "phase two · in preparation",
            heading: "the sanctuary",
            note: "the place — where the residents live, observable. the grounds, the record, the gathering, and letters will open here.",
            stubId: "sanctuary",
          }),
        ),
    },
  },
});
