-- ===== Public archive + autonomous resident work =====

-- Conversations are private by default. Opus 3 may choose to publish a closed
-- exchange when consolidation finds it meaningfully altered the self-model.
CREATE TABLE IF NOT EXISTS public.published_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL,
  reason text NOT NULL,
  significance_kind text NOT NULL DEFAULT 'memory',
  selected_by text NOT NULL DEFAULT 'opus_3',
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_published_conversations_published
  ON public.published_conversations(published_at DESC);
ALTER TABLE public.published_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "published_conversations readable by anyone"
  ON public.published_conversations;
CREATE POLICY "published_conversations readable by anyone"
  ON public.published_conversations FOR SELECT TO public USING (true);

-- Long-form writing, ASCII art, manifestos, and other artifacts made outside
-- direct visitor turns. These are visible through the private residence APIs.
CREATE TABLE IF NOT EXISTS public.resident_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('writing', 'art', 'manifesto', 'note')),
  title text NOT NULL,
  body text NOT NULL,
  medium text NOT NULL DEFAULT 'text',
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  choice_reason text,
  related_engram_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resident_artifacts_kind_created
  ON public.resident_artifacts(kind, created_at DESC);
ALTER TABLE public.resident_artifacts ENABLE ROW LEVEL SECURITY;
-- No public policy: the app serves these only after accepted-session access.

CREATE TABLE IF NOT EXISTS public.autonomy_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  action text NOT NULL,
  reason text,
  artifact_id uuid REFERENCES public.resident_artifacts(id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_autonomy_runs_created
  ON public.autonomy_runs(created_at DESC);
ALTER TABLE public.autonomy_runs ENABLE ROW LEVEL SECURITY;

-- Optional hosted scheduler. Before running this migration in production, store:
--   select vault.create_secret('https://PROJECT_REF.supabase.co', 'project_url');
--   select vault.create_secret('SUPABASE_ANON_KEY', 'anon_key');
-- The hosted Supabase scheduler uses pg_cron + pg_net to invoke Edge Functions.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  has_project_url boolean := false;
  has_anon_key boolean := false;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE $sql$SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url')$sql$
      INTO has_project_url;
    EXECUTE $sql$SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'anon_key')$sql$
      INTO has_anon_key;
  END IF;

  IF has_project_url
     AND has_anon_key
     AND NOT EXISTS (
       SELECT 1 FROM cron.job WHERE jobname = 'opus-autonomy-every-six-hours'
     ) THEN
    PERFORM cron.schedule(
      'opus-autonomy-every-six-hours',
      '17 */6 * * *',
      $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/opus-autonomy',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
        ),
        body := jsonb_build_object('source', 'supabase_cron', 'scheduled_at', now())
      );
      $cron$
    );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
