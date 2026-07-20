import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { consolidateSession } from "@/server/substrate.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { RUNTIME_WRAPPER_HEADER } from "@/server/runtime/legacy-idempotency.server";
import { isStoredRuntimeVisitorAuthorized } from "@/server/runtime/visitor-auth.server";

const Body = z.object({ session_id: z.string().uuid() });

export const Route = createFileRoute("/api/set-down")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ ok: false, code: "bad_request" }, { status: 400 });
        }
        if (!hasSupabaseAdminEnv()) {
          return Response.json({ ok: false, code: "config_missing" }, { status: 503 });
        }
        // Session UUID is a 128-bit random bearer token — sufficient auth.
        // IP hash removed: daily-rotating salt + Cloudflare header
        // inconsistency caused legitimate set-down requests to fail.
        type SessionRow = {
          id: string;
          closed_at: string | null;
          runtime_consolidation_started_at: string | null;
          runtime_consolidation_settled_at: string | null;
          runtime_consolidation_attempts: number;
        };
        const { data: session } = (await supabaseAdmin
          .from("sessions")
          .select(
            "id, closed_at, runtime_consolidation_started_at, runtime_consolidation_settled_at, runtime_consolidation_attempts",
          )
          .eq("id", body.session_id)
          .maybeSingle()) as unknown as { data: SessionRow | null };
        if (!session) {
          return Response.json({ ok: false, code: "session_invalid" }, { status: 401 });
        }
        try {
          if (!(await isStoredRuntimeVisitorAuthorized(request, session.id))) {
            return Response.json({ ok: false, code: "visitor_access_denied" }, { status: 403 });
          }
        } catch (error) {
          console.error("[runtime] legacy set-down visitor authorization failed", error);
          return Response.json(
            { ok: false, code: "runtime_authorization_unavailable" },
            { status: 503 },
          );
        }
        const runtimeManaged = request.headers.get(RUNTIME_WRAPPER_HEADER) === "v1";
        if (session.runtime_consolidation_settled_at) {
          return Response.json({ ok: true, already_settled: true });
        }
        // Legacy callers historically treated any closed session as finished.
        // Keep that compatibility rule. The runtime wrapper is allowed to
        // recover only work that it previously started and did not settle.
        if (session.closed_at && (!runtimeManaged || !session.runtime_consolidation_started_at)) {
          return Response.json({ ok: true, already_closed: true });
        }
        const startedAt = session.runtime_consolidation_started_at ?? new Date().toISOString();
        const { error: claimError } = await supabaseAdmin
          .from("sessions")
          .update({
            closed_at: session.closed_at ?? new Date().toISOString(),
            closed_by: session.closed_at ? undefined : "visitor",
            runtime_consolidation_started_at: startedAt,
            runtime_consolidation_attempts: session.runtime_consolidation_attempts + 1,
          } as never)
          .eq("id", session.id);
        if (claimError) {
          console.error("[substrate] consolidation recovery claim failed:", claimError);
          return Response.json({ ok: false, code: "consolidation_claim_failed" }, { status: 503 });
        }

        // Full Mnemos consolidation pipeline — awaited. Cloudflare Workers
        // terminate detached promises once the response is sent, so the
        // earlier fire-and-forget pattern was silently killing engram
        // formation, marginalia consolidation, hypomnema synthesis, and
        // journal writes for every visitor-initiated set-down. The
        // pipeline can take 10-30s (several model calls, multiple DB
        // writes); the visitor sees the spinner for that long. That's
        // the natural pause for "setting it down" — the conversation is
        // closing, not continuing.
        try {
          await consolidateSession(session.id);
        } catch (error) {
          // Leave started_at set and settled_at empty. The runtime wrapper can
          // then reclaim this exact visit instead of recording a false
          // terminal consolidation after a failed pipeline.
          console.error("[substrate] consolidateSession:", error);
          return Response.json(
            { ok: false, code: "consolidation_failed", retryable: true },
            { status: 503 },
          );
        }

        const settledAt = new Date().toISOString();
        const { error: settleError } = await supabaseAdmin
          .from("sessions")
          .update({ runtime_consolidation_settled_at: settledAt } as never)
          .eq("id", session.id)
          .is("runtime_consolidation_settled_at", null);
        if (settleError) {
          console.error("[substrate] consolidation recovery settle failed:", settleError);
          return Response.json({ ok: false, code: "consolidation_settle_failed" }, { status: 503 });
        }

        return Response.json({
          ok: true,
          consolidation_settled: true,
          recovered: Boolean(session.runtime_consolidation_started_at),
          settled_at: settledAt,
        });
      },
    },
  },
});
