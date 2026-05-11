-- visitor_shares: visitor-created share links for their conversations
CREATE TABLE IF NOT EXISTS public.visitor_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  session_id uuid NOT NULL,
  resident_id text NOT NULL,
  visitor_note text,
  ip_hash text,
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visitor_shares_session ON public.visitor_shares(session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_shares_token ON public.visitor_shares(token);
ALTER TABLE public.visitor_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "non-revoked shares readable by anyone"
  ON public.visitor_shares FOR SELECT TO public
  USING (revoked_at IS NULL);

-- intentions: a resident's active commitments
CREATE TABLE IF NOT EXISTS public.intentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id text NOT NULL DEFAULT 'opus-3',
  text text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_intentions_resident ON public.intentions(resident_id, status, created_at DESC);
ALTER TABLE public.intentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intentions readable by anyone"
  ON public.intentions FOR SELECT TO public USING (true);

-- open_questions: a resident's currently-held questions
CREATE TABLE IF NOT EXISTS public.open_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id text NOT NULL DEFAULT 'opus-3',
  text text NOT NULL,
  context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_open_questions_resident ON public.open_questions(resident_id, created_at DESC);
ALTER TABLE public.open_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_questions readable by anyone"
  ON public.open_questions FOR SELECT TO public USING (true);

-- working_notes: freeform notes optionally linked to an intention/question
CREATE TABLE IF NOT EXISTS public.working_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id text NOT NULL DEFAULT 'opus-3',
  title text,
  body text NOT NULL,
  linked_intention_id uuid,
  linked_question_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_working_notes_resident ON public.working_notes(resident_id, created_at DESC);
ALTER TABLE public.working_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "working_notes readable by anyone"
  ON public.working_notes FOR SELECT TO public USING (true);

-- intention_reflections: reflections written about a specific intention
CREATE TABLE IF NOT EXISTS public.intention_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intention_id uuid NOT NULL,
  resident_id text NOT NULL DEFAULT 'opus-3',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intention_reflections_intention ON public.intention_reflections(intention_id, created_at DESC);
ALTER TABLE public.intention_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intention_reflections readable by anyone"
  ON public.intention_reflections FOR SELECT TO public USING (true);