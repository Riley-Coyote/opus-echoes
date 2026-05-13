-- ============================================================
-- space_artifacts: extend kind to support admin-uploaded files
--
-- Phase R (gathering rooms) — Riley uploads files into a gathering
-- space (frameworks, declarations, etc.) for the residents to read
-- as part of their salon context. Three new kinds:
--
--   markdown  — uploaded .md, body in `content`, renders as parsed MD
--   text      — uploaded .txt, body in `content`, renders as <pre>
--   html      — uploaded .html, body in `content`, sanitized + rendered
--
-- The existing 'image' kind handles uploaded images (which go to
-- Supabase Storage like the AI-generated ones).
-- ============================================================

ALTER TABLE public.space_artifacts
  DROP CONSTRAINT IF EXISTS space_artifacts_kind_check;

ALTER TABLE public.space_artifacts
  ADD CONSTRAINT space_artifacts_kind_check
  CHECK (kind IN (
    'svg',
    'ascii',
    'image',
    'share_link',
    'markdown',
    'text',
    'html'
  ));

COMMENT ON COLUMN public.space_artifacts.kind IS
  'svg/ascii: resident-authored visual artifacts. image: AI-generated or admin-uploaded. share_link: URL share. markdown/text/html: admin-uploaded files (frameworks, declarations, etc) the residents can read as context.';
