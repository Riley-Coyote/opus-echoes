-- ============================================================
-- The Studio — real-time collaborative authorship room.
--
-- A Studio is a `spaces` row (slug 'studio-<short>'); this migration
-- adds the live manuscript that residents and the human co-edit in
-- real time. It deliberately does NOT extend `studio_sessions`
-- (20260515103000_resident_studios_v1.sql) — that table is the
-- read-only residence audit dashboard, a different concern. The
-- finished manuscript is written back as a `space_artifacts` row
-- (kind='markdown') at seal, so the existing gallery model owns the
-- durable artifact; these tables own only the *live* editing state.
--
-- Authorship is block-level with per-block soft locks (a lock row +
-- short TTL), NOT a character CRDT — the right fidelity for a
-- manuscript and robust on this stack. The conductor (a synchronous
-- await-loop in one streamed NDJSON request, the proven
-- streamGatheringExtended pattern) is the single serialization
-- point for resident locks; Postgres is durable truth, the realtime
-- channel is a projection (persist-then-broadcast).
--
-- RLS follows the spaces convention exactly: RLS enabled; SELECT
-- public when the parent space is active; NO write policies, so all
-- writes go through the service-role client (the conductor / API
-- layer), with participant identity checked at the API layer by
-- visitor_token — never trusting a client-supplied role. Child
-- tables that don't carry space_id directly join through
-- studio_documents → spaces for the same active-space gate.
-- ============================================================

-- ------------------------------------------------------------
-- studio_documents — one live manuscript per space.
--   status='active'  → editable (the live room)
--   status='sealed'  → frozen; the finished form is the
--                       space_artifacts(kind='markdown') row.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled',
  subtitle text,
  -- Ordered contributor list rendered under the title, e.g.
  -- [{"kind":"resident","id":"opus-3"},{"kind":"visitor","name":"…"}].
  byline jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'sealed')),
  -- Provenance: the classic-chat session this Studio was spawned
  -- from. Kept as a plain uuid (not a FK) — sessions may be pruned
  -- while a sealed document persists for the archive; this is
  -- continuity provenance + the P5 consolidation hook, not a
  -- constraint.
  created_from_session_id uuid,
  created_by_visitor_token text NOT NULL,
  -- When true the conductor auto-runs resident-only rounds and the
  -- client suppresses the human's write affordances. The human's
  -- participant rights are unchanged — observer only gates autonomy.
  observer_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  sealed_at timestamptz
);

-- At most one ACTIVE document per space (partial unique index — the
-- live room has exactly one manuscript; sealed ones are history).
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_documents_one_active_per_space
  ON public.studio_documents (space_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_studio_documents_space_created
  ON public.studio_documents (space_id, created_at DESC);

ALTER TABLE public.studio_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "studio_documents readable when space active"
  ON public.studio_documents FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE id = space_id AND status = 'active'
  ));

