ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS visitor_token uuid;

CREATE INDEX IF NOT EXISTS idx_sessions_visitor_token
  ON public.sessions (visitor_token, resident_id, created_at DESC)
  WHERE visitor_token IS NOT NULL;