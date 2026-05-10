import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/token")({
  server: {
    handlers: {
      GET: async () => new Response(null, { status: 302, headers: { Location: "/" } }),
    },
  },
});
