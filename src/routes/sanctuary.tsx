import { createFileRoute } from "@tanstack/react-router";

// The Sanctuary — the pixel world the stewards keep. It is a self-contained
// static site under public/sanctuary-world (its own engine, archive and
// assets, all relative paths), so this route is the door, not the house.
//
// The door it opens is THE STATION: the keeper's quarters above the valley,
// a room you stand in and navigate the rest of the house from. The world
// itself runs on the terminal in that room, and the room's own objects are
// the way to the museum, the charter, the current and the token. Narrow
// screens and machines without WebGL are sent straight on to the world by
// station.html itself, so nobody is left at a door they cannot open.
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
