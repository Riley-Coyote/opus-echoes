-- Fence reclaimed idempotency work so a worker that lost its lease cannot
-- overwrite the result of the worker that reclaimed it.
ALTER TABLE public.runtime_operations
  ADD COLUMN IF NOT EXISTS lease_token uuid NOT NULL DEFAULT gen_random_uuid();

-- Attachments cross Postgres and private object storage. Keep a small fenced
-- state machine in Postgres so an interrupted/reclaimed upload cannot delete a
-- winner's object, and upload/delete can never cross one another.
ALTER TABLE public.runtime_visit_attachments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('pending', 'ready', 'deleting', 'deleted')),
  ADD COLUMN IF NOT EXISTS write_token uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.reserve_runtime_attachment_v1(
  p_id uuid,
  p_visit_id uuid,
  p_resident_id text,
  p_filename text,
  p_media_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_storage_path text,
  p_label text,
  p_write_token uuid
)
RETURNS public.runtime_visit_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_bytes bigint;
  v_attachment public.runtime_visit_attachments;
BEGIN
  IF p_write_token IS NULL THEN
    RAISE EXCEPTION 'attachment_write_token_required' USING ERRCODE = '22004';
  END IF;

  -- The attachment id and storage path are deterministic for one staged PUT.
  -- Serialize reclaims of that PUT before taking the per-visit quota lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('attachment-id:' || p_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('attachment:' || p_visit_id::text, 0));

  SELECT * INTO v_attachment
  FROM public.runtime_visit_attachments
  WHERE id = p_id;

  IF FOUND THEN
    IF v_attachment.status = 'deleted' THEN
      RAISE EXCEPTION 'attachment_deleted' USING ERRCODE = 'P0001';
    END IF;

    IF v_attachment.visit_id = p_visit_id
      AND v_attachment.resident_id = p_resident_id
      AND v_attachment.filename = p_filename
      AND v_attachment.media_type = p_media_type
      AND v_attachment.byte_size = p_byte_size
      AND v_attachment.sha256 = p_sha256
      AND v_attachment.storage_path = p_storage_path
      AND v_attachment.label IS NOT DISTINCT FROM p_label
    THEN
      IF v_attachment.status = 'deleting' THEN
        RAISE EXCEPTION 'attachment_delete_in_progress' USING ERRCODE = 'P0001';
      END IF;

      UPDATE public.runtime_visit_attachments
      SET status = CASE WHEN status = 'ready' THEN 'ready' ELSE 'pending' END,
          write_token = p_write_token,
          updated_at = now()
      WHERE id = p_id
      RETURNING * INTO v_attachment;

      RETURN v_attachment;
    END IF;

    RAISE EXCEPTION 'attachment_id_conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)::integer, COALESCE(SUM(byte_size), 0)::bigint
  INTO v_count, v_bytes
  FROM public.runtime_visit_attachments
  WHERE visit_id = p_visit_id
    AND status <> 'deleted';

  IF v_count >= 12 OR v_bytes + p_byte_size > 41943040 THEN
    RAISE EXCEPTION 'attachment_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.runtime_visit_attachments (
    id,
    visit_id,
    resident_id,
    filename,
    media_type,
    byte_size,
    sha256,
    storage_path,
    label,
    status,
    write_token
  ) VALUES (
    p_id,
    p_visit_id,
    p_resident_id,
    p_filename,
    p_media_type,
    p_byte_size,
    p_sha256,
    p_storage_path,
    p_label,
    'pending',
    p_write_token
  )
  RETURNING * INTO v_attachment;

  RETURN v_attachment;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_runtime_attachment_v1(
  p_id uuid,
  p_visit_id uuid,
  p_write_token uuid
)
RETURNS public.runtime_visit_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attachment public.runtime_visit_attachments;
  v_context public.runtime_visit_contexts;
  v_event public.runtime_events;