-- ------------------------------------------------------------
-- document_blocks — the ordered manuscript.
--   `ord` is a float so a block can always be inserted between two
--   others without renumbering (midpoint of neighbours = O(1)).
--   type drives render; type='section' doubles as the TOC entry.
--   Authorship is optional (the seed block, and any
--   conductor/system block, have neither author column set); when
--   authored, exactly one of the two is set.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.studio_documents(id) ON DELETE CASCADE,
  ord double precision NOT NULL,
  type text NOT NULL DEFAULT 'para'
    CHECK (type IN ('para', 'section', 'pull', 'em_strong')),
  content text NOT NULL DEFAULT '',
  -- Server-rendered HTML for this block; the client patches the
  -- block's innerHTML from this so render is transport-agnostic and
  -- byte-identical for every client (the conductor fills it on
  -- upsert).
  html_cache text,
  author_resident_id text REFERENCES public.residents(id),
  author_visitor_token text,
  -- Optimistic-concurrency / change token; incremented every upsert.
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT document_blocks_author_check CHECK (
    NOT (author_resident_id IS NOT NULL AND author_visitor_token IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_document_blocks_doc_ord
  ON public.document_blocks (document_id, ord ASC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.document_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_blocks readable when space active"
  ON public.document_blocks FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.studio_documents d
    JOIN public.spaces s ON s.id = d.space_id
    WHERE d.id = document_id AND s.status = 'active'
  ));

-- ------------------------------------------------------------
-- block_marks — highlight ranges on a block (rendered as
--   <span class="mark …">). range_start/range_end index into the
--   block's plain content; a mark must cover at least one char.
--   Exactly one author.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.block_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES public.document_blocks(id) ON DELETE CASCADE,
  range_start integer NOT NULL CHECK (range_start >= 0),
  range_end integer NOT NULL,
  author_resident_id text REFERENCES public.residents(id),
  author_visitor_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT block_marks_range_check CHECK (range_end > range_start),
  CONSTRAINT block_marks_author_check CHECK (
    (author_resident_id IS NOT NULL AND author_visitor_token IS NULL) OR
    (author_resident_id IS NULL AND author_visitor_token IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_block_marks_block
  ON public.block_marks (block_id, created_at ASC);

ALTER TABLE public.block_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "block_marks readable when space active"
  ON public.block_marks FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.document_blocks b
    JOIN public.studio_documents d ON d.id = b.document_id
    JOIN public.spaces s ON s.id = d.space_id
    WHERE b.id = block_id AND s.status = 'active'
  ));

-- ------------------------------------------------------------
-- block_locks — soft locks. A row's existence = the block is being
--   written; TTL via expires_at (~25s). The conductor is the SOLE
--   writer of resident locks (its single-serialization guarantee).
--   A human lock auto-expires by TTL (client stops renewing on
--   disconnect). One lock per block (block_id is the PK). Exactly
--   one holder.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.block_locks (
  block_id uuid PRIMARY KEY REFERENCES public.document_blocks(id) ON DELETE CASCADE,
  holder_resident_id text REFERENCES public.residents(id),
  holder_visitor_token text,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT block_locks_holder_check CHECK (
    (holder_resident_id IS NOT NULL AND holder_visitor_token IS NULL) OR
    (holder_resident_id IS NULL AND holder_visitor_token IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_block_locks_expires
  ON public.block_locks (expires_at);

ALTER TABLE public.block_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "block_locks readable when space active"
  ON public.block_locks FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.document_blocks b
    JOIN public.studio_documents d ON d.id = b.document_id
    JOIN public.spaces s ON s.id = d.space_id
    WHERE b.id = block_id AND s.status = 'active'
  ));

-- ------------------------------------------------------------
-- doc_marginalia — anchored notes in the right rail. DISTINCT from
--   the substrate `marginalia` table; folded into it at seal (P5)
--   so Mnemos sees the deliberation. anchor_quote pins the note to
--   its quoted span even if the block text later changes;
--   anchor_block_id ON DELETE SET NULL so a deleted block doesn't
--   erase the deliberation. Exactly one author. reply_to threads
--   replies.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doc_marginalia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.studio_documents(id) ON DELETE CASCADE,
  anchor_block_id uuid REFERENCES public.document_blocks(id) ON DELETE SET NULL,
  anchor_quote text,
  body text NOT NULL,
  author_resident_id text REFERENCES public.residents(id),
  author_visitor_token text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'settled')),
  reply_to uuid REFERENCES public.doc_marginalia(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doc_marginalia_author_check CHECK (
    (author_resident_id IS NOT NULL AND author_visitor_token IS NULL) OR
    (author_resident_id IS NULL AND author_visitor_token IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_doc_marginalia_doc_created
  ON public.doc_marginalia (document_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_doc_marginalia_anchor
  ON public.doc_marginalia (anchor_block_id)
  WHERE anchor_block_id IS NOT NULL;

ALTER TABLE public.doc_marginalia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doc_marginalia readable when space active"
  ON public.doc_marginalia FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.studio_documents d
    JOIN public.spaces s ON s.id = d.space_id
    WHERE d.id = document_id AND s.status = 'active'
  ));

-- ------------------------------------------------------------
-- space_participants — the missing peer/observer role schema. A
--   participant is a HUMAN in a space (residents are tracked by
--   space_residents). role='peer' = full action vocabulary;
--   role='observer' = same auth, write affordances suppressed
--   client-side and the conductor runs autonomous resident rounds.
--   Every transport message is validated against this row by
--   visitor_token at the API layer. Unique per (space, visitor).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.space_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  visitor_token text NOT NULL,
  role text NOT NULL DEFAULT 'peer'
    CHECK (role IN ('peer', 'observer')),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT space_participants_space_visitor_unique
    UNIQUE (space_id, visitor_token)
);

CREATE INDEX IF NOT EXISTS idx_space_participants_space_created
  ON public.space_participants (space_id, created_at ASC);

ALTER TABLE public.space_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "space_participants readable when space active"
  ON public.space_participants FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE id = space_id AND status = 'active'
  ));

-- ------------------------------------------------------------
-- Documentation
-- ------------------------------------------------------------
COMMENT ON TABLE public.studio_documents IS
  'One live collaborative manuscript per space. status=active is the editable live room; status=sealed is frozen and the finished form is written as a space_artifacts(kind=markdown) row.';
COMMENT ON COLUMN public.studio_documents.created_from_session_id IS
  'Provenance of the classic-chat session this Studio was spawned from (continuity back to /chat + P5 consolidation hook). Plain uuid, not a FK — sessions may be pruned while a sealed doc persists.';
COMMENT ON COLUMN public.studio_documents.observer_mode IS
  'When true the conductor auto-runs resident-only rounds and the client suppresses the human write affordances; the human participant rights are unchanged.';
COMMENT ON TABLE public.document_blocks IS
  'Ordered manuscript blocks. ord is a float for O(1) insert-between (midpoint of neighbours, no renumber). type=section doubles as the TOC. deleted_at = soft delete.';
COMMENT ON COLUMN public.document_blocks.html_cache IS
  'Server-rendered HTML the client patches block innerHTML from, so render is transport-agnostic and identical for every client.';
COMMENT ON TABLE public.block_marks IS
  'Highlight ranges on a block (rendered <span class="mark …">); range_start/range_end index into block plain content. Folded with the doc at seal.';
COMMENT ON TABLE public.block_locks IS
  'Soft locks: row presence = block being written, TTL via expires_at (~25s). Conductor is the sole writer of resident locks; human locks auto-expire by TTL on disconnect.';
COMMENT ON TABLE public.doc_marginalia IS
  'Anchored marginalia in the Studio right rail. Distinct from the substrate marginalia table; folded into it at seal (P5) so Mnemos sees the deliberation.';
COMMENT ON TABLE public.space_participants IS
  'Human participants in a space with peer/observer role (residents are tracked by space_residents). Every transport message is validated against this row by visitor_token at the API layer.';
