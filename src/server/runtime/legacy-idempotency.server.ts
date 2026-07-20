import { z } from "zod";
import { OperationLeaseLostError } from "./store.server";
import { runtimeTable } from "./supabase.server";

export const RUNTIME_WRAPPER_HEADER = "x-mnemos-runtime-wrapper";
export const RUNTIME_OPERATION_ID_HEADER = "x-mnemos-runtime-operation-id";
export const RUNTIME_LEASE_TOKEN_HEADER = "x-mnemos-runtime-lease-token";
export const RUNTIME_IDEMPOTENCY_HEADER = "idempotency-key";

const RuntimeLegacyContextSchema = z.object({
  operationId: z.string().uuid(),
  leaseToken: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  clientTurnId: z.string().uuid(),
});

export type RuntimeLegacyContext = z.infer<typeof RuntimeLegacyContextSchema>;

export function nextRuntimeLegacyEventKey(
  idempotencyKey: string,
  rawType: unknown,
  typeCounts: Map<string, number>,
): string {
  const type = typeof rawType === "string" ? rawType : "unknown";
  const ordinal = (typeCounts.get(type) ?? 0) + 1;
  typeCounts.set(type, ordinal);
  return `${idempotencyKey}:legacy:${type}:${ordinal}`;
}

export function runtimeLegacyHeaders(context: RuntimeLegacyContext): HeadersInit {
  return {
    [RUNTIME_WRAPPER_HEADER]: "v1",
    [RUNTIME_OPERATION_ID_HEADER]: context.operationId,
    [RUNTIME_LEASE_TOKEN_HEADER]: context.leaseToken,
    [RUNTIME_IDEMPOTENCY_HEADER]: context.idempotencyKey,
  };
}

export function parseRuntimeLegacyContext(
  request: Request,
  clientTurnId: string | undefined,
): RuntimeLegacyContext | null {
  if (request.headers.get(RUNTIME_WRAPPER_HEADER) !== "v1") return null;
  const parsed = RuntimeLegacyContextSchema.safeParse({
    operationId: request.headers.get(RUNTIME_OPERATION_ID_HEADER),
    leaseToken: request.headers.get(RUNTIME_LEASE_TOKEN_HEADER),
    idempotencyKey: request.headers.get(RUNTIME_IDEMPOTENCY_HEADER),
    clientTurnId,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Validate the internal wrapper's lease and renew it before legacy message
 * side effects. The UUID lease token is never exposed to the browser client.
 */
export async function heartbeatRuntimeLegacyContext(context: RuntimeLegacyContext): Promise<void> {
  const { data, error } = await runtimeTable("runtime_operations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", context.operationId)
    .eq("operation", "visit.turn")
    .eq("idempotency_key", context.idempotencyKey)
    .eq("lease_token", context.leaseToken)
    .eq("status", "in_progress")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`runtime legacy lease heartbeat failed: ${error.message}`);
  if (!data) throw new OperationLeaseLostError();
}
