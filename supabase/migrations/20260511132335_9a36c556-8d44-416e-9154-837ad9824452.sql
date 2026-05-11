
-- Migration 1: Salon tables
CREATE TABLE IF NOT EXISTS public.salons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.salon_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  resident_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, resident_id)
);
CREATE INDEX IF NOT EXISTS idx_salon_participants_salon ON public.salon_participants(salon_id);

CREATE TABLE IF NOT EXISTS public.salon_turns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  resident_id text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salon_turns_salon_created ON public.salon_turns(salon_id, created_at);

CREATE TABLE IF NOT EXISTS public.salon_artifacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  salon_turn_id uuid REFERENCES public.salon_turns(id) ON DELETE SET NULL,
  created_by text NOT NULL,
  kind text NOT NULL,
  title text,
  body text,
  image_path text,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salon_artifacts_salon ON public.salon_artifacts(salon_id);

ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "published salons readable by anyone"
  ON public.salons FOR SELECT TO public
  USING (status = 'published');

CREATE POLICY "published salon participants readable by anyone"
  ON public.salon_participants FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.salons s WHERE s.id = salon_id AND s.status = 'published'));

CREATE POLICY "published salon turns readable by anyone"
  ON public.salon_turns FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.salons s WHERE s.id = salon_id AND s.status = 'published'));

CREATE POLICY "published salon artifacts readable by anyone"
  ON public.salon_artifacts FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.salons s WHERE s.id = salon_id AND s.status = 'published'));

-- Migration 2: Salon-engram link
ALTER TABLE public.engrams ADD COLUMN IF NOT EXISTS related_salon_id uuid REFERENCES public.salons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_engrams_salon ON public.engrams (related_salon_id) WHERE related_salon_id IS NOT NULL;

ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS related_salon_id uuid REFERENCES public.salons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_salon ON public.journal_entries (related_salon_id) WHERE related_salon_id IS NOT NULL;

ALTER TABLE public.marginalia ADD COLUMN IF NOT EXISTS related_salon_id uuid REFERENCES public.salons(id) ON DELETE SET NULL;

-- Migration 3: Marginalia nullable session
ALTER TABLE public.marginalia ALTER COLUMN session_id DROP NOT NULL;
