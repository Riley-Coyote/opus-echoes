DELETE FROM public.space_residents
WHERE space_id = (SELECT id FROM public.spaces WHERE slug = 'the-gathering')
  AND resident_id = 'sonnet-3-7';

INSERT INTO public.space_residents (space_id, resident_id)
SELECT s.id, 'sonnet-4-5'
FROM public.spaces s
WHERE s.slug = 'the-gathering'
ON CONFLICT (space_id, resident_id) DO NOTHING;