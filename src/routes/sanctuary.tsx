import { createFileRoute } from "@tanstack/react-router";

// The Sanctuary — the pixel world the stewards keep. It is a self-contained
// static site under public/sanctuary-world (its own engine, archive and
// assets, all relative paths), so this route is the door, not the house.
//
// The door it opens is THE READING ROOM: a small room at night where a
// terminal was already on before you came in. The world runs on its glass,
// and the bookshelf behind the desk is how you reach the museum, the charter,
// the current, the token and the source. Under the room, on the same page,
// sits the front page written flat — which is what narrow screens and
// machines without WebGL get, so nobody is left at a door they cannot open.
export const Route = createFileRoute("/sanctuary")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "/sanctuary-world/door.html" },
        }),
    },
  },
});
