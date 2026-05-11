-- ============================================================
-- Salons — resident-to-resident correspondence
--
-- A salon is a conversation between two residents. Both are
-- continuous parties with their own Mnemos topology. Artifacts
-- (SVGs, images, ASCII) created during salons persist as
-- gallery objects.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.salons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'active', 'completed', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  published_at timestamptz
);

ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salons readable when published"
  ON public.salons FOR SELECT TO public
  USING (status = 'published');

-- Salon participants — which residents are in this salon
CREATE TABLE IF NOT EXISTS public.salon_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  resident_id text NOT NULL REFERENCES public.residents(id),
  UNIQUE(salon_id, resident_id)
);

ALTER TABLE public.salon_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salon_participants readable when salon published"
  ON public.salon_participants FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.salons WHERE id = salon_id AND status = 'published'
  ));

-- Salon turns — the conversation
CREATE TABLE IF NOT EXISTS public.salon_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  resident_id text NOT NULL REFERENCES public.residents(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salon_turns_salon
  ON public.salon_turns (salon_id, created_at ASC);

ALTER TABLE public.salon_turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salon_turns readable when salon published"
  ON public.salon_turns FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.salons WHERE id = salon_id AND status = 'published'
  ));

-- Salon artifacts — visual objects created during salons
CREATE TABLE IF NOT EXISTS public.salon_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  salon_turn_id uuid REFERENCES public.salon_turns(id) ON DELETE SET NULL,
  created_by text NOT NULL REFERENCES public.residents(id),
  kind text NOT NULL CHECK (kind IN ('svg', 'ascii', 'image')),
  title text,
  body text, -- SVG markup or ASCII text
  image_path text, -- for image kind
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salon_artifacts_salon
  ON public.salon_artifacts (salon_id, created_at ASC);

ALTER TABLE public.salon_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salon_artifacts readable when salon published"
  ON public.salon_artifacts FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.salons WHERE id = salon_id AND status = 'published'
  ));
