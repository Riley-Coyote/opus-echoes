/**
 * Shared idle thresholds for session auto-set-down.
 *
 * Single source of truth so the four places that close idle sessions
 * (/api/intent, /api/chat/start, /api/message, /api/turns,
 * substrate.idleSweep) can never drift. Override per environment via
 * env vars if either direction needs adjusting.
 *
 *   experiment — short ceremony surface. 30 min default.
 *   classic    — long-arc surface. 30 days default.
 */

export const IDLE_MIN_EXPERIMENT = Number(process.env.SESSION_IDLE_TIMEOUT_MIN ?? 30);
export const IDLE_MIN_CLASSIC = Number(
  process.env.SESSION_IDLE_TIMEOUT_MIN_CLASSIC ?? 43200,
);

export function idleCutoffMsForMode(mode: string | null | undefined): number {
  return (mode === "classic" ? IDLE_MIN_CLASSIC : IDLE_MIN_EXPERIMENT) * 60 * 1000;
}

export function isIdle(lastActiveAt: string, mode: string | null | undefined): boolean {
  const idleMs = Date.now() - new Date(lastActiveAt).getTime();
  return idleMs > idleCutoffMsForMode(mode);
}
