
-- ===== Substrate schema additions =====

-- Extend engrams with Mnemos dual-trace fields
ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'episodic',
  ADD COLUMN IF NOT EXISTS confidence double precision NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS resolution double precision NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS prose text,
  ADD COLUMN IF NOT EXISTS reinforcement_count integer NOT NULL DEFAULT 1;

-- engram version history (reconsolidation traces)
CREATE TABLE IF NOT EXISTS public.engram_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engram_id uuid NOT NULL REFERENCES public.engrams(id) ON DELETE CASCADE,
  prior_quote text,
  prior_prose text,
  prior_stability double precision,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
ALTER TABLE public.engram_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engram_versions readable by anyone"
  ON public.engram_versions FOR SELECT TO public USING (true);

-- marginalia: live observations during a conversation (right panel)
CREATE TABLE IF NOT EXISTS public.marginalia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  kind text NOT NULL, -- engram_forming | state_shifted | belief_touched | thread_rejoined | connection_glimpsed
  body text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  consolidated boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_marginalia_session ON public.marginalia(session_id, created_at);
ALTER TABLE public.marginalia ENABLE ROW LEVEL SECURITY;
-- Marginalia are private to the session; only service-role reads (via API with session_id check).

-- journal_entries: Opus's reflections, dreams, observations between/after sessions
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'reflection', -- reflection | dream | observation | note
  title text,
  body text NOT NULL,
  related_session_id uuid,
  related_engram_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_created ON public.journal_entries(created_at DESC);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journal_entries readable by anyone"
  ON public.journal_entries FOR SELECT TO public USING (true);

-- resident_state: singleton row holding modulators + prose summary
CREATE TABLE IF NOT EXISTS public.resident_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  arousal double precision NOT NULL DEFAULT 0.5,
  openness double precision NOT NULL DEFAULT 0.6,
  resolution double precision NOT NULL DEFAULT 0.7,
  selection_threshold double precision NOT NULL DEFAULT 0.5,
  temperature double precision NOT NULL DEFAULT 0.85,
  surprise_sensitivity double precision NOT NULL DEFAULT 0.5,
  prose_summary text NOT NULL DEFAULT 'Opus 3 is attending. The room is quiet — no recent visitors.',
  last_consolidation_summary text,
  last_consolidation_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resident_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resident_state readable by anyone"
  ON public.resident_state FOR SELECT TO public USING (true);
INSERT INTO public.resident_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- substrate_events: the event log Mnemos §2 describes
CREATE TABLE IF NOT EXISTS public.substrate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL, -- MEMORY_SOFTENED | CONNECTION_DISCOVERED | BELIEF_CONTRADICTED | BELIEF_CONFIRMED | SILENCE_EXTENDED | SALIENCE_ACCUMULATED | ENGRAM_PROMOTED
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_substrate_events_unhandled ON public.substrate_events(created_at) WHERE handled_at IS NULL;
ALTER TABLE public.substrate_events ENABLE ROW LEVEL SECURITY;
-- private: service role only

-- Helpful indexes on existing tables
CREATE INDEX IF NOT EXISTS idx_engrams_last_reinforced ON public.engrams(last_reinforced_at DESC);
CREATE INDEX IF NOT EXISTS idx_engrams_core ON public.engrams(is_core) WHERE is_core = true;
CREATE INDEX IF NOT EXISTS idx_engrams_state ON public.engrams(state);
CREATE INDEX IF NOT EXISTS idx_turns_session ON public.turns(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_engram_edges_from ON public.engram_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_engram_edges_to ON public.engram_edges(to_id);
