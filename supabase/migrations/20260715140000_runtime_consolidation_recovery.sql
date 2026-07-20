-- A closed session and a settled consolidation are different facts. Runtime
-- recovery needs to distinguish a worker that returned from the Mnemos
-- pipeline from one that died after closing the visit but before the pipeline
-- could finish.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS runtime_consolidation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS runtime_consolidation_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS runtime_consolidation_attempts integer NOT NULL DEFAULT 0
    CHECK (runtime_consolidation_attempts >= 0);

COMMENT ON COLUMN public.sessions.runtime_consolidation_started_at IS
  'First runtime-managed consolidation attempt. A set value without settled_at is recoverable interrupted work.';
COMMENT ON COLUMN public.sessions.runtime_consolidation_settled_at IS
  'The legacy consolidation function returned. This is a lifecycle fence, not a claim that every best-effort mutation succeeded.';
COMMENT ON COLUMN public.sessions.runtime_consolidation_attempts IS
  'Number of runtime-managed attempts, including recovery after an interrupted worker.';
