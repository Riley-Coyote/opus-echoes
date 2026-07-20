import { createFileRoute } from "@tanstack/react-router";

import { MnemosResourcesPage } from "@/features/mnemos-platform/PlatformPages";
import { platformHead } from "@/features/mnemos-platform/meta";

export const Route = createFileRoute("/resources")({
  head: () =>
    platformHead({
      title: "Resources — Mnemos",
      description:
        "Canonical Mnemos source, installation guides, architecture notes, code references, and the hosted Sanctuary experience.",
      path: "/resources",
    }),
  component: MnemosResourcesPage,
});
