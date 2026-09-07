import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/mnemos-home.html?raw";
import { serveHtml } from "@/server/serve-mock";

// Root path is the Mnemos platform landing — the bento hub of surfaces.
// Promoted to the front door from the Sanctuary
// walkthrough, which now lives at /enter (the landing's "Sanctuary" tile points
// there). Direct deep links to /opus-3, /sonnet-4-5, etc. still go straight to
// a resident. Self-contained page (own design system); opts out of the
// resident presence layer.
//
// One exception, by host: mnemos.world is the sanctuary's own domain, and its
// front door is the station — the room with the pixel world on the computer at
// the desk. Every other host (mnemos.chat, localhost, a preview URL) gets the
// hub exactly as before.
const SANCTUARY_HOSTS = new Set(["mnemos.world", "www.mnemos.world"]);
const STATION = "/sanctuary-world/station.html";

// A proxy in front of the app forwards the visitor's own host; the direct
// Host header is the fallback. Either may carry a port, and X-Forwarded-Host
// may carry a list — the first entry is the client's.
function hostOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const raw = (forwarded ? forwarded.split(",")[0] : request.headers.get("host")) ?? "";
  return raw.trim().toLowerCase().replace(/:\d+$/, "");
}

export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (SANCTUARY_HOSTS.has(hostOf(request))) {
          return new Response(null, { status: 302, headers: { Location: STATION } });
        }
        return serveHtml(html, undefined, { presence: false });
      },
    },
  },
});
