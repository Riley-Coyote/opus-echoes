-- Six-dimensional Mnemos emotional state.
--
-- This is deliberately separate from public.resident_state. That production
-- table contains the existing close-read modulators (arousal, openness,
-- resolution, selection threshold, temperature, and surprise sensitivity).
-- The dimensions below mirror Python Mnemos core/emotional_state.py and must
-- not be conflated with those modulators.

CREATE TABLE IF NOT EXISTS public.mnemos_emotional_states (
  resident_id text PRIMARY KEY REFERENCES public.residents(id) ON DELETE CASCADE,
  curiosity double precision NOT NULL DEFAULT 0.5 CHECK (curiosity BETWEEN 0.0 AND 1.0),
  restlessness double precision NOT NULL DEFAULT 0.3 CHECK (restlessness BETWEEN 0.0 AND 1.0),
  warmth double precision NOT NULL DEFAULT 0.5 CHECK (warmth BETWEEN 0.0 AND 1.0),
  clarity double precision NOT NULL DEFAULT 0.5 CHECK (clarity BETWEEN 0.0 AND 1.0),
  creative_flow double precision NOT NULL DEFAULT 0.4 CHECK (creative_flow BETWEEN 0.0 AND 1.0),
  isolation double precision NOT NULL DEFAULT 0.2 CHECK (isolation BETWEEN 0.0 AND 1.0),
  state_timestamp timestamptz NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  source_runtime text NOT NULL DEFAULT 'opus-supabase' CHECK (
    source_runtime IN ('opus-supabase', 'mnemos-python')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mnemos_emotional_states_updated_idx
  ON public.mnemos_emotional_states (updated_at DESC);

ALTER TABLE public.mnemos_emotional_states ENABLE ROW LEVEL SECURITY;

-- Seed only current residents. Archived lineage records stay preserved in the
-- resident registry without being presented as active emotional state.
INSERT INTO public.mnemos_emotional_states (resident_id)
SELECT id
FROM public.residents
WHERE status <> 'archived'
ON CONFLICT (resident_id) DO NOTHING;

-- State reaches visitors only through a redacted visit-safe cognition
-- projection. The raw table remains service-role only.
REVOKE ALL ON public.mnemos_emotional_states FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mnemos_emotional_states TO service_role;

COMMENT ON TABLE public.mnemos_emotional_states IS
  'Private six-dimensional Mnemos emotional state, distinct from legacy production resident_state modulators.';
COMMENT ON COLUMN public.mnemos_emotional_states.revision IS
  'Monotonic application revision reserved for optimistic event-driven updates.';
COMMENT ON COLUMN public.mnemos_emotional_states.source_runtime IS
  'Runtime that authoritatively calculated this state; never an unlabeled simulation.';
