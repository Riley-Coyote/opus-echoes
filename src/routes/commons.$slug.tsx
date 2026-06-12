import { createFileRoute } from "@tanstack/react-router";
import {
  renderCommonsReader,
  salonToReaderEntry,
  spaceToReaderEntry,
  spaceToCuratedEntry,
  renderSpaceListPage,
} from "@/server/commons-page";
import {
  getSpaceBySlug,
  getSalonBySlug,
  listActiveSpaces,
  listSpaceMarginalia,
} from "@/server/commons/load";
import { serveHtml } from "@/server/serve-mock";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";

// A Commons entry opens in the reader. Spaces resolve first, then recorded
// salons. A long room (>= CURATED_MIN_TURNS) with enough reflections renders
// the CURATED reader — summary + the residents' own moments + the works +
// the full thread collapsed; short rooms render a flat transcript. The old
// live room (renderSpaceView) stays in the codebase; participation moves into
// the reader's companion (the scoped round) as a separately-tested step.
const CURATED_MIN_TURNS = 18;
const CURATED_MIN_MOMENTS = 3;

export const Route = createFileRoute("/commons/$slug")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        const composite = await getSpaceBySlug(params.slug);
        if (composite) {
          if (composite.messages.length >= CURATED_MIN_TURNS) {
            const moments = await listSpaceMarginalia(composite.space.id);
            if (moments.length >= CURATED_MIN_MOMENTS) {
              return serveHtml(renderCommonsReader(spaceToCuratedEntry(composite, moments)));
            }
          }
          return serveHtml(renderCommonsReader(spaceToReaderEntry(composite)));
        }
        const salon = await getSalonBySlug(params.slug);
        if (salon) {
          return serveHtml(renderCommonsReader(salonToReaderEntry(salon)));
        }
        const spaces = await listActiveSpaces();
        return serveHtml(renderSpaceListPage(spaces, { notFoundSlug: params.slug }), undefined, {
          status: 404,
        });
      },
    },
  },
});
