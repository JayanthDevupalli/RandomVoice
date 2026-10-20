-- ========================================================
-- YapClub / RandomVoice — Admin & Management System Migration
-- Run this in your Supabase Dashboard -> SQL Editor
-- ========================================================

-- 1. Add role, ban, and display_name columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('super_admin', 'admin', 'manager', 'user'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- 2. Ensure Main Admin 'jayanthadmin' (and 'jayanth') is super_admin
UPDATE profiles 
SET role = 'super_admin' 
WHERE LOWER(username) IN ('jayanthadmin', 'jayanth');

-- 3. Create indexes for quick admin querying
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON profiles(is_banned);

-- 4. Enable RLS updates for Super Admin and Admins
-- (Optional helper policy if you have RLS enabled on profiles)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can update user profiles'
  ) THEN
    CREATE POLICY "Admins can update user profiles"
    ON profiles
    FOR UPDATE
    USING (
      auth.uid() = id OR 
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND (role IN ('super_admin', 'admin') OR LOWER(username) IN ('jayanthadmin', 'jayanth'))
      )
    );
  END IF;
END $$;

-- 5. Main Admin Password in auth.users
-- Username: jayanthadmin
-- Email: jayanthadmin@users.yapclub.com
-- Password: devadmin@143
-- (The credentials are already registered on the live database via Supabase Auth Admin API)
-- If you ever want to update the password directly via SQL:
-- UPDATE auth.users 
-- SET encrypted_password = crypt('devadmin@143', gen_salt('bf'))
-- WHERE email = 'jayanthadmin@users.yapclub.com';
