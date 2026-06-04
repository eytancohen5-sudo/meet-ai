-- Migration: 20260604000003_security_fixes.sql
-- Security fixes from @sentinel audit 2026-06-04
-- Addresses: S-HIGH-2 (profiles_safe view), S-MED-6 (role escalation), S-MED-7 (soft-delete SELECT filter)
-- Run AFTER 20260604000002_rls_policies.sql

-- ─────────────────────────────────────────────
-- Fix S-HIGH-2: profiles_safe view
-- Prevents email + invite_code from being exposed to non-owners.
-- Team members read from this view; only owners can read the raw profiles table.
-- ─────────────────────────────────────────────

-- profiles_safe: public-facing profile view that omits sensitive columns
CREATE OR REPLACE VIEW profiles_safe AS
  SELECT
    id,
    supabase_user_id,
    display_name,
    role_level,
    avatar_url,
    color,
    avatar_initials,
    staff_role,
    created_at
    -- email and invite_code intentionally excluded
  FROM profiles;

-- Grant read access to authenticated users (view enforces column restriction)
GRANT SELECT ON profiles_safe TO authenticated;

-- Revoke direct SELECT on profiles from authenticated role
-- (Only the service role and policies using SECURITY DEFINER can read raw profiles)
REVOKE SELECT ON profiles FROM authenticated;

-- Re-add owner/manager access to raw profiles via a SECURITY DEFINER function
CREATE OR REPLACE FUNCTION get_profile_sensitive(profile_id UUID)
RETURNS TABLE(email TEXT, invite_code TEXT) AS $$
  SELECT email, invite_code FROM profiles WHERE id = profile_id
    AND (
      (SELECT role_level FROM profiles WHERE supabase_user_id = auth.uid()) IN ('owner', 'manager')
      OR supabase_user_id = auth.uid()  -- own row
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- Fix S-MED-6: Prevent members from self-elevating role_level
-- The previous WITH CHECK allowed a member to write any role_level on their own row.
-- The new WITH CHECK pins a member's role_level to whatever it was before the update.
-- ─────────────────────────────────────────────

-- Drop the existing update policy for profiles
DROP POLICY IF EXISTS "profiles: update own row or owner updates all" ON profiles;

-- Re-create with column-level role_level protection
CREATE POLICY "profiles: update own row or owner updates all" ON profiles
  FOR UPDATE
  USING (
    supabase_user_id = auth.uid()
    OR get_my_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    -- A member can update their own row but CANNOT change role_level
    (
      supabase_user_id = auth.uid()
      AND role_level = (SELECT role_level FROM profiles WHERE supabase_user_id = auth.uid())
    )
    OR get_my_role() = 'owner'
  );

-- ─────────────────────────────────────────────
-- Fix S-MED-7: Add deleted_at IS NULL to SELECT policies
-- ideas, issues, decisions, and transcript_lines were missing the soft-delete filter,
-- allowing authenticated users to read logically-deleted rows.
-- ─────────────────────────────────────────────

-- ideas
DROP POLICY IF EXISTS "ideas: select by role" ON ideas;
CREATE POLICY "ideas: select by role" ON ideas
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      get_my_role() IN ('owner', 'manager')
      OR session_id IN (
        SELECT sp.session_id FROM session_participants sp
        WHERE sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );

-- issues
DROP POLICY IF EXISTS "issues: select by role" ON issues;
CREATE POLICY "issues: select by role" ON issues
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      get_my_role() IN ('owner', 'manager')
      OR session_id IN (
        SELECT sp.session_id FROM session_participants sp
        WHERE sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );

-- decisions
DROP POLICY IF EXISTS "decisions: select by role" ON decisions;
CREATE POLICY "decisions: select by role" ON decisions
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      get_my_role() IN ('owner', 'manager')
      OR session_id IN (
        SELECT sp.session_id FROM session_participants sp
        WHERE sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );

-- transcript_lines
DROP POLICY IF EXISTS "transcript_lines: select by role" ON transcript_lines;
CREATE POLICY "transcript_lines: select by role" ON transcript_lines
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      get_my_role() IN ('owner', 'manager')
      OR session_id IN (
        SELECT sp.session_id FROM session_participants sp
        WHERE sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );
