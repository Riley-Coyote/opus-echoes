export function hasSupabaseAdminEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isLocalDev(): boolean {
  return process.env.NODE_ENV !== "production";
}
