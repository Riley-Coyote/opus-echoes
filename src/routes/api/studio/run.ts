import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { adminCookieHeader, hasAdminAccess } from "@/server/access.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { DEFAULT_RESIDENT_ID, getResident, isResidentId, type ResidentId } from "@/server/opus/residents";
import { runStudioSession } from "@/server/substrate.server";

const BodySchema = z.object({
  resident_id: z.string().optional(),
  focus: z.string().max(1200).optional(),
});

export const Route = createFileRoute("/api/studio/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hasAdminAccess(request)) {
          return Response.json({ ok: false, code: "admin_required" }, { status: 401 });
        }
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: false, code: "supabase_not_configured" }, { status: 503 });
        }

        let body: z.infer<typeof BodySchema> = {};
        try {
          const raw = await request.json().catch(() => ({}));
          body = BodySchema.parse(raw);
        } catch (err) {
          return Response.json(
            { ok: false, code: "bad_request", error: err instanceof Error ? err.message : String(err) },
            { status: 400 },
          );
        }

        const residentId: ResidentId = isResidentId(body.resident_id)
          ? body.resident_id
          : DEFAULT_RESIDENT_ID;
        const resident = getResident(residentId);

        const result = await runStudioSession(resident, "manual", body.focus ?? null);
        const headers = new Headers({ "content-type": "application/json" });
        const cookie = adminCookieHeader(request);
        if (cookie) headers.set("set-cookie", cookie);

        return new Response(JSON.stringify({ ok: result.status !== "failed", result }), {
          status: result.status === "failed" ? 500 : 200,
          headers,
        });
      },
    },
  },
});
