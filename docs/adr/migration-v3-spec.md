# Migration v3 Spec — Unified Ground Truth

**Date:** 2026-06-04
**Status:** Authoritative — supersedes individual migration snippets in ADR-003, ADR-004, ADR-005
**Steward:** atlas
**For:** forge (implementation), reviewer (audit)

---

## Background

Three ADRs each define partial DDL that must land in a single `user_version = 3` migration:

| ADR | DDL scope |
|---|---|
| ADR-003 | Rename `locations` → `contexts`; add `context_type` column |
| ADR-004 | Five new columns on `staff` for identity/auth |
| ADR-005 | Sync timestamp columns on `sessions` and `tasks`; soft-delete requirement |

Running them in separate migration blocks is not safe: the first block to set `PRAGMA user_version = 3` causes all subsequent blocks to be skipped on every future cold start. All three ADRs must be unified into a single `if (user_version < 3)` block.

**Scoping decisions baked into this spec:**

- `org_id` column is **not** introduced in v3. Deferred to a future release.
- `deleted_at INTEGER` columns are added to six tables per ADR-005 §"Conflict Resolution Rules" rule 5 (soft-delete only; hard deletes not supported). No ADR migration snippet included them — this spec adds them.
- SQLite `ALTER TABLE ... RENAME TO` is not transactional. The guard described in §1 handles the re-entrant case.

---

## 1. Complete Ordered DDL List

Each statement is shown with its idempotency guard. Statements must be executed in the order listed — the rename must precede the ADD COLUMN on `contexts`.

### 1.1 Rename `locations` → `contexts` (ADR-003)

**Guard:** Check whether `locations` still exists before renaming. If `contexts` already exists (migration ran the rename but crashed before `user_version` was bumped), skip. This is the only safe re-entrant pattern because SQLite `RENAME TO` has no `IF EXISTS` syntax.

```sql
-- Only execute if 'locations' table still exists
-- (checked in TypeScript before issuing this statement)
ALTER TABLE locations RENAME TO contexts;
```

Guard query: `SELECT name FROM sqlite_master WHERE type='table' AND name='locations'`

If this query returns a row, run the RENAME. If it returns nothing, `contexts` is already the name — skip.

### 1.2 Add `context_type` to `contexts` (ADR-003)

```sql
ALTER TABLE contexts ADD COLUMN context_type TEXT NOT NULL DEFAULT 'space';
```

Guard: wrap in `try/catch` — if the column already exists SQLite throws "duplicate column name"; catch and continue.

### 1.3 Add sync columns to `sessions` (ADR-005)

```sql
ALTER TABLE sessions ADD COLUMN synced_at INTEGER;
ALTER TABLE sessions ADD COLUMN last_synced_at INTEGER;
```

Guard: each in its own `try/catch`.

### 1.4 Add `deleted_at` to `sessions` (ADR-005 soft-delete requirement)

```sql
ALTER TABLE sessions ADD COLUMN deleted_at INTEGER;
```

Guard: `try/catch`.

### 1.5 Add `synced_at` and `deleted_at` to `tasks` (ADR-005)

```sql
ALTER TABLE tasks ADD COLUMN synced_at INTEGER;
ALTER TABLE tasks ADD COLUMN deleted_at INTEGER;
```

Guard: each in its own `try/catch`.

### 1.6 Add `deleted_at` to `ideas` (ADR-005 soft-delete requirement)

```sql
ALTER TABLE ideas ADD COLUMN deleted_at INTEGER;
```

Guard: `try/catch`.

### 1.7 Add `deleted_at` to `issues` (ADR-005 soft-delete requirement)

```sql
ALTER TABLE issues ADD COLUMN deleted_at INTEGER;
```

Guard: `try/catch`.

### 1.8 Add `deleted_at` to `decisions` (ADR-005 soft-delete requirement)

```sql
ALTER TABLE decisions ADD COLUMN deleted_at INTEGER;
```

Guard: `try/catch`.

### 1.9 Add `deleted_at` to `transcript_lines` (ADR-005 soft-delete requirement)

```sql
ALTER TABLE transcript_lines ADD COLUMN deleted_at INTEGER;
```

Guard: `try/catch`.

### 1.10 Add identity/auth columns to `staff` (ADR-004)

```sql
ALTER TABLE staff ADD COLUMN email TEXT;
ALTER TABLE staff ADD COLUMN role_level TEXT NOT NULL DEFAULT 'member';
ALTER TABLE staff ADD COLUMN invite_code TEXT;
ALTER TABLE staff ADD COLUMN supabase_user_id TEXT;
ALTER TABLE staff ADD COLUMN avatar_url TEXT;
```

Guard: each in its own `try/catch`.

