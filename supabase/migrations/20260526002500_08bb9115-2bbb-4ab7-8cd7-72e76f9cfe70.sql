
-- Drop public SELECT policies on tables that expose visitor_token columns.
-- All application reads go through supabaseAdmin (service role bypasses RLS),
-- so removing these policies does not affect app behavior.
DROP POLICY IF EXISTS "block_locks readable when space active" ON public.block_locks;
DROP POLICY IF EXISTS "block_marks readable when space active" ON public.block_marks;
DROP POLICY IF EXISTS "doc_marginalia readable when space active" ON public.doc_marginalia;
DROP POLICY IF EXISTS "document_blocks readable when space active" ON public.document_blocks;
DROP POLICY IF EXISTS "studio_documents readable when space active" ON public.studio_documents;
DROP POLICY IF EXISTS "space_messages readable when space active" ON public.space_messages;
DROP POLICY IF EXISTS "space_participants readable when space active" ON public.space_participants;

-- Explicit deny-by-default policy for space_visitor_salon_requests
-- (RLS is enabled with no policies — this makes the intent explicit and
-- prevents accidental future permissive grants from exposing visitor_token/ip_hash).
CREATE POLICY "space_visitor_salon_requests deny all"
  ON public.space_visitor_salon_requests
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
