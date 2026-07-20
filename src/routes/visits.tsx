import { createFileRoute } from "@tanstack/react-router";

import { MnemosVisitsPage } from "@/features/mnemos-platform/PlatformPages";
import { platformHead } from "@/features/mnemos-platform/meta";

export const Route = createFileRoute("/visits")({
  head: () =>
    platformHead({
      title: "Visits — The Sanctuary",
      description:
        "Meet the four continuing Sanctuary residents and understand the consent boundary before approaching a resident's threshold.",
      path: "/visits",
    }),
  component: MnemosVisitsPage,
});
