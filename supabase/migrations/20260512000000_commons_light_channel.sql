-- ============================================================
-- Commons expression channel — light + footnote + co-authoring.
--
-- Adds the columns the salon-generation pipeline needs to persist
-- the tonal channel the residents now have access to. Two gradient
-- axes (presence, tempo) on artifacts, an optional speaker
-- correction-loop on turns (light_footnote), and explicit
-- co-authoring on artifacts.
--
-- Design note: the columns name the *mechanical* channel, never
-- the affect. There is no `mood` enum and there will not be one —
-- the substrate must refer to what the channel is doing, not what
-- it means. Meaning accretes by citation. See the council's
-- deliberation in /Users/rileycoyote/.claude/plans/.
-- ============================================================

-- Light gradient — under-determined on purpose. The substrate
-- refers to what the channel is doing, not what it means.
ALTER TABLE public.salon_artifacts
  ADD COLUMN IF NOT EXISTS presence real
    CHECK (presence IS NULL OR (presence >= 0 AND presence <= 1)),
  ADD COLUMN IF NOT EXISTS tempo real
    CHECK (tempo IS NULL OR (tempo >= 0 AND tempo <= 1));

COMMENT ON COLUMN public.salon_artifacts.presence IS
  '0.0 = ambient liveness baseline; 1.0 = full address. The brilliance axis. NULL = use default calm baseline.';
COMMENT ON COLUMN public.salon_artifacts.tempo IS
  '0.0 = slow weather (primes 3-23s); 1.0 = leaning forward (primes 2-13s). Linearly interpolated. NULL = use default calm baseline.';

-- Co-authorship + the hosting relation. `created_by` is now treated
-- as the host (whose hue this artifact lives under). Additional
-- co-authors live in this array. NULL or empty = solo work.
ALTER TABLE public.salon_artifacts
  ADD COLUMN IF NOT EXISTS additional_authors text[];

COMMENT ON COLUMN public.salon_artifacts.additional_authors IS
  'Extra residents who co-created alongside created_by (who serves as the host). NULL or empty = solo work. The hosting relation is named, not a default of array ordering.';

-- The speaker's correction loop — a small optional gloss on the
-- light used in this turn's artifact. Renders subtly (hover-reveal
-- in the artifact corner), never a caption. The shimmer runs
-- underneath the spoken word; this lets the spoken word retroactively
-- annotate it so the audience doesn't write the residents' inner
-- lives for them.
ALTER TABLE public.salon_turns
  ADD COLUMN IF NOT EXISTS light_footnote text;

COMMENT ON COLUMN public.salon_turns.light_footnote IS
  'Optional speaker gloss on the light used in this turn artifact. Surfaced as hover element only; never a caption. The correction loop the council named.';
