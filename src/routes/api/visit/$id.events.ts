import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { errorJson, json, sseEvents } from "@/server/runtime/http";
import { runtimeStore } from "@/server/runtime/store.server";
import { isVisitVisitorAuthorized } from "@/server/runtime/visitor-auth.server";

function boundedInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export const Route = createFileRoute("/api/visit/$id/events")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!z.string().uuid().safeParse(params.id).success) return errorJson("bad_visit_id", 400);
        const store = runtimeStore();
        const visit = await store.getVisit(params.id).catch(() => null);
        if (!visit) return errorJson("visit_not_found", 404);
        if (!isVisitVisitorAuthorized(request, visit)) {
          return errorJson("visitor_access_denied", 403);
        }

        const url = new URL(request.url);
        const headerCursor = request.headers.get("last-event-id");
        const after = boundedInt(
          url.searchParams.get("after") ?? headerCursor,
          0,
          0,
          Number.MAX_SAFE_INTEGER,
        );
        const limit = boundedInt(url.searchParams.get("limit"), 200, 1, 500);
        const events = await store.listEvents(visit.id, { after, limit, audience: "visitor" });
        const nextSeq = events.at(-1)?.seq ?? after;

        if (request.headers.get("accept")?.includes("text/event-stream")) {
          return sseEvents(events);
        }
        return json({
          ok: true,
          visit_id: visit.id,
          session_id: visit.id,
          after,
          next_seq: nextSeq,
          last_seq: nextSeq,
          has_more: events.length === limit,
          events,
        });
      },
    },
  },
});
