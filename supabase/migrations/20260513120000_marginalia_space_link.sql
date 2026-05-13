-- ============================================================
-- marginalia.related_space_id — link marginalia to a space.
--
-- Mirrors related_salon_id (added in 20260511170000). After each
-- resident turn in a space room, observeSpaceExchange generates
-- 1–3 marginalia rows tagged with the space id. These accumulate
-- as the resident's memory of what happens in each space, and
-- become engrams during the next consolidation cycle.
--
-- session_id is already nullable (see 20260511180000) so
-- marginalia from a space context can carry a null session_id
-- alongside the related_space_id pointer.
-- ============================================================

ALTER TABLE public.marginalia
  ADD COLUMN IF NOT EXISTS related_space_id uuid REFERENCES public.spaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_marginalia_space_created
  ON public.marginalia (related_space_id, created_at DESC)
  WHERE related_space_id IS NOT NULL;

COMMENT ON COLUMN public.marginalia.related_space_id IS
  'Set on marginalia generated from a space room exchange. Null otherwise.';
