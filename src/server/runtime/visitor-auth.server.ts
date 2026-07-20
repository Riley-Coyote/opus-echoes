import type { RuntimeVisit } from "./store.server";
import { runtimeTable } from "./supabase.server";

export const MNEMOS_VISITOR_ID_HEADER = "x-mnemos-visitor-id";

/**
 * A canonical visitor id is a second bearer beside the visit UUID. Legacy
 * sessions created before visitor context existed intentionally remain
 * visit-UUID-only so this boundary can be deployed without invalidating them.
 */
export function isVisitVisitorAuthorized(
  request: Request,
  visit: Pick<RuntimeVisit, "visitor_id">,
  bodyVisitorId?: string | null,
): boolean {
  const canonical = visit.visitor_id;
  if (!canonical) return true;

  const headerVisitorId = request.headers.get(MNEMOS_VISITOR_ID_HEADER)?.trim() || null;
  const bodyId = bodyVisitorId?.trim() || null;
  if (headerVisitorId && headerVisitorId !== canonical) return false;
  if (bodyId && bodyId !== canonical) return false;
  return headerVisitorId === canonical || bodyId === canonical;
}

/**
 * Compatibility boundary for older routes which still address sessions
 * directly. A missing context row is a genuine legacy session; a context
 * lookup error is not, and is allowed to fail closed by throwing.
 */
export async function isStoredRuntimeVisitorAuthorized(
  request: Request,
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await runtimeTable("runtime_visit_contexts")
    .select("visitor_id")
    .eq("visit_id", sessionId)
    .maybeSingle();
  if (error) {
    throw new Error(`runtime visitor context lookup failed: ${error.message}`);
  }
  return isVisitVisitorAuthorized(request, { visitor_id: data?.visitor_id ?? null });
}
