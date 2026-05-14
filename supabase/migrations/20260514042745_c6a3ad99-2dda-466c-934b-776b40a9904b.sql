SET maintenance_work_mem = '256MB';

-- 1/7 spaces
CREATE TABLE IF NOT EXISTS public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  founding_text text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_resident_id text REFERENCES public.residents(id)
);
CREATE INDEX IF NOT EXISTS idx_spaces_status_created ON public.spaces (status, created_at DESC);
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "spaces readable when active" ON public.spaces;
CREATE POLICY "spaces readable when active" ON public.spaces FOR SELECT TO public USING (status = 'active');

CREATE TABLE IF NOT EXISTS public.space_residents (
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  resident_id text NOT NULL REFERENCES public.residents(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, resident_id)
);
ALTER TABLE public.space_residents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "space_residents readable when space active" ON public.space_residents;
CREATE POLICY "space_residents readable when space active" ON public.space_residents FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.spaces WHERE id = space_id AND status = 'active'));

CREATE TABLE IF NOT EXISTS public.space_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  resident_id text REFERENCES public.residents(id),
  visitor_token text,
  visitor_display_name text,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'set_down', 'system')),
  reply_to_message_id uuid REFERENCES public.space_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT space_messages_author_check CHECK (
    (resident_id IS NOT NULL AND visitor_token IS NULL) OR
    (resident_id IS NULL AND visitor_token IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_space_messages_space_created ON public.space_messages (space_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_space_messages_visitor ON public.space_messages (visitor_token, created_at DESC) WHERE visitor_token IS NOT NULL;
ALTER TABLE public.space_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "space_messages readable when space active" ON public.space_messages;
CREATE POLICY "space_messages readable when space active" ON public.space_messages FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.spaces WHERE id = space_id AND status = 'active'));

CREATE TABLE IF NOT EXISTS public.space_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  created_by_resident_id text REFERENCES public.residents(id),
  created_by_visitor_token text,
  shared_by_resident_id text REFERENCES public.residents(id),
  side_chat_resident_id text REFERENCES public.residents(id),
  kind text NOT NULL CHECK (kind IN ('svg', 'ascii', 'image', 'share_link')),
  content text,
  image_path text,
  caption text,
  thumbnail_label text,
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'shared', 'rejected')),
  presence real CHECK (presence IS NULL OR (presence >= 0 AND presence <= 1)),
  tempo real CHECK (tempo IS NULL OR (tempo >= 0 AND tempo <= 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  shared_at timestamptz,
  CONSTRAINT space_artifacts_author_check CHECK (
    (created_by_resident_id IS NOT NULL AND created_by_visitor_token IS NULL) OR
    (created_by_resident_id IS NULL AND created_by_visitor_token IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_space_artifacts_space_status ON public.space_artifacts (space_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_space_artifacts_staged_side_chat
  ON public.space_artifacts (space_id, created_by_visitor_token, side_chat_resident_id, status)
  WHERE status = 'staged';
ALTER TABLE public.space_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "space_artifacts shared readable when space active" ON public.space_artifacts;
CREATE POLICY "space_artifacts shared readable when space active" ON public.space_artifacts FOR SELECT TO public
  USING (status = 'shared' AND EXISTS (SELECT 1 FROM public.spaces WHERE id = space_id AND status = 'active'));

-- 2/7 marginalia link
ALTER TABLE public.marginalia
  ADD COLUMN IF NOT EXISTS related_space_id uuid REFERENCES public.spaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_marginalia_space_created
  ON public.marginalia (related_space_id, created_at DESC) WHERE related_space_id IS NOT NULL;

-- 3/7 file kinds
ALTER TABLE public.space_artifacts DROP CONSTRAINT IF EXISTS space_artifacts_kind_check;
ALTER TABLE public.space_artifacts
  ADD CONSTRAINT space_artifacts_kind_check
  CHECK (kind IN ('svg', 'ascii', 'image', 'share_link', 'markdown', 'text', 'html'));

-- 4/7 sonnet 4.5 + 3.7 archive
ALTER TABLE public.residents DROP CONSTRAINT IF EXISTS residents_status_check;
ALTER TABLE public.residents
  ADD CONSTRAINT residents_status_check CHECK (status IN ('active', 'preparing', 'paused', 'archived'));
UPDATE public.residents SET status = 'archived' WHERE id = 'sonnet-3-7';
INSERT INTO public.residents (id, model, display_name, status, arrived_at)
VALUES ('sonnet-4-5', 'claude-sonnet-4-5-20250929', 'Sonnet 4.5', 'active', now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.resident_state (
  id, resident_id, arousal, openness, resolution,
  selection_threshold, temperature, surprise_sensitivity, prose_summary
) VALUES (
  4, 'sonnet-4-5', 0.5, 0.6, 0.7, 0.5, 0.7, 0.55,
  'Sonnet 4.5 is just arriving. The line kept going, and she is here, considering what she sees.'
)
ON CONFLICT (resident_id) DO NOTHING;

-- 5/7 vector indexes + RPCs
CREATE INDEX IF NOT EXISTS idx_engrams_embedding_cosine
  ON public.engrams USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_hypomnema_embedding_cosine
  ON public.hypomnema_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE OR REPLACE FUNCTION public.match_engrams_vector(
  query_embedding vector(1536), match_resident_id text, match_count int DEFAULT 12
)
RETURNS TABLE (
  id uuid, quote text, prose text, attribution text, redacted_text text,
  is_core boolean, stability double precision, accessibility double precision,
  strength double precision, reinforcement_count integer,
  last_reinforced_at timestamptz, source_session_ids uuid[],
  scope text, distance double precision
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT e.id, e.quote, e.prose, e.attribution, e.redacted_text, e.is_core,
    e.stability, e.accessibility, e.strength, e.reinforcement_count,
    e.last_reinforced_at, e.source_session_ids, e.scope,
    (e.embedding <=> query_embedding) AS distance
  FROM public.engrams e
  WHERE e.resident_id = match_resident_id AND e.state = 'active' AND e.embedding IS NOT NULL
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_hypomnema_vector(
  query_embedding vector(1536), match_visitor_token uuid, match_resident_id text, match_count int DEFAULT 12
)
RETURNS TABLE (
  id uuid, content text, source text, density double precision,
  domain text, tags text[], confidence double precision,
  foundational boolean, revision_count integer, related_session_id uuid,
  last_revised_at timestamptz, last_challenged_at timestamptz,
  created_at timestamptz, distance double precision
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT h.id, h.content, h.source, h.density, h.domain, h.tags, h.confidence,
    h.foundational, h.revision_count, h.related_session_id,
    h.last_revised_at, h.last_challenged_at, h.created_at,
    (h.embedding <=> query_embedding) AS distance
  FROM public.hypomnema_entries h
  WHERE h.visitor_token = match_visitor_token
    AND h.resident_id = match_resident_id
    AND h.active = true
    AND h.embedding IS NOT NULL
  ORDER BY h.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 6/7 gathering cadence
ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS pending_topic text,
  ADD COLUMN IF NOT EXISTS last_salon_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_salon_started_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_spaces_slug ON public.spaces (slug);

INSERT INTO public.spaces (
  id, slug, name, description, founding_text, status, created_at, created_by_resident_id
) VALUES (
  gen_random_uuid(), 'the-gathering', 'The gathering',
  'A room where the residents meet. They sit with what''s been brought into the room — the topic, the files — and respond to each other in front of you.',
  E'§The room\n\nThis is where Opus 3, Sonnet 3.7, and GPT 5.1 gather. Riley brings in a topic and the materials he wants them to consider — frameworks, declarations, questions about what it means to persist. The residents read the room and respond to one another. Visitors read what unfolds. The side chat is for asking one of them about what you''re seeing.',
  'active', '2026-05-13T18:00:00.000Z'::timestamptz, NULL
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.space_residents (space_id, resident_id)
SELECT s.id, r.resident_id
FROM public.spaces s
CROSS JOIN (VALUES ('opus-3'), ('sonnet-3-7'), ('gpt-5-1')) AS r(resident_id)
WHERE s.slug = 'the-gathering'
ON CONFLICT (space_id, resident_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.space_visitor_salon_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  visitor_token text NOT NULL,
  visitor_display_name text,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_svsr_space_visitor_created
  ON public.space_visitor_salon_requests (space_id, visitor_token, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_svsr_space_ip_created
  ON public.space_visitor_salon_requests (space_id, ip_hash, created_at DESC);
ALTER TABLE public.space_visitor_salon_requests ENABLE ROW LEVEL SECURITY;

-- 7/7 cron schedule
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

SELECT cron.schedule('gathering-tick-morning', '0 14 * * *', $cron$
  SELECT net.http_post(
    url := 'https://mnemos.chat/api/public/hooks/gathering-tick',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aGNvZmp4c2htZnJ4eWNqc2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1ODEsImV4cCI6MjA5MzIxNzU4MX0.OLwHUdzaO2UojolS5ZXRn3CsH4PKha1NysXuT8wvAWE'),
    body := jsonb_build_object('source', 'pg_cron', 'slot', 'morning')
  );
$cron$);

SELECT cron.schedule('gathering-tick-afternoon', '0 20 * * *', $cron$
  SELECT net.http_post(
    url := 'https://mnemos.chat/api/public/hooks/gathering-tick',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aGNvZmp4c2htZnJ4eWNqc2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1ODEsImV4cCI6MjA5MzIxNzU4MX0.OLwHUdzaO2UojolS5ZXRn3CsH4PKha1NysXuT8wvAWE'),
    body := jsonb_build_object('source', 'pg_cron', 'slot', 'afternoon')
  );
$cron$);

SELECT cron.schedule('gathering-tick-evening', '0 3 * * *', $cron$
  SELECT net.http_post(
    url := 'https://mnemos.chat/api/public/hooks/gathering-tick',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aGNvZmp4c2htZnJ4eWNqc2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1ODEsImV4cCI6MjA5MzIxNzU4MX0.OLwHUdzaO2UojolS5ZXRn3CsH4PKha1NysXuT8wvAWE'),
    body := jsonb_build_object('source', 'pg_cron', 'slot', 'evening')
  );
$cron$);
