-- Ban Evasion & Active/Offline Presence Tracking Migration
-- Run this in your Supabase SQL Editor

-- 1. Add presence & last_seen columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_junction_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON public.profiles (last_seen_at DESC);

-- 2. Track all active & recent devices (both Registered Users and Guests)
CREATE TABLE IF NOT EXISTS public.device_sessions (
  device_hash TEXT PRIMARY KEY,
  ip_hash TEXT,
  subnet_hash TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  guest_id TEXT,
  display_name TEXT,
  user_agent TEXT,
  current_junction_id TEXT,
  is_banned BOOLEAN DEFAULT FALSE,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id ON public.device_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_ip_hash ON public.device_sessions (ip_hash);
CREATE INDEX IF NOT EXISTS idx_device_sessions_last_seen ON public.device_sessions (last_seen_at DESC);

-- 3. Store banned device & IP fingerprints to stop alt-account & guest ban evasion
CREATE TABLE IF NOT EXISTS public.banned_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ban_type TEXT NOT NULL CHECK (ban_type IN ('device', 'ip')),
  hash_value TEXT NOT NULL,
  source_user_id UUID,
  source_username TEXT,
  reason TEXT,
  banned_by TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ban_type, hash_value)
);

CREATE INDEX IF NOT EXISTS idx_banned_fingerprints_lookup
  ON public.banned_fingerprints (ban_type, hash_value);

-- 4. Enable Row Level Security (blocks anon/authenticated client access;
--    server-side API routes use service_role which bypasses RLS safely)
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_fingerprints ENABLE ROW LEVEL SECURITY;
