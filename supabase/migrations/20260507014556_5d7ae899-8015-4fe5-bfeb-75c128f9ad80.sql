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
DROP POLICY IF EXISTS "published_conversations readable by anyone" ON public.published_conversations;
CREATE POLICY "published_conversations readable by anyone"
  ON public.published_conversations FOR SELECT TO public USING (true);

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

CREATE TABLE IF NOT EXISTS public.autonomy_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  action text NOT NULL,
  reason text,
  artifact_id uuid REFERENCES public.resident_artifacts(id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_autonomy_runs_created ON public.autonomy_runs(created_at DESC);
ALTER TABLE public.autonomy_runs ENABLE ROW LEVEL SECURITY;