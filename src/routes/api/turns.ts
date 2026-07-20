import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isIdle } from "@/server/idle";
import { isStoredRuntimeVisitorAuthorized } from "@/server/runtime/visitor-auth.server";

const TURNS_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  vary: "x-mnemos-visitor-id",
  "x-content-type-options": "nosniff",
} as const;

function turnsJson(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: TURNS_HEADERS });
}

// Returns the transcript for a session so /conversation can rehydrate after a reload.
// Runtime-created sessions require both the UUID and canonical visitor id;
// sessions without runtime context retain their legacy UUID bearer behavior.
export const Route = createFileRoute("/api/turns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) {
          return turnsJson({ ok: false, code: "bad_request" }, 400);
        }
        if (!hasSupabaseAdminEnv()) {
          return turnsJson({ ok: false, code: "config_missing" }, 503);
        }
        // The UUID remains the first bearer. Runtime sessions add the stable
        // visitor id below rather than reviving fragile IP-hash ownership.
        const { data: session } = (await supabaseAdmin
          .from("sessions")
          .select("id, closed_at, last_active_at, mode")
          .eq("id", sessionId)
          .maybeSingle()) as unknown as {
          data: {
            id: string;
            closed_at: string | null;
            last_active_at: string;
            mode: string | null;
          } | null;
        };
        if (!session) {
          return turnsJson({ ok: false, code: "session_invalid" }, 401);
        }
        try {
          if (!(await isStoredRuntimeVisitorAuthorized(request, session.id))) {
            return turnsJson({ ok: false, code: "visitor_access_denied" }, 403);
          }
        } catch (error) {
          console.error("[turns] runtime visitor authorization failed", error);
          return turnsJson({ ok: false, code: "authorization_unavailable" }, 500);
        }
        // Defensive idle-close on rehydration — if the cron sweep hasn't
        // reached this session yet, close it now so the client renders
        // the read-only "set down" state instead of treating it as live.
        if (!session.closed_at && isIdle(session.last_active_at, session.mode)) {
          await supabaseAdmin
            .from("sessions")
            .update({ closed_at: new Date().toISOString(), closed_by: "idle" })
            .eq("id", session.id);
          session.closed_at = new Date().toISOString();
        }
        // Fetch turns regardless of closed state — the visitor should
        // always be able to see their transcript. Artifacts come back in
        // parallel and the response groups them per turn_id so the
        // client can render images / svg / ascii beside the right
        // bubble on reload.
        const [{ data: turns }, { data: artifactRows }] = await Promise.all([
          supabaseAdmin
            .from("turns")
            .select("id, role, body, kind, created_at")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true }),
          supabaseAdmin
            .from("turn_artifacts")
            .select("id, turn_id, kind, body, image_path, caption, prompt, created_at")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true }),
        ]);

        const supabaseUrl = process.env.SUPABASE_URL ?? "";
        const artifacts = (artifactRows ?? []).map((a) => ({
          id: a.id,
          turn_id: a.turn_id,
          kind: a.kind,
          caption: a.caption,
          prompt: a.prompt,
          content: a.kind === "image" ? null : a.body,
          url: a.image_path ? `${supabaseUrl}/storage/v1/object/public/art/${a.image_path}` : null,
          created_at: a.created_at,
        }));

        if (session.closed_at) {
          // 410 with turns included so the client can render read-only.
          return turnsJson(
            { ok: false, code: "session_closed", turns: turns ?? [], artifacts },
            410,
          );
        }
        return turnsJson({ ok: true, turns: turns ?? [], artifacts });
      },
    },
  },
});
