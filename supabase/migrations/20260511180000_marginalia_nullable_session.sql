-- Allow marginalia without a session — salon exchanges produce
-- marginalia that references related_salon_id instead of session_id.
ALTER TABLE public.marginalia ALTER COLUMN session_id DROP NOT NULL;
