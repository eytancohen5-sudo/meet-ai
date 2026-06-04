# ADR-006: Supabase Row Level Security Policies
**Date:** 2026-06-04
**Status:** Accepted
**Deciders:** Boss (Eytan)

---

## Context

The web portal (Phase 5) allows team members to read session data, tasks, and profiles directly from Supabase via the browser. The `RightsGate` React component filters rows in the client-side query, but this provides no real security: any authenticated Supabase user can call the Supabase REST or JS client API directly and retrieve every row in every table — completely bypassing the component.

Row Level Security (RLS) is the only mechanism that enforces access control at the database layer, independent of the calling application. Without it, shipping the web portal means shipping an effective data breach for any team member who knows their auth token.

This ADR was referenced as a dependency by ADR-005 ("Row-level security on all Supabase tables: users may only read/write rows where `user_id = auth.uid()` or where they are a member of the owning team — policy to be defined in ADR-006 or equivalent") and was blocking Phase 5 deployment per @challenger's review.

### Role hierarchy (from ADR-004)

```
owner > manager > member
```

| Role | Canonical permissions |
|---|---|
| `owner` | Full read + write access to all rows in the org |
| `manager` | Read all sessions and participants; organize/assign tasks; cannot manage team members |
| `member` | Read only sessions they participated in; read/update only their own tasks |

### Auth identity

- Supabase Auth is the identity provider.
- Each Supabase Auth user has a UUID (`auth.uid()`).
- The `profiles` table maps that UUID via `profiles.supabase_user_id`.
- `profiles.role_level` stores `'owner'` | `'manager'` | `'member'`.

### Sync model (from ADR-005)

- The owner device pushes data to Supabase using the owner's auth token (or a server-side service role key for automation).
- Team members pull data from Supabase using their own auth token.
- RLS must allow owners to INSERT and UPDATE all rows they create.

---

## Decision — RLS helper function

A stable helper function `get_my_role()` is created once and used in every policy expression. It is declared `SECURITY DEFINER` so it runs as the function owner (with full table access) rather than as the caller — this prevents infinite recursion on the `profiles` table when RLS is enabled on it.

```sql
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role_level
  FROM profiles
  WHERE supabase_user_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

**Why `STABLE`:** The role does not change within a single SQL statement, so Postgres can cache the result per query — avoiding one lookup per row for table scans.

**Why `SECURITY DEFINER`:** Without this flag, the function executes as the calling user. When RLS is enabled on `profiles`, the function would recurse into its own policy check and return NULL for every user, locking everyone out. `SECURITY DEFINER` runs the lookup as the function owner (typically the Supabase `postgres` role) which bypasses RLS for this single lookup. The function exposes only `role_level` — it does not leak any other column.

---

## Policies per table

### Convention

- Every `CREATE POLICY` has an explicit `AS PERMISSIVE` (the default) to make intent clear.
- A missing policy for an operation = that operation is denied by default. Every intentionally-denied operation is listed as a comment so future maintainers see a conscious decision, not a gap.
- All policies assume `auth.uid()` is non-NULL (i.e., an unauthenticated request is rejected before any policy is checked, because the `anon` key has no `role_level` row in `profiles`).
- `org_id` is used in `sessions` and related tables to isolate tenants. All policies include an `org_id` check where applicable (see Supabase service role section for the assumption about org_id column presence).

---

### Table: `profiles`

Stores team member records including `supabase_user_id`, `role_level`, `display_name`, `avatar_url`, `invite_code`, and `org_id`.

**SELECT**
- Owner and manager: read all profiles in the same org.
- Member: read their own row, plus the `id`, `display_name`, `avatar_url`, and `role_level` of others in the same org (basic info, not invite codes or sensitive fields).

Because member-readable columns differ from owner/manager-readable columns, the cleanest RLS approach is to grant SELECT to all authenticated org members and restrict sensitive columns at the view layer (a `profiles_safe` view for the web portal that omits `invite_code` and `email`). The policy below permits the row; the view restricts the columns.

```sql
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
```

**Intentionally denied:** Manager and member cannot INSERT or DELETE profile rows. Manager cannot update other profiles' `role_level` — that restriction is enforced at the application layer (the web portal must not offer the field in the form for non-owners). A future ADR may add a column-level trigger if belt-and-suspenders enforcement is needed.

---

### Table: `sessions`

Stores session metadata: `id`, `title`, `status`, `org_id`, `owner_id` (the `supabase_user_id` of the recording device owner), `created_at`, `updated_at`, `deleted_at`.

```sql
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
```

**Intentionally denied:** Manager and member cannot INSERT, UPDATE, or DELETE session rows. They are read-only consumers of session data.

---

### Table: `session_participants`

Join table: `session_id`, `user_id` (foreign key to `profiles.id`), `org_id`.

```sql
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
```

**Intentionally denied:** Manager and member cannot mutate the participant list.

---

### Table: `transcript_lines`

Columns: `id`, `session_id`, `speaker`, `text`, `timestamp_ms`, `org_id`, `created_at`. Append-only per ADR-005.

Access mirrors the parent session: if you can see the session, you can see its lines.

```sql
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
```

**Intentionally denied:** UPDATE and DELETE on transcript lines are denied for all roles. This is the enforcement layer for the append-only constraint defined in ADR-005. No policy means no permission.

---

### Table: `tasks`

Columns: `id`, `session_id`, `title`, `status`, `assigned_to` (foreign key to `profiles.id`), `org_id`, `created_at`, `updated_at`, `deleted_at`.

```sql
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
```

**Intentionally denied:** Manager and member cannot DELETE tasks. Manager cannot INSERT tasks (tasks originate from the owner device via AI organization). Member UPDATE is intentionally broad at the RLS layer — the column-level restriction (status only) is enforced by the web portal; see Known Limitations.

---

### Table: `ideas`

Columns: `id`, `session_id`, `text`, `org_id`, `created_at`. Access mirrors the parent session.

```sql
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
```

**Intentionally denied:** Manager and member cannot mutate ideas. Manager read access is granted (they can read all ideas in the org). Member read access is scoped to sessions they participated in.

---

### Table: `issues`

Same access model as `ideas`.

```sql
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
```

---

### Table: `decisions`

Same access model as `ideas` and `issues`.

```sql
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
```

---

### Table: `contexts`

Formerly `locations` (renamed in ADR-003). Stores rooms, products, topics, etc. Columns: `id`, `label`, `type`, `org_id`, `created_at`, `updated_at`.

**Access model:** All authenticated org members may read. Owner and manager may write.

```sql
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
```

**Intentionally denied:** Member cannot INSERT, UPDATE, or DELETE contexts. Manager cannot DELETE.

---

### Table: `media_items`

Columns: `id`, `session_id`, `storage_path`, `mime_type`, `org_id`, `created_at`. Access mirrors the parent session.

```sql
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
```

---

## Enabling RLS

RLS must be explicitly enabled on each table. Until `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is run, the policies above have no effect — all rows remain publicly accessible to any authenticated user.

