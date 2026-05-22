
-- Tighten anonymous SELECT exposure across tables surfacing private/pseudonymous data.
-- All app reads go through supabaseAdmin (service role), which bypasses RLS, so these
-- changes only affect direct anon/authenticated client access.

-- 1. engrams: hide rows scoped as 'private' from anonymous readers
DROP POLICY IF EXISTS "engrams readable by anyone" ON public.engrams;
CREATE POLICY "engrams non-private readable by anyone"
ON public.engrams FOR SELECT TO public
USING (scope <> 'private');

-- 2. engram_versions: only expose versions tied to engrams that are themselves public
DROP POLICY IF EXISTS "engram_versions readable by anyone" ON public.engram_versions;
CREATE POLICY "engram_versions readable when engram public"
ON public.engram_versions FOR SELECT TO public
USING (EXISTS (
  SELECT 1 FROM public.engrams e
  WHERE e.id = engram_versions.engram_id AND e.scope <> 'private'
));

-- 3. working_notes: internal resident scratch — no public access
DROP POLICY IF EXISTS "working_notes readable by anyone" ON public.working_notes;

-- 4. visitor_shares: token IS the credential — don't expose via anon SELECT.
-- Public share page is rendered server-side with supabaseAdmin.
DROP POLICY IF EXISTS "non-revoked shares readable by anyone" ON public.visitor_shares;

-- 5. Revoke column-level SELECT on pseudonymous visitor_token / ip_hash columns
--    from anon + authenticated roles. Service role (supabaseAdmin) is unaffected.
REVOKE SELECT (visitor_token) ON public.space_messages FROM anon, authenticated;
REVOKE SELECT (visitor_token) ON public.space_participants FROM anon, authenticated;
REVOKE SELECT (created_by_visitor_token) ON public.studio_documents FROM anon, authenticated;
REVOKE SELECT (author_visitor_token) ON public.block_marks FROM anon, authenticated;
REVOKE SELECT (author_visitor_token) ON public.doc_marginalia FROM anon, authenticated;
REVOKE SELECT (author_visitor_token) ON public.document_blocks FROM anon, authenticated;

-- Re-grant SELECT on all other columns so SELECT * style queries via admin still work
-- (service_role retains full access regardless; this is for anon/authenticated who may
-- query non-sensitive columns).
GRANT SELECT (id, space_id, resident_id, visitor_display_name, body, kind, reply_to_message_id, created_at)
  ON public.space_messages TO anon, authenticated;
GRANT SELECT (id, space_id, role, display_name, created_at)
  ON public.space_participants TO anon, authenticated;
GRANT SELECT (id, space_id, title, subtitle, sealed_at, created_at, observer_mode, status, byline, created_from_session_id)
  ON public.studio_documents TO anon, authenticated;
GRANT SELECT (id, block_id, created_at, author_resident_id, range_start, range_end)
  ON public.block_marks TO anon, authenticated;
GRANT SELECT (id, document_id, anchor_block_id, anchor_quote, body, author_resident_id, status, reply_to, created_at)
  ON public.doc_marginalia TO anon, authenticated;
GRANT SELECT (id, document_id, ord, type, content, html_cache, version, author_resident_id, created_at, deleted_at)
  ON public.document_blocks TO anon, authenticated;
