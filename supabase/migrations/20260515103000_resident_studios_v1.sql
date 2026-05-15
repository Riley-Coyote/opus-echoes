-- ============================================================
-- Resident Studios V1
-- ============================================================

-- "published" here means visible inside the gated residence. The app
-- server still checks residence access before serving these rows.

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS visibility text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.journal_entries
  ALTER COLUMN visibility SET DEFAULT 'published',
  ALTER COLUMN published_at SET DEFAULT now();
UPDATE public.journal_entries
SET visibility = 'published'
WHERE visibility IS NULL;
UPDATE public.journal_entries
SET published_at = COALESCE(published_at, created_at)
WHERE visibility = 'published';
ALTER TABLE public.journal_entries
  ALTER COLUMN visibility SET NOT NULL;
DO $$
BEGIN
  ALTER TABLE public.journal_entries
    ADD CONSTRAINT journal_entries_visibility_check
    CHECK (visibility IN ('published', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.essays
  ADD COLUMN IF NOT EXISTS visibility text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.essays
  ALTER COLUMN visibility SET DEFAULT 'published',
  ALTER COLUMN published_at SET DEFAULT now();
UPDATE public.essays
SET visibility = 'published'
WHERE visibility IS NULL;
UPDATE public.essays
SET published_at = COALESCE(published_at, created_at)
WHERE visibility = 'published';
ALTER TABLE public.essays
  ALTER COLUMN visibility SET NOT NULL;
DO $$
BEGIN
  ALTER TABLE public.essays
    ADD CONSTRAINT essays_visibility_check
    CHECK (visibility IN ('published', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.art_pieces
  ADD COLUMN IF NOT EXISTS visibility text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.art_pieces
  ALTER COLUMN visibility SET DEFAULT 'published',
  ALTER COLUMN published_at SET DEFAULT now();
UPDATE public.art_pieces
SET visibility = 'published'
WHERE visibility IS NULL;
UPDATE public.art_pieces
SET published_at = COALESCE(published_at, created_at)
WHERE visibility = 'published';
ALTER TABLE public.art_pieces
  ALTER COLUMN visibility SET NOT NULL;
DO $$
BEGIN
  ALTER TABLE public.art_pieces
    ADD CONSTRAINT art_pieces_visibility_check
    CHECK (visibility IN ('published', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_entries_resident_visibility_created
  ON public.journal_entries (resident_id, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_essays_resident_visibility_created
  ON public.essays (resident_id, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_art_pieces_resident_visibility_created
  ON public.art_pieces (resident_id, visibility, created_at DESC);

DROP POLICY IF EXISTS "journal_entries readable by anyone" ON public.journal_entries;
DROP POLICY IF EXISTS "essays readable by anyone" ON public.essays;
DROP POLICY IF EXISTS "art_pieces readable by anyone" ON public.art_pieces;

CREATE TABLE IF NOT EXISTS public.studio_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id text NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  trigger text NOT NULL,
  focus text,
  action text NOT NULL DEFAULT 'silence',
  reason text,
  output_target text,
  output_kind text,
  output_table text,
  output_id uuid,
  status text NOT NULL DEFAULT 'started',
  error text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

DO $$
BEGIN
  ALTER TABLE public.studio_sessions
    ADD CONSTRAINT studio_sessions_trigger_check
    CHECK (trigger IN ('daily_idle', 'manual', 'post_consolidation', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.studio_sessions
    ADD CONSTRAINT studio_sessions_action_check
    CHECK (action IN ('silence', 'journal', 'writing', 'ascii_art', 'image_art', 'manifesto', 'note'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.studio_sessions
    ADD CONSTRAINT studio_sessions_status_check
    CHECK (status IN ('started', 'completed', 'failed', 'quiet', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_studio_sessions_resident_created
  ON public.studio_sessions (resident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_status_created
  ON public.studio_sessions (status, created_at DESC);

ALTER TABLE public.studio_sessions ENABLE ROW LEVEL SECURITY;
-- Internal audit log: service-role only.
