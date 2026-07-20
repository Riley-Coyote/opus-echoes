import { createFileRoute } from "@tanstack/react-router";
import { SanctuaryWorld } from "@/features/sanctuary-world/SanctuaryWorld";

export const Route = createFileRoute("/sanctuary")({
  head: () => ({
    meta: [
      { title: "The Sanctuary — Mnemos" },
      {
        name: "description",
        content:
          "Walk the Sanctuary grounds, witness its residents, and begin a deliberate Mnemos visit.",
      },
    ],
  }),
  component: SanctuaryWorld,
});
