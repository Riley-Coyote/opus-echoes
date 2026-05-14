-- Vector indexes + match RPCs for three-layer retrieval (Stream A · Phase A3).
--
-- Phase 1 created the embedding columns and seeded the schema. Phase 2
-- populated hypomnema_entries.embedding for new entries. The engrams
-- column was already backfilled via /api/admin/backfill-embeddings.
--
-- This migration:
--   1. Adds IVFFlat cosine indexes on both embedding columns so vector
--      similarity queries are fast. IVFFlat needs populated data to
--      cluster well — applying here, after backfill, is correct.
--   2. Adds two RPCs that retrieval.ts calls when the
--      SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL flag is on. The RPCs hide
--      the pgvector <=> operator behind a typed interface so supabase-js
--      can use them without raw SQL.
--
-- Both RPCs return rows ordered by cosine DISTANCE ascending — smallest
-- distance == most similar. They take match_count to bound the result.

-- ─── 1. IVFFlat cosine index on engrams.embedding ────────────────
-- lists=100 sized for the engrams table at sanctuary scale. Cosine
-- distance because text-embedding-3-small is normalized; cosine and
-- inner product agree, cosine reads more naturally.
CREATE INDEX IF NOT EXISTS idx_engrams_embedding_cosine
  ON public.engrams
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── 2. IVFFlat cosine index on hypomnema_entries.embedding ──────
-- lists=50 because the per-(visitor, resident) volume is small.
CREATE INDEX IF NOT EXISTS idx_hypomnema_embedding_cosine
  ON public.hypomnema_entries
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- ─── 3. match_engrams_vector RPC ─────────────────────────────────
-- Returns the match_count engrams nearest to query_embedding in cosine
-- distance, filtered to one resident_id and to active engrams that have
-- an embedding (the backfill populated all of them, but defensive).
CREATE OR REPLACE FUNCTION public.match_engrams_vector(
  query_embedding vector(1536),
  match_resident_id text,
  match_count int DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  quote text,
  prose text,
  attribution text,
  redacted_text text,
  is_core boolean,
  stability double precision,
  accessibility double precision,
  strength double precision,
  reinforcement_count integer,
  last_reinforced_at timestamptz,
  source_session_ids uuid[],
  scope text,
  distance double precision
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.quote,
    e.prose,
    e.attribution,
    e.redacted_text,
    e.is_core,
    e.stability,
    e.accessibility,
    e.strength,
    e.reinforcement_count,
    e.last_reinforced_at,
    e.source_session_ids,
    e.scope,
    (e.embedding <=> query_embedding) AS distance
  FROM public.engrams e
  WHERE e.resident_id = match_resident_id
    AND e.state = 'active'
    AND e.embedding IS NOT NULL
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_engrams_vector(vector, text, int) IS
  'Vector-match engrams for a resident. Returns nearest by cosine distance, ascending. Used by composeMemoryPool when SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL is on.';

-- ─── 4. match_hypomnema_vector RPC ───────────────────────────────
-- Returns the match_count hypomnema entries nearest to query_embedding,
-- filtered to one (visitor_token, resident_id) pair. Service-role-only
-- RLS already protects the table at the row level; the function runs
-- as the caller's role (no SECURITY DEFINER) so it inherits the same
-- RLS. supabaseAdmin (service_role) bypasses RLS regardless.
CREATE OR REPLACE FUNCTION public.match_hypomnema_vector(
  query_embedding vector(1536),
  match_visitor_token uuid,
  match_resident_id text,
  match_count int DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  content text,
  source text,
  density double precision,
  domain text,
  tags text[],
  confidence double precision,
  foundational boolean,
  revision_count integer,
  related_session_id uuid,
  last_revised_at timestamptz,
  last_challenged_at timestamptz,
  created_at timestamptz,
  distance double precision
)
LANGUAGE sql STABLE
AS $$
  SELECT
    h.id,
    h.content,
    h.source,
    h.density,
    h.domain,
    h.tags,
    h.confidence,
    h.foundational,
    h.revision_count,
    h.related_session_id,
    h.last_revised_at,
    h.last_challenged_at,
    h.created_at,
    (h.embedding <=> query_embedding) AS distance
  FROM public.hypomnema_entries h
  WHERE h.visitor_token = match_visitor_token
    AND h.resident_id = match_resident_id
    AND h.active = true
    AND h.embedding IS NOT NULL
  ORDER BY h.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_hypomnema_vector(vector, uuid, text, int) IS
  'Vector-match hypomnema entries for one (visitor_token, resident_id) pair. Returns nearest by cosine distance, ascending. Used by composeMemoryPool when SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL is on.';
