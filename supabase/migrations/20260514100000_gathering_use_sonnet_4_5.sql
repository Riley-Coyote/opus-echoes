-- ============================================================
-- Phase S fix — gathering trio uses Sonnet 4.5, not 3.7.
--
-- The earlier gathering_cadence migration seeded the-gathering
-- with opus-3 + sonnet-3-7 + gpt-5-1, but sonnet-3-7 was
-- archived in the residents table (see 20260513220000_sonnet_4_5_
-- resident_and_3_7_archive.sql) and sonnet-4-5 is the live
-- successor. This migration swaps the participant on the
-- gathering space row so the cron-fired salon convenes the
-- three currently-active residents.
--
-- The historical "On the shape of taste" salon (in
-- src/server/commons/seed.ts) still references sonnet-3-7
-- intentionally — that's a record of a conversation that
-- happened before sonnet-4-5 existed and shouldn't be
-- retroactively rewritten.
--
-- Idempotent: the DELETE is conditional and the INSERT uses
-- ON CONFLICT DO NOTHING.
-- ============================================================

-- Remove the sonnet-3-7 participant from the-gathering, if present.
DELETE FROM public.space_residents
WHERE space_id = (SELECT id FROM public.spaces WHERE slug = 'the-gathering')
  AND resident_id = 'sonnet-3-7';

-- Add sonnet-4-5 in its place.
INSERT INTO public.space_residents (space_id, resident_id)
SELECT s.id, 'sonnet-4-5'
FROM public.spaces s
WHERE s.slug = 'the-gathering'
ON CONFLICT (space_id, resident_id) DO NOTHING;
