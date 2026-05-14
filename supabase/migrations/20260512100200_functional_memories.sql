-- ============================================================
-- functional_memories — per-session working memory
-- (Stream A · Phase A1)
--
-- The shallowest layer of the multilayer architecture. Holds
-- things the resident needs to keep track of for the duration
-- of *this* session — names, current topic, what the visitor
-- said two turns ago, what a clarification resolved.
--
-- Distinct from hypomnema (persistent, per-visitor-per-resident)
-- and engrams (shared, per-resident). Functional memories die
-- with the session. They are NOT promoted: the relevant content
-- from a session is consolidated into hypomnema at session
-- close via the existing consolidation pipeline (extended for
-- hypomnema synthesis in phase A2).
--
-- Service-role-only RLS. Visitors never read this table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.functional_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- scope
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  resident_id text NOT NULL REFERENCES public.residents(id),

  -- content
  content text NOT NULL,
  memory_type text NOT NULL DEFAULT 'working'
    CHECK (memory_type IN ('working', 'topic', 'name', 'clarification', 'fact', 'commitment')),
  emotional_valence double precision
    CHECK (emotional_valence IS NULL OR (emotional_valence >= -1.0 AND emotional_valence <= 1.0)),

  -- lifecycle flags
  needs_confirmation boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,

  -- timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.functional_memories IS
  'per-session working memory. Ephemeral. Service-role only.';

-- Hot path: load this session's live working memory, newest first,
-- skipping deletes. The partial index keeps the read scan tight.
CREATE INDEX IF NOT EXISTS idx_functional_memories_session_created
  ON public.functional_memories (session_id, created_at DESC)
  WHERE is_deleted = false;

-- Service-role-only RLS.
ALTER TABLE public.functional_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "functional_memories service role only"
  ON public.functional_memories FOR ALL TO public USING (false);
