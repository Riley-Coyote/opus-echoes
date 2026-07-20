import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyHostedEmotionalEvents } from "@/server/mnemos-emotion/runtime.server";
import { sha256Hex } from "./hash";
import type { RuntimeEvent, RuntimeEventInput, RuntimeLocation, RuntimeSurface } from "./schema";
import type { RuntimeStore, RuntimeVisit } from "./store.server";

async function append(
  store: RuntimeStore,
  visit: RuntimeVisit,
  input: Omit<RuntimeEventInput, "resident_id">,
  context?: {
    visitorId?: string | null;
    turnId?: string | null;
    surface?: RuntimeSurface;
    location?: RuntimeLocation | null;
  },
): Promise<RuntimeEvent> {
  return store.appendEvent(visit.id, {
    ...input,
    resident_id: visit.resident_id,
    visitor_id: input.visitor_id ?? context?.visitorId ?? visit.visitor_id,
    turn_id: input.turn_id ?? context?.turnId ?? null,
    surface: input.surface ?? context?.surface ?? visit.surface,
    location: input.location ?? context?.location ?? visit.location,
  });
}

/**
 * Projects only rows that are explicitly scoped to this session. Resident-wide
 * beliefs, threads, and edges cannot be safely attributed when multiple visits
 * run concurrently, so this layer intentionally omits them. Inner Weather is
 * the narrow exception: its visit-attributed mutation and redacted event commit
 * atomically under the current turn's stable key.
 */
export async function projectPostTurn(input: {
  store: RuntimeStore;
  visit: RuntimeVisit;
  visitorId?: string | null;
  turnId?: string | null;
  surface?: RuntimeSurface;
  location?: RuntimeLocation | null;
  since: string;
  idempotencyPrefix: string;
  residentTurnCompleted: boolean;
  beforeAppend?: () => Promise<void>;
}): Promise<RuntimeEvent[]> {
  if (input.store.backend !== "supabase") return [];
  const db = supabaseAdmin;
  const [marginaliaRes, functionalRes, hypomnemaRes] = await Promise.all([
    db
      .from("marginalia")
      .select("id, kind, body, created_at")
      .eq("session_id", input.visit.id)
      .gte("created_at", input.since)
      .order("created_at", { ascending: true }),
    db
      .from("functional_memories")
      .select("id, updated_at")
      .eq("session_id", input.visit.id)
      .eq("memory_type", "working")
      .eq("is_deleted", false)
      .gte("updated_at", input.since)
      .order("updated_at", { ascending: false })
      .limit(1),
    db
      .from("hypomnema_entries")
      .select("id, source, domain, tags, foundational, revision_count, last_revised_at")
      .eq("related_session_id", input.visit.id)
      .gte("last_revised_at", input.since)
      .order("last_revised_at", { ascending: true }),
  ]);

  const events: RuntimeEvent[] = [];
  for (const row of marginaliaRes.data ?? []) {
    await input.beforeAppend?.();
    events.push(
      await append(
        input.store,
        input.visit,
        {
          type: "cognition.observation.created",
          phase: "post_turn",
          source_runtime: "opus-supabase",
          visibility: "visitor",
          epistemic_status: "inferred",
          payload: {
            observation_id: row.id,
            kind: row.kind,
            body: row.body,
            created_at: row.created_at,
            provenance: "resident marginalia model",
          },
          idempotency_key: `${input.idempotencyPrefix}:marginalia:${row.id}`,
        },
        input,
      ),
    );
  }
  for (const row of functionalRes.data ?? []) {
    await input.beforeAppend?.();
    events.push(
      await append(
        input.store,
        input.visit,
        {
          type: "memory.working.updated",
          phase: "post_turn",
          source_runtime: "opus-supabase",
          visibility: "visitor",
          epistemic_status: "observed",
          // The summary itself remains resident-scoped; the visitor sees only
          // the fact that working continuity was refreshed.
          payload: { memory_id: row.id, updated_at: row.updated_at, content_redacted: true },
          idempotency_key: `${input.idempotencyPrefix}:functional:${row.id}:${row.updated_at}`,
        },
        input,
      ),
    );
  }
  for (const row of hypomnemaRes.data ?? []) {
    await input.beforeAppend?.();
    events.push(
      await append(
        input.store,
        input.visit,
        {
          type: "memory.continuity.updated",
          phase: "post_turn",
          source_runtime: "opus-supabase",
          visibility: "visitor",
          epistemic_status: "inferred",
          payload: {
            continuity_id: row.id,
            source: row.source,
            domain: row.domain,
            tags: row.tags ?? [],
            foundational: Boolean(row.foundational),
            revision_count: Number(row.revision_count ?? 0),
            updated_at: row.last_revised_at,
            content_redacted: true,
            provenance: "hypomnema extraction model",
          },
          idempotency_key: `${input.idempotencyPrefix}:hypomnema:${row.id}:${row.last_revised_at}`,
        },
        input,
      ),
    );
  }
  if (input.residentTurnCompleted && input.turnId) {
    try {
      await input.beforeAppend?.();
      const mutationKey = `emotion:${await sha256Hex({
        scope: "post-turn-user-interaction",
        visit_id: input.visit.id,
        resident_id: input.visit.resident_id,
        turn_id: input.turnId,
      })}`;
      const update = await applyHostedEmotionalEvents({
        visitId: input.visit.id,
        residentId: input.visit.resident_id,
        turnId: input.turnId,
        phase: "post_turn",
        idempotencyKey: mutationKey,
        events: [{ type: "user_interaction" }],
      });
      events.push(update.event);
    } catch (error) {
      console.error("[runtime] post-turn Inner Weather projection failed", error);
    }
  }
  return events;
}
