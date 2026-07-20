import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyHostedEmotionalEvents } from "@/server/mnemos-emotion/runtime.server";
import { z } from "zod";
import {
  RuntimePhaseSchema,
  RuntimeSourceSchema,
  type RuntimeEvent,
  type RuntimeEventInput,
} from "./schema";
import type { RuntimeStore, RuntimeVisit } from "./store.server";
import { runtimeTable } from "./supabase.server";

export const CognitionMutationTypeSchema = z.enum([
  "engram.created",
  "engram.reinforced",
  "engram.promoted",
  "engram.decayed",
  "engram.connections.updated",
  "engram.edge.created",
  "belief.created",
  "belief.updated",
  "thread.created",
  "thread.reinforced",
  "journal.created",
  "resident.state.updated",
]);

export type CognitionMutationType = z.infer<typeof CognitionMutationTypeSchema>;

const EngramSnapshotSchema = z
  .object({
    strength: z.number().finite(),
    stability: z.number().finite(),
    accessibility: z.number().finite(),
    reinforcement_count: z.number().int().nonnegative(),
    is_core: z.boolean(),
    connections: z.number().int().nonnegative(),
    state: z.string().trim().min(1).max(40),
  })
  .strict();

const EdgeSnapshotSchema = z
  .object({
    from_engram_id: z.string().uuid(),
    to_engram_id: z.string().uuid(),
    weight: z.number().finite(),
  })
  .strict();

const BeliefSnapshotSchema = z
  .object({
    confidence: z.number().finite(),
    prior_confidence: z.number().finite().nullable(),
  })
  .strict();

const ThreadSnapshotSchema = z
  .object({
    appearance_count: z.number().int().nonnegative(),
    distinct_visitor_count: z.number().int().nonnegative(),
  })
  .strict();

const JournalSnapshotSchema = z.object({ kind: z.string().trim().min(1).max(80) }).strict();

const ResidentStateSnapshotSchema = z
  .object({
    arousal: z.number().finite(),
    openness: z.number().finite(),
    resolution: z.number().finite(),
    selection_threshold: z.number().finite(),
    temperature: z.number().finite(),
    surprise_sensitivity: z.number().finite(),
  })
  .strict();

function mutationPayloadSchema<T extends z.ZodType>(snapshot: T, created: boolean) {
  return z
    .object({
      before: created ? z.null() : snapshot,
      after: snapshot,
      content_redacted: z.literal(true),
    })
    .strict();
}

const MUTATION_PAYLOAD_SCHEMAS: Record<CognitionMutationType, z.ZodType> = {
  "engram.created": mutationPayloadSchema(EngramSnapshotSchema, true),
  "engram.reinforced": mutationPayloadSchema(EngramSnapshotSchema, false),
  "engram.promoted": mutationPayloadSchema(EngramSnapshotSchema, false),
  "engram.decayed": mutationPayloadSchema(EngramSnapshotSchema, false),
  "engram.connections.updated": mutationPayloadSchema(EngramSnapshotSchema, false),
  "engram.edge.created": mutationPayloadSchema(EdgeSnapshotSchema, true),
  "belief.created": mutationPayloadSchema(BeliefSnapshotSchema, true),
  "belief.updated": mutationPayloadSchema(BeliefSnapshotSchema, false),
  "thread.created": mutationPayloadSchema(ThreadSnapshotSchema, true),
  "thread.reinforced": mutationPayloadSchema(ThreadSnapshotSchema, false),
  "journal.created": mutationPayloadSchema(JournalSnapshotSchema, true),
  "resident.state.updated": mutationPayloadSchema(ResidentStateSnapshotSchema, false),
};

const SESSION_LINKED_TYPES = new Set<CognitionMutationType>([
  "engram.created",
  "engram.reinforced",
  "engram.promoted",
  "engram.edge.created",
  "journal.created",
]);

const VISITOR_VISIBLE_TYPES = new Set<CognitionMutationType>([
  "engram.created",
  "engram.reinforced",
  "engram.promoted",
  "engram.edge.created",
]);

