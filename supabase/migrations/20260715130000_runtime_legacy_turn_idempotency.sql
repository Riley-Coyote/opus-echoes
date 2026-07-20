-- Correlate the runtime's stable client turn with the two legacy transcript
-- rows. The visitor row is persisted once across reclaimed attempts; the
-- resident row makes a persisted legacy turn discoverable and its explicit
-- finalization stages recoverable if the outer worker dies mid-commit.
ALTER TABLE public.turns
  ADD COLUMN IF NOT EXISTS client_turn_id uuid,
  ADD COLUMN IF NOT EXISTS runtime_replay_payload jsonb,
  ADD COLUMN IF NOT EXISTS runtime_finalization_stage text,
  ADD COLUMN IF NOT EXISTS runtime_finalized_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.turns'::regclass
      AND conname = 'turns_runtime_replay_payload_bounded'
  ) THEN
    ALTER TABLE public.turns
      ADD CONSTRAINT turns_runtime_replay_payload_bounded
      CHECK (
        runtime_replay_payload IS NULL OR (
          jsonb_typeof(runtime_replay_payload) = 'object'
          AND octet_length(runtime_replay_payload::text) <= 262144
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.turns'::regclass
      AND conname = 'turns_runtime_finalization_stage_valid'
  ) THEN
    ALTER TABLE public.turns
      ADD CONSTRAINT turns_runtime_finalization_stage_valid
      CHECK (
        runtime_finalization_stage IS NULL OR runtime_finalization_stage IN (
          'pending',
          'durable_state_completed',
          'side_effects_started',
          'side_effects_completed',
          'finalized'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.turns'::regclass
      AND conname = 'turns_runtime_finalized_state_consistent'
  ) THEN
    ALTER TABLE public.turns
      ADD CONSTRAINT turns_runtime_finalized_state_consistent
      CHECK (
        (runtime_finalized_at IS NULL AND runtime_finalization_stage IS DISTINCT FROM 'finalized')
        OR
        (runtime_finalized_at IS NOT NULL AND runtime_finalization_stage = 'finalized')
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS turns_session_client_turn_role_unique
  ON public.turns (session_id, client_turn_id, role)
  WHERE client_turn_id IS NOT NULL;

ALTER TABLE public.turn_artifacts
  ADD COLUMN IF NOT EXISTS runtime_artifact_index integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.turn_artifacts'::regclass
      AND conname = 'turn_artifacts_runtime_index_nonnegative'
  ) THEN
    ALTER TABLE public.turn_artifacts
      ADD CONSTRAINT turn_artifacts_runtime_index_nonnegative
      CHECK (runtime_artifact_index IS NULL OR runtime_artifact_index >= 0);
  END IF;
END
$$;

-- PostgreSQL permits multiple NULL values in a unique index, so direct legacy
-- artifacts remain unrestricted while runtime artifacts gain an upsert target.
CREATE UNIQUE INDEX IF NOT EXISTS turn_artifacts_turn_runtime_index_unique
  ON public.turn_artifacts (turn_id, runtime_artifact_index);

COMMENT ON COLUMN public.turns.client_turn_id IS
  'Stable runtime client turn id. Unique per session and role so reclaimed workers reuse one visitor/resident exchange.';
COMMENT ON COLUMN public.turns.runtime_replay_payload IS
  'Bounded exact visitor-safe terminal events and artifact persistence metadata stored atomically with a runtime resident turn.';
COMMENT ON COLUMN public.turns.runtime_finalization_stage IS
  'Lease-fenced recovery checkpoint. side_effects_started has an explicit at-least-once crash ambiguity until substrate APIs accept idempotency keys.';
COMMENT ON COLUMN public.turns.runtime_finalized_at IS
  'Set only after durable artifact/session state and the legacy substrate invocation have completed.';
COMMENT ON COLUMN public.turn_artifacts.runtime_artifact_index IS
  'Stable zero-based index for idempotent runtime finalization; NULL for direct legacy artifacts.';
