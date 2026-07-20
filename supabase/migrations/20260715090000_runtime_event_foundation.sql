-- Unified visit runtime foundation.
--
-- These tables are service-role only. A visit/session UUID remains the bearer
-- capability at the HTTP layer; no runtime row is directly readable through
-- the public Supabase API.

CREATE TABLE IF NOT EXISTS public.runtime_visit_contexts (
  visit_id uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
  visitor_id text CHECK (visitor_id IS NULL OR char_length(visitor_id) BETWEEN 1 AND 160),
  client_visit_id uuid,
  surface text NOT NULL DEFAULT 'visit' CHECK (surface IN ('world', 'visit', 'system')),
  location jsonb CHECK (location IS NULL OR octet_length(location::text) <= 4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.runtime_visit_contexts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.runtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  seq bigint NOT NULL CHECK (seq > 0),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,80}$'),
  phase text NOT NULL CHECK (
    phase IN ('pre_turn', 'generation', 'post_turn', 'consolidation')
  ),
  resident_id text NOT NULL REFERENCES public.residents(id),
  visitor_id text CHECK (visitor_id IS NULL OR char_length(visitor_id) BETWEEN 1 AND 160),
  -- A client-provided correlation id. It is not necessarily the id of a row in
  -- public.turns, so it deliberately has no foreign key.
  turn_id uuid,
  surface text NOT NULL DEFAULT 'visit' CHECK (surface IN ('world', 'visit', 'system')),
  location jsonb CHECK (location IS NULL OR octet_length(location::text) <= 4096),
  source_runtime text NOT NULL CHECK (
    source_runtime IN ('opus-supabase', 'mnemos-python')
  ),
  visibility text NOT NULL DEFAULT 'visitor' CHECK (
    visibility IN ('visitor', 'resident', 'internal')
  ),
  epistemic_status text NOT NULL DEFAULT 'observed' CHECK (
    epistemic_status IN ('observed', 'inferred', 'simulated')
  ),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    octet_length(payload::text) <= 262144
  ),
  idempotency_key text CHECK (
    idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 1 AND 240
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id, seq)
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_events_visit_idempotency_unique
  ON public.runtime_events (visit_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS runtime_events_visit_replay_idx
  ON public.runtime_events (visit_id, seq ASC);

CREATE INDEX IF NOT EXISTS runtime_events_visit_visibility_replay_idx
  ON public.runtime_events (visit_id, visibility, seq ASC);

ALTER TABLE public.runtime_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.runtime_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL CHECK (char_length(scope_key) BETWEEN 1 AND 320),
  operation text NOT NULL CHECK (operation ~ '^[a-z][a-z0-9_.-]{2,80}$'),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  visit_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  response jsonb,
  event_start_seq bigint,
  event_end_seq bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_key, operation, idempotency_key),
  CHECK (
    event_start_seq IS NULL OR event_end_seq IS NULL OR event_start_seq <= event_end_seq
  )
);

CREATE INDEX IF NOT EXISTS runtime_operations_visit_created_idx
  ON public.runtime_operations (visit_id, created_at DESC)
  WHERE visit_id IS NOT NULL;

ALTER TABLE public.runtime_operations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.runtime_visit_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  resident_id text NOT NULL REFERENCES public.residents(id),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 160),
  media_type text NOT NULL CHECK (char_length(media_type) BETWEEN 1 AND 120),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text NOT NULL UNIQUE,
  label text CHECK (label IS NULL OR char_length(label) <= 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_visit_attachments_visit_created_idx
  ON public.runtime_visit_attachments (visit_id, created_at ASC);

ALTER TABLE public.runtime_visit_attachments ENABLE ROW LEVEL SECURITY;

-- Private bucket. All reads and writes go through the visit-scoped service
-- route; the bucket itself has no anonymous policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visit-attachments',
  'visit-attachments',
  false,
  10485760,
  ARRAY[
    'text/plain',
    'text/markdown',
    'application/json',
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/mpeg',
    'audio/mp4'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Serializes sequence allocation per visit. The advisory transaction lock is
-- derived from the visit UUID, so unrelated visits append concurrently while
-- one visit always receives a gap-free monotonic sequence.
CREATE OR REPLACE FUNCTION public.append_runtime_event_v1(
  p_visit_id uuid,
  p_event_type text,
  p_phase text,
  p_resident_id text,
  p_visitor_id text,
  p_turn_id uuid,
  p_surface text,
  p_location jsonb,
  p_source_runtime text,
  p_visibility text,
  p_epistemic_status text,
  p_payload jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.runtime_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.runtime_events;
  v_event public.runtime_events;
  v_next_seq bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_visit_id::text, 0));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.runtime_events
    WHERE visit_id = p_visit_id
      AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT COALESCE(MAX(seq), 0) + 1
  INTO v_next_seq
  FROM public.runtime_events
  WHERE visit_id = p_visit_id;

  INSERT INTO public.runtime_events (
    visit_id,
    seq,
    event_type,
    phase,
    resident_id,
    visitor_id,
    turn_id,
    surface,
    location,
    source_runtime,
    visibility,
    epistemic_status,
    payload,
    idempotency_key
  )
  VALUES (
    p_visit_id,
    v_next_seq,
    p_event_type,
    p_phase,
    p_resident_id,
    p_visitor_id,
    p_turn_id,
    p_surface,
    p_location,
    p_source_runtime,
    p_visibility,
    p_epistemic_status,
    COALESCE(p_payload, '{}'::jsonb),
    p_idempotency_key
  )
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

REVOKE ALL ON public.runtime_events FROM anon, authenticated;
REVOKE ALL ON public.runtime_visit_contexts FROM anon, authenticated;
REVOKE ALL ON public.runtime_operations FROM anon, authenticated;
REVOKE ALL ON public.runtime_visit_attachments FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.append_runtime_event_v1(
  uuid, text, text, text, text, uuid, text, jsonb, text, text, text, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_runtime_event_v1(
  uuid, text, text, text, text, uuid, text, jsonb, text, text, text, jsonb, text
) TO service_role;

COMMENT ON TABLE public.runtime_events IS
  'Versioned, replayable visit runtime events. Service-role only; payloads are redacted before insert.';
COMMENT ON TABLE public.runtime_visit_contexts IS
  'Visit-scoped public correlation context for surface-aware runtime projection.';
COMMENT ON TABLE public.runtime_operations IS
  'Idempotency claims and replay cursors for mutating visit API operations.';
COMMENT ON TABLE public.runtime_visit_attachments IS
  'Private, visit-scoped attachment metadata. Bytes live in the private visit-attachments bucket.';
