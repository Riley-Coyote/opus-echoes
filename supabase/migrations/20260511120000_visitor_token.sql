-- ============================================================
-- Per-visitor recognition via localStorage token
--
-- Visitors get a random UUID in localStorage on first visit.
-- It persists across browser sessions (unlike sessionStorage).
-- The resident can recognize returning visitors through the
-- traces their prior visits left in the topology.
--
-- No accounts, no login, no fingerprinting. Clearing localStorage
-- or using incognito = fresh start. The visitor controls this.
-- ============================================================

-- Add visitor_token to sessions
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS visitor_token uuid;

-- Index for fast history lookups: "all sessions from this visitor with this resident"
CREATE INDEX IF NOT EXISTS idx_sessions_visitor_token
  ON public.sessions (visitor_token, resident_id, created_at DESC)
  WHERE visitor_token IS NOT NULL;
