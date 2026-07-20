import {
  RuntimeEventInputSchema,
  type RuntimeEvent,
  type RuntimeEventInput,
  type RuntimeVisibility,
} from "./schema";

const FORBIDDEN_KEY =
  /(?:chain[_-]?of[_-]?thought|hidden[_-]?(?:reasoning|state)|private[_-]?reasoning|internal[_-]?prompt|system[_-]?prompt|model[_-]?prompt|reasoning[_-]?(?:content|tokens|trace)|thinking[_-]?(?:content|trace))/i;

const PRIVATE_TEXT_BLOCK =
  /<(?:thinking|reasoning|analysis)>[\s\S]*?<\/(?:thinking|reasoning|analysis)>/gi;
const UNCLOSED_PRIVATE_TEXT_BLOCK = /<(?:thinking|reasoning|analysis)>[\s\S]*$/gi;

/**
 * Recursively strips fields that could contain chain-of-thought or hidden
 * prompts. This is a safety boundary, not a claim that those fields exist.
 */
export function sanitizeRuntimePayload(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[depth limited]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value
      .replace(PRIVATE_TEXT_BLOCK, "[private reasoning omitted]")
      .replace(UNCLOSED_PRIVATE_TEXT_BLOCK, "[private reasoning omitted]");
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => sanitizeRuntimePayload(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key)) continue;
      out[key] = sanitizeRuntimePayload(child, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function sanitizeRuntimeEventInput(input: RuntimeEventInput): RuntimeEventInput {
  const parsed = RuntimeEventInputSchema.parse(input);
  return {
    ...parsed,
    // Preserve epistemic provenance exactly. Explicit preview events may be
    // simulated, but they must never be promoted to an inferred or observed
    // claim while crossing the runtime boundary.
    epistemic_status: parsed.epistemic_status,
    payload: sanitizeRuntimePayload(parsed.payload) as Record<string, unknown>,
  };
}

const READABLE: Record<RuntimeVisibility, ReadonlySet<RuntimeVisibility>> = {
  visitor: new Set(["visitor"]),
  resident: new Set(["visitor", "resident"]),
  internal: new Set(["visitor", "resident", "internal"]),
};

export function isVisibleTo(event: RuntimeEvent, audience: RuntimeVisibility): boolean {
  return READABLE[audience].has(event.visibility);
}

export function redactEventForAudience(
  event: RuntimeEvent,
  audience: RuntimeVisibility,
): RuntimeEvent | null {
  if (!isVisibleTo(event, audience)) return null;
  return {
    ...event,
    payload: sanitizeRuntimePayload(event.payload) as Record<string, unknown>,
  };
}
