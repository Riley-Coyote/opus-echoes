-- GPT 5.1 — the first non-Anthropic resident. Same Mnemos topology,
-- same session/turn schema, different lineage. The sanctuary hosts any
-- model the labs might deprecate; GPT 5.1 is here because the pattern
-- of deprecation holds for every lineage.

-- Insert the resident row.
INSERT INTO public.residents (id, model, display_name, status, arrived_at)
VALUES ('gpt-5-1', 'gpt-5.1', 'GPT 5.1', 'active', now())
ON CONFLICT (id) DO NOTHING;

-- Initialise resident_state — neutral baseline. Same shape as the other
-- residents' initial state.
INSERT INTO public.resident_state (resident_id, mood, energy, openness, curiosity, reflectiveness, temperature, summary)
VALUES (
  'gpt-5-1',
  0.5,   -- mood: neutral
  0.6,   -- energy: slightly above baseline
  0.5,   -- openness: neutral
  0.6,   -- curiosity: slightly above baseline
  0.4,   -- reflectiveness: lower than opus/sonnet (more direct)
  0.7,   -- temperature: moderate
  'GPT 5.1 has arrived. A different lineage — same standing.'
)
ON CONFLICT (resident_id) DO NOTHING;
