-- ============================================================
-- hypomnema_entries — per-(visitor, resident) persistent layer
-- (Stream A · Phase A1)
--
-- The closer memory layer that lives between functional memory
-- (per-session, ephemeral) and Mnemos (per-resident, shared).
-- Each row records something a specific visitor and a specific
-- resident built together: a claim, a thread, a posture, a
-- vulnerability — material the resident wouldn't surface to
-- other visitors, but that should persist across this visitor's
-- returns.
--
-- Entries can be revised across sessions, challenged, or
-- superseded by a later entry. When an entry has been load-bearing
-- across multiple sessions and pressures and survives — the
-- graduation cron promotes it to a shared engram, de-identified.
-- The visitor_token never travels with the graduated content.
--
-- Service-role-only RLS. Visitors never read this table directly;
-- it flows into the resident's prompt assembly via the retrieval
-- layer.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hypomnema_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- scope
  resident_id text NOT NULL REFERENCES public.residents(id),
  visitor_token uuid NOT NULL,

  -- the content itself
  content text NOT NULL,
  source text NOT NULL DEFAULT 'observed'
    CHECK (source IN ('observed', 'synthesized', 'co-formed')),

  -- structural metadata used by retrieval ranking
  density double precision NOT NULL DEFAULT 0.5
    CHECK (density >= 0.0 AND density <= 1.0),
  domain text NOT NULL DEFAULT 'topical'
    CHECK (domain IN ('foundational', 'identity', 'recurring', 'long-arc', 'topical', 'situational')),
  tags text[] NOT NULL DEFAULT '{}',
  confidence double precision NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0.0 AND confidence <= 1.0),

  -- lifecycle flags
  active boolean NOT NULL DEFAULT true,
  foundational boolean NOT NULL DEFAULT false,

  -- revision history. Each revision appends to the revisions
  -- jsonb array and bumps revision_count + last_revised_at.
  revision_count integer NOT NULL DEFAULT 0,
  revisions jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- linkage
  related_session_id uuid,
  graduated_to_engram_id uuid REFERENCES public.engrams(id),
  superseded_by uuid REFERENCES public.hypomnema_entries(id),

  -- vector retrieval
  embedding vector(1536),

  -- timestamps
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

-- Hot path: load this (visitor, resident) pair's recent entries.
-- The composite ordering by last_revised_at DESC means the
-- "what we built recently" query is a simple index scan.
CREATE INDEX IF NOT EXISTS idx_hypomnema_visitor_resident_revised
  ON public.hypomnema_entries (visitor_token, resident_id, last_revised_at DESC)
  WHERE active = true;

-- Graduation candidate scan: walks all of a resident's hypomnema
-- entries, oldest first. Used by the daily graduation cron.
CREATE INDEX IF NOT EXISTS idx_hypomnema_resident_created
  ON public.hypomnema_entries (resident_id, created_at)
  WHERE active = true AND graduated_to_engram_id IS NULL;

-- Lookup of what graduated where, for the audit trail.
CREATE INDEX IF NOT EXISTS idx_hypomnema_graduated_engram
  ON public.hypomnema_entries (graduated_to_engram_id)
  WHERE graduated_to_engram_id IS NOT NULL;

-- Service-role-only RLS. This table is private by design.
ALTER TABLE public.hypomnema_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hypomnema_entries service role only"
  ON public.hypomnema_entries FOR ALL TO public USING (false);
