-- ========================================================
-- YapClub / RandomVoice — System Settings & Maintenance Mode Migration
-- Run this in your Supabase Dashboard -> SQL Editor
-- ========================================================

-- 1. Create system_settings table if it doesn't already exist
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'system'
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Allow anyone (including anonymous/guest visitors) to read system settings (like maintenance mode)
DROP POLICY IF EXISTS "system_settings_select_policy" ON system_settings;
CREATE POLICY "system_settings_select_policy" ON system_settings
  FOR SELECT
  USING (true);

-- Allow server / authenticated operations to insert or update settings
DROP POLICY IF EXISTS "system_settings_insert_policy" ON system_settings;
CREATE POLICY "system_settings_insert_policy" ON system_settings
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "system_settings_update_policy" ON system_settings;
CREATE POLICY "system_settings_update_policy" ON system_settings
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 4. Enable Supabase Realtime for system_settings table (if supported)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'system_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE system_settings;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Fallback if publication cannot be modified directly via non-superuser
  NULL;
END $$;

-- 5. Seed default maintenance mode setting if not present (disabled by default)
INSERT INTO system_settings (key, value, updated_by)
VALUES (
  'maintenance_mode',
  '{
    "enabled": false,
    "title": "Maintenance in Progress",
    "message": "Platform updates in progress. Voice rooms & features remain active!",
    "severity": "warning",
    "updated_at": null,
    "updated_by": null
  }'::jsonb,
  'system'
)
ON CONFLICT (key) DO NOTHING;
