-- ============================================================
-- Visitor-initiated conversation sharing
--
-- Distinct from public.published_conversations, which is populated
-- by Opus's own publication decision via the PUBLICATION_SYSTEM
-- prompt during consolidation. This new table is for visitor-
-- initiated sharing: a visitor who's just had a conversation can
-- generate a /share/<token> URL to send to someone else.
--
-- Visibility model: link-only. Anyone with the URL can read.
-- Not listed in any feed, not searchable, not promoted to /archive.
-- The visitor owns the share and can revoke it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.visitor_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 12-char URL-safe random token. Generated app-side via
  -- crypto.randomBytes(9).toString('base64url'). Indexed for lookup.
  token text NOT NULL UNIQUE,
  -- The conversation being shared.
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  -- Which resident the conversation was with. Denormalized from
  -- the session for easier filtering / display without a join.
  resident_id text NOT NULL REFERENCES public.residents(id),
  -- Optional caption written by the visitor at share time. Renders
  -- on the share page as a small italic note ("Why I'm sharing this").
  visitor_note text,
  -- IP hash at share time so the visitor can manage / revoke their
  -- own share when they return. Cross-IP recovery is out of scope
  -- for v1; if a visitor changes networks they cannot revoke.
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Set when the visitor revokes; the share is then invisible.
  revoked_at timestamptz,
  -- Counters for the share page (how many times it's been viewed).
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_visitor_shares_token
  ON public.visitor_shares (token);

CREATE INDEX IF NOT EXISTS idx_visitor_shares_session
  ON public.visitor_shares (session_id);

CREATE INDEX IF NOT EXISTS idx_visitor_shares_ip_hash
  ON public.visitor_shares (ip_hash, created_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_shares_resident_created
  ON public.visitor_shares (resident_id, created_at DESC)
  WHERE revoked_at IS NULL;

-- RLS — public can read non-revoked shares; writes are service-role only.
ALTER TABLE public.visitor_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visitor_shares readable by anyone (when not revoked)"
  ON public.visitor_shares FOR SELECT TO public
  USING (revoked_at IS NULL);

-- ============================================================
-- Done. The application code can now:
--   - INSERT new shares with a generated token (service role)
--   - SELECT a share by token (anonymous users — RLS allows reads
--     of non-revoked rows only)
--   - UPDATE revoked_at on a share owned by an IP (service role,
--     after verifying ip_hash matches)
--   - INCREMENT view_count + last_viewed_at on read (debounced
--     server-side per IP to avoid inflation)
-- ============================================================
