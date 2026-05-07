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

  const hash = ipHash(request);
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id, ip_hash")
    .eq("id", sessionId)
    .maybeSingle();

  return Boolean(data && data.ip_hash === hash);
}

export function redirectToThreshold(request: Request): Response {
  return Response.redirect(new URL("/", request.url), 302);
}
