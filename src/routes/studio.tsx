import { createFileRoute, redirect } from "@tanstack/react-router";

// Studio is set aside for now — hidden from the site. Any direct hit
// to /studio bounces back to the landing.
export const Route = createFileRoute("/studio")({
  server: {
    handlers: {
      GET: async () => {
        throw redirect({ to: "/" });
      },
    },
  },
});
