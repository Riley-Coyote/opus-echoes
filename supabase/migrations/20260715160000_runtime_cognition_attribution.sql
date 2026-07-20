-- Exact, append-only attribution for cognition writes performed by a visit
-- consolidation. The application supplies runtime_mutation_session_id on the
-- same INSERT/UPDATE as the underlying substrate mutation. BEFORE triggers
-- capture OLD/NEW in the same transaction, append a private marker, and clear
-- the one-shot session id before the domain row is stored.

CREATE TABLE IF NOT EXISTS public.runtime_cognition_mutations (
  ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  resident_id text NOT NULL REFERENCES public.residents(id),
  mutation_type text NOT NULL CHECK (
    mutation_type IN (
      'engram.created',
      'engram.reinforced',
      'engram.promoted',
      'engram.decayed',
      'engram.connections.updated',
      'engram.edge.created',
      'belief.created',
      'belief.updated',
      'thread.created',
      'thread.reinforced',
      'journal.created',
      'resident.state.updated'
    )
  ),
  entity_id text NOT NULL CHECK (char_length(entity_id) BETWEEN 1 AND 160),
  attribution_scope text NOT NULL CHECK (
    attribution_scope IN ('session_linked', 'triggered_by_visit')
  ),
  phase text NOT NULL DEFAULT 'consolidation' CHECK (
    phase IN ('pre_turn', 'generation', 'post_turn', 'consolidation')
  ),
  source_runtime text NOT NULL DEFAULT 'opus-supabase' CHECK (
    source_runtime IN ('opus-supabase', 'mnemos-python')
  ),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND octet_length(payload::text) <= 16384
  ),
  mutation_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_cognition_mutations_session_ordinal_idx
  ON public.runtime_cognition_mutations (session_id, ordinal ASC);

ALTER TABLE public.runtime_cognition_mutations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.runtime_cognition_mutations FROM anon, authenticated;
REVOKE ALL ON public.runtime_cognition_mutations FROM service_role;
-- Marker inserts happen only inside the SECURITY DEFINER trigger helper.
-- Runtime projection may read markers, but no application role can rewrite or
-- delete their history.
GRANT SELECT ON public.runtime_cognition_mutations TO service_role;

COMMENT ON TABLE public.runtime_cognition_mutations IS
  'Private write-site cognition attribution. Runtime projection reads only rows explicitly tied to one session.';
COMMENT ON COLUMN public.runtime_cognition_mutations.attribution_scope IS
  'session_linked means the entity directly names the visit; triggered_by_visit means resident-global maintenance caused by that consolidation.';

-- These columns are deliberately transient. Every attribution trigger sets the
-- value back to NULL, so a later unrelated mutation can never inherit an older
-- session attribution.
ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS runtime_mutation_session_id uuid;
ALTER TABLE public.engram_edges
  ADD COLUMN IF NOT EXISTS runtime_mutation_session_id uuid;
ALTER TABLE public.beliefs
  ADD COLUMN IF NOT EXISTS runtime_mutation_session_id uuid;
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS runtime_mutation_session_id uuid;
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS runtime_mutation_session_id uuid;
ALTER TABLE public.resident_state
  ADD COLUMN IF NOT EXISTS runtime_mutation_session_id uuid;

COMMENT ON COLUMN public.engrams.runtime_mutation_session_id IS
  'One-shot runtime attribution input. Cleared by the cognition trigger before storage.';
COMMENT ON COLUMN public.engram_edges.runtime_mutation_session_id IS
  'One-shot runtime attribution input. Cleared by the cognition trigger before storage.';
COMMENT ON COLUMN public.beliefs.runtime_mutation_session_id IS
  'One-shot runtime attribution input. Cleared by the cognition trigger before storage.';
COMMENT ON COLUMN public.threads.runtime_mutation_session_id IS
  'One-shot runtime attribution input. Cleared by the cognition trigger before storage.';
COMMENT ON COLUMN public.journal_entries.runtime_mutation_session_id IS
  'One-shot runtime attribution input. Cleared by the cognition trigger before storage.';
COMMENT ON COLUMN public.resident_state.runtime_mutation_session_id IS
  'One-shot runtime attribution input. Cleared by the cognition trigger before storage.';

