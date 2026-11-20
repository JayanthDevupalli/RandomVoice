-- ============================================================
-- YapClub Security Hardening Migration
-- Run this in Supabase SQL Editor to protect recovery codes
-- from public profile queries.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Private table for hashed recovery codes (server-only via service_role)
CREATE TABLE IF NOT EXISTS account_recovery_secrets (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS with ZERO public SELECT/UPDATE/DELETE policies.
-- Only SUPABASE_SERVICE_ROLE_KEY (server API routes) can access this table.
ALTER TABLE account_recovery_secrets ENABLE ROW LEVEL SECURITY;

-- 2. Migrate existing plaintext recovery codes into SHA-256 hashes
INSERT INTO account_recovery_secrets (user_id, code_hash, updated_at)
SELECT
  id,
  'sha256:' || encode(
    digest(
      regexp_replace(
        upper(COALESCE(recovery_code, social_links->>'recovery_code')),
        '[^A-Z0-9]',
        '',
        'g'
      ),
      'sha256'
    ),
    'hex'
  ),
  NOW()
FROM profiles
WHERE COALESCE(recovery_code, social_links->>'recovery_code') IS NOT NULL
  AND trim(COALESCE(recovery_code, social_links->>'recovery_code')) <> ''
ON CONFLICT (user_id) DO UPDATE
SET code_hash = EXCLUDED.code_hash,
    updated_at = NOW();

-- 3. Scrub plaintext recovery codes from publicly selectable profiles table
UPDATE profiles
SET
  recovery_code = NULL,
  social_links = CASE
    WHEN social_links IS NOT NULL AND social_links ? 'recovery_code'
      THEN social_links - 'recovery_code'
    ELSE social_links
  END
WHERE recovery_code IS NOT NULL
   OR (social_links IS NOT NULL AND social_links ? 'recovery_code');
