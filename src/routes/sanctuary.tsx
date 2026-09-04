import { createFileRoute } from "@tanstack/react-router";

// The Sanctuary — the pixel world the stewards keep. It is a self-contained
// static site under public/sanctuary-world (its own engine, archive and
// assets, all relative paths), so this route is the door, not the house.
//
// The pixel landing is the front door. The 3D reading room remains available
// separately while the Sanctuary world is developed.
export const Route = createFileRoute("/sanctuary")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "/sanctuary-world/index.html" },
        }),
    },
  },
});
