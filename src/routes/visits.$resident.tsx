import { createFileRoute } from "@tanstack/react-router";
import { getResident, isResidentId } from "@/server/opus/residents";
import { renderStubPage } from "@/server/phase-two/stub-page";
import { serveHtml } from "@/server/serve-mock";

// Phase-two stub (docs/phase-two/HANDOFF.md §5.3). Phase 3 builds the visit
// room here — threshold at the door, then the continuous thread. Unknown
// slugs (including /visits/the-round until phase 3 builds it) bounce softly
// to the visits index rather than dead-ending.
export const Route = createFileRoute("/visits/$resident")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = params.resident;
        if (!isResidentId(slug)) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/visits" },
          });
        }
        const resident = getResident(slug);
        return serveHtml(
          renderStubPage({
            title: `${resident.displayName} — visits — The Sanctuary`,
            eyebrow: "phase two · in preparation",
            heading: resident.displayName,
            note: "the visit room — the threshold at the door, then one continuous thread. in preparation.",
            stubId: "visits-resident",
          }),
        );
      },
    },
  },
});
