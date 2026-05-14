-- ─────────────────────────────────────────────────────────────────────
-- session mode — classic-chat production-readiness
--
-- Adds the `mode` column to sessions so the substrate can distinguish
-- experiment-mode sessions (created via /api/intent + the threshold
-- ceremony) from classic-mode sessions (created via /api/chat/start
-- when a visitor reaches /chat/<resident> directly).
--
-- The two modes share everything load-bearing — same residents, same
-- souls, same Mnemos topology, same memory retrieval, same /api/message
-- streaming. The differences are:
--   - classic-mode sessions get 4× higher pacing thresholds (cost ceiling)
--   - classic-mode sessions get a 30-day idle timeout (vs experiment's 30m)
--   - cross-surface conflict detection enforces one open thread per
--     (visitor_token, resident_id) so a visitor doesn't accidentally run
--     two concurrent conversations against the same resident
--
-- Default value 'experiment' covers backfill — every existing session
-- was created via the threshold flow, so the default is correct.
--
-- The partial index supports the conflict-detection lookup on each
-- bootstrap: both /api/intent and /api/chat/start filter open sessions
-- by (visitor_token, resident_id) and select `mode` to decide whether
-- the new request collides with an existing session on the other surface.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN mode text NOT NULL DEFAULT 'experiment'
    CHECK (mode IN ('experiment', 'classic'));

CREATE INDEX IF NOT EXISTS idx_sessions_mode_visitor_resident_open
  ON sessions (visitor_token, resident_id, mode)
  WHERE closed_at IS NULL;
