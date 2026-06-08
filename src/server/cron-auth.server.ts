/**
 * Shared auth check for pg_cron-triggered hook endpoints.
 *
 * Prefers a dedicated CRON_SECRET (passed via `Authorization: Bearer <secret>`
 * or `apikey: <secret>` header) so cron callers don't share the same secret
 * as the client-side publishable key. Falls back to the publishable key only
 * when CRON_SECRET is not configured, so existing pg_cron jobs keep working
 * during the rollout window — set CRON_SECRET and update pg_cron to remove
 * the fallback.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const apikey = request.headers.get("apikey") ?? "";

  if (cronSecret) {
    if (bearer && bearer === cronSecret) return true;
    if (apikey && apikey === cronSecret) return true;
    return false;
  }

  // Legacy fallback (deprecated). Remove once pg_cron is updated to send
  // CRON_SECRET in the Authorization header.
  const publishable =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (publishable && apikey === publishable) return true;
  return false;
}
