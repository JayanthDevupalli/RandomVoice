-- ============================================
-- YapClub / RandomVoice — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Junctions (Voice Rooms)
CREATE TABLE IF NOT EXISTS junctions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('casual','gaming','tech','music','philosophy','languages','chill')),
  icon TEXT DEFAULT 'Mic',
  tags TEXT[] DEFAULT '{}',
  max_participants INT DEFAULT 7,
  current_count INT DEFAULT 0,
  created_at BIGINT NOT NULL,
  is_custom BOOLEAN DEFAULT true,
  creator_id TEXT,
  moderator_identity TEXT NOT NULL,
  is_locked BOOLEAN DEFAULT false,
  banned_identities TEXT[] DEFAULT '{}'
);

-- 2. Junction Participants
CREATE TABLE IF NOT EXISTS junction_participants (
  id TEXT PRIMARY KEY,
  junction_id TEXT NOT NULL REFERENCES junctions(id) ON DELETE CASCADE,
  identity TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT 'zap',
  color TEXT DEFAULT '#6366F1',
  role TEXT DEFAULT 'speaker' CHECK (role IN ('moderator','speaker','listener')),
  is_muted BOOLEAN DEFAULT false,
  is_muted_by_mod BOOLEAN DEFAULT false,
  is_speaking BOOLEAN DEFAULT false,
  joined_at BIGINT NOT NULL,
  connection_quality TEXT DEFAULT 'excellent',
  reported_by TEXT[] DEFAULT '{}',
  UNIQUE(junction_id, identity)
);

-- 3. Enable Row Level Security (required by Supabase)
ALTER TABLE junctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE junction_participants ENABLE ROW LEVEL SECURITY;

-- 4. Permissive policies (this is a demo/fun app — allow all operations via anon key)
-- Junctions: full access
CREATE POLICY "Allow all access to junctions" ON junctions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Junction Participants: full access
CREATE POLICY "Allow all access to junction_participants" ON junction_participants
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_participants_junction_id ON junction_participants(junction_id);
CREATE INDEX IF NOT EXISTS idx_participants_identity ON junction_participants(identity);
CREATE INDEX IF NOT EXISTS idx_junctions_category ON junctions(category);
