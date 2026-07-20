import { RUNTIME_EVENT_VERSION, type RuntimeEvent } from "./schema";

export function json(payload: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mnemos-runtime-version", String(RUNTIME_EVENT_VERSION));
  return new Response(JSON.stringify(payload), { status, headers });
}

export function errorJson(code: string, status: number, detail?: string): Response {
  return json({ ok: false, code, ...(detail ? { detail } : {}) }, status);
}

export function operationConflict(kind: "conflict" | "in_progress"): Response {
  return json(
    {
      ok: false,
      code: kind === "conflict" ? "idempotency_key_reused" : "operation_in_progress",
    },
    409,
    kind === "in_progress" ? { "retry-after": "2" } : undefined,
  );
}

export function ndjsonEvents(events: RuntimeEvent[], replay = false): Response {
  const body = events.map((event) => `${JSON.stringify(event)}\n`).join("");
  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-mnemos-runtime-version": String(RUNTIME_EVENT_VERSION),
      "x-mnemos-runtime-replay": replay ? "true" : "false",
    },
  });
}

export function sseEvents(events: RuntimeEvent[]): Response {
  const body = events
    .map((event) => `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body || ": replay empty\n\n", {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-mnemos-runtime-version": String(RUNTIME_EVENT_VERSION),
    },
  });
}
