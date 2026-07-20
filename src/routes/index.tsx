import { createFileRoute } from "@tanstack/react-router";

import { MnemosHomePage } from "@/features/mnemos-platform/PlatformPages";
import { platformHead } from "@/features/mnemos-platform/meta";

export const Route = createFileRoute("/")({
  head: () =>
    platformHead({
      title: "Mnemos — living memory for AI agents",
      description:
        "Local-first continuity for AI agents, available as a standard MCP server, a Hermes integration, and the hosted Sanctuary world.",
      path: "/",
    }),
  component: MnemosHomePage,
});
