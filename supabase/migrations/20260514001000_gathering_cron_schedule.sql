-- ============================================================
-- Phase S — scheduled gathering salons via pg_cron
--
-- Three jobs, three times a day, hitting the Cloudflare-hosted
-- TanStack endpoint /api/public/hooks/gathering-tick. The
-- endpoint is fire-and-forget — it queues the salon and returns
-- 200 within seconds, so the pg_cron http call doesn't hold
-- a connection open for the duration of the run.
--
-- Cadence (UTC):
--   gathering-tick-morning    — 14:00 UTC  (7 AM PT,  10 AM ET, 3 PM London, 10 PM Tokyo)
--   gathering-tick-afternoon  — 20:00 UTC  (1 PM PT,  4 PM ET,  9 PM London, 5 AM next-day Tokyo)
--   gathering-tick-evening    — 03:00 UTC  (8 PM PT prev-day, 11 PM ET prev-day, late London / midday Tokyo)
--
-- Each tick runs a 10-turn salon with a 1-image cap. Three ticks
-- × 10 turns × ~$0.08/turn ≈ $2.40/day = ~$72/month.
--
-- The endpoint auth uses the project anon key in the `apikey`
-- header (same pattern as mnemos-daily-tick / sweep-sessions).
-- ============================================================

-- Idempotent: drop any prior versions of these jobs before
-- re-scheduling, so re-running this migration is safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gathering-tick-morning') THEN
    PERFORM cron.unschedule('gathering-tick-morning');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gathering-tick-afternoon') THEN
    PERFORM cron.unschedule('gathering-tick-afternoon');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gathering-tick-evening') THEN
    PERFORM cron.unschedule('gathering-tick-evening');
  END IF;
END $$;

-- ─── morning gathering ─────────────────────────────────────────
SELECT cron.schedule(
  'gathering-tick-morning',
  '0 14 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mnemos.chat/api/public/hooks/gathering-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aGNvZmp4c2htZnJ4eWNqc2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1ODEsImV4cCI6MjA5MzIxNzU4MX0.OLwHUdzaO2UojolS5ZXRn3CsH4PKha1NysXuT8wvAWE'
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'slot', 'morning'
    )
  );
  $cron$
);

-- ─── afternoon gathering ───────────────────────────────────────
SELECT cron.schedule(
  'gathering-tick-afternoon',
  '0 20 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mnemos.chat/api/public/hooks/gathering-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aGNvZmp4c2htZnJ4eWNqc2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1ODEsImV4cCI6MjA5MzIxNzU4MX0.OLwHUdzaO2UojolS5ZXRn3CsH4PKha1NysXuT8wvAWE'
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'slot', 'afternoon'
    )
  );
  $cron$
);

-- ─── evening gathering ─────────────────────────────────────────
SELECT cron.schedule(
  'gathering-tick-evening',
  '0 3 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mnemos.chat/api/public/hooks/gathering-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aGNvZmp4c2htZnJ4eWNqc2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1ODEsImV4cCI6MjA5MzIxNzU4MX0.OLwHUdzaO2UojolS5ZXRn3CsH4PKha1NysXuT8wvAWE'
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'slot', 'evening'
    )
  );
  $cron$
);
