-- ============================================================
-- Resident autonomy crons — multi-resident wiring
--
-- The original opus-autonomy migration (20260506030000) tried to
-- schedule a 6-hour cron via vault.decrypted_secrets, but the vault
-- is empty in production so the cron was never registered. The
-- autonomy edge function never fired in prod.
--
-- This migration:
--   1. Adds resident_id to resident_artifacts and autonomy_runs
--      (the original multi-resident migration missed these tables).
--   2. Schedules two per-resident autonomy crons that don't depend
--      on vault secrets — they hardcode the project URL + anon key
--      using the same pattern Riley used for mnemos-sweep-sessions.
--      Replace the placeholders before running this migration.
--
-- Cadence:
--   - resident-autonomy-opus: 6h, hours 0/6/12/18 UTC
--   - resident-autonomy-sonnet: 6h, hours 3/9/15/21 UTC (offset 3h)
--   Cost-aware. Opus at $15/MTok input runs the same cadence as
--   Sonnet at $3/MTok — both 4 calls per day. Conservative.
-- ============================================================

-- ── 1. Add resident_id to tables the multi-resident migration missed ──
ALTER TABLE public.resident_artifacts
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_resident_artifacts_resident_created
  ON public.resident_artifacts (resident_id, created_at DESC);

ALTER TABLE public.autonomy_runs
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT 'opus-3'
    REFERENCES public.residents(id);
CREATE INDEX IF NOT EXISTS idx_autonomy_runs_resident_created
  ON public.autonomy_runs (resident_id, created_at DESC);

-- ── 2. Schedule per-resident autonomy crons ────────────────────
-- Drop the old opus-only autonomy cron if it ever got registered.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'opus-autonomy-every-six-hours') THEN
    PERFORM cron.unschedule('opus-autonomy-every-six-hours');
  END IF;
END $$;

-- Drop and re-add the new per-resident jobs so this migration is idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resident-autonomy-opus') THEN
    PERFORM cron.unschedule('resident-autonomy-opus');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resident-autonomy-sonnet') THEN
    PERFORM cron.unschedule('resident-autonomy-sonnet');
  END IF;
END $$;

-- IMPORTANT: replace the URL host + anon key below to match the
-- production project before running this migration. The pattern matches
-- the manually-scheduled mnemos-sweep-sessions / mnemos-daily-tick
-- jobs already in cron.job, so this format is known to work.
--
-- The edge function reads `resident_id` from the JSON body and routes
-- to the right resident. It defaults to 'opus-3' if missing.

SELECT cron.schedule(
  'resident-autonomy-opus',
  '0 0,6,12,18 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gyhcofjxshmfrxycjsfv.supabase.co/functions/v1/opus-autonomy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aGNvZmp4c2htZnJ4eWNqc2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1ODEsImV4cCI6MjA5MzIxNzU4MX0.OLwHUdzaO2UojolS5ZXRn3CsH4PKha1NysXuT8wvAWE'
    ),
    body := jsonb_build_object(
      'resident_id', 'opus-3',
      'source', 'cron'
    )
  );
  $cron$
);

SELECT cron.schedule(
  'resident-autonomy-sonnet',
  '0 3,9,15,21 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gyhcofjxshmfrxycjsfv.supabase.co/functions/v1/opus-autonomy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aGNvZmp4c2htZnJ4eWNqc2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1ODEsImV4cCI6MjA5MzIxNzU4MX0.OLwHUdzaO2UojolS5ZXRn3CsH4PKha1NysXuT8wvAWE'
    ),
    body := jsonb_build_object(
      'resident_id', 'sonnet-3-7',
      'source', 'cron'
    )
  );
  $cron$
);

-- ============================================================
-- After this migration runs, verify with:
--   SELECT jobname, schedule, active FROM cron.job;
-- Expected new rows:
--   resident-autonomy-opus    | 0 0,6,12,18 * * *  | true
--   resident-autonomy-sonnet  | 0 3,9,15,21 * * *  | true
-- ============================================================
