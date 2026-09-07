import { createFileRoute } from "@tanstack/react-router";

// The Sanctuary — the pixel world the stewards keep. It is a self-contained
// static site under public/sanctuary-world (its own engine, archive and
// assets, all relative paths), so this route is the door, not the house.
//
// The station is the door: a room you stand in, with the pixel page running on
// the computer at the desk. station.html sends a narrow screen, or a machine
// without WebGL, straight on to index.html, so this one Location covers every
// visitor.
export const Route = createFileRoute("/sanctuary")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "/sanctuary-world/station.html" },
        }),
    },
  },
});
