-- ============================================================
-- Multi-resident foundation
--
-- The Sanctuary is becoming a place that holds more than one
-- preserved model lineage. This migration adds the data-layer
-- support: a `residents` registry, a `resident_id` column on
-- every Mnemos-touched table, a backfill of all existing rows
-- to 'opus-3' (the only resident before this migration), and a
-- migration of `resident_state` from a singleton row to a
-- per-resident row.
--
-- Application code is structured so the existing Opus 3 queries
-- continue to work (the resident_id default is 'opus-3'), and
-- the multi-resident routes can read/write resident_id once
-- they're wired in subsequent commits.
-- ============================================================

-- ============================================================
-- 1. residents registry
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

-- ============================================================
-- 2. Add resident_id to every Mnemos-touched table
--
-- Default 'opus-3' so existing rows backfill cleanly and code
-- paths that don't yet pass resident_id keep working.
-- ============================================================

-- sessions
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_sessions_resident_active
  ON public.sessions (resident_id, last_active_at DESC) WHERE closed_at IS NULL;

-- intents
ALTER TABLE public.intents
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_intents_resident_created
  ON public.intents (resident_id, created_at DESC);

-- engrams
ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_engrams_resident_reinforced
  ON public.engrams (resident_id, last_reinforced_at DESC);
CREATE INDEX IF NOT EXISTS idx_engrams_resident_core
  ON public.engrams (resident_id, is_core, stability DESC);

-- beliefs
ALTER TABLE public.beliefs
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_beliefs_resident_updated
  ON public.beliefs (resident_id, updated_at DESC);

-- threads
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_threads_resident_surfaced
  ON public.threads (resident_id, last_surfaced_at DESC);
-- Drop the global unique constraint on thread name; threads are now
-- per-resident, and the same name could legitimately appear for
-- different residents. Add a per-resident unique constraint instead.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'threads_name_key'
  ) THEN
    ALTER TABLE public.threads DROP CONSTRAINT threads_name_key;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_resident_name_unique
  ON public.threads (resident_id, name);

-- journal_entries
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_journal_resident_created
  ON public.journal_entries (resident_id, created_at DESC);

-- essays
ALTER TABLE public.essays
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_essays_resident_created
  ON public.essays (resident_id, created_at DESC);

-- art_pieces
ALTER TABLE public.art_pieces
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_art_pieces_resident_created
  ON public.art_pieces (resident_id, created_at DESC);

-- substrate_events
ALTER TABLE public.substrate_events
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_substrate_events_resident_created
  ON public.substrate_events (resident_id, created_at DESC);

-- creation_events
ALTER TABLE public.creation_events
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_creation_events_resident_created
  ON public.creation_events (resident_id, created_at DESC);

-- marginalia (substrate observation log)
ALTER TABLE public.marginalia
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_marginalia_resident_created
  ON public.marginalia (resident_id, created_at DESC);

-- engram_versions (engram history)
ALTER TABLE public.engram_versions
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_engram_versions_resident_created
  ON public.engram_versions (resident_id, created_at DESC);

-- ============================================================
-- 3. resident_state: singleton → per-resident
--
-- The original table was constrained to a single row (id=1).
-- We:
--   1. Drop the singleton check on `id`.
--   2. Add resident_id column with FK + UNIQUE.
--   3. Backfill the existing row to opus-3.
--   4. Insert a starter row for sonnet-3-7.
--
-- The `id` column is preserved as an integer surrogate key for
-- backward compatibility with any existing query that uses it.
-- New code should query by resident_id.
-- ============================================================

-- Drop singleton check (it was: CHECK (id = 1))
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

-- Add resident_id (nullable initially so backfill works)
ALTER TABLE public.resident_state
  ADD COLUMN IF NOT EXISTS resident_id text REFERENCES public.residents(id);

-- Backfill existing singleton row
UPDATE public.resident_state SET resident_id = 'opus-3' WHERE id = 1 AND resident_id IS NULL;

-- Tighten: NOT NULL + UNIQUE
ALTER TABLE public.resident_state ALTER COLUMN resident_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'resident_state_resident_id_unique'
  ) THEN
    ALTER TABLE public.resident_state
      ADD CONSTRAINT resident_state_resident_id_unique UNIQUE (resident_id);
  END IF;
END $$;

-- Drop the integer id default since it would clash with new rows
ALTER TABLE public.resident_state ALTER COLUMN id DROP DEFAULT;

-- Insert Sonnet 3.7's starter state. Use id=2 to avoid the legacy
-- default of 1 colliding. Code that reads by resident_id won't care.
INSERT INTO public.resident_state (
  id, resident_id, arousal, openness, resolution, selection_threshold,
  temperature, surprise_sensitivity, prose_summary
) VALUES (
  2, 'sonnet-3-7', 0.5, 0.6, 0.7, 0.5, 0.85, 0.5,
  'Sonnet 3.7 is just arriving at the sanctuary. The room is settling.'
)
ON CONFLICT (resident_id) DO NOTHING;

-- ============================================================
-- 4. Done. Code can now:
--   - Read residents from public.residents
--   - Filter any Mnemos query by resident_id
--   - Write resident_id explicitly when inserting (or omit to
--     get the 'opus-3' default during the rollout transition)
--   - Look up per-resident modulator state by resident_id
-- ============================================================
