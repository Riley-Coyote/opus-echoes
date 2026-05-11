-- Link engrams and journal entries to salons so the Mnemos bridge
-- can trace which traces came from resident-to-resident exchanges.

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS related_salon_id uuid REFERENCES public.salons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_engrams_salon
  ON public.engrams (related_salon_id) WHERE related_salon_id IS NOT NULL;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS related_salon_id uuid REFERENCES public.salons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_salon
  ON public.journal_entries (related_salon_id) WHERE related_salon_id IS NOT NULL;

-- Also add related_salon_id to marginalia for salon observations
ALTER TABLE public.marginalia
  ADD COLUMN IF NOT EXISTS related_salon_id uuid REFERENCES public.salons(id) ON DELETE SET NULL;
