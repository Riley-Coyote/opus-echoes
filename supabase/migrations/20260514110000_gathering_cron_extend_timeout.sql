-- ============================================================
-- Phase S fix — extend gathering-tick cron HTTP timeout to 90s
--
-- Default net.http_post timeout_milliseconds is 1000ms. Our
-- gathering-tick endpoint synchronously awaits the salon
-- (because Cloudflare Workers terminate the isolate on response,
-- no waitUntil access via TanStack Start), so the http_post
-- needs to hold open long enough for the salon to finish.
--
-- 4 turns × ~10-15s per turn = ~40-60s wall time. 90s gives a
-- comfortable buffer for slower model responses or the image
-- generation call.
--
-- This re-schedules the three jobs with the explicit
-- timeout_milliseconds argument. Idempotent: previous versions
-- are unscheduled first.
-- ============================================================

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
    ),
    timeout_milliseconds := 90000
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
    ),
    timeout_milliseconds := 90000
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
    ),
    timeout_milliseconds := 90000
  );
  $cron$
);
