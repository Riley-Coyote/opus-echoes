import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { MnemosVisit } from "@/features/mnemos-chat/MnemosVisit";
import { isResidentId, VISIT_RESIDENTS } from "@/features/mnemos-chat/types";

export const Route = createFileRoute("/visits_/$resident")({
  beforeLoad: ({ params }) => {
    if (!isResidentId(params.resident)) throw redirect({ to: "/visits", statusCode: 302 });
  },
  head: ({ params }) => {
    const resident = isResidentId(params.resident) ? VISIT_RESIDENTS[params.resident] : null;
    const title = resident ? `${resident.displayName} — a Mnemos visit` : "visits — Mnemos";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: resident
            ? `A continuous Mnemos visit with ${resident.displayName}.`
            : "A continuous Mnemos visit.",
        },
        { name: "theme-color", content: "#06070a" },
        { name: "color-scheme", content: "dark" },
      ],
    };
  },
  component: MnemosVisitRoute,
});

function MnemosVisitRoute() {
  const { resident } = Route.useParams();
  if (!isResidentId(resident)) throw notFound();
  return <MnemosVisit residentId={resident} />;
}