### 1.11 Bump `user_version` to 3 — LAST

```sql
PRAGMA user_version = 3;
```

This is the commit point. It runs only after every statement above has been attempted. If any statement above throws an unhandled error, this line must not run — `user_version` stays at 2 and the migration retries on next cold start.

---

## 2. Exact TypeScript Migration Block

This block replaces the placeholder after the existing `if (user_version < 2)` block in `lib/database.ts`. It follows the `try/catch` per-statement style established by the v2 block (lines 138–143).

```typescript
  // v3 — context model (ADR-003), identity model (ADR-004), sync + soft-delete (ADR-005)
  if (user_version < 3) {
    // 1. Rename locations → contexts only if locations still exists.
    //    If this migration ran partially before (renamed but crashed before user_version=3),
    //    'locations' is already gone and we skip safely.
    const locationsExists = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='locations'"
    );
    if (locationsExists) {
      await db.runAsync('ALTER TABLE locations RENAME TO contexts');
    }

    // 2. contexts — context_type discriminator (ADR-003)
    try { await db.runAsync("ALTER TABLE contexts ADD COLUMN context_type TEXT NOT NULL DEFAULT 'space'"); } catch {}

    // 3. sessions — sync timestamps + soft-delete (ADR-005)
    try { await db.runAsync('ALTER TABLE sessions ADD COLUMN synced_at INTEGER'); } catch {}
    try { await db.runAsync('ALTER TABLE sessions ADD COLUMN last_synced_at INTEGER'); } catch {}
    try { await db.runAsync('ALTER TABLE sessions ADD COLUMN deleted_at INTEGER'); } catch {}

    // 4. tasks — sync timestamp + soft-delete (ADR-005)
    try { await db.runAsync('ALTER TABLE tasks ADD COLUMN synced_at INTEGER'); } catch {}
    try { await db.runAsync('ALTER TABLE tasks ADD COLUMN deleted_at INTEGER'); } catch {}

    // 5. ideas — soft-delete (ADR-005)
    try { await db.runAsync('ALTER TABLE ideas ADD COLUMN deleted_at INTEGER'); } catch {}

    // 6. issues — soft-delete (ADR-005)
    try { await db.runAsync('ALTER TABLE issues ADD COLUMN deleted_at INTEGER'); } catch {}

    // 7. decisions — soft-delete (ADR-005)
    try { await db.runAsync('ALTER TABLE decisions ADD COLUMN deleted_at INTEGER'); } catch {}

    // 8. transcript_lines — soft-delete (ADR-005)
    try { await db.runAsync('ALTER TABLE transcript_lines ADD COLUMN deleted_at INTEGER'); } catch {}

    // 9. staff — identity/auth columns (ADR-004)
    try { await db.runAsync('ALTER TABLE staff ADD COLUMN email TEXT'); } catch {}
    try { await db.runAsync("ALTER TABLE staff ADD COLUMN role_level TEXT NOT NULL DEFAULT 'member'"); } catch {}
    try { await db.runAsync('ALTER TABLE staff ADD COLUMN invite_code TEXT'); } catch {}
    try { await db.runAsync('ALTER TABLE staff ADD COLUMN supabase_user_id TEXT'); } catch {}
    try { await db.runAsync('ALTER TABLE staff ADD COLUMN avatar_url TEXT'); } catch {}

    // Commit point — only reached if no unhandled throws above
    await db.runAsync('PRAGMA user_version = 3');
  }
```

**Why `runAsync` per statement instead of `execAsync` batch:**
The v2 pattern already uses individual `runAsync` + `try/catch`. Using `execAsync` for a batch would swallow per-statement errors silently and prevent the `locationsExists` guard from working. Individual calls are required here.

**Why no `BEGIN`/`COMMIT` wrapper:**
SQLite DDL (`ALTER TABLE`) auto-commits in SQLite. Wrapping in an explicit transaction does not make DDL atomic across statements in SQLite — each `ALTER TABLE` commits immediately regardless of the enclosing transaction. The idempotency guards above (check-before-execute for RENAME, try/catch for ADD COLUMN) are the correct mechanism. This corrects the false-atomicity assumption noted in ADR-003's migration spec.

---

## 3. Complete Column List

### `contexts` (formerly `locations`)

| Column | SQL Type | Nullable | Default | Source |
|---|---|---|---|---|
| `id` | TEXT | NO | — | v1 (CREATE TABLE) |
| `name` | TEXT | NO | — | v1 |
| `icon` | TEXT | NO | `'📍'` | v1 |
| `color` | TEXT | NO | `'#6E8FAC'` | v1 |
| `reference_image_uri` | TEXT | YES | NULL | v2 |
| `ai_description` | TEXT | YES | NULL | v2 |
| `context_type` | TEXT | NO | `'space'` | **v3 — ADR-003** |

