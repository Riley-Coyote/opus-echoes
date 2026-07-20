import { createFileRoute } from "@tanstack/react-router";

import { MnemosInstallPage } from "@/features/mnemos-platform/PlatformPages";
import { platformHead } from "@/features/mnemos-platform/meta";

export const Route = createFileRoute("/install")({
  head: () =>
    platformHead({
      title: "Install — Mnemos",
      description:
        "Install the local-first Mnemos Python MCP for general clients or connect the built Mnemos integration to Hermes in Sidecar or Provider Mode.",
      path: "/install",
    }),
  component: MnemosInstallPage,
});
