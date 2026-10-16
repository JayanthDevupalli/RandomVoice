-- ==============================================================================
-- YAPCLUB / RandomVoice — Instagram-Style Social & Blocking Migration
-- Run this in your Supabase SQL Editor: (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. CONNECTIONS RLS POLICIES (Fixes unfollow, remove follower, and public counts)
DROP POLICY IF EXISTS "Users can view their own connections" ON connections;
DROP POLICY IF EXISTS "connections_select_policy" ON connections;
DROP POLICY IF EXISTS "Users can create connection requests" ON connections;
DROP POLICY IF EXISTS "connections_insert_policy" ON connections;
DROP POLICY IF EXISTS "Users can update connections they are involved in" ON connections;
DROP POLICY IF EXISTS "connections_update_policy" ON connections;
DROP POLICY IF EXISTS "connections_delete_policy" ON connections;

-- SELECT: Accepted connections viewable by authenticated users (for profile counts and lists)
-- Pending and blocked connections are strictly private to the users involved
CREATE POLICY "connections_select_policy" ON connections
  FOR SELECT USING (
    status = 'accepted' 
    OR auth.uid() = requester_id 
    OR auth.uid() = receiver_id
  );

-- INSERT: Only allowed if neither user has blocked the other
CREATE POLICY "connections_insert_policy" ON connections
  FOR INSERT WITH CHECK (
    auth.uid() = requester_id
    AND NOT EXISTS (
      SELECT 1 FROM connections c 
      WHERE (
        (c.requester_id = connections.receiver_id AND c.receiver_id = auth.uid() AND c.status = 'blocked')
        OR (c.requester_id = auth.uid() AND c.receiver_id = connections.receiver_id AND c.status = 'blocked')
      )
    )
  );

-- UPDATE: Users can update a connection they are involved in
CREATE POLICY "connections_update_policy" ON connections
  FOR UPDATE USING (auth.uid() = receiver_id OR auth.uid() = requester_id);

-- DELETE: Allows Unfollowing, Removing a Follower, and Unblocking (CRITICAL: fixes the deletion bug!)
CREATE POLICY "connections_delete_policy" ON connections
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- 2. MESSAGES RLS POLICIES (Database-level shield against blocked users sending DMs)
DROP POLICY IF EXISTS "messages_insert_policy" ON messages;

CREATE POLICY "messages_insert_policy" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_members 
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    ) 
    AND auth.uid() = sender_id
    AND NOT EXISTS (
      SELECT 1 
      FROM conversation_members cm1
      JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id AND cm1.user_id != cm2.user_id
      JOIN connections c ON (
        (c.requester_id = cm1.user_id AND c.receiver_id = cm2.user_id AND c.status = 'blocked')
        OR (c.requester_id = cm2.user_id AND c.receiver_id = cm1.user_id AND c.status = 'blocked')
      )
      WHERE cm1.conversation_id = messages.conversation_id
        AND (cm1.user_id = auth.uid() OR cm2.user_id = auth.uid())
    )
  );