### `sessions`

| Column | SQL Type | Nullable | Default | Source |
|---|---|---|---|---|
| `id` | TEXT | NO | — | v1 |
| `title` | TEXT | NO | — | v1 |
| `location_id` | TEXT | YES | NULL | v1 |
| `started_at` | INTEGER | NO | — | v1 |
| `ended_at` | INTEGER | YES | NULL | v1 |
| `status` | TEXT | NO | `'recording'` | v1 |
| `summary` | TEXT | YES | NULL | v1 |
| `audio_uri` | TEXT | YES | NULL | v1 |
| `synced_at` | INTEGER | YES | NULL | **v3 — ADR-005** |
| `last_synced_at` | INTEGER | YES | NULL | **v3 — ADR-005** |
| `deleted_at` | INTEGER | YES | NULL | **v3 — ADR-005** |

### `tasks`

| Column | SQL Type | Nullable | Default | Source |
|---|---|---|---|---|
| `id` | TEXT | NO | — | v1 |
| `session_id` | TEXT | NO | — | v1 |
| `title` | TEXT | NO | — | v1 |
| `assigned_to` | TEXT | YES | NULL | v1 |
| `location_id` | TEXT | YES | NULL | v1 |
| `status` | TEXT | NO | `'open'` | v1 |
| `priority` | TEXT | NO | `'medium'` | v1 |
| `due_date` | INTEGER | YES | NULL | v1 |
| `notes` | TEXT | YES | NULL | v1 |
| `created_at` | INTEGER | NO | — | v1 |
| `synced_at` | INTEGER | YES | NULL | **v3 — ADR-005** |
| `deleted_at` | INTEGER | YES | NULL | **v3 — ADR-005** |

### `ideas`

| Column | SQL Type | Nullable | Default | Source |
|---|---|---|---|---|
| `id` | TEXT | NO | — | v1 |
| `session_id` | TEXT | NO | — | v1 |
| `text` | TEXT | NO | — | v1 |
| `source` | TEXT | NO | — | v1 |
| `category` | TEXT | YES | NULL | v1 |
| `created_at` | INTEGER | NO | — | v1 |
| `deleted_at` | INTEGER | YES | NULL | **v3 — ADR-005** |

### `issues`

| Column | SQL Type | Nullable | Default | Source |
|---|---|---|---|---|
| `id` | TEXT | NO | — | v1 |
| `session_id` | TEXT | NO | — | v1 |
| `title` | TEXT | NO | — | v1 |
| `description` | TEXT | YES | NULL | v1 |
| `location_id` | TEXT | YES | NULL | v1 |
| `severity` | TEXT | NO | `'medium'` | v1 |
| `status` | TEXT | NO | `'open'` | v1 |
| `created_at` | INTEGER | NO | — | v1 |
| `deleted_at` | INTEGER | YES | NULL | **v3 — ADR-005** |

### `decisions`

| Column | SQL Type | Nullable | Default | Source |
|---|---|---|---|---|
| `id` | TEXT | NO | — | v1 |
| `session_id` | TEXT | NO | — | v1 |
| `text` | TEXT | NO | — | v1 |
| `made_by` | TEXT | NO | `'owner'` | v1 |
| `created_at` | INTEGER | NO | — | v1 |
| `deleted_at` | INTEGER | YES | NULL | **v3 — ADR-005** |

### `transcript_lines`

| Column | SQL Type | Nullable | Default | Source |
|---|---|---|---|---|
| `id` | TEXT | NO | — | v1 |
| `session_id` | TEXT | NO | — | v1 |
| `speaker_id` | TEXT | NO | — | v1 |
| `text` | TEXT | NO | — | v1 |
| `start_time` | REAL | NO | `0` | v1 |
| `end_time` | REAL | NO | `0` | v1 |
| `timestamp` | INTEGER | NO | — | v1 |
| `location_id` | TEXT | YES | NULL | v1 |
| `deleted_at` | INTEGER | YES | NULL | **v3 — ADR-005** |

### `staff`

| Column | SQL Type | Nullable | Default | Source |
|---|---|---|---|---|
| `id` | TEXT | NO | — | v1 |
| `name` | TEXT | NO | — | v1 |
| `role` | TEXT | NO | `''` | v1 |
| `color` | TEXT | NO | `'#1E3A5F'` | v1 |
| `voice_sample_uri` | TEXT | YES | NULL | v1 |
| `avatar_initials` | TEXT | NO | `''` | v1 |
| `email` | TEXT | YES | NULL | **v3 — ADR-004** |
| `role_level` | TEXT | NO | `'member'` | **v3 — ADR-004** |
| `invite_code` | TEXT | YES | NULL | **v3 — ADR-004** |
| `supabase_user_id` | TEXT | YES | NULL | **v3 — ADR-004** |
| `avatar_url` | TEXT | YES | NULL | **v3 — ADR-004** |

