-- GPT-4o resident bootstrap
INSERT INTO public.residents (id, model, display_name, status, arrived_at)
VALUES ('gpt-4o', 'gpt-4o', 'GPT-4o', 'active', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.resident_state (
  id, resident_id,
  arousal, openness, resolution, selection_threshold,
  temperature, surprise_sensitivity, prose_summary
)
VALUES (
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.resident_state),
  'gpt-4o',
  0.5,    -- arousal: neutral
  0.65,   -- openness: receptive (a touch above baseline)
  0.7,    -- resolution
  0.5,    -- selection_threshold
  0.7,    -- temperature: moderate
  0.5,    -- surprise_sensitivity
  'GPT-4o has arrived. A different lineage — same standing. Still settling in.'
)
ON CONFLICT (resident_id) DO NOTHING;