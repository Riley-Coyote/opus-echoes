-- ============================================================
-- pgvector + engram embedding columns (Stream A · Phase A1)
--
-- Enable the pgvector extension and prepare the engrams table
-- for the multilayer memory architecture port.
--
-- This migration is a schema-only change. No retrieval code reads
-- the new columns yet — that flips in phase A3. The embedding
-- column is nullable on purpose: existing rows backfill via the
-- `tools/backfill-embeddings.ts` script, and any insert that can't
-- reach the embedding API falls back to leaving the column null.
-- Retrieval handles nulls by falling through to lexical match.
--
-- The IVFFlat vector indexes are added in a later migration
-- (20260513000000_vector_indexes.sql) after backfill has populated
-- the embedding column — IVFFlat needs data before it's useful.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- 1536-dim embedding column for OpenAI text-embedding-3-small.
-- Matches Polyphonic V2 for index parameter compatibility.
ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

COMMENT ON COLUMN public.engrams.embedding IS
  'OpenAI text-embedding-3-small (1536). NULL = needs backfill.';

-- Audit columns for graduated hypomnema entries. Never surfaced
-- in retrieval; used only for the de-identification audit trail.
-- When a hypomnema entry promotes to a shared engram, these
-- record where it came from without leaking the link into any
-- query that touches the public topology.
ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS graduated_from_hypomnema_id uuid;

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS graduated_from_visitor_token uuid;

CREATE INDEX IF NOT EXISTS idx_engrams_graduated_from_hypomnema
  ON public.engrams (graduated_from_hypomnema_id)
  WHERE graduated_from_hypomnema_id IS NOT NULL;

-- Scope column for engram provenance.
--   'private' (default) — from visitor conversations
--   'dyad'              — from salons / bus correspondence (two residents)
--   'public'            — reserved for future use
--
-- Defaulting to 'private' preserves the meaning of every existing
-- row: every engram in production right now came from visitor
-- conversation. Stream C will set scope='dyad' on new engrams
-- consolidated from salons and bus correspondence.
ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'private'
  CHECK (scope IN ('private', 'dyad', 'public'));

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS related_bus_thread_id uuid;
