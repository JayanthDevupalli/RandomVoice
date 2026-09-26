-- ============================================
-- YapClub / RandomVoice — Social Features Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  avatar TEXT DEFAULT 'zap',
  bio TEXT DEFAULT '',
  social_links JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Connections Table (Follow Requests & Mutuals)
-- status: 'pending', 'accepted', 'blocked'
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, receiver_id) -- Prevent duplicate requests
);

-- 3. Conversations (1-on-1 and Groups)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  name TEXT, -- Only used for groups
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Conversation Members
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

-- 5. Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Enable Row Level Security (RLS)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies (For Anonymous Auth / Authenticated Users)
-- Note: Adjust based on exact privacy needs. 
-- Assuming standard authenticated users via Supabase Anon Auth.
-- ============================================

-- PROFILES
-- Anyone can view profiles (UI hides fields for non-mutuals)
CREATE POLICY "Profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
  
-- Users can insert their own profile on signup
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- CONNECTIONS
-- Users can view connections if they are the requester or receiver
CREATE POLICY "Users can view their own connections" ON connections
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- Users can insert a connection if they are the requester
CREATE POLICY "Users can create connection requests" ON connections
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- Users can update a connection if they are the receiver (to accept/block)
-- OR if they are the requester (to cancel a pending request)
CREATE POLICY "Users can update connections they are involved in" ON connections
  FOR UPDATE USING (auth.uid() = receiver_id OR auth.uid() = requester_id);

-- CONVERSATIONS & MEMBERS
-- Drop old or conflicting policies to avoid 42710 errors
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view conversations" ON conversations;
DROP POLICY IF EXISTS "Users can insert conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete conversations" ON conversations;

-- Conversations RLS: Allow authenticated users to view, create, and update conversations
CREATE POLICY "conversations_select_policy" ON conversations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "conversations_insert_policy" ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "conversations_update_policy" ON conversations
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "conversations_delete_policy" ON conversations
  FOR DELETE TO authenticated
  USING (true);

-- Drop old conversation_members policies
DROP POLICY IF EXISTS "Users can view conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Users can insert conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Users can update conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Users can delete conversation members" ON conversation_members;

-- Conversation Members RLS: Clean, non-recursive policies
CREATE POLICY "conversation_members_select_policy" ON conversation_members
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "conversation_members_insert_policy" ON conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "conversation_members_update_policy" ON conversation_members
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "conversation_members_delete_policy" ON conversation_members
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- MESSAGES
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON messages;

-- Users can view messages in conversations they are a member of
CREATE POLICY "messages_select_policy" ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_members 
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

-- Users can insert messages in conversations they are a member of
CREATE POLICY "messages_insert_policy" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_members 
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    ) AND auth.uid() = sender_id
  );

-- ============================================
-- STORAGE BUCKET: Avatars
-- Run this to create the bucket for profile pictures
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;

-- Storage Policies for Avatars
CREATE POLICY "Avatar images are publicly accessible."
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'avatars' );

CREATE POLICY "Authenticated users can upload an avatar."
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id = 'avatars' AND auth.role() = 'authenticated' );

CREATE POLICY "Users can update their own avatar."
  ON storage.objects FOR UPDATE
  USING ( bucket_id = 'avatars' AND auth.uid() = owner );