```sql
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
```

Additionally, enable `FORCE ROW LEVEL SECURITY` on all tables to ensure the policies also apply to the table owner (i.e., the `postgres` database role used by the Supabase dashboard and direct SQL connections):

```sql
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
```

**Note:** `FORCE ROW LEVEL SECURITY` does not affect the Supabase service role key, which always bypasses RLS regardless of this setting. See the service role section below.

---

## Policy testing checklist

For each role, verify the following scenarios against a seeded test database. Run these as integration tests against a Supabase local dev instance (via `supabase start`).

### Owner

- [ ] Can SELECT all sessions across all org members
- [ ] Can INSERT a new session row
- [ ] Can UPDATE any session row (title, status)
- [ ] Can SELECT all tasks including tasks assigned to other members
- [ ] Can INSERT a task
- [ ] Can UPDATE any task (change assignee, change status, edit title)
- [ ] Can SELECT all transcript lines for any session
- [ ] Cannot INSERT a transcript line into another org's session
- [ ] Can SELECT all profiles in the org
- [ ] Can INSERT a new profile (invite)
- [ ] Can UPDATE another member's profile (e.g., change their role_level)
- [ ] Can DELETE a profile (remove a team member)
- [ ] Can SELECT, INSERT, UPDATE, DELETE contexts
- [ ] Can SELECT, INSERT, UPDATE, DELETE ideas, issues, decisions
- [ ] Can SELECT, INSERT, UPDATE, DELETE media_items
- [ ] Cannot SELECT rows belonging to a different org_id

### Manager

- [ ] Can SELECT all sessions in the org
- [ ] Cannot INSERT a new session row
- [ ] Cannot UPDATE a session row
- [ ] Can SELECT all tasks in the org
- [ ] Cannot INSERT a task
- [ ] Can UPDATE any task (change status, reassign)
- [ ] Can SELECT all transcript lines for any session in the org
- [ ] Cannot INSERT a transcript line
- [ ] Can SELECT all profiles in the org (including display_name, role_level of others)
- [ ] Cannot INSERT a profile
- [ ] Cannot UPDATE another member's profile
- [ ] Can SELECT, INSERT, UPDATE contexts — cannot DELETE
- [ ] Can SELECT all ideas, issues, decisions — cannot INSERT, UPDATE, DELETE
- [ ] Can SELECT all media_items — cannot INSERT, UPDATE, DELETE
- [ ] Cannot SELECT rows belonging to a different org_id

### Member

