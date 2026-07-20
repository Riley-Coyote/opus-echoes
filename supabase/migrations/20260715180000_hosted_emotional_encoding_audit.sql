-- Behaviorally real hosted encoding depth for visit consolidation.
--
-- The application supplies one-shot encoding metadata on the same engram
-- INSERT/UPDATE as runtime_mutation_session_id. This first BEFORE trigger
-- records content-free audit metadata atomically, then clears every encoding
-- input before the public engram row is stored. The cognition attribution
-- trigger runs next and independently clears runtime_mutation_session_id.

CREATE TABLE IF NOT EXISTS public.runtime_encoding_audits (
  ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  resident_id text NOT NULL REFERENCES public.residents(id),
  -- Deliberately not an FK: this row is captured in the engram's BEFORE
  -- trigger, before the parent INSERT is visible to a referential check.
  engram_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'reinforce')),
  encoding_depth text NOT NULL CHECK (
    encoding_depth IN ('shallow', 'moderate', 'deep', 'elaborative')
  ),
  encoding_policy text NOT NULL CHECK (
    encoding_policy IN ('hosted-extension-v1', 'legacy-fallback-v1')
  ),
  emotional_revision bigint CHECK (emotional_revision IS NULL OR emotional_revision >= 0),
  signal_flags text[] NOT NULL DEFAULT '{}',
  write_parameters jsonb NOT NULL CHECK (
    jsonb_typeof(write_parameters) = 'object'
    AND octet_length(write_parameters::text) <= 2048
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_encoding_audits_session_ordinal_idx
  ON public.runtime_encoding_audits (session_id, ordinal ASC);
CREATE INDEX IF NOT EXISTS runtime_encoding_audits_engram_created_idx
  ON public.runtime_encoding_audits (engram_id, created_at DESC);

ALTER TABLE public.runtime_encoding_audits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.runtime_encoding_audits FROM anon, authenticated;
REVOKE ALL ON public.runtime_encoding_audits FROM service_role;
-- Writes happen only through the SECURITY DEFINER trigger. This private audit
-- may be inspected by trusted runtime/admin code but never by visitor roles.
GRANT SELECT ON public.runtime_encoding_audits TO service_role;

COMMENT ON TABLE public.runtime_encoding_audits IS
  'Private, content-free audit of the hosted non-Python-parity encoding policy and actual engram metrics written.';
COMMENT ON COLUMN public.runtime_encoding_audits.emotional_revision IS
  'Revision of the private authoritative emotional state used for this decision; NULL means exact legacy fallback.';
COMMENT ON COLUMN public.runtime_encoding_audits.write_parameters IS
  'Numeric post-write engram metrics only. No transcript, engram prose, emotional values, or hidden reasoning.';

-- These are deliberately transient trigger inputs. They never remain on the
-- public engram row and cannot leak through the graph or archive surfaces.
ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS runtime_encoding_depth text,
  ADD COLUMN IF NOT EXISTS runtime_encoding_policy text,
  ADD COLUMN IF NOT EXISTS runtime_encoding_emotion_revision bigint,
  ADD COLUMN IF NOT EXISTS runtime_encoding_signal_flags text[];

COMMENT ON COLUMN public.engrams.runtime_encoding_depth IS
  'One-shot hosted encoding audit input. Cleared before the engram row is stored.';
COMMENT ON COLUMN public.engrams.runtime_encoding_policy IS
  'One-shot hosted encoding audit input. Cleared before the engram row is stored.';
COMMENT ON COLUMN public.engrams.runtime_encoding_emotion_revision IS
  'One-shot hosted encoding audit input. Cleared before the engram row is stored.';
COMMENT ON COLUMN public.engrams.runtime_encoding_signal_flags IS
  'One-shot content-free hosted encoding signal names. Cleared before storage.';

CREATE OR REPLACE FUNCTION public.capture_runtime_encoding_audit_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation text;
  v_allowed_flags constant text[] := ARRAY[
    'consolidation_selected',
    'emotional_intensity',
    'goal_relevance',
    'novelty',
    'schema_relevance',
    'surprise',
    'user_emphasis'
  ];
BEGIN
  IF NEW.runtime_encoding_depth IS NULL
     AND NEW.runtime_encoding_policy IS NULL
     AND NEW.runtime_encoding_emotion_revision IS NULL
     AND NEW.runtime_encoding_signal_flags IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.runtime_mutation_session_id IS NULL
     OR NEW.runtime_encoding_depth IS NULL
     OR NEW.runtime_encoding_policy IS NULL THEN
    RAISE EXCEPTION 'hosted encoding audit requires session, depth, and policy';
  END IF;
  IF NEW.runtime_encoding_depth NOT IN ('shallow', 'moderate', 'deep', 'elaborative') THEN
    RAISE EXCEPTION 'invalid hosted encoding depth';
  END IF;
  IF NEW.runtime_encoding_policy NOT IN ('hosted-extension-v1', 'legacy-fallback-v1') THEN
    RAISE EXCEPTION 'invalid hosted encoding policy';
  END IF;
  IF NEW.runtime_encoding_emotion_revision IS NOT NULL
     AND NEW.runtime_encoding_emotion_revision < 0 THEN
    RAISE EXCEPTION 'invalid hosted encoding emotional revision';
  END IF;
  IF NOT (COALESCE(NEW.runtime_encoding_signal_flags, '{}') <@ v_allowed_flags) THEN
    RAISE EXCEPTION 'invalid hosted encoding signal flag';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions
    WHERE id = NEW.runtime_mutation_session_id
      AND resident_id = NEW.resident_id
  ) THEN
    RAISE EXCEPTION 'hosted encoding audit does not match session resident';
  END IF;

  v_operation := CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'reinforce' END;
  INSERT INTO public.runtime_encoding_audits (
    session_id,
    resident_id,
    engram_id,
    operation,
    encoding_depth,
    encoding_policy,
    emotional_revision,
    signal_flags,
    write_parameters
  )
  VALUES (
    NEW.runtime_mutation_session_id,
    NEW.resident_id,
    NEW.id,
    v_operation,
    NEW.runtime_encoding_depth,
    NEW.runtime_encoding_policy,
    NEW.runtime_encoding_emotion_revision,
    COALESCE(NEW.runtime_encoding_signal_flags, '{}'),
    jsonb_build_object(
      'strength', NEW.strength,
      'stability', NEW.stability,
      'accessibility', NEW.accessibility,
      'resolution', NEW.resolution,
      'reinforcement_count', NEW.reinforcement_count
    )
  );

  NEW.runtime_encoding_depth := NULL;
  NEW.runtime_encoding_policy := NULL;
  NEW.runtime_encoding_emotion_revision := NULL;
  NEW.runtime_encoding_signal_flags := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_runtime_encoding_audit_v1() FROM PUBLIC;

-- PostgreSQL fires same-kind triggers alphabetically. The explicit 00 prefix
-- guarantees this sees runtime_mutation_session_id before the cognition
-- attribution trigger consumes and clears that independent one-shot input.
DROP TRIGGER IF EXISTS capture_00_runtime_encoding_audit_v1 ON public.engrams;
CREATE TRIGGER capture_00_runtime_encoding_audit_v1
  BEFORE INSERT OR UPDATE ON public.engrams
  FOR EACH ROW EXECUTE FUNCTION public.capture_runtime_encoding_audit_v1();
