import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The runtime migrations are intentionally checked in with this feature. Until
// the generated Supabase types are refreshed from the migrated project, keep
// the schema boundary in one place rather than spreading unsafe casts through
// the runtime implementation.
type RuntimeTableBuilder = ReturnType<(typeof supabaseAdmin)["from"]>;

export function runtimeTable(table: string): RuntimeTableBuilder {
  const from = supabaseAdmin.from as unknown as (name: string) => RuntimeTableBuilder;
  return from.call(supabaseAdmin, table);
}

type RuntimeRpcResult = {
  data: Record<string, unknown> | Record<string, unknown>[] | null;
  error: { message: string } | null;
};

export async function appendRuntimeEventRpc(
  args: Record<string, unknown>,
): Promise<RuntimeRpcResult> {
  const rpc = supabaseAdmin.rpc as unknown as (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<RuntimeRpcResult>;
  return rpc.call(supabaseAdmin, "append_runtime_event_v1", args);
}

export async function reserveRuntimeAttachmentRpc(
  args: Record<string, unknown>,
): Promise<RuntimeRpcResult> {
  const rpc = supabaseAdmin.rpc as unknown as (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<RuntimeRpcResult>;
  return rpc.call(supabaseAdmin, "reserve_runtime_attachment_v1", args);
}

async function attachmentRpc(
  name:
    | "finalize_runtime_attachment_v1"
    | "begin_runtime_attachment_delete_v1"
    | "finalize_runtime_attachment_delete_v1",
  args: Record<string, unknown>,
): Promise<RuntimeRpcResult> {
  const rpc = supabaseAdmin.rpc as unknown as (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<RuntimeRpcResult>;
  return rpc.call(supabaseAdmin, name, args);
}

export function finalizeRuntimeAttachmentRpc(
  args: Record<string, unknown>,
): Promise<RuntimeRpcResult> {
  return attachmentRpc("finalize_runtime_attachment_v1", args);
}

export function beginRuntimeAttachmentDeleteRpc(
  args: Record<string, unknown>,
): Promise<RuntimeRpcResult> {
  return attachmentRpc("begin_runtime_attachment_delete_v1", args);
}

export function finalizeRuntimeAttachmentDeleteRpc(
  args: Record<string, unknown>,
): Promise<RuntimeRpcResult> {
  return attachmentRpc("finalize_runtime_attachment_delete_v1", args);
}