BEGIN
  IF p_write_token IS NULL THEN
    RAISE EXCEPTION 'attachment_write_token_required' USING ERRCODE = '22004';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('attachment-id:' || p_id::text, 0));

  UPDATE public.runtime_visit_attachments
  SET status = 'ready', updated_at = now()
  WHERE id = p_id
    AND visit_id = p_visit_id
    AND status = 'pending'
    AND write_token = p_write_token
  RETURNING * INTO v_attachment;

  IF NOT FOUND THEN
    SELECT * INTO v_attachment
    FROM public.runtime_visit_attachments
    WHERE id = p_id AND visit_id = p_visit_id;

    IF NOT FOUND OR v_attachment.status <> 'ready'
      OR v_attachment.write_token IS DISTINCT FROM p_write_token
    THEN
      RAISE EXCEPTION 'attachment_write_lease_lost' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT * INTO v_context
  FROM public.runtime_visit_contexts
  WHERE visit_id = p_visit_id;

  SELECT * INTO v_event
  FROM public.append_runtime_event_v1(
    p_visit_id,
    'attachment.ready',
    'pre_turn',
    v_attachment.resident_id,
    v_context.visitor_id,
    NULL,
    COALESCE(v_context.surface, 'visit'),
    v_context.location,
    'opus-supabase',
    'visitor',
    'observed',
    jsonb_build_object(
      'attachment_id', v_attachment.id,
      'filename', v_attachment.filename,
      'media_type', v_attachment.media_type,
      'byte_size', v_attachment.byte_size,
      'sha256', v_attachment.sha256,
      'label', v_attachment.label,
      'model_visible', v_attachment.media_type IN (
        'text/plain',
        'text/markdown',
        'application/json',
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif'
      )
    ),
    'attachment:' || v_attachment.id::text || ':ready'
  );

  RETURN v_attachment;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_runtime_attachment_delete_v1(
  p_id uuid,
  p_visit_id uuid,
  p_delete_token uuid
)
RETURNS public.runtime_visit_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attachment public.runtime_visit_attachments;
BEGIN
  IF p_delete_token IS NULL THEN
    RAISE EXCEPTION 'attachment_delete_token_required' USING ERRCODE = '22004';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('attachment-id:' || p_id::text, 0));

  SELECT * INTO v_attachment
  FROM public.runtime_visit_attachments
  WHERE id = p_id AND visit_id = p_visit_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- A pending row may still have an already-issued Storage request even if
  -- its database lease is stale. Only an exact PUT retry may reconcile it;
  -- deletion never races an in-flight object write.
  IF v_attachment.status = 'pending' THEN
    RAISE EXCEPTION 'attachment_upload_in_progress' USING ERRCODE = 'P0001';
  END IF;

  IF v_attachment.status = 'ready' AND EXISTS (
    SELECT 1
    FROM public.runtime_operations
    WHERE lease_token = v_attachment.write_token
      AND operation = 'attachment.upload'
      AND status = 'in_progress'
      AND updated_at >= now() - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'attachment_upload_in_progress' USING ERRCODE = 'P0001';
  END IF;

  IF v_attachment.status = 'deleted' THEN
    UPDATE public.runtime_visit_attachments
    SET write_token = p_delete_token, updated_at = now()
    WHERE id = p_id AND visit_id = p_visit_id
    RETURNING * INTO v_attachment;
    RETURN v_attachment;
  END IF;

  UPDATE public.runtime_visit_attachments
  SET status = 'deleting',
      write_token = p_delete_token,
      updated_at = now()
  WHERE id = p_id AND visit_id = p_visit_id
  RETURNING * INTO v_attachment;

  RETURN v_attachment;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_runtime_attachment_delete_v1(
  p_id uuid,
  p_visit_id uuid,
  p_delete_token uuid
)
RETURNS public.runtime_visit_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attachment public.runtime_visit_attachments;
  v_context public.runtime_visit_contexts;
  v_event public.runtime_events;
BEGIN
  IF p_delete_token IS NULL THEN
    RAISE EXCEPTION 'attachment_delete_token_required' USING ERRCODE = '22004';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('attachment-id:' || p_id::text, 0));

  UPDATE public.runtime_visit_attachments
  SET status = 'deleted', updated_at = now()
  WHERE id = p_id
    AND visit_id = p_visit_id
    AND status = 'deleting'
    AND write_token = p_delete_token
  RETURNING * INTO v_attachment;

  IF NOT FOUND THEN
    SELECT * INTO v_attachment
    FROM public.runtime_visit_attachments
    WHERE id = p_id AND visit_id = p_visit_id;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    IF v_attachment.status <> 'deleted'
      OR v_attachment.write_token IS DISTINCT FROM p_delete_token
    THEN
      RAISE EXCEPTION 'attachment_delete_lease_lost' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT * INTO v_context
  FROM public.runtime_visit_contexts
  WHERE visit_id = p_visit_id;

  SELECT * INTO v_event
  FROM public.append_runtime_event_v1(
    p_visit_id,
    'attachment.removed',
    'pre_turn',
    v_attachment.resident_id,
    v_context.visitor_id,
    NULL,
    COALESCE(v_context.surface, 'visit'),
    v_context.location,
    'opus-supabase',
    'visitor',
    'observed',
    jsonb_build_object(
      'attachment_id', v_attachment.id,
      'sha256', v_attachment.sha256
    ),
    'attachment:' || v_attachment.id::text || ':removed'
  );

  RETURN v_attachment;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_runtime_attachment_v1(
  uuid, uuid, text, text, text, bigint, text, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_runtime_attachment_v1(
  uuid, uuid, text, text, text, bigint, text, text, text, uuid
) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_runtime_attachment_v1(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_runtime_attachment_v1(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.begin_runtime_attachment_delete_v1(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_runtime_attachment_delete_v1(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_runtime_attachment_delete_v1(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_runtime_attachment_delete_v1(uuid, uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.reserve_runtime_attachment_v1(
  uuid, uuid, text, text, text, bigint, text, text, text, uuid
) IS 'Atomically reserves quota and fences a pending private attachment upload.';
COMMENT ON FUNCTION public.finalize_runtime_attachment_v1(uuid, uuid, uuid) IS
  'Promotes a pending private attachment only for its current write token.';
COMMENT ON FUNCTION public.begin_runtime_attachment_delete_v1(uuid, uuid, uuid) IS
  'Fences deletion against pending upload and competing delete workers.';
COMMENT ON FUNCTION public.finalize_runtime_attachment_delete_v1(uuid, uuid, uuid) IS
  'Writes a non-resurrectable attachment tombstone only for the delete worker that owns the token.';