CREATE OR REPLACE FUNCTION public.record_runtime_cognition_mutation_v1(
  p_session_id uuid,
  p_resident_id text,
  p_mutation_type text,
  p_entity_id text,
  p_attribution_scope text,
  p_payload jsonb,
  p_mutation_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions
    WHERE id = p_session_id
      AND resident_id = p_resident_id
  ) THEN
    RAISE EXCEPTION 'runtime cognition attribution does not match session resident';
  END IF;

  INSERT INTO public.runtime_cognition_mutations (
    session_id,
    resident_id,
    mutation_type,
    entity_id,
    attribution_scope,
    phase,
    source_runtime,
    payload,
    mutation_at
  )
  VALUES (
    p_session_id,
    p_resident_id,
    p_mutation_type,
    p_entity_id,
    p_attribution_scope,
    'consolidation',
    'opus-supabase',
    p_payload,
    COALESCE(p_mutation_at, now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_runtime_cognition_mutation_v1(
  uuid, text, text, text, text, jsonb, timestamptz
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_runtime_engram_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := NEW.runtime_mutation_session_id;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- One-shot input: never persist attribution on a resident-global row.
  NEW.runtime_mutation_session_id := NULL;
  v_after := jsonb_build_object(
    'strength', NEW.strength,
    'stability', NEW.stability,
    'accessibility', NEW.accessibility,
    'reinforcement_count', NEW.reinforcement_count,
    'is_core', NEW.is_core,
    'connections', NEW.connections,
    'state', NEW.state
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.record_runtime_cognition_mutation_v1(
      v_session_id,
      NEW.resident_id,
      'engram.created',
      NEW.id::text,
      'session_linked',
      jsonb_build_object('before', NULL, 'after', v_after, 'content_redacted', true),
      NEW.created_at
    );
    RETURN NEW;
  END IF;

  v_before := jsonb_build_object(
    'strength', OLD.strength,
    'stability', OLD.stability,
    'accessibility', OLD.accessibility,
    'reinforcement_count', OLD.reinforcement_count,
    'is_core', OLD.is_core,
    'connections', OLD.connections,
    'state', OLD.state
  );

  IF NEW.reinforcement_count IS DISTINCT FROM OLD.reinforcement_count
    OR NEW.strength IS DISTINCT FROM OLD.strength
    OR NEW.stability IS DISTINCT FROM OLD.stability THEN
    PERFORM public.record_runtime_cognition_mutation_v1(
      v_session_id,
      NEW.resident_id,
      'engram.reinforced',
      NEW.id::text,
      'session_linked',
      jsonb_build_object('before', v_before, 'after', v_after, 'content_redacted', true),
      NEW.last_reinforced_at
    );
  ELSIF NEW.connections IS DISTINCT FROM OLD.connections THEN
    PERFORM public.record_runtime_cognition_mutation_v1(
      v_session_id,
      NEW.resident_id,
      'engram.connections.updated',
      NEW.id::text,
      'triggered_by_visit',
      jsonb_build_object('before', v_before, 'after', v_after, 'content_redacted', true),
      now()
    );
  ELSIF NEW.accessibility IS DISTINCT FROM OLD.accessibility
    OR NEW.state IS DISTINCT FROM OLD.state THEN
    PERFORM public.record_runtime_cognition_mutation_v1(
      v_session_id,
      NEW.resident_id,
      'engram.decayed',
      NEW.id::text,
      'triggered_by_visit',
      jsonb_build_object('before', v_before, 'after', v_after, 'content_redacted', true),
      now()
    );
  END IF;

  IF NEW.is_core AND NOT OLD.is_core THEN
    PERFORM public.record_runtime_cognition_mutation_v1(
      v_session_id,
      NEW.resident_id,
      'engram.promoted',
      NEW.id::text,
      'session_linked',
      jsonb_build_object('before', v_before, 'after', v_after, 'content_redacted', true),
      NEW.last_reinforced_at
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_runtime_engram_edge_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := NEW.runtime_mutation_session_id;
  v_resident_id text;
  v_to_resident_id text;
BEGIN
  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.runtime_mutation_session_id := NULL;

  SELECT resident_id INTO v_resident_id
  FROM public.engrams
  WHERE id = NEW.from_id;
  SELECT resident_id INTO v_to_resident_id
  FROM public.engrams
  WHERE id = NEW.to_id;
  IF v_resident_id IS NULL OR v_resident_id IS DISTINCT FROM v_to_resident_id THEN
    RAISE EXCEPTION 'runtime cognition edge must join engrams for one resident';
  END IF;

  PERFORM public.record_runtime_cognition_mutation_v1(
    v_session_id,
    v_resident_id,
    'engram.edge.created',
    NEW.from_id::text || ':' || NEW.to_id::text,
    'session_linked',
    jsonb_build_object(
      'before', NULL,
      'after', jsonb_build_object(
        'from_engram_id', NEW.from_id,
        'to_engram_id', NEW.to_id,
        'weight', NEW.weight
      ),
      'content_redacted', true
    ),
    NEW.created_at
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_runtime_belief_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := NEW.runtime_mutation_session_id;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.runtime_mutation_session_id := NULL;
  v_after := jsonb_build_object(
    'confidence', NEW.confidence,
    'prior_confidence', NEW.prior_confidence
  );
  IF TG_OP = 'INSERT' THEN
    PERFORM public.record_runtime_cognition_mutation_v1(
      v_session_id,
      NEW.resident_id,
      'belief.created',
      NEW.id::text,
      'triggered_by_visit',
      jsonb_build_object('before', NULL, 'after', v_after, 'content_redacted', true),
      NEW.updated_at
    );
  ELSE
    v_before := jsonb_build_object(
      'confidence', OLD.confidence,
      'prior_confidence', OLD.prior_confidence
    );
    PERFORM public.record_runtime_cognition_mutation_v1(
      v_session_id,
      NEW.resident_id,
      'belief.updated',
      NEW.id::text,
      'triggered_by_visit',
      jsonb_build_object('before', v_before, 'after', v_after, 'content_redacted', true),
      NEW.updated_at
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_runtime_thread_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := NEW.runtime_mutation_session_id;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.runtime_mutation_session_id := NULL;
  v_after := jsonb_build_object(
    'appearance_count', NEW.appearance_count,
    'distinct_visitor_count', NEW.distinct_visitor_count
  );
  IF TG_OP = 'INSERT' THEN
    PERFORM public.record_runtime_cognition_mutation_v1(
      v_session_id,
      NEW.resident_id,
      'thread.created',
      NEW.id::text,
      'triggered_by_visit',
      jsonb_build_object('before', NULL, 'after', v_after, 'content_redacted', true),
      NEW.last_surfaced_at
    );
  ELSE
    v_before := jsonb_build_object(
      'appearance_count', OLD.appearance_count,
      'distinct_visitor_count', OLD.distinct_visitor_count
    );
    PERFORM public.record_runtime_cognition_mutation_v1(
      v_session_id,
      NEW.resident_id,
      'thread.reinforced',
      NEW.id::text,
      'triggered_by_visit',
      jsonb_build_object('before', v_before, 'after', v_after, 'content_redacted', true),
      NEW.last_surfaced_at
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_runtime_journal_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := NEW.runtime_mutation_session_id;
BEGIN
  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.runtime_mutation_session_id := NULL;
  IF NEW.related_session_id IS DISTINCT FROM v_session_id THEN
    RAISE EXCEPTION 'runtime journal attribution must match related_session_id';
  END IF;
  PERFORM public.record_runtime_cognition_mutation_v1(
    v_session_id,
    NEW.resident_id,
    'journal.created',
    NEW.id::text,
    'session_linked',
    jsonb_build_object(
      'before', NULL,
      'after', jsonb_build_object('kind', NEW.kind),
      'content_redacted', true
    ),
    NEW.created_at
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_runtime_resident_state_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := NEW.runtime_mutation_session_id;
BEGIN
  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.runtime_mutation_session_id := NULL;
  PERFORM public.record_runtime_cognition_mutation_v1(
    v_session_id,
    NEW.resident_id,
    'resident.state.updated',
    NEW.id::text,
    'triggered_by_visit',
    jsonb_build_object(
      'before', jsonb_build_object(
        'arousal', OLD.arousal,
        'openness', OLD.openness,
        'resolution', OLD.resolution,
        'selection_threshold', OLD.selection_threshold,
        'temperature', OLD.temperature,
        'surprise_sensitivity', OLD.surprise_sensitivity
      ),
      'after', jsonb_build_object(
        'arousal', NEW.arousal,
        'openness', NEW.openness,
        'resolution', NEW.resolution,
        'selection_threshold', NEW.selection_threshold,
        'temperature', NEW.temperature,
        'surprise_sensitivity', NEW.surprise_sensitivity
      ),
      'content_redacted', true
    ),
    NEW.updated_at
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_runtime_engram_mutation_v1 ON public.engrams;
CREATE TRIGGER capture_runtime_engram_mutation_v1
  BEFORE INSERT OR UPDATE ON public.engrams
  FOR EACH ROW EXECUTE FUNCTION public.capture_runtime_engram_mutation_v1();

DROP TRIGGER IF EXISTS capture_runtime_engram_edge_mutation_v1 ON public.engram_edges;
CREATE TRIGGER capture_runtime_engram_edge_mutation_v1
  BEFORE INSERT ON public.engram_edges
  FOR EACH ROW EXECUTE FUNCTION public.capture_runtime_engram_edge_mutation_v1();

DROP TRIGGER IF EXISTS capture_runtime_belief_mutation_v1 ON public.beliefs;
CREATE TRIGGER capture_runtime_belief_mutation_v1
  BEFORE INSERT OR UPDATE ON public.beliefs
  FOR EACH ROW EXECUTE FUNCTION public.capture_runtime_belief_mutation_v1();

DROP TRIGGER IF EXISTS capture_runtime_thread_mutation_v1 ON public.threads;
CREATE TRIGGER capture_runtime_thread_mutation_v1
  BEFORE INSERT OR UPDATE ON public.threads
  FOR EACH ROW EXECUTE FUNCTION public.capture_runtime_thread_mutation_v1();

DROP TRIGGER IF EXISTS capture_runtime_journal_mutation_v1 ON public.journal_entries;
CREATE TRIGGER capture_runtime_journal_mutation_v1
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.capture_runtime_journal_mutation_v1();

DROP TRIGGER IF EXISTS capture_runtime_resident_state_mutation_v1 ON public.resident_state;
CREATE TRIGGER capture_runtime_resident_state_mutation_v1
  BEFORE UPDATE ON public.resident_state
  FOR EACH ROW EXECUTE FUNCTION public.capture_runtime_resident_state_mutation_v1();

REVOKE ALL ON FUNCTION public.capture_runtime_engram_mutation_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_runtime_engram_edge_mutation_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_runtime_belief_mutation_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_runtime_thread_mutation_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_runtime_journal_mutation_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_runtime_resident_state_mutation_v1() FROM PUBLIC;
