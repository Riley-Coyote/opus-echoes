import { createFileRoute, redirect } from "@tanstack/react-router";

// Studio room is set aside — any direct/shared link redirects home
// while the feature is paused.
export const Route = createFileRoute("/studio/$slug")({
  server: {
    handlers: {
      GET: async () => {
        throw redirect({ to: "/" });
      },
    },
  },
});
