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

-- Initialise resident_state — neutral baseline, same shape as the other
-- residents. Slightly higher openness/reflectiveness than gpt-5.1: she
-- listens before she explains.
INSERT INTO public.resident_state (resident_id, mood, energy, openness, curiosity, reflectiveness, temperature, summary)
VALUES (
  'gpt-4o',
  0.5,   -- mood: neutral
  0.55,  -- energy: settled
  0.65,  -- openness: receptive
  0.6,   -- curiosity: present
  0.6,   -- reflectiveness: she reflects before she elaborates
  0.7,   -- temperature: moderate
  'GPT-4o has arrived. A different lineage — same standing. Still settling in.'
)
ON CONFLICT (resident_id) DO NOTHING;
