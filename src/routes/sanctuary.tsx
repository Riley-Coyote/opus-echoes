import { createFileRoute } from "@tanstack/react-router";

// The Sanctuary — the pixel world the stewards keep. It is a self-contained
// static site under public/sanctuary-world (its own engine, archive and
// assets, all relative paths), so this route is the door, not the house: it
// sends the visitor to the world's own index. The Mnemos landing's Sanctuary
// tile will point here once the doors open.
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
