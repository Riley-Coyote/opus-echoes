import { type RuntimeLegacyContext, runtimeLegacyHeaders } from "./legacy-idempotency.server";

const FORWARDED_HEADERS = [
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-real-ip",
  "x-mnemos-visitor-id",
  "user-agent",
  "accept-language",
] as const;

function legacyHeaders(request: Request, contentType: string, additional?: HeadersInit): Headers {
  const headers = new Headers({
    "content-type": contentType,
    accept: "application/json, application/x-ndjson",
    "x-mnemos-runtime-wrapper": "v1",
  });
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (additional) {
    new Headers(additional).forEach((value, name) => headers.set(name, value));
  }
  return headers;
}

async function fetchLegacy(
  request: Request,
  path: string,
  body: unknown,
  additionalHeaders?: HeadersInit,
): Promise<Response> {
  const url = new URL(path, request.url);
  return fetch(url, {
    method: "POST",
    headers: legacyHeaders(request, "application/json", additionalHeaders),
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

/** Uses the production-tested classic bootstrap rather than duplicating it. */
export function legacyStartVisit(
  request: Request,
  body: { resident: string; visitor_token?: string },
): Promise<Response> {
  return fetchLegacy(request, "/api/chat/start", body);
}

/**
 * Compatibility seam over /api/message. The upstream releases only immutable
 * paragraph-safe prefixes. Those are genuine incremental provider output, but
 * they are intentionally not token-level or reasoning-level telemetry.
 */
export function legacyTurn(
  request: Request,
  body: {
    session_id: string;
    body: string;
    attachment_ids?: string[];
    preview_turns?: Array<{ role: "visitor" | "resident"; body: string }>;
  },
  runtime: RuntimeLegacyContext,
): Promise<Response> {
  return fetchLegacy(
    request,
    "/api/message",
    { ...body, client_turn_id: runtime.clientTurnId },
    runtimeLegacyHeaders(runtime),
  );
}

/** The legacy response resolves only after the full consolidation pass. */
export function legacySetDown(request: Request, visitId: string): Promise<Response> {
  return fetchLegacy(request, "/api/set-down", { session_id: visitId });
}

export async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : { ok: false, code: "invalid_upstream_response" };
  } catch {
    return { ok: false, code: "invalid_upstream_response" };
  }
}
