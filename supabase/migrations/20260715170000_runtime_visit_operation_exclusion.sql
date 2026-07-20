-- A turn and set-down mutate the same visit transcript and consolidation
-- boundary. They must never run concurrently, even when two browser requests
-- race after a client abort. Idempotent retries of the same operation still
-- resolve through runtime_operations; this partial index only fences distinct
-- active visit mutations.

CREATE UNIQUE INDEX IF NOT EXISTS runtime_operations_one_active_visit_mutation_idx
  ON public.runtime_operations (visit_id)
  WHERE visit_id IS NOT NULL
    AND status = 'in_progress'
    AND operation IN ('visit.turn', 'visit.set-down');

COMMENT ON INDEX public.runtime_operations_one_active_visit_mutation_idx IS
  'Prevents generation and set-down/consolidation from crossing for one visit.';
