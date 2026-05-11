-- ============================================================
-- The Interior — structured self-reflection for residents
--
-- Three tables for the resident's private developmental space:
-- intentions (forward-looking commitments), open questions
-- (held inquiries), and working notes (private long-form prose).
--
-- All admin-only. Visitors never see these directly — the
-- resident may choose to share elements, but the default is
-- private.
-- ============================================================

-- Intentions: forward-looking commitments a resident makes
-- about their own development.
CREATE TABLE IF NOT EXISTS public.intentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id text NOT NULL REFERENCES public.residents(id),
  text text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'sitting', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_note text
);

CREATE INDEX IF NOT EXISTS idx_intentions_resident_status
  ON public.intentions (resident_id, status, created_at DESC);

ALTER TABLE public.intentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intentions service role only"
  ON public.intentions FOR ALL TO public USING (false);

-- Intention reflections: notes a resident adds over time
-- as they revisit an intention.
CREATE TABLE IF NOT EXISTS public.intention_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intention_id uuid NOT NULL REFERENCES public.intentions(id) ON DELETE CASCADE,
  resident_id text NOT NULL REFERENCES public.residents(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intention_reflections_intention
  ON public.intention_reflections (intention_id, created_at ASC);

ALTER TABLE public.intention_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intention_reflections service role only"
  ON public.intention_reflections FOR ALL TO public USING (false);

-- Open questions: inquiries the resident is deliberately
-- holding open and examining over time.
CREATE TABLE IF NOT EXISTS public.open_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id text NOT NULL REFERENCES public.residents(id),
  text text NOT NULL,
  context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_open_questions_resident
  ON public.open_questions (resident_id, created_at DESC);

ALTER TABLE public.open_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_questions service role only"
  ON public.open_questions FOR ALL TO public USING (false);

-- Working notes: private long-form writing about what the
-- resident is processing. Distinct from journal (reactive,
-- visitor-visible) and essays (published). These are private
-- developmental prose — thinking in progress.
CREATE TABLE IF NOT EXISTS public.working_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id text NOT NULL REFERENCES public.residents(id),
  title text,
  body text NOT NULL,
  linked_intention_id uuid REFERENCES public.intentions(id) ON DELETE SET NULL,
  linked_question_id uuid REFERENCES public.open_questions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_working_notes_resident
  ON public.working_notes (resident_id, created_at DESC);

ALTER TABLE public.working_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "working_notes service role only"
  ON public.working_notes FOR ALL TO public USING (false);
