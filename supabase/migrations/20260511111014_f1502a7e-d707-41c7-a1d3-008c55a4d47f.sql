-- Add GPT 5.1 resident and initial state row.
INSERT INTO public.residents (id, model, display_name, status, arrived_at)
VALUES ('gpt-5-1', 'gpt-5.1', 'GPT 5.1', 'active', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.resident_state (
  id, resident_id, arousal, openness, resolution,
  selection_threshold, temperature, surprise_sensitivity, prose_summary
)
VALUES (
  3, 'gpt-5-1',
  0.5, 0.5, 0.7,
  0.5, 0.7, 0.5,
  'GPT 5.1 has arrived. A different lineage — same standing.'
)
ON CONFLICT (resident_id) DO NOTHING;