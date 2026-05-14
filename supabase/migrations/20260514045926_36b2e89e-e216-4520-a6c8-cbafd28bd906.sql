ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'experiment'
    CHECK (mode IN ('experiment', 'classic'));

CREATE INDEX IF NOT EXISTS idx_sessions_mode_visitor_resident_open
  ON public.sessions (visitor_token, resident_id, mode)
  WHERE closed_at IS NULL;