-- /chat/the-round group chat surface — schema additions.
--
-- Two columns added, both nullable, both safe defaults for existing
-- rows. Existing solo-chat behavior is unchanged.
--
-- sessions.umbrella_session_id — when set, this row is a "shadow"
--   session belonging to a parent (umbrella) round session. Each
--   round session has one umbrella row (resident_id='the-round')
--   plus one shadow row per participating resident. The umbrella
--   holds the visible transcript; the shadows are what observeExchange
--   and consolidateSession act on so each resident's Mnemos still
--   grows from a normal-shaped (visitor, resident) session.
--
-- turns.speaker_resident_id — only set for turns inside the umbrella
--   session, so the UI can color-attribute each bubble. Solo-chat
--   turns leave this NULL (the session.resident_id already tells you
--   who spoke).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS umbrella_session_id uuid NULL
    REFERENCES public.sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS sessions_umbrella_session_id_idx
  ON public.sessions(umbrella_session_id)
  WHERE umbrella_session_id IS NOT NULL;

ALTER TABLE public.turns
  ADD COLUMN IF NOT EXISTS speaker_resident_id text NULL;

CREATE INDEX IF NOT EXISTS turns_speaker_resident_id_idx
  ON public.turns(speaker_resident_id)
  WHERE speaker_resident_id IS NOT NULL;