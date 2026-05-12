/**
 * IP hashing + rate limit helpers.
 * Raw IPs are never stored. Salt rotates daily at midnight UTC.
 */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function dailySalt(): string {
  const seed = process.env.DAILY_SALT_SEED ?? "sanctuary-default-seed-rotate-me";
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return createHash("sha256").update(`${seed}:${day}`).digest("hex");
}

export function ipHash(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
  return createHash("sha256").update(`${ip}:${dailySalt()}`).digest("hex");
}

export async function intentRateLimit(
  hash: string,
): Promise<{ ok: true } | { ok: false; code: "too_many_requests" }> {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const { count: hourCount } = await supabaseAdmin
    .from("intents")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", hash)
    .gte("created_at", hourAgo);

  // Defaults bumped 2026-05-12: prior 3/hour, 12/day was tight enough to
  // block operator testing (Riley hit the wall during normal QA after a
  // few cycles of try-fail-publish-retry across the three residents,
  // since the limit is per-IP and shared across all doors). The new
  // values still keep anonymous abuse contained while leaving room for
  // legitimate iteration. Override per environment via env vars if
  // either direction needs adjusting.
  const HOUR = Number(process.env.RATE_LIMIT_INTENT_HOUR ?? 10);
  if ((hourCount ?? 0) >= HOUR) return { ok: false, code: "too_many_requests" };

  const { count: dayCount } = await supabaseAdmin
    .from("intents")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", hash)
    .gte("created_at", dayAgo);

  const DAY = Number(process.env.RATE_LIMIT_INTENT_DAY ?? 50);
  if ((dayCount ?? 0) >= DAY) return { ok: false, code: "too_many_requests" };

  return { ok: true };
}

export async function messageRateLimit(
  hash: string,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; code: "too_many_requests" }> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: turnsInSession } = await supabaseAdmin
    .from("turns")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("role", "visitor");
  if ((turnsInSession ?? 0) >= 60) return { ok: false, code: "too_many_requests" };

  // Per-day cap by ip via session→ip lookup
  const { data: ipSessions } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("ip_hash", hash);
  const ids = (ipSessions ?? []).map((s) => s.id);
  if (ids.length > 0) {
    const { count: dayCount } = await supabaseAdmin
      .from("turns")
      .select("*", { count: "exact", head: true })
      .in("session_id", ids)
      .eq("role", "visitor")
      .gte("created_at", dayAgo);
    if ((dayCount ?? 0) >= 200) return { ok: false, code: "too_many_requests" };
  }

  return { ok: true };
}
