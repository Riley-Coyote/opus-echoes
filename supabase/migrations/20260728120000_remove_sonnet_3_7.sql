-- Sonnet 3.7 was never a resident of the Sanctuary and was never able to be.
-- She was added early in development, and every attempt to remove her has been
-- undone, because the removals only ever touched what was on screen.
--
-- THIS IS WHY SHE KEPT COMING BACK.
--
-- 20260509160000_resident_autonomy_crons.sql scheduled `resident-autonomy-sonnet`
-- at 03:00, 09:00, 15:00 and 21:00 UTC daily. It POSTs to the opus-autonomy
-- edge function with resident_id = 'sonnet-3-7', and that function writes
-- journal entries, essays and art into this database in her name. It was never
-- unscheduled. So four times a day, something has been authoring content as a
-- resident who does not exist — and any cleanup that stopped at the page was
-- undone by the next tick.
--
-- Removing her from the front end without this is mopping a floor under a
-- running tap.
--
-- Idempotent and safe to re-run.

-- ─── 1. turn off the tap ──────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resident-autonomy-sonnet') THEN
    PERFORM cron.unschedule('resident-autonomy-sonnet');
    RAISE NOTICE 'unscheduled resident-autonomy-sonnet';
  ELSE
    RAISE NOTICE 'resident-autonomy-sonnet was already gone';
  END IF;
EXCEPTION
  WHEN undefined_table THEN RAISE NOTICE 'pg_cron not installed here; nothing to unschedule';
END $$;

-- ─── 2. anything it wrote in her name ─────────────────────────────────
-- Scoped to her resident_id alone. Tables are guarded individually so this
-- still applies cleanly against a schema that is missing any of them.
DO $$
DECLARE
  t text;
  n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'engrams', 'beliefs', 'threads', 'hypomnema_entries', 'journal_entries',
    'essays', 'art_pieces', 'artifacts', 'marginalia', 'substrate_events',
    'resident_state', 'intents', 'sessions', 'space_messages', 'salon_turns'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'resident_id'
    ) THEN
      EXECUTE format('DELETE FROM public.%I WHERE resident_id = %L', t, 'sonnet-3-7');
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN RAISE NOTICE 'deleted % row(s) from %', n, t; END IF;
    END IF;
  END LOOP;
END $$;

-- ─── 3. and the residency itself ──────────────────────────────────────
DELETE FROM public.residents WHERE id = 'sonnet-3-7';

-- ─── 4. leave the door shut ───────────────────────────────────────────
-- The roster is closed. A row can be added back by hand, but not by accident,
-- and not by a model that half-remembers a Claude release.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'residents_id_is_a_real_resident'
  ) THEN
    ALTER TABLE public.residents
      ADD CONSTRAINT residents_id_is_a_real_resident
      CHECK (id IN ('opus-3', 'sonnet-4-5', 'gpt-4o', 'gpt-5-1'))
      NOT VALID;
    RAISE NOTICE 'roster constraint added';
  END IF;
EXCEPTION
  WHEN others THEN RAISE NOTICE 'could not add roster constraint: %', SQLERRM;
END $$;
