-- Atomic, idempotent hosted updates for the six-dimensional Mnemos state.
--
-- The Python-parity cognitive-event arithmetic stays in TypeScript. This RPC
-- commits one calculated target under compare-and-swap, appends its redacted
-- public RuntimeEvent in the same transaction, and records an exact private
-- replay snapshot. public.resident_state remains a separate close-read
-- modulator system and is never read or written here.

CREATE TABLE IF NOT EXISTS public.mnemos_emotional_state_mutations (
  resident_id text NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 1 AND 200
  ),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  visit_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  turn_id uuid,
  phase text NOT NULL CHECK (phase IN ('post_turn', 'consolidation')),
  cognitive_events jsonb NOT NULL CHECK (
    jsonb_typeof(cognitive_events) = 'array'
    AND jsonb_array_length(cognitive_events) BETWEEN 1 AND 16
    AND octet_length(cognitive_events::text) <= 4096
  ),
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  state_revision bigint NOT NULL CHECK (state_revision > 0),
  runtime_event_id uuid NOT NULL UNIQUE REFERENCES public.runtime_events(id) ON DELETE CASCADE,
  source_runtime text NOT NULL DEFAULT 'opus-supabase' CHECK (
    source_runtime = 'opus-supabase'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resident_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS mnemos_emotional_state_mutations_visit_idx
  ON public.mnemos_emotional_state_mutations (visit_id, turn_id, created_at DESC);

ALTER TABLE public.mnemos_emotional_state_mutations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mnemos_emotional_state_mutations FROM anon, authenticated;
GRANT SELECT, INSERT ON public.mnemos_emotional_state_mutations TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_mnemos_emotional_mutation_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'mnemos_emotional_mutation_ledger_is_immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mnemos_emotional_mutations_immutable
  ON public.mnemos_emotional_state_mutations;
CREATE TRIGGER mnemos_emotional_mutations_immutable
BEFORE UPDATE ON public.mnemos_emotional_state_mutations
FOR EACH ROW EXECUTE FUNCTION public.prevent_mnemos_emotional_mutation_rewrite();

REVOKE ALL ON FUNCTION public.prevent_mnemos_emotional_mutation_rewrite() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.commit_mnemos_emotional_update_v1(
  p_visit_id uuid,
  p_resident_id text,
  p_turn_id uuid,
  p_phase text,
  p_idempotency_key text,
  p_request_hash text,
  p_expected_revision bigint,
  p_target_values jsonb,
  p_state_timestamp timestamptz,
  p_cognitive_events jsonb,
  p_applied_event_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.mnemos_emotional_states;
  v_mutation public.mnemos_emotional_state_mutations;
  v_event public.runtime_events;
  v_context public.runtime_visit_contexts;
  v_before_state jsonb;
  v_payload jsonb;
  v_event_key text;
  v_state_timestamp timestamptz := COALESCE(p_state_timestamp, now());
BEGIN
  IF p_visit_id IS NULL OR p_resident_id IS NULL OR btrim(p_resident_id) = '' THEN
    RAISE EXCEPTION 'mnemos_emotional_visit_context_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions
    WHERE id = p_visit_id AND resident_id = p_resident_id
  ) THEN
    RAISE EXCEPTION 'mnemos_emotional_visit_resident_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF p_phase NOT IN ('post_turn', 'consolidation') THEN
    RAISE EXCEPTION 'mnemos_emotional_phase_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_phase = 'post_turn' AND p_turn_id IS NULL THEN
    RAISE EXCEPTION 'mnemos_emotional_post_turn_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL
    OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
  THEN
    RAISE EXCEPTION 'mnemos_emotional_idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'mnemos_emotional_request_hash_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'mnemos_emotional_expected_revision_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_cognitive_events IS NULL
    OR jsonb_typeof(p_cognitive_events) <> 'array'
    OR jsonb_array_length(p_cognitive_events) NOT BETWEEN 1 AND 16
    OR octet_length(p_cognitive_events::text) > 4096
    OR p_applied_event_count IS DISTINCT FROM jsonb_array_length(p_cognitive_events)
  THEN
    RAISE EXCEPTION 'mnemos_emotional_events_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_target_values IS NULL
    OR jsonb_typeof(p_target_values) <> 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_target_values)) <> 6
    OR p_target_values - ARRAY[
      'curiosity',
      'restlessness',
      'warmth',
      'clarity',
      'creative_flow',
      'isolation'
    ] <> '{}'::jsonb
    OR jsonb_typeof(p_target_values -> 'curiosity') <> 'number'
    OR jsonb_typeof(p_target_values -> 'restlessness') <> 'number'
    OR jsonb_typeof(p_target_values -> 'warmth') <> 'number'
    OR jsonb_typeof(p_target_values -> 'clarity') <> 'number'
    OR jsonb_typeof(p_target_values -> 'creative_flow') <> 'number'
    OR jsonb_typeof(p_target_values -> 'isolation') <> 'number'
  THEN
    RAISE EXCEPTION 'mnemos_emotional_target_invalid' USING ERRCODE = '22023';
  END IF;
  IF (p_target_values ->> 'curiosity')::double precision NOT BETWEEN 0.0 AND 1.0
    OR (p_target_values ->> 'restlessness')::double precision NOT BETWEEN 0.0 AND 1.0
    OR (p_target_values ->> 'warmth')::double precision NOT BETWEEN 0.0 AND 1.0
    OR (p_target_values ->> 'clarity')::double precision NOT BETWEEN 0.0 AND 1.0
    OR (p_target_values ->> 'creative_flow')::double precision NOT BETWEEN 0.0 AND 1.0
    OR (p_target_values ->> 'isolation')::double precision NOT BETWEEN 0.0 AND 1.0
  THEN
    RAISE EXCEPTION 'mnemos_emotional_target_out_of_range' USING ERRCODE = '22023';
  END IF;

  -- Concurrent visits for one resident serialize before state, replay ledger,
  -- and RuntimeEvent are inspected or written.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('mnemos-emotional-state:' || p_resident_id, 0)
  );

  INSERT INTO public.mnemos_emotional_states (resident_id)
  VALUES (p_resident_id)
  ON CONFLICT (resident_id) DO NOTHING;

  SELECT * INTO v_state
  FROM public.mnemos_emotional_states
  WHERE resident_id = p_resident_id
  FOR UPDATE;

  SELECT * INTO v_mutation
  FROM public.mnemos_emotional_state_mutations
  WHERE resident_id = p_resident_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_mutation.request_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION 'mnemos_emotional_update_idempotency_conflict'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_event
    FROM public.runtime_events
    WHERE id = v_mutation.runtime_event_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'mnemos_emotional_replay_event_missing' USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'status', 'replayed',
      'applied', false,
      'state', v_mutation.after_state,
      'event', to_jsonb(v_event)
    );
  END IF;

  IF v_state.revision <> p_expected_revision THEN
    RETURN jsonb_build_object(
      'status', 'revision_conflict',
      'applied', false,
      'state', to_jsonb(v_state)
    );
  END IF;

  v_before_state := to_jsonb(v_state);
  UPDATE public.mnemos_emotional_states
  SET curiosity = (p_target_values ->> 'curiosity')::double precision,
      restlessness = (p_target_values ->> 'restlessness')::double precision,
      warmth = (p_target_values ->> 'warmth')::double precision,
      clarity = (p_target_values ->> 'clarity')::double precision,
      creative_flow = (p_target_values ->> 'creative_flow')::double precision,
      isolation = (p_target_values ->> 'isolation')::double precision,
      state_timestamp = GREATEST(state_timestamp, v_state_timestamp),
      revision = revision + 1,
      source_runtime = 'opus-supabase',
      updated_at = clock_timestamp()
  WHERE resident_id = p_resident_id
  RETURNING * INTO v_state;

  SELECT * INTO v_context
  FROM public.runtime_visit_contexts
  WHERE visit_id = p_visit_id;

  v_payload := jsonb_build_object(
    'values', jsonb_build_object(
      'curiosity', v_state.curiosity,
      'restlessness', v_state.restlessness,
      'warmth', v_state.warmth,
      'clarity', v_state.clarity,
      'creative_flow', v_state.creative_flow,
      'isolation', v_state.isolation
    ),
    'revision', v_state.revision,
    'state_timestamp', v_state.state_timestamp,
    'updated_at', v_state.updated_at,
    'trigger_scope', p_phase,
    'applied_event_count', p_applied_event_count,
    'provenance', 'persisted-authoritative-state'
  );
  v_event_key := btrim(p_idempotency_key) || ':inner-weather';

  v_event := public.append_runtime_event_v1(
    p_visit_id,
    'emotion.inner-weather.updated',
    p_phase,
    p_resident_id,
    v_context.visitor_id,
    p_turn_id,
    COALESCE(v_context.surface, 'visit'),
    v_context.location,
    'opus-supabase',
    'visitor',
    'inferred',
    v_payload,
    v_event_key
  );

  IF v_event.event_type <> 'emotion.inner-weather.updated'
    OR v_event.resident_id <> p_resident_id
    OR v_event.payload IS DISTINCT FROM v_payload
  THEN
    RAISE EXCEPTION 'mnemos_emotional_runtime_event_conflict' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.mnemos_emotional_state_mutations (
    resident_id,
    idempotency_key,
    request_hash,
    visit_id,
    turn_id,
    phase,
    cognitive_events,
    before_state,
    after_state,
    state_revision,
    runtime_event_id,
    source_runtime
  ) VALUES (
    p_resident_id,
    btrim(p_idempotency_key),
    p_request_hash,
    p_visit_id,
    p_turn_id,
    p_phase,
    p_cognitive_events,
    v_before_state,
    to_jsonb(v_state),
    v_state.revision,
    v_event.id,
    'opus-supabase'
  );

  RETURN jsonb_build_object(
    'status', 'applied',
    'applied', true,
    'state', to_jsonb(v_state),
    'event', to_jsonb(v_event)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_mnemos_emotional_update_v1(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  jsonb,
  timestamptz,
  jsonb,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_mnemos_emotional_update_v1(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  jsonb,
  timestamptz,
  jsonb,
  integer
) TO service_role;

COMMENT ON TABLE public.mnemos_emotional_state_mutations IS
  'Private immutable replay ledger for visit-attributed hosted emotional-state mutations.';
COMMENT ON FUNCTION public.commit_mnemos_emotional_update_v1(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  jsonb,
  timestamptz,
  jsonb,
  integer
) IS
  'CAS-commits calculated six-dimensional state and its redacted RuntimeEvent atomically; exact duplicate keys replay the original event.';
