-- ========================================================
-- YapClub / RandomVoice — Message Reactions Table Migration
-- Run this in your Supabase SQL Editor
-- ========================================================

CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- Enable RLS
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Allow conversation members to view reactions
DROP POLICY IF EXISTS "message_reactions_select_policy" ON message_reactions;
CREATE POLICY "message_reactions_select_policy" ON message_reactions
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to add their own reactions
DROP POLICY IF EXISTS "message_reactions_insert_policy" ON message_reactions;
CREATE POLICY "message_reactions_insert_policy" ON message_reactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Allow users to delete (unreact) their own reactions
DROP POLICY IF EXISTS "message_reactions_delete_policy" ON message_reactions;
CREATE POLICY "message_reactions_delete_policy" ON message_reactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Index for speedy lookups
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);

