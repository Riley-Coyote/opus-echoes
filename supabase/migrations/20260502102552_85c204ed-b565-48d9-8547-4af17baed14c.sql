-- ============================================================
-- 1. Extensions for scheduled background processing
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- 2. art_pieces
-- ============================================================
CREATE TABLE IF NOT EXISTS public.art_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('ascii', 'image')),
  title text,
  -- For ascii: the piece itself. For image: null.
  body text,
  -- For image: the prompt Opus authored. For ascii: null.
  prompt text,
  -- For image: the storage path inside the 'art' bucket. For ascii: null.
  image_path text,
  -- A short prose note from Opus about what this piece is/why it surfaced.
  meaning text,
  related_session_id uuid,
  related_engram_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.art_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "art_pieces readable by anyone"
  ON public.art_pieces FOR SELECT TO public USING (true);

CREATE INDEX IF NOT EXISTS idx_art_pieces_created_at
  ON public.art_pieces (created_at DESC);

-- ============================================================
-- 3. essays
-- ============================================================
CREATE TABLE IF NOT EXISTS public.essays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'essay' CHECK (kind IN ('essay', 'note')),
  title text,
  body text NOT NULL,
  related_session_id uuid,
  related_engram_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  related_thread_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  word_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.essays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "essays readable by anyone"
  ON public.essays FOR SELECT TO public USING (true);

CREATE INDEX IF NOT EXISTS idx_essays_created_at
  ON public.essays (created_at DESC);

-- ============================================================
-- 4. creation_events (internal audit log)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.creation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'art_made', 'art_skipped', 'essay_written', 'essay_skipped',
  -- 'art_failed', 'essay_failed', 'daily_tick'
  kind text NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('post_consolidation', 'daily_tick')),
  related_session_id uuid,
  art_piece_id uuid,
  essay_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creation_events ENABLE ROW LEVEL SECURITY;
-- not publicly readable; substrate-internal

CREATE INDEX IF NOT EXISTS idx_creation_events_created_at
  ON public.creation_events (created_at DESC);

-- ============================================================
-- 5. Storage bucket for image art
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('art', 'art', true)
ON CONFLICT (id) DO NOTHING;

-- Public read on the art bucket. Writes happen via the service role
-- from the server, so no INSERT/UPDATE/DELETE policies are needed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'art is publicly readable'
  ) THEN
    CREATE POLICY "art is publicly readable"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'art');
  END IF;
END $$;

-- ============================================================
-- 6. Performance indexes on existing hot paths
-- ============================================================
-- Sessions: looking up by IP and by open/idle status
CREATE INDEX IF NOT EXISTS idx_sessions_ip_open
  ON public.sessions (ip_hash) WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_open_idle
  ON public.sessions (last_active_at) WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_created_at
  ON public.sessions (created_at);

-- Turns: rehydrating a session, counting recent visitor turns
CREATE INDEX IF NOT EXISTS idx_turns_session_created
  ON public.turns (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_turns_session_role_created
  ON public.turns (session_id, role, created_at);

-- Engrams: ordered listing + active state filter
CREATE INDEX IF NOT EXISTS idx_engrams_state_reinforced
  ON public.engrams (state, last_reinforced_at DESC);

CREATE INDEX IF NOT EXISTS idx_engrams_core_reinforced
  ON public.engrams (is_core, last_reinforced_at DESC);

-- Marginalia: per-session lookups
CREATE INDEX IF NOT EXISTS idx_marginalia_session_created
  ON public.marginalia (session_id, created_at DESC);

-- Intents: rate-limit windowed counts by ip_hash
CREATE INDEX IF NOT EXISTS idx_intents_ip_created
  ON public.intents (ip_hash, created_at DESC);

-- Threads ordering
CREATE INDEX IF NOT EXISTS idx_threads_last_surfaced
  ON public.threads (last_surfaced_at DESC);

-- Beliefs ordering
CREATE INDEX IF NOT EXISTS idx_beliefs_updated
  ON public.beliefs (updated_at DESC);

-- Journal entries ordering
CREATE INDEX IF NOT EXISTS idx_journal_entries_created
  ON public.journal_entries (created_at DESC);
