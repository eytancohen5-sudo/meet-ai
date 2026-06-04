-- RLS Policies for Meet AI
-- Generated from ADR-006 (docs/adr/006-rls-policies.md)
-- Run AFTER 20260604000001_initial_schema.sql
-- Apply via: supabase db push OR supabase migration up

-- ─────────────────────────────────────────────
-- Helper function
-- SECURITY DEFINER prevents infinite recursion when RLS is enabled on profiles.
-- STABLE allows Postgres to cache the result per query (one lookup per query, not per row).
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role_level
  FROM profiles
  WHERE supabase_user_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- Enable RLS on all tables
-- ─────────────────────────────────────────────
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues                ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE contexts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_items           ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (postgres role / Supabase dashboard connections)
-- Note: FORCE ROW LEVEL SECURITY does not affect the service role key — it always bypasses RLS.
ALTER TABLE profiles              FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions              FORCE ROW LEVEL SECURITY;
ALTER TABLE session_participants  FORCE ROW LEVEL SECURITY;
ALTER TABLE transcript_lines      FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks                 FORCE ROW LEVEL SECURITY;
ALTER TABLE ideas                 FORCE ROW LEVEL SECURITY;
ALTER TABLE issues                FORCE ROW LEVEL SECURITY;
ALTER TABLE decisions             FORCE ROW LEVEL SECURITY;
ALTER TABLE contexts              FORCE ROW LEVEL SECURITY;
ALTER TABLE media_items           FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- Table: profiles
-- Intentionally denied: manager/member cannot INSERT or DELETE profile rows.
-- Column-level restriction (invite_code, email) is enforced at the view layer (profiles_safe view).
-- ─────────────────────────────────────────────

-- All authenticated org members may read profiles in their org.
-- Sensitive columns (invite_code, email) are restricted at the view layer, not here.
CREATE POLICY "profiles: read within org"
  ON profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner only: insert new profile rows (inviting team members).
CREATE POLICY "profiles: insert by owner"
  ON profiles
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = 'owner'
  );

-- Owner: update any profile in their org.
-- Member/manager: update only their own row (display_name, avatar_url — not role_level).
CREATE POLICY "profiles: update own row or owner updates all"
  ON profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    supabase_user_id = auth.uid()
    OR (
      get_my_role() = 'owner'
      AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    )
  )
  WITH CHECK (
    supabase_user_id = auth.uid()
    OR (
      get_my_role() = 'owner'
      AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    )
  );

-- Owner only: delete (i.e., remove a team member from the org).
CREATE POLICY "profiles: delete by owner"
  ON profiles
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- Table: sessions
-- Intentionally denied: manager and member cannot INSERT, UPDATE, or DELETE session rows.
-- ─────────────────────────────────────────────

-- Owner and manager: read all sessions in the org.
-- Member: read only sessions they participated in (checked via session_participants).
CREATE POLICY "sessions: select by role"
  ON sessions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    AND (
      get_my_role() IN ('owner', 'manager')
      OR EXISTS (
        SELECT 1
        FROM session_participants sp
        WHERE sp.session_id = sessions.id
          AND sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );

-- Owner only: insert new sessions (device push from sync).
CREATE POLICY "sessions: insert by owner"
  ON sessions
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner only: update session rows (title, status, summary updates from sync).
CREATE POLICY "sessions: update by owner"
  ON sessions
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner only: soft-delete (sets deleted_at). Hard deletes are not supported (ADR-005).
CREATE POLICY "sessions: delete by owner"
  ON sessions
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- Table: session_participants
-- Intentionally denied: manager and member cannot mutate the participant list.
-- ─────────────────────────────────────────────

-- Owner and manager: read all participant rows in the org.
-- Member: read only their own participant row.
CREATE POLICY "session_participants: select by role"
  ON session_participants
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    AND (
      get_my_role() IN ('owner', 'manager')
      OR user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
    )
  );

-- Owner only: insert participant rows (set during session sync).
CREATE POLICY "session_participants: insert by owner"
  ON session_participants
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner only: update participant rows.
CREATE POLICY "session_participants: update by owner"
  ON session_participants
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner only: delete participant rows.
CREATE POLICY "session_participants: delete by owner"
  ON session_participants
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- Table: transcript_lines
-- Intentionally denied: UPDATE and DELETE are denied for ALL roles (append-only per ADR-005).
-- No policy = no permission. The absence of UPDATE/DELETE policies is deliberate.
-- ─────────────────────────────────────────────

