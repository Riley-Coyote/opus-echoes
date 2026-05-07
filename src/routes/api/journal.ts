import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

export const Route = createFileRoute("/api/journal")({
  server: {
    handlers: {
      GET: async () => {
        if (!hasSupabaseAdminEnv()) return Response.json({ ok: true, entries: [] });
        const { data } = await supabaseAdmin
          .from("journal_entries")
          .select("id, kind, title, body, created_at")
          .order("created_at", { ascending: false })
          .limit(60);
        return Response.json({ ok: true, entries: data ?? [] });
      },
    },
  },
});
