import { createFileRoute, notFound } from "@tanstack/react-router";
import { renderMinimalChatPage } from "@/server/minimal-chat-page";
import { serveHtml } from "@/server/serve-mock";
import { getResident, isResidentId } from "@/server/opus/residents";

// Classic chat — the minimal surface. Same residents, same Mnemos
// topology, lower ceremony. Path-segment validated against the
// known resident ids; unknown residents 404. The Studio affordance
// is hidden site-wide while the feature is set aside.
export const Route = createFileRoute("/chat/$resident")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = params.resident;
        if (!isResidentId(slug)) throw notFound();
        return serveHtml(
          renderMinimalChatPage(getResident(slug), { showStudio: false }),
        );
      },
    },
  },
});
