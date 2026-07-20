import { z } from "zod";

/**
 * Public protocol version for the unified visit event stream.
 *
 * A version bump is required for breaking envelope or semantic changes. New
 * event names and optional payload fields may be added without changing this
 * value.
 */
export const RUNTIME_EVENT_VERSION = 1 as const;

export const RuntimePhaseSchema = z.enum(["pre_turn", "generation", "post_turn", "consolidation"]);

export const RuntimeVisibilitySchema = z.enum(["visitor", "resident", "internal"]);

export const RuntimeSurfaceSchema = z.enum(["world", "visit", "system"]);

const RuntimeLocationValueSchema = z.union([
  z.string().trim().max(240),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

/**
 * Location is intentionally shallow and bounded. It is correlation context
 * (for example a room slug or world coordinate), never a container for hidden
 * resident state or prompt material.
 */
export const RuntimeLocationSchema = z.union([
  z.string().trim().min(1).max(240),
  z
    .record(z.string().trim().min(1).max(80), RuntimeLocationValueSchema)
    .refine((value) => JSON.stringify(value).length <= 4096, "location is too large"),
]);

/**
 * `observed` means the runtime directly witnessed the state or write.
 * `inferred` means a model or heuristic interpreted an exchange.
 * `simulated` is reserved for explicitly labeled fixtures and previews. It
 * must never be silently promoted to an inferred or observed claim.
 */
export const RuntimeEpistemicStatusSchema = z.enum(["observed", "inferred", "simulated"]);

export const RuntimeSourceSchema = z.enum(["opus-supabase", "mnemos-python"]);

/**
 * Deliberately finite. These names describe facts the compatibility layer can
 * currently witness; they do not claim access to hidden model reasoning.
 */
export const RuntimeEventTypeSchema = z.enum([
  "visit.started",
  "visit.resumed",
  "visit.closed",
  "turn.accepted",
  "turn.processing.started",
  "visit.pacing.changed",
  "turn.kind.detected",
  "model.output.started",
  "model.output.delta",
  "model.output.completed",
  "artifact.pending",
  "artifact.ready",
  "artifact.failed",
  "space.proposed",
  "turn.error",
  "turn.settled",
  "cognition.observation.created",
  "emotion.inner-weather.updated",
  "memory.working.updated",
  "memory.continuity.updated",
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
  "consolidation.started",
  "consolidation.completed",
  "consolidation.failed",
  "consolidation.unavailable",
  "attachment.ready",
  "attachment.removed",
]);

export const RuntimeEventInputSchema = z
  .object({
    type: RuntimeEventTypeSchema,
    phase: RuntimePhaseSchema,
    resident_id: z.string().trim().min(1).max(80),
    visitor_id: z.string().trim().min(1).max(160).nullable().optional(),
    turn_id: z.string().uuid().nullable().optional(),
    surface: RuntimeSurfaceSchema.default("visit"),
    location: RuntimeLocationSchema.nullable().optional(),
    source_runtime: RuntimeSourceSchema,
    visibility: RuntimeVisibilitySchema.default("visitor"),
    epistemic_status: RuntimeEpistemicStatusSchema.default("observed"),
    payload: z.record(z.string(), z.unknown()).default({}),
    idempotency_key: z.string().trim().min(1).max(240).nullable().optional(),
  })
  .strict();

export const RuntimeEventSchema = RuntimeEventInputSchema.omit({ idempotency_key: true })
  .extend({
    v: z.literal(RUNTIME_EVENT_VERSION),
    event_id: z.string().uuid(),
    session_id: z.string().uuid(),
    visit_id: z.string().uuid(),
    seq: z.number().int().positive(),
    ts: z.string().datetime({ offset: true }),
  })
  .strict();

export type RuntimePhase = z.infer<typeof RuntimePhaseSchema>;
export type RuntimeVisibility = z.infer<typeof RuntimeVisibilitySchema>;
export type RuntimeSurface = z.infer<typeof RuntimeSurfaceSchema>;
export type RuntimeLocation = z.infer<typeof RuntimeLocationSchema>;
export type RuntimeEpistemicStatus = z.infer<typeof RuntimeEpistemicStatusSchema>;
export type RuntimeSource = z.infer<typeof RuntimeSourceSchema>;
export type RuntimeEventType = z.infer<typeof RuntimeEventTypeSchema>;
export type RuntimeEventInput = z.input<typeof RuntimeEventInputSchema>;
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

export const StartVisitBodySchema = z
  .object({
    visitor_id: z.string().trim().min(1).max(160).optional(),
    visitor_token: z.string().uuid().optional(),
    visit_id: z.string().uuid().optional(),
    resident_id: z.string().trim().min(1).max(80).optional(),
    resident: z.string().trim().min(1).max(80).optional(),
    surface: RuntimeSurfaceSchema.default("visit"),
    location: RuntimeLocationSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.resident_id ?? value.resident), {
    message: "resident_id is required",
    path: ["resident_id"],
  })
  .transform((value) => ({
    // Older clients named this bearer visitor_token. New visits always bind
    // whichever public identifier was supplied as their canonical visitor_id.
    visitor_id: value.visitor_id ?? value.visitor_token ?? null,
    // Canonical web visitors are UUIDs. Preserve that UUID through the legacy
    // bootstrap so production retrieval never falls back to shared IP scope.
    visitor_token:
      value.visitor_token ??
      (z.string().uuid().safeParse(value.visitor_id).success ? value.visitor_id : undefined),
    requested_visit_id: value.visit_id ?? null,
    resident_id: (value.resident_id ?? value.resident) as string,
    surface: value.surface,
    location: value.location ?? null,
  }));

export const TurnBodySchema = z
  .object({
    visitor_id: z.string().trim().min(1).max(160).optional(),
    visit_id: z.string().uuid().optional(),
    turn_id: z.string().uuid().optional(),
    client_turn_id: z.string().uuid().optional(),
    resident_id: z.string().trim().min(1).max(80).optional(),
    surface: RuntimeSurfaceSchema.optional(),
    location: RuntimeLocationSchema.optional(),
    message: z.string().trim().min(1).max(8000).optional(),
    body: z.string().trim().min(1).max(8000).optional(),
    attachment_ids: z.array(z.string().uuid()).max(12).default([]),
    preview_turns: z
      .array(
        z
          .object({
            role: z.enum(["visitor", "resident"]),
            body: z.string().trim().min(1).max(8000),
          })
          .strict(),
      )
      .max(24)
      .optional(),
  })
  .strict()
  .refine((value) => Boolean(value.message ?? value.body), {
    message: "message is required",
    path: ["message"],
  })
  .transform((value) => ({
    visitor_id: value.visitor_id ?? null,
    visit_id: value.visit_id ?? null,
    turn_id: value.turn_id ?? value.client_turn_id ?? crypto.randomUUID(),
    resident_id: value.resident_id ?? null,
    surface: value.surface ?? null,
    location: value.location ?? null,
    message: (value.message ?? value.body) as string,
    attachment_ids: Array.from(new Set(value.attachment_ids)),
    preview_turns: value.preview_turns,
  }));

export const SetDownBodySchema = z.object({}).strict();

export const IDEMPOTENCY_HEADER = "idempotency-key";

export function parseIdempotencyKey(request: Request, fallback?: string | null): string | null {
  const raw = request.headers.get(IDEMPOTENCY_HEADER)?.trim() || fallback?.trim() || "";
  return raw.length >= 8 && raw.length <= 200 ? raw : null;
}
