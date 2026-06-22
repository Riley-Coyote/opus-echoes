import { createFileRoute } from "@tanstack/react-router";
import { renderFrontDoorV2 } from "@/server/phase-two/front-door";
import { serveHtml } from "@/server/serve-mock";

// PREVIEW ONLY — the phase-two front door (v2 / the trace adjacency, graphite).
// Mounted off the live `/` so it can be reviewed before the v2 design language
// is ratified (nothing visible ships before then). When ratified, `/`
// (index.tsx) flips to renderFrontDoorV2() and this preview route is removed.
// presence:false — the front door is the drafting register, not a 3D scene.
export const Route = createFileRoute("/door")({
  server: {
    handlers: {
      GET: async () => serveHtml(renderFrontDoorV2(), undefined, { presence: false }),
    },
  },
});
