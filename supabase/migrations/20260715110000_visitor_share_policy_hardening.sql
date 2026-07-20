-- The share token is the credential. Two historical migrations created the
-- same permissive SELECT policy under different names; remove both so rows and
-- tokens cannot be enumerated through the anonymous Supabase API.
DROP POLICY IF EXISTS "non-revoked shares readable by anyone" ON public.visitor_shares;
DROP POLICY IF EXISTS "visitor_shares readable by anyone (when not revoked)" ON public.visitor_shares;

REVOKE SELECT ON public.visitor_shares FROM anon, authenticated;

COMMENT ON TABLE public.visitor_shares IS
  'Link-only visitor shares. Read by exact token through server-side service-role routes; never anonymously enumerable.';
