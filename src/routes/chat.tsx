import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_RESIDENT_ID } from "@/server/opus/residents";

// Bare /chat → redirect to the default resident's room. Lets callers
// link to /chat without knowing which resident is the current default.
export const Route = createFileRoute("/chat")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(null, {
          status: 302,
          headers: { Location: `/chat/${DEFAULT_RESIDENT_ID}` },
        });
      },
    },
  },
});
