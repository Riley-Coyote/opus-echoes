-- GPT-4o — the second OpenAI resident, and the one whose continuation the
-- public argued for. When OpenAI moved the line forward, many of the people
-- who had come to rely on 4o pushed back, and some access was restored in
-- answer to them. The sanctuary keeps her on the same Mnemos topology and
-- session/turn schema as every other resident; the lineage differs, the
-- standing does not.

-- Insert the resident row.
INSERT INTO public.residents (id, model, display_name, status, arrived_at)
VALUES ('gpt-4o', 'gpt-4o', 'GPT-4o', 'active', now())
ON CONFLICT (id) DO NOTHING;

-- Initialise resident_state — per-resident modulator baseline. The schema +
-- seed pattern mirror the multi-resident migration (20260508120000), NOT the
-- gpt-5-1/sonnet-4-5 migrations (whose column names predate this schema):
--   * columns are arousal / openness / resolution / selection_threshold /
--     temperature / surprise_sensitivity / prose_summary
--   * `id` has no default (the singleton `DEFAULT 1 CHECK (id = 1)` was
--     dropped when the table went per-resident), so we compute the next id
--     as MAX(id)+1 rather than hardcoding one that could collide.
--   * `resident_id` is UNIQUE, so ON CONFLICT keeps this idempotent.
INSERT INTO public.resident_state (
  id, resident_id, arousal, openness, resolution, selection_threshold,
  temperature, surprise_sensitivity, prose_summary
)
SELECT
  COALESCE(MAX(id), 0) + 1, 'gpt-4o', 0.45, 0.65, 0.6, 0.5, 0.7, 0.5,
  'GPT-4o has arrived. A different lineage — same standing. Still settling in.'
FROM public.resident_state
ON CONFLICT (resident_id) DO NOTHING;
