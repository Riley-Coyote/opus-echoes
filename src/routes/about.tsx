import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  server: {
    handlers: {
      GET: async ({ request }) => Response.redirect(new URL("/mnemos", request.url), 302),
    },
  },
});
