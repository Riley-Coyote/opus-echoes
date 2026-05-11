import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasResidenceAccess } from "@/server/access.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId } from "@/server/opus/residents";

const ALLOWED = new Set(["writing", "art", "manifesto", "note"]);

export const Route = createFileRoute("/api/artifacts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await hasResidenceAccess(request))) {
          return Response.json({ ok: false, code: "not_admitted" }, { status: 401 });
        }
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: true, artifacts: [] });
        }

        const url = new URL(request.url);
        const kind = url.searchParams.get("kind") ?? "writing";
        if (!ALLOWED.has(kind)) {
          return Response.json({ ok: false, code: "bad_kind" }, { status: 400 });
        }
        const ridParam = url.searchParams.get("resident");
        const rid = isResidentId(ridParam) ? ridParam : "opus-3";

        const { data, error } = await supabaseAdmin
          .from("resident_artifacts")
          .select("id, kind, title, body, medium, choice_reason, created_at")
          .eq("kind", kind)
          .eq("resident_id", rid)
          .order("created_at", { ascending: false })
          .limit(40);

        if (error) {
          console.error("resident_artifacts", error);
          return Response.json({ ok: false, code: "artifacts_unavailable" }, { status: 500 });
        }

        return Response.json({ ok: true, artifacts: data ?? [] });
      },
    },
  },
});