---

## 4. Impact on Existing Functions — `locations` References That Break After Rename

Every function below contains a hard-coded string `'locations'` in its SQL. After the v3 migration runs, the table is named `contexts`. These functions will throw `"no such table: locations"` at runtime until updated.

| Function | Location in database.ts | SQL that breaks | Fix required |
|---|---|---|---|
| `getSessions` | line 183 | `LEFT JOIN locations l ON s.location_id = l.id` | Change to `LEFT JOIN contexts l ON s.location_id = l.id` |
| `getSession` | line 215 | `FROM sessions s LEFT JOIN locations l ON s.location_id = l.id` | Change to `LEFT JOIN contexts l ON s.location_id = l.id` |
| `getTranscriptLines` | line 281 | `LEFT JOIN locations l ON tl.location_id = l.id` | Change to `LEFT JOIN contexts l ON tl.location_id = l.id` |
| `getTasks` | line 312 | `LEFT JOIN locations l ON t.location_id = l.id` | Change to `LEFT JOIN contexts l ON t.location_id = l.id` |
| `getAllOpenTasks` | line 331 | `LEFT JOIN locations l ON t.location_id = l.id` | Change to `LEFT JOIN contexts l ON t.location_id = l.id` |
| `getIssues` | line 373 | `LEFT JOIN locations l ON i.location_id = l.id` | Change to `LEFT JOIN contexts l ON i.location_id = l.id` |
| `getLocations` | line 413 | `SELECT * FROM locations ORDER BY name ASC` | Rename function to `getContexts`; change table to `contexts` |
| `upsertLocation` | line 417 | `INSERT OR REPLACE INTO locations (...)` | Rename function to `upsertContext`; change table to `contexts`; add `context_type` to column list |
| `deleteLocation` | line 425 | `DELETE FROM locations WHERE id = ?` | Rename function to `deleteContext`; change table to `contexts` |

**Additional non-SQL breakage:**

- Line 2: `import { ..., Location, ... }` — `Location` type no longer exists after ADR-003 renames it to `Context`
- Line 3: `import { DEFAULT_LOCATIONS }` — this import is removed entirely (ADR-003 removes the constant)
- `upsertContext` call signature must accept `Context` (which includes `context_type`) — the INSERT must include the `context_type` column

**Total functions requiring SQL edits: 9** (6 JOIN queries + 3 CRUD functions)

---

## 5. Insertion Point in `lib/database.ts`

The v3 block is inserted immediately after line 143 (`await db.runAsync('PRAGMA user_version = 2');`), before the closing `}` of `migrate()`. The exact splice:

```typescript
  // ...existing v2 block ends here (line 143)...
  }

  // v3 — context model (ADR-003), identity model (ADR-004), sync + soft-delete (ADR-005)
  if (user_version < 3) {
    // ... (full block from §2 above) ...
  }
}  // end migrate()
```

The `user_version` variable is read once at line 16 before any migration runs. Because both the v2 and v3 blocks use `user_version < N` comparisons against that original snapshot, a fresh database (user_version=0) will correctly execute v1, v2, and v3 blocks in sequence on first launch. An existing v2 database will skip v1 and v2 and run only v3.

---

## 6. Notes for forge

1. **Do not** use `db.execAsync()` for this block. The `locationsExists` guard requires a query result before conditionally issuing the RENAME, which is only possible with individual `runAsync` calls.
2. **Do not** wrap in `BEGIN`/`COMMIT`. SQLite DDL is auto-commit. A transaction wrapper gives false confidence without providing real atomicity across DDL statements.
3. **The `try/catch` blocks must swallow silently.** The pattern matches the existing v2 block. A "duplicate column name" error on re-run is expected and harmless.
4. **Update the import on line 2** of `database.ts`: `Location` → `Context`, remove `DEFAULT_LOCATIONS` import from line 3 — these are TypeScript-layer changes that must land in the same commit as the migration.
5. **`upsertContext`** must add `context_type` to the INSERT column list: `INSERT OR REPLACE INTO contexts (id, name, icon, color, reference_image_uri, ai_description, context_type) VALUES (?, ?, ?, ?, ?, ?, ?)`.
6. **Test on fresh simulator** (delete `villa_assistant.db` from simulator container) AND on a simulated upgrade (backup a v2 database, restore, relaunch) before marking implementation complete.
