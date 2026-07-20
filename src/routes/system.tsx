import { createFileRoute } from "@tanstack/react-router";

import { SystemSurface } from "@/features/mnemos-system/SystemSurface";

export const Route = createFileRoute("/system")({
  head: () => ({
    meta: [
      { title: "Mnemos System — Topologie" },
      {
        name: "description",
        content:
          "The personal-system register of Mnemos: Sanctuary, visits, architecture, integrations, and the Topologie art house.",
      },
    ],
  }),
  component: SystemSurface,
});
