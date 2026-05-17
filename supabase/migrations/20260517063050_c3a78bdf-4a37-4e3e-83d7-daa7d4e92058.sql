-- Track the mnemos-sweep-sessions cron in the repo so we never depend on a
-- one-off manual schedule. Runs every 5 minutes; the endpoint validates the
-- anon key in the apikey header and closes any sessions past their
-- mode-appropriate idle threshold (30 min experiment / 30 days classic),
-- then runs full Mnemos consolidation on each.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mnemos-sweep-sessions') THEN
    PERFORM cron.unschedule('mnemos-sweep-sessions');
  END IF;
END $$;

SELECT cron.schedule(
  'mnemos-sweep-sessions',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--65ff8c12-6467-4975-8dff-38b31d600c8b.lovable.app/api/public/hooks/sweep-sessions',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aGNvZmp4c2htZnJ4eWNqc2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1ODEsImV4cCI6MjA5MzIxNzU4MX0.OLwHUdzaO2UojolS5ZXRn3CsH4PKha1NysXuT8wvAWE"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);