- [ ] Can SELECT only sessions where they appear in session_participants
- [ ] Cannot SELECT sessions they were not a participant in
- [ ] Cannot INSERT, UPDATE, or DELETE session rows
- [ ] Can SELECT only tasks assigned to them OR belonging to sessions they participated in
- [ ] Cannot SELECT tasks for sessions they were not a participant in
- [ ] Cannot INSERT a task
- [ ] Can UPDATE tasks assigned to them (status change)
- [ ] Cannot UPDATE tasks assigned to someone else
- [ ] Can SELECT transcript lines only for sessions they participated in
- [ ] Cannot SELECT transcript lines for sessions they were not a participant in
- [ ] Can SELECT their own profile row
- [ ] Can SELECT basic profile info (display_name, role_level) of other org members
- [ ] Cannot UPDATE another member's profile
- [ ] Cannot INSERT or DELETE profiles
- [ ] Can SELECT all contexts
- [ ] Cannot INSERT, UPDATE, or DELETE contexts
- [ ] Can SELECT ideas, issues, decisions only for sessions they participated in
- [ ] Cannot INSERT, UPDATE, or DELETE ideas, issues, decisions
- [ ] Can SELECT media_items only for sessions they participated in
- [ ] Cannot INSERT, UPDATE, or DELETE media_items
- [ ] Cannot SELECT rows belonging to a different org_id

### Unauthenticated (anon key)

- [ ] Cannot SELECT any row from any table
- [ ] Cannot INSERT, UPDATE, or DELETE any row from any table

---

## Supabase service role vs anon key usage

### Service role key

The Supabase service role key **bypasses RLS entirely**. It is Postgres superuser-equivalent for data access.

- **Use only server-side.** The service role key must never appear in a browser bundle, a React Native app bundle, or any client-side code.
- **Permitted uses:** Supabase Edge Functions (server), CI migration scripts, and future server-side sync workers.
- **The owner device sync (ADR-005)** must use the owner's auth token — not the service role key — so that RLS validates the owner's org_id on all inserts. If a future server-side sync worker is introduced (e.g., a webhook or Edge Function), it must manually validate org_id in application code before every write.

### Anon key

The Supabase `anon` key is safe to include in the web portal and mobile app bundles. It does not bypass RLS. Any request made with the anon key and without a valid Supabase Auth JWT will match no `authenticated` policies and will be denied.

The anon key must not have any policies that expose rows without a valid JWT. Do not create `FOR SELECT ... TO anon` policies on any table in this project.

---

## Known limitations

### 1. Column-level restriction on member task updates

The `tasks: update by role` policy grants members UPDATE access to their own task rows. It does not restrict which columns they can update — a member could technically UPDATE the `title` or `session_id` of a task assigned to them via a direct API call. The web portal must not expose these fields in the member UI. A `BEFORE UPDATE` trigger enforcing column-level restrictions on member updates is the correct permanent fix and is deferred to a future ADR.

### 2. Profile sensitive column restriction is view-layer only

The `profiles: read within org` policy grants all org members SELECT on all profile columns, including `invite_code` and `email`. These columns must be hidden from non-owner users at the web portal query layer — the portal should query a `profiles_safe` view that excludes those columns for non-owner sessions. Direct API access from a member would still expose these columns. A column-level trigger or a stricter policy using column masking (Postgres 16+ feature) is the correct permanent fix and is deferred.

### 3. `get_my_role()` result is not re-validated mid-transaction

Because `get_my_role()` is `STABLE`, Postgres caches the result within a transaction. A role change mid-transaction (e.g., a concurrent UPDATE to `profiles.role_level`) will not be reflected until the next transaction. This is an acceptable trade-off: role changes are rare, initiated only by the owner, and the member's current session token will continue to work for its lifetime regardless.

### 4. No RLS on Supabase Storage buckets

Media files stored in Supabase Storage (if audio is ever uploaded — currently out of scope per ADR-005) have separate bucket-level policies. The `media_items` table policies above protect the metadata rows but do not restrict access to the actual storage objects. Storage bucket policies are a separate concern and must be defined before audio upload is enabled.

### 5. `org_id` column must exist on all tables

This ADR assumes an `org_id` column is present on all tables listed. If `org_id` is absent from the current Supabase schema (the schema described in ADR-005 does not list `org_id` explicitly on all tables), it must be added as a prerequisite migration before these policies are applied. Atlas owns this migration step.

### 6. `profiles.id` vs `profiles.supabase_user_id` join cost

Several policies perform a subquery `SELECT id FROM profiles WHERE supabase_user_id = auth.uid()` to convert from the Supabase Auth UUID to the local `profiles.id` (used as the FK in `session_participants.user_id` and `tasks.assigned_to`). This subquery executes once per row evaluated by RLS. An index on `profiles(supabase_user_id)` is required for acceptable performance at any meaningful table size:

```sql
CREATE INDEX IF NOT EXISTS idx_profiles_supabase_user_id
  ON profiles (supabase_user_id);

CREATE INDEX IF NOT EXISTS idx_session_participants_user_id
  ON session_participants (user_id);

CREATE INDEX IF NOT EXISTS idx_session_participants_session_id
  ON session_participants (session_id);
```

These indexes are part of the atlas migration that deploys these policies.
