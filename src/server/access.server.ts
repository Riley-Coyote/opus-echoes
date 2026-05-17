import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv, isLocalDev } from "@/server/env.server";
import { ipHash } from "@/server/rate-limit.server";

const SESSION_COOKIE = "sanctuary_session";

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const parts = cookie.split(";").map((part) => part.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export function residenceSessionId(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("session_id") || cookieValue(request, SESSION_COOKIE);
}

export async function hasResidenceAccess(request: Request): Promise<boolean> {
  const sessionId = residenceSessionId(request);

  if (!sessionId) {
    if (!isLocalDev()) return false;
    const url = new URL(request.url);
    if (url.searchParams.get("preview") === "1") return true;
    const referer = request.headers.get("referer");
    if (!referer) return false;
    try {
      return new URL(referer).searchParams.get("preview") === "1";
    } catch {
      return false;
    }
  }

  if (!hasSupabaseAdminEnv()) {
    return isLocalDev();
  }

  // Possession of the session cookie (a UUID minted server-side at
  // /api/intent accept) is the access secret. We previously also required
  // the visitor's current ip_hash to equal the session's recorded
  // ip_hash, but in practice the same visitor's IP changes across a
  // single sitting — Cloudflare edge variance, mobile/CGNAT, dual-stack
  // v4↔v6 flips — which locked legitimate visitors out of /residence
  // and /memory after their conversation moved them off the original
  // edge. Existence-of-row is the gate now.
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  return Boolean(data);
}

export function redirectToThreshold(request: Request): Response {
  return Response.redirect(new URL("/", request.url), 302);
}

/**
 * Admin-only access gate. Checks for ADMIN_TOKEN via:
 *   1. ?token= query parameter (sets a cookie for future visits)
 *   2. sanctuary_admin cookie (persisted from a prior ?token= visit)
 *
 * Returns the Response to set the cookie (if query param used),
 * or null if access is granted via cookie alone.
 * Throws if access is denied.
 */
const ADMIN_COOKIE = "sanctuary_admin";

export function hasAdminAccess(request: Request): boolean {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret) {
    // No ADMIN_TOKEN configured — allow in local dev, deny in production
    return isLocalDev();
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken === secret) return true;

  const cookie = cookieValue(request, ADMIN_COOKIE);
  return cookie === secret;
}

/**
 * If the visitor authenticated via ?token= query param, return
 * a Set-Cookie header value to persist the admin token. Returns
 * null if cookie is already set or no query token was used.
 */
export function adminCookieHeader(request: Request): string | null {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret) return null;

  const url = new URL(request.url);
  if (url.searchParams.get("token") !== secret) return null;

  // Already have the cookie — skip
  if (cookieValue(request, ADMIN_COOKIE) === secret) return null;

  return `${ADMIN_COOKIE}=${encodeURIComponent(secret)}; Path=/; Max-Age=${60 * 60 * 24 * 90}; SameSite=Lax; HttpOnly; Secure`;
}