-- Same access as parent session.
CREATE POLICY "transcript_lines: select by role"
  ON transcript_lines
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    AND (
      get_my_role() IN ('owner', 'manager')
      OR EXISTS (
        SELECT 1
        FROM session_participants sp
        WHERE sp.session_id = transcript_lines.session_id
          AND sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );

-- Owner only: insert lines (append-only sync push).
CREATE POLICY "transcript_lines: insert by owner"
  ON transcript_lines
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- UPDATE intentionally denied for all roles (append-only).
-- DELETE intentionally denied for all roles (append-only).

-- ─────────────────────────────────────────────
-- Table: tasks
-- Intentionally denied: manager/member cannot DELETE tasks; manager cannot INSERT tasks.
-- Member UPDATE is broad at the RLS layer — column restriction (status only) enforced by web portal.
-- ─────────────────────────────────────────────

-- Owner and manager: read all tasks in the org.
-- Member: read tasks assigned to them OR tasks belonging to a session they participated in.
CREATE POLICY "tasks: select by role"
  ON tasks
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    AND (
      get_my_role() IN ('owner', 'manager')
      OR assigned_to = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      OR EXISTS (
        SELECT 1
        FROM session_participants sp
        WHERE sp.session_id = tasks.session_id
          AND sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );

-- Owner only: insert new tasks (created during sync push from device).
CREATE POLICY "tasks: insert by owner"
  ON tasks
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner: update any task (title, status, assignee).
-- Manager: update any task they can read (reassign, change status).
-- Member: update only tasks assigned to them, and only the status column.
--   Note: column-level restriction on members is enforced at the application layer.
--   The RLS policy grants UPDATE access; the web portal must not expose title/assignee
--   fields to members. A future trigger can enforce the column restriction if needed.
CREATE POLICY "tasks: update by role"
  ON tasks
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    AND (
      get_my_role() IN ('owner', 'manager')
      OR assigned_to = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
    )
  )
  WITH CHECK (
    org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    AND (
      get_my_role() IN ('owner', 'manager')
      OR assigned_to = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
    )
  );

-- Owner only: soft-delete tasks.
CREATE POLICY "tasks: delete by owner"
  ON tasks
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- Table: ideas
-- Intentionally denied: manager and member cannot mutate ideas.
-- Manager read access is granted (all ideas in org). Member scoped to their sessions.
-- ─────────────────────────────────────────────

CREATE POLICY "ideas: select by role"
  ON ideas
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    AND (
      get_my_role() IN ('owner', 'manager')
      OR EXISTS (
        SELECT 1
        FROM session_participants sp
        WHERE sp.session_id = ideas.session_id
          AND sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );

-- Owner only: insert (sync push from device after AI organization).
CREATE POLICY "ideas: insert by owner"
  ON ideas
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner only: update.
CREATE POLICY "ideas: update by owner"
  ON ideas
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner only: delete.
CREATE POLICY "ideas: delete by owner"
  ON ideas
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- Table: issues
-- Same access model as ideas.
-- ─────────────────────────────────────────────

CREATE POLICY "issues: select by role"
  ON issues
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    AND (
      get_my_role() IN ('owner', 'manager')
      OR EXISTS (
        SELECT 1
        FROM session_participants sp
        WHERE sp.session_id = issues.session_id
          AND sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );

CREATE POLICY "issues: insert by owner"
  ON issues
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

CREATE POLICY "issues: update by owner"
  ON issues
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

CREATE POLICY "issues: delete by owner"
  ON issues
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- Table: decisions
-- Same access model as ideas and issues.
-- ─────────────────────────────────────────────

CREATE POLICY "decisions: select by role"
  ON decisions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    AND (
      get_my_role() IN ('owner', 'manager')
      OR EXISTS (
        SELECT 1
        FROM session_participants sp
        WHERE sp.session_id = decisions.session_id
          AND sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );

CREATE POLICY "decisions: insert by owner"
  ON decisions
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

CREATE POLICY "decisions: update by owner"
  ON decisions
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

CREATE POLICY "decisions: delete by owner"
  ON decisions
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- Table: contexts
-- Intentionally denied: member cannot INSERT, UPDATE, or DELETE contexts; manager cannot DELETE.
-- ─────────────────────────────────────────────

-- All authenticated org members may read contexts.
CREATE POLICY "contexts: select by org member"
  ON contexts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner and manager: insert new contexts.
CREATE POLICY "contexts: insert by owner or manager"
  ON contexts
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('owner', 'manager')
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner and manager: update contexts.
CREATE POLICY "contexts: update by owner or manager"
  ON contexts
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('owner', 'manager')
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() IN ('owner', 'manager')
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner only: delete contexts (destructive, irreversible for members).
CREATE POLICY "contexts: delete by owner"
  ON contexts
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- Table: media_items
-- Intentionally denied: manager and member cannot INSERT, UPDATE, or DELETE media item records.
-- Storage bucket policies are separate and must be defined before audio upload is enabled (ADR-006 §known-limitations-4).
-- ─────────────────────────────────────────────

CREATE POLICY "media_items: select by role"
  ON media_items
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
    AND (
      get_my_role() IN ('owner', 'manager')
      OR EXISTS (
        SELECT 1
        FROM session_participants sp
        WHERE sp.session_id = media_items.session_id
          AND sp.user_id = (SELECT id FROM profiles WHERE supabase_user_id = auth.uid())
      )
    )
  );

-- Owner only: insert media item records (sync push from device).
CREATE POLICY "media_items: insert by owner"
  ON media_items
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner only: update media item metadata.
CREATE POLICY "media_items: update by owner"
  ON media_items
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );

-- Owner only: delete media item records.
CREATE POLICY "media_items: delete by owner"
  ON media_items
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'owner'
    AND org_id = (SELECT org_id FROM profiles WHERE supabase_user_id = auth.uid())
  );