export const CognitionMutationRowSchema = z
  .object({
    ordinal: z.coerce.number().int().positive(),
    id: z.string().uuid(),
    session_id: z.string().uuid(),
    resident_id: z.string().trim().min(1).max(80),
    mutation_type: CognitionMutationTypeSchema,
    entity_id: z.string().trim().min(1).max(160),
    attribution_scope: z.enum(["session_linked", "triggered_by_visit"]),
    phase: RuntimePhaseSchema,
    source_runtime: RuntimeSourceSchema,
    payload: z.unknown(),
    mutation_at: z.string().datetime({ offset: true }),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((row, context) => {
    const payloadResult = MUTATION_PAYLOAD_SCHEMAS[row.mutation_type].safeParse(row.payload);
    if (!payloadResult.success) {
      context.addIssue({
        code: "custom",
        path: ["payload"],
        message: `invalid ${row.mutation_type} cognition payload`,
      });
    }
    const expectedScope = SESSION_LINKED_TYPES.has(row.mutation_type)
      ? "session_linked"
      : "triggered_by_visit";
    if (row.attribution_scope !== expectedScope) {
      context.addIssue({
        code: "custom",
        path: ["attribution_scope"],
        message: `${row.mutation_type} requires ${expectedScope} attribution`,
      });
    }
  });

export type CognitionMutationRow = z.infer<typeof CognitionMutationRowSchema>;

const HypomnemaProjectionRowSchema = z
  .object({
    id: z.string().uuid(),
    source: z.string().trim().min(1).max(120),
    domain: z.string().trim().min(1).max(120),
    tags: z.array(z.string().trim().max(120)).nullable(),
    foundational: z.boolean().nullable(),
    revision_count: z.number().int().nonnegative().nullable(),
    last_revised_at: z.string().datetime({ offset: true }),
  })
  .strict();

function cognitionMutationTable() {
  // The table lands in migration 1600 and is intentionally kept out of the
  // generated browser-facing database types until the next schema regeneration.
  return runtimeTable("runtime_cognition_mutations");
}

async function loadCognitionMutations(
  sessionId: string,
  residentId: string,
): Promise<CognitionMutationRow[]> {
  const rows: unknown[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await cognitionMutationTable()
      .select(
        "ordinal, id, session_id, resident_id, mutation_type, entity_id, attribution_scope, phase, source_runtime, payload, mutation_at, created_at",
      )
      .eq("session_id", sessionId)
      .eq("resident_id", residentId)
      .order("ordinal", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`cognition mutation projection failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return z.array(CognitionMutationRowSchema).parse(rows);
}

function markerPayload(row: CognitionMutationRow): {
  before: unknown;
  after: unknown;
  content_redacted: true;
} {
  return MUTATION_PAYLOAD_SCHEMAS[row.mutation_type].parse(row.payload) as {
    before: unknown;
    after: unknown;
    content_redacted: true;
  };
}

export function cognitionMutationVisibility(
  row: Pick<CognitionMutationRow, "mutation_type" | "attribution_scope">,
): "visitor" | "internal" {
  return row.attribution_scope === "session_linked" && VISITOR_VISIBLE_TYPES.has(row.mutation_type)
    ? "visitor"
    : "internal";
}

function projectedMutationPayload(row: CognitionMutationRow): Record<string, unknown> {
  const payload = markerPayload(row);
  const shared = {
    mutation_id: row.id,
    mutation_at: row.mutation_at,
    attribution_scope: row.attribution_scope,
    content_redacted: true,
  } as const;

  if (cognitionMutationVisibility(row) === "visitor") {
    if (row.mutation_type === "engram.edge.created") {
      const edge = EdgeSnapshotSchema.parse(payload.after);
      return {
        ...shared,
        from_engram_id: edge.from_engram_id,
        to_engram_id: edge.to_engram_id,
      };
    }
    return { ...shared, engram_id: row.entity_id };
  }

  // Internal events retain exact numeric OLD/NEW snapshots without content,
  // prose, quotes, belief text, journal bodies, or hidden prompt material.
  return {
    ...shared,
    entity_id: row.entity_id,
    before: payload.before,
    after: payload.after,
  };
}

async function append(
  store: RuntimeStore,
  visit: RuntimeVisit,
  input: Omit<RuntimeEventInput, "resident_id">,
): Promise<RuntimeEvent> {
  return store.appendEvent(visit.id, {
    ...input,
    resident_id: visit.resident_id,
    visitor_id: input.visitor_id ?? visit.visitor_id,
    surface: input.surface ?? visit.surface,
    location: input.location ?? visit.location,
  });
}

export type AttributedConsolidationProjection = {
  events: RuntimeEvent[];
  cognitionEventCount: number;
  visitorCognitionEventCount: number;
  internalCognitionEventCount: number;
  continuityEventCount: number;
  emotionalEventCount: number;
};

/**
 * Projects only durable mutation markers written in the same transaction as
 * their substrate row, plus session-keyed continuity rows. No resident-wide
 * time-window diff participates in attribution.
 */
export async function projectAttributedConsolidation(input: {
  store: RuntimeStore;
  visit: RuntimeVisit;
  since: string;
}): Promise<AttributedConsolidationProjection> {
  if (input.store.backend !== "supabase") {
    return {
      events: [],
      cognitionEventCount: 0,
      visitorCognitionEventCount: 0,
      internalCognitionEventCount: 0,
      continuityEventCount: 0,
      emotionalEventCount: 0,
    };
  }

  const [mutations, continuityResult] = await Promise.all([
    loadCognitionMutations(input.visit.id, input.visit.resident_id),
    supabaseAdmin
      .from("hypomnema_entries")
      .select("id, source, domain, tags, foundational, revision_count, last_revised_at")
      .eq("related_session_id", input.visit.id)
      .gte("last_revised_at", input.since)
      .order("last_revised_at", { ascending: true }),
  ]);
  if (continuityResult.error) {
    throw new Error(
      `consolidation continuity projection failed: ${continuityResult.error.message}`,
    );
  }
  const continuityRows = z.array(HypomnemaProjectionRowSchema).parse(continuityResult.data ?? []);

  const events: RuntimeEvent[] = [];
  let visitorCognitionEventCount = 0;
  let emotionalEventCount = 0;
  for (const mutation of mutations) {
    const visibility = cognitionMutationVisibility(mutation);
    if (visibility === "visitor") visitorCognitionEventCount += 1;
    events.push(
      await append(input.store, input.visit, {
        type: mutation.mutation_type,
        phase: mutation.phase,
        source_runtime: mutation.source_runtime,
        visibility,
        epistemic_status: "observed",
        payload: projectedMutationPayload(mutation),
        idempotency_key: `cognition:${mutation.id}`,
      }),
    );
    if (
      mutation.mutation_type === "engram.edge.created" &&
      mutation.attribution_scope === "session_linked"
    ) {
      const emotionalUpdate = await applyHostedEmotionalEvents({
        visitId: input.visit.id,
        residentId: input.visit.resident_id,
        phase: "consolidation",
        idempotencyKey: `emotion:connection:${mutation.id}`,
        events: [{ type: "new_connection_discovered" }],
        occurredAt: mutation.mutation_at,
      });
      events.push(emotionalUpdate.event);
      emotionalEventCount += 1;
    }
  }

  for (const row of continuityRows) {
    events.push(
      await append(input.store, input.visit, {
        type: "memory.continuity.updated",
        phase: "consolidation",
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
          provenance: "session-close hypomnema synthesis",
        },
        idempotency_key: `consolidation-continuity:${row.id}:${row.last_revised_at}`,
      }),
    );
  }

  return {
    events,
    cognitionEventCount: mutations.length,
    visitorCognitionEventCount,
    internalCognitionEventCount: mutations.length - visitorCognitionEventCount,
    continuityEventCount: continuityRows.length,
    emotionalEventCount,
  };
}
