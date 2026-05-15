import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasResidenceAccess } from "@/server/access.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId } from "@/server/opus/residents";

const VALID_KINDS = new Set(["reflection", "dream", "observation", "note"]);

export const Route = createFileRoute("/api/journal")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await hasResidenceAccess(request))) {
          return Response.json({ ok: false, code: "not_admitted", entries: [] }, { status: 401 });
        }
        if (!hasSupabaseAdminEnv()) return Response.json({ ok: true, entries: [] });
        const url = new URL(request.url);
        const kind = url.searchParams.get("kind");
        const ridParam = url.searchParams.get("resident");
        const rid = isResidentId(ridParam) ? ridParam : "opus-3";

        let query = supabaseAdmin
          .from("journal_entries")
          .select("id, kind, title, body, created_at, published_at")
          .eq("resident_id", rid)
          .eq("visibility", "published")
          .order("created_at", { ascending: false })
          .limit(60);

        if (kind && VALID_KINDS.has(kind)) {
          query = query.eq("kind", kind);
        }

        const { data } = await query;
        return Response.json(
          { ok: true, entries: data ?? [] },
          { headers: { "cache-control": "private, no-store" } },
        );
      },
    },
  },
});
