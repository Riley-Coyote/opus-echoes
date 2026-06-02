-- 1. Add optional edge type to engram_edges
ALTER TABLE public.engram_edges
  ADD COLUMN IF NOT EXISTS type text;

CREATE INDEX IF NOT EXISTS idx_engram_edges_from ON public.engram_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_engram_edges_to ON public.engram_edges(to_id);

-- 2. Mirror beliefs.prior_confidence on engrams for motion/replay tails
ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS prior_stability double precision;

-- 3. FK link from journal_entries -> engrams (which reflection seeded which core memory)
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS seeded_engram_id uuid REFERENCES public.engrams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_seeded_engram ON public.journal_entries(seeded_engram_id);

-- Ensure public roles can read engram_edges (it already has a public SELECT policy)
GRANT SELECT ON public.engram_edges TO anon, authenticated;
GRANT ALL ON public.engram_edges TO service_role;