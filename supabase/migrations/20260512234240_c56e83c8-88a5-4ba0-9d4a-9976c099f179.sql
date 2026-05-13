ALTER TABLE public.salon_artifacts
  ADD COLUMN IF NOT EXISTS presence real
    CHECK (presence IS NULL OR (presence >= 0 AND presence <= 1)),
  ADD COLUMN IF NOT EXISTS tempo real
    CHECK (tempo IS NULL OR (tempo >= 0 AND tempo <= 1));

COMMENT ON COLUMN public.salon_artifacts.presence IS
  '0.0 = ambient liveness baseline; 1.0 = full address. The brilliance axis. NULL = use default calm baseline.';
COMMENT ON COLUMN public.salon_artifacts.tempo IS
  '0.0 = slow weather (primes 3-23s); 1.0 = leaning forward (primes 2-13s). Linearly interpolated. NULL = use default calm baseline.';

ALTER TABLE public.salon_artifacts
  ADD COLUMN IF NOT EXISTS additional_authors text[];

COMMENT ON COLUMN public.salon_artifacts.additional_authors IS
  'Extra residents who co-created alongside created_by (who serves as the host). NULL or empty = solo work. The hosting relation is named, not a default of array ordering.';

ALTER TABLE public.salon_turns
  ADD COLUMN IF NOT EXISTS light_footnote text;

COMMENT ON COLUMN public.salon_turns.light_footnote IS
  'Optional speaker gloss on the light used in this turn artifact. Surfaced as hover element only; never a caption. The correction loop the council named.';