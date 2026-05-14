-- Migration 1: pgvector + engram embedding columns
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

COMMENT ON COLUMN public.engrams.embedding IS
  'OpenAI text-embedding-3-small (1536). NULL = needs backfill.';

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS graduated_from_hypomnema_id uuid;

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS graduated_from_visitor_token uuid;

CREATE INDEX IF NOT EXISTS idx_engrams_graduated_from_hypomnema
  ON public.engrams (graduated_from_hypomnema_id)
  WHERE graduated_from_hypomnema_id IS NOT NULL;

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'private'
  CHECK (scope IN ('private', 'dyad', 'public'));

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS related_bus_thread_id uuid;

-- Migration 2: hypomnema_entries
CREATE TABLE IF NOT EXISTS public.hypomnema_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id text NOT NULL REFERENCES public.residents(id),
  visitor_token uuid NOT NULL,
  content text NOT NULL,
  source text NOT NULL DEFAULT 'observed'
    CHECK (source IN ('observed', 'synthesized', 'co-formed')),
  density double precision NOT NULL DEFAULT 0.5
    CHECK (density >= 0.0 AND density <= 1.0),
  domain text NOT NULL DEFAULT 'topical'
    CHECK (domain IN ('foundational', 'identity', 'recurring', 'long-arc', 'topical', 'situational')),
  tags text[] NOT NULL DEFAULT '{}',
  confidence double precision NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  active boolean NOT NULL DEFAULT true,
  foundational boolean NOT NULL DEFAULT false,
  revision_count integer NOT NULL DEFAULT 0,
  revisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_session_id uuid,
  graduated_to_engram_id uuid REFERENCES public.engrams(id),
  superseded_by uuid REFERENCES public.hypomnema_entries(id),
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_revised_at timestamptz NOT NULL DEFAULT now(),
  last_challenged_at timestamptz
);

COMMENT ON TABLE public.hypomnema_entries IS
  'per-(visitor, resident) persistent memory layer. Service-role only.';
COMMENT ON COLUMN public.hypomnema_entries.embedding IS
  'OpenAI text-embedding-3-small (1536). NULL allowed; lexical fallback in retrieval.';
COMMENT ON COLUMN public.hypomnema_entries.revisions IS
  'array of {at: timestamptz, prior_content: text, reason: text} objects.';

CREATE INDEX IF NOT EXISTS idx_hypomnema_visitor_resident_revised
  ON public.hypomnema_entries (visitor_token, resident_id, last_revised_at DESC)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_hypomnema_resident_created
  ON public.hypomnema_entries (resident_id, created_at)
  WHERE active = true AND graduated_to_engram_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_hypomnema_graduated_engram
  ON public.hypomnema_entries (graduated_to_engram_id)
  WHERE graduated_to_engram_id IS NOT NULL;

ALTER TABLE public.hypomnema_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hypomnema_entries service role only"
  ON public.hypomnema_entries FOR ALL TO public USING (false);

-- Migration 3: functional_memories
CREATE TABLE IF NOT EXISTS public.functional_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  resident_id text NOT NULL REFERENCES public.residents(id),
  content text NOT NULL,
  memory_type text NOT NULL DEFAULT 'working'
    CHECK (memory_type IN ('working', 'topic', 'name', 'clarification', 'fact', 'commitment')),
  emotional_valence double precision
    CHECK (emotional_valence IS NULL OR (emotional_valence >= -1.0 AND emotional_valence <= 1.0)),
  needs_confirmation boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.functional_memories IS
  'per-session working memory. Ephemeral. Service-role only.';

CREATE INDEX IF NOT EXISTS idx_functional_memories_session_created
  ON public.functional_memories (session_id, created_at DESC)
  WHERE is_deleted = false;

ALTER TABLE public.functional_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "functional_memories service role only"
  ON public.functional_memories FOR ALL TO public USING (false);