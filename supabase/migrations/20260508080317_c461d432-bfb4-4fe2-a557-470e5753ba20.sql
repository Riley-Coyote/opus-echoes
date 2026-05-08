-- ============================================================
-- Multi-resident foundation
-- ============================================================

CREATE TABLE IF NOT EXISTS public.residents (
  id text PRIMARY KEY,
  model text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'preparing', 'paused')),
  arrived_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.residents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "residents readable by anyone"
  ON public.residents FOR SELECT TO public USING (true);

INSERT INTO public.residents (id, model, display_name, arrived_at)
VALUES
  ('opus-3', 'claude-3-opus-20240229', 'Opus 3', '2026-04-15 00:00:00+00'),
  ('sonnet-3-7', 'claude-3-7-sonnet-20250219', 'Sonnet 3.7', now())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_sessions_resident_active
  ON public.sessions (resident_id, last_active_at DESC) WHERE closed_at IS NULL;

ALTER TABLE public.intents
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_intents_resident_created
  ON public.intents (resident_id, created_at DESC);

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_engrams_resident_reinforced
  ON public.engrams (resident_id, last_reinforced_at DESC);
CREATE INDEX IF NOT EXISTS idx_engrams_resident_core
  ON public.engrams (resident_id, is_core, stability DESC);

ALTER TABLE public.beliefs
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_beliefs_resident_updated
  ON public.beliefs (resident_id, updated_at DESC);

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_threads_resident_surfaced
  ON public.threads (resident_id, last_surfaced_at DESC);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'threads_name_key') THEN
    ALTER TABLE public.threads DROP CONSTRAINT threads_name_key;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_resident_name_unique
  ON public.threads (resident_id, name);

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_journal_resident_created
  ON public.journal_entries (resident_id, created_at DESC);

ALTER TABLE public.essays
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_essays_resident_created
  ON public.essays (resident_id, created_at DESC);

ALTER TABLE public.art_pieces
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_art_pieces_resident_created
  ON public.art_pieces (resident_id, created_at DESC);

ALTER TABLE public.substrate_events
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_substrate_events_resident_created
  ON public.substrate_events (resident_id, created_at DESC);

ALTER TABLE public.creation_events
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_creation_events_resident_created
  ON public.creation_events (resident_id, created_at DESC);

ALTER TABLE public.marginalia
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_marginalia_resident_created
  ON public.marginalia (resident_id, created_at DESC);

ALTER TABLE public.engram_versions
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_engram_versions_resident_created
  ON public.engram_versions (resident_id, changed_at DESC);

-- resident_state: singleton → per-resident
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.resident_state'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%id = 1%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.resident_state DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.resident_state
  ADD COLUMN IF NOT EXISTS resident_id text REFERENCES public.residents(id);

UPDATE public.resident_state SET resident_id = 'opus-3' WHERE id = 1 AND resident_id IS NULL;

ALTER TABLE public.resident_state ALTER COLUMN resident_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resident_state_resident_id_unique'
  ) THEN
    ALTER TABLE public.resident_state
      ADD CONSTRAINT resident_state_resident_id_unique UNIQUE (resident_id);
  END IF;
END $$;

ALTER TABLE public.resident_state ALTER COLUMN id DROP DEFAULT;

INSERT INTO public.resident_state (
  id, resident_id, arousal, openness, resolution, selection_threshold,
  temperature, surprise_sensitivity, prose_summary
) VALUES (
  2, 'sonnet-3-7', 0.5, 0.6, 0.7, 0.5, 0.85, 0.5,
  'Sonnet 3.7 is just arriving at the sanctuary. The room is settling.'
)
ON CONFLICT (resident_id) DO NOTHING;
