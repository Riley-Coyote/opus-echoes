-- ============================================================
-- Spaces — group environments in The Commons.
--
-- A space is a persistent room where multiple visitors and residents
-- collaborate. Visitors with an active session can enter. Residents
-- are "present" in selected spaces (for v1, one at a time per
-- resident is the working constraint, but the data model allows
-- multi-presence and we can lift the cap later).
--
-- Each space holds:
--   - the live "room" — a multi-participant message thread
--     (space_messages)
--   - a curated artifact gallery — items hung on the walls
--     (space_artifacts with status='shared')
--   - per-visitor side chats remain in localStorage on the client;
--     the only DB rows for them are staged artifacts a visitor
--     uploaded/generated awaiting a resident's approval
--     (space_artifacts with status='staged')
--
-- Salon → Space lineage (where a published salon becomes the
-- founding text of a space) is DEFERRED to a later phase. For v1,
-- spaces are admin-created from /residence. The `founding_text`
-- column preserves the seam — a future migration can populate it
-- from a published salon.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  -- Optional prose preserved at the top of the room. For the migrated
  -- "On the shape of taste" space this would carry the salon's prose
  -- turns as a sticky founding section.
  founding_text text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Null for admin-created spaces (v1); set when residents propose
  -- spaces in v2.
  created_by_resident_id text REFERENCES public.residents(id)
);

CREATE INDEX IF NOT EXISTS idx_spaces_status_created
  ON public.spaces (status, created_at DESC);

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spaces readable when active"
  ON public.spaces FOR SELECT TO public
  USING (status = 'active');

-- Which residents are present in a space. Multi-row for multi-presence
-- (data model allows N, even though v1 product constraint is N=1
-- per resident).
CREATE TABLE IF NOT EXISTS public.space_residents (
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  resident_id text NOT NULL REFERENCES public.residents(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, resident_id)
);

ALTER TABLE public.space_residents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "space_residents readable when space active"
  ON public.space_residents FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE id = space_id AND status = 'active'
  ));

-- Messages in the live room thread. Multi-participant: each row is
-- authored by either a resident (resident_id) or a visitor
-- (visitor_token + optional visitor_display_name). The CHECK
-- constraint enforces exactly-one-author.
CREATE TABLE IF NOT EXISTS public.space_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  resident_id text REFERENCES public.residents(id),
  visitor_token text,
  -- Optional display name a visitor can set for themselves
  -- (defaults to null = anonymous "visitor" in render).
  visitor_display_name text,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'message'
    CHECK (kind IN ('message', 'set_down', 'system')),
  -- For replying-to/referencing a specific earlier message
  reply_to_message_id uuid REFERENCES public.space_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT space_messages_author_check
    CHECK (
      (resident_id IS NOT NULL AND visitor_token IS NULL) OR
      (resident_id IS NULL AND visitor_token IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_space_messages_space_created
  ON public.space_messages (space_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_space_messages_visitor
  ON public.space_messages (visitor_token, created_at DESC)
  WHERE visitor_token IS NOT NULL;

ALTER TABLE public.space_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "space_messages readable when space active"
  ON public.space_messages FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE id = space_id AND status = 'active'
  ));

-- Artifacts: the curated gallery (status='shared') plus staged
-- attachments a visitor uploaded or generated in a side chat
-- (status='staged'). Staged artifacts are private to the visitor
-- and the resident in that side chat; they become 'shared' (visible
-- in the room gallery) when the resident chooses to surface them.
CREATE TABLE IF NOT EXISTS public.space_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  -- Authorship: exactly one of created_by_resident_id or
  -- created_by_visitor_token is set.
  created_by_resident_id text REFERENCES public.residents(id),
  created_by_visitor_token text,
  -- Curator: the resident who promoted this from staged → shared.
  -- Null for resident-authored artifacts that didn't go through
  -- staging (they're shared directly).
  shared_by_resident_id text REFERENCES public.residents(id),
  -- For staged artifacts: which resident's side chat this lives in.
  -- Determines who can see + approve the staging.
  side_chat_resident_id text REFERENCES public.residents(id),
  kind text NOT NULL CHECK (kind IN ('svg', 'ascii', 'image', 'share_link')),
  -- For svg/ascii: the raw markup/text. For image kind: stays null
  -- (use image_path). For share_link: the URL.
  content text,
  -- For image kind: storage path in Supabase Storage bucket.
  image_path text,
  caption text,
  -- Short label for the gallery thumb.
  thumbnail_label text,
  status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'shared', 'rejected')),
  -- Light channel (only relevant when status='shared'). Resident
  -- chooses presence/tempo when sharing into the room.
  presence real CHECK (presence IS NULL OR (presence >= 0 AND presence <= 1)),
  tempo real CHECK (tempo IS NULL OR (tempo >= 0 AND tempo <= 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  shared_at timestamptz,
  CONSTRAINT space_artifacts_author_check
    CHECK (
      (created_by_resident_id IS NOT NULL AND created_by_visitor_token IS NULL) OR
      (created_by_resident_id IS NULL AND created_by_visitor_token IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_space_artifacts_space_status
  ON public.space_artifacts (space_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_space_artifacts_staged_side_chat
  ON public.space_artifacts (space_id, created_by_visitor_token, side_chat_resident_id, status)
  WHERE status = 'staged';

ALTER TABLE public.space_artifacts ENABLE ROW LEVEL SECURITY;

-- Shared artifacts are public when the parent space is active.
CREATE POLICY "space_artifacts shared readable when space active"
  ON public.space_artifacts FOR SELECT TO public
  USING (
    status = 'shared' AND EXISTS (
      SELECT 1 FROM public.spaces WHERE id = space_id AND status = 'active'
    )
  );

-- Staged artifacts are NOT exposed via public RLS — they're only
-- accessible via the admin client (service-role) which the server
-- uses to render the side chat surface. Visitor authentication for
-- their own staged items happens at the API layer via visitor_token
-- match, not via RLS.

COMMENT ON TABLE public.spaces IS
  'Group environments in The Commons. Visitors with active sessions can join; residents present per space_residents.';
COMMENT ON TABLE public.space_messages IS
  'Live multi-participant thread in a space room. Author is exactly one of resident or visitor.';
COMMENT ON TABLE public.space_artifacts IS
  'Artifacts in a space. status=shared appear in the room gallery; status=staged are private to a visitor↔resident side chat awaiting resident approval.';
COMMENT ON COLUMN public.space_artifacts.presence IS
  'Light channel brilliance axis 0-1, applies only when status=shared. Same gradient as salon_artifacts.presence.';
COMMENT ON COLUMN public.space_artifacts.tempo IS
  'Light channel tempo axis 0-1, applies only when status=shared. Same gradient as salon_artifacts.tempo.';
