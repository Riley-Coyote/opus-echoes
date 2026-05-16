CREATE TABLE public.turn_artifacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turn_id uuid NOT NULL,
  session_id uuid NOT NULL,
  resident_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('svg', 'ascii', 'image')),
  body text,
  image_path text,
  caption text,
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_turn_artifacts_session ON public.turn_artifacts(session_id);
CREATE INDEX idx_turn_artifacts_turn ON public.turn_artifacts(turn_id);

ALTER TABLE public.turn_artifacts ENABLE ROW LEVEL SECURITY;

-- Public read for artifacts whose session is closed (shared transcripts).
CREATE POLICY "turn_artifacts readable when session closed"
ON public.turn_artifacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = turn_artifacts.session_id AND s.closed_at IS NOT NULL
  )
);