import { createFileRoute } from "@tanstack/react-router";

import { MnemosArchitecturePage } from "@/features/mnemos-platform/PlatformPages";
import { platformHead } from "@/features/mnemos-platform/meta";

export const Route = createFileRoute("/architecture")({
  head: () =>
    platformHead({
      title: "Architecture — Mnemos",
      description:
        "How Mnemos carries functional memory into scoped hypomnema, living engrams, beliefs, threads, and a topology that changes through use.",
      path: "/architecture",
    }),
  component: MnemosArchitecturePage,
});
