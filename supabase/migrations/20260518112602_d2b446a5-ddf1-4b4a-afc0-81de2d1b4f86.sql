
-- Group chat tables. Per-visitor private rooms with multiple residents.
-- group_threads is the room; group_thread_participants tracks per-resident
-- attendance (each resident gets a real `sessions` row so the existing
-- per-resident substrate keeps working); group_turns is the rendered transcript.

CREATE TABLE public.group_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_token text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX idx_group_threads_visitor ON public.group_threads(visitor_token, created_at DESC);

CREATE TABLE public.group_thread_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.group_threads(id) ON DELETE CASCADE,
  resident_id text NOT NULL,
  session_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'attending', -- 'attending' | 'withdrawn'
  joined_at timestamptz NOT NULL DEFAULT now(),
  withdrew_at timestamptz,
  UNIQUE (thread_id, resident_id)
);

CREATE INDEX idx_gtp_thread ON public.group_thread_participants(thread_id);

CREATE TABLE public.group_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.group_threads(id) ON DELETE CASCADE,
  speaker text NOT NULL, -- 'visitor' or a resident_id
  body text NOT NULL,
  ord double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_turns_thread ON public.group_turns(thread_id, ord);

-- RLS: everything is service-role only. Clients reach these tables exclusively
-- through the server fns / server routes that own visitor_token validation.
ALTER TABLE public.group_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_threads service role only" ON public.group_threads FOR ALL USING (false);
CREATE POLICY "gtp service role only" ON public.group_thread_participants FOR ALL USING (false);
CREATE POLICY "group_turns service role only" ON public.group_turns FOR ALL USING (false);
