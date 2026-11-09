-- ========================================================
-- YapClub — Migration: Junction Lifespan & Duration System
-- ========================================================

-- Add expires_at (Unix timestamp in ms) and duration_type (e.g. '30m', '1h', 'permanent')
ALTER TABLE junctions 
  ADD COLUMN IF NOT EXISTS expires_at BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duration_type TEXT DEFAULT '1h';

-- High performance partial index for query sweeps
CREATE INDEX IF NOT EXISTS idx_junctions_expires_at ON junctions(expires_at) 
  WHERE expires_at IS NOT NULL;

