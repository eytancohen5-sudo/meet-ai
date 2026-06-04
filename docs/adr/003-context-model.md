# ADR-003: Replace `Location` with `Context` — Generalized Meeting Context Model

**Date:** 2026-06-04
**Status:** Accepted
**Deciders:** Boss (Eytan)

---

## Context

The app is pivoting from villa property management to a general team meeting intelligence platform ("Meet AI"). The existing `Location` type was purpose-built for physical rooms in a villa: it carries `reference_image_uri`, `ai_description`, `icon`, and `color`, and the `DEFAULT_LOCATIONS` constant seeds ten hardcoded villa rooms (Entrance, Living Room, Kitchen, etc.) on first install.

This model is too narrow for the new use case. A meeting might be about a product, a website, a slide deck, a document, or any arbitrary topic — none of which are physical spaces. Keeping `Location` and its villa-specific seeds would make every new user's first experience wrong.

Three specific problems forced this decision:

1. **Type name mismatch.** `Location` implies a physical place. Downstream code — prompts, UI labels, transcript annotations — all say "location" when the concept is really "what this meeting is about."
2. **Hardcoded seeds.** `DEFAULT_LOCATIONS` auto-populates villa rooms. New users would see "Pool Area" and "Terrace" regardless of their domain.
3. **No type discrimination.** There is no way to express that a context is a product vs. a room vs. a URL. Claude vision, display logic, and future filtering all need this.

expo-sqlite is at version `^56.0.4`. SQLite `ALTER TABLE ... RENAME TO` is available from SQLite 3.26 (2018-12-01); the SQLite bundled with Expo 56 is well above that threshold, so `ALTER TABLE locations RENAME TO contexts` is valid. However, because the existing `location_id` foreign-key columns across five tables are plain `TEXT` columns with no declared `REFERENCES` constraint, renaming the parent table requires no cascading changes on the child columns — only the JOIN queries in `database.ts` need their table name updated.

---

## Decision

1. Rename the TypeScript type `Location` → `Context` in `types/index.ts` and add a `context_type` discriminator field.
2. Remove the `DEFAULT_LOCATIONS` constant and its migration-time seeding.
3. Rename the SQLite table `locations` → `contexts` in a new migration v3.
4. Rename the three CRUD exports in `lib/database.ts` that reference "Location" → "Context".
5. Rename the two vision functions in `lib/vision.ts` from room-specific to context-generic names.
6. Update every callsite across the app accordingly (see Files Affected below).

The `reference_image_uri`, `ai_description`, `icon`, and `color` fields are retained as-is — they are valid for all context types: a product photo, a website screenshot, or a room photo all fit `reference_image_uri`; Claude vision can generate `ai_description` for any of them.

The empty-state UX for the contexts list becomes an "Add your first context" prompt rather than a pre-seeded list.

---

## Options Considered

### Option A — Rename `Location` → `Context` (chosen)
Pros: semantically correct; single rename that unblocks all non-space context types; minimal schema delta.
Cons: touches 9 files; requires a migration; all in-flight PRs must rebase.

### Option B — Add a parallel `Context` type alongside `Location`
Pros: zero breakage of existing Location code paths.
Cons: duplicates the model permanently; two tables to keep in sync; confusing to all agents; does not solve the DEFAULT_LOCATIONS seeding problem.

### Option C — Widen `Location` in place (add `context_type`, keep name)
Pros: no file renames outside `types/index.ts` and `database.ts`.
Cons: the name `Location` remains semantically misleading forever; UI labels and prompts would still say "location" for a product or a website; deferred confusion.

---

## Consequences

**Positive:**
- The data model now accurately describes what a meeting is "about" regardless of domain.
- `context_type` enables type-specific UI (icon pickers, display copy) and future Claude prompting that varies by type.
- Removing `DEFAULT_LOCATIONS` eliminates the wrong-first-impression problem for all non-villa users.

**Negative:**
- Nine files require coordinated edits; must land in a single commit to avoid a broken intermediate state.
- Any user data in the `locations` table on a device that ran v1/v2 must be migrated losslessly (the migration handles this — see spec below).

**Risks:**
- Migration failure on cold start: the `ALTER TABLE ... RENAME TO` path is safe but must be wrapped in a transaction. If migration v3 partially runs and crashes, `user_version` stays at 2 and the rename re-runs on next launch — which fails because `contexts` already exists. Mitigation: wrap the entire v3 block in `BEGIN`/`COMMIT` and use `IF NOT EXISTS` / `IF EXISTS` guards where available.
- SQL JOIN queries reference the table name `locations` in ~6 places inside `database.ts`; missing any one will produce a runtime "no such table" error. The Files Affected section below is exhaustive.

---

## Files Affected (exhaustive list with what changes)

### `types/index.ts`
- **Remove** the `Location` interface.
- **Add** the `Context` interface:
  ```ts
  export interface Context {
    id: string;
    name: string;
    context_type: 'space' | 'product' | 'presentation' | 'website' | 'document' | 'other';
    icon: string;
    color: string;
    reference_image_uri?: string;
    ai_description?: string;
  }
  ```
- **Remove** the `DEFAULT_LOCATIONS` export and its entire array value.

### `lib/database.ts`
- **Import line 2:** `Location` → `Context`; remove `DEFAULT_LOCATIONS` import (line 3).
- **Migration v1 block:** Table still named `locations` here — do not change; v3 migration renames it.
- **Migration v2 block:** References `ALTER TABLE locations` — do not change; it ran before v3.
- **Add migration v3 block** (see Migration v3 Spec below).
- **Remove the v1 seeding loop** (lines 128–134) that inserts `DEFAULT_LOCATIONS`. This loop ran only at `user_version < 1`; removing it from the source prevents it from running on any future fresh install while leaving already-seeded devices unaffected.
- **`getLocations` → `getContexts`**: Query `SELECT * FROM contexts ORDER BY name ASC`; return type `Context[]`.
- **`upsertLocation` → `upsertContext`**: Query `INSERT OR REPLACE INTO contexts (...) VALUES (...)`, add `context_type` column; parameter type `Context`.
- **`deleteLocation` → `deleteContext`**: Query `DELETE FROM contexts WHERE id = ?`.
- **Section comment** `// ── Locations` → `// ── Contexts`.
- **All JOIN queries** that reference `LEFT JOIN locations l ON ...`:
  - `getSessions` (line 183): `LEFT JOIN contexts l ON s.location_id = l.id`
  - `getSession` (line 215): `LEFT JOIN contexts l ON s.location_id = l.id`
  - `getTranscriptLines` (line 281): `LEFT JOIN contexts l ON tl.location_id = l.id`
  - `getTasks` (line 312): `LEFT JOIN contexts l ON t.location_id = l.id`
  - `getAllOpenTasks` (line 331): `LEFT JOIN contexts l ON t.location_id = l.id`
  - `getIssues` (line 373): `LEFT JOIN contexts l ON i.location_id = l.id`

Note: The `location_id` column name in `sessions`, `transcript_lines`, `tasks`, and `issues` tables is **not** renamed in this ADR. It remains `location_id` as a foreign-key string; renaming it would require recreating those tables and is deferred to a later migration if desired.

### `lib/vision.ts`
- **Import line 3:** `Location` → `Context`.
- **`describeRoomForRegistration` → `describeContextFromPhoto`**: Function signature, JSDoc, and any internal room-specific language updated.
- **`identifyRoomFromPhoto` → `identifyContextFromPhoto`**: Function signature; parameter `knownLocations: Location[]` → `knownContexts: Context[]`; internal variable `roomDescriptions` and `knownLocations` references updated.

### `lib/organization.ts`
- **Import line 2:** `Location` → `Context`.
- **Function parameter** (line 9): `locations: Location[]` → `contexts: Context[]`.
- **Internal variable** `locationMap` can stay named as-is (internal implementation detail) or be renamed to `contextMap` for consistency — forge's call.
- **No SQL** in this file — no table references to update.

### `stores/session.ts`
- No TypeScript `Location` import in this file (it uses string fields `currentLocationId`, `currentLocationName` — these column names are not being renamed in this ADR).
- No changes required.

### `app/session/new.tsx`
- **Import line 9:** `Location` → `Context` from `'../../types'`.
- **Import line 8:** `getLocations` → `getContexts` from `'../../lib/database'`.
- **State variables** `locations` and `selectedLocation`: types change to `Context[]` and `Context | null`.
- **Section label** in JSX (line 108): "Starting Location" — rename to "Starting Context" or a user-facing equivalent (canvas decision).

### `app/session/[id].tsx`
- **Import line 12:** `getLocations` → `getContexts` from `'../../lib/database'`.
- **Import line 14:** `identifyRoomFromPhoto` → `identifyContextFromPhoto` from `'../../lib/vision'`.
- **Import line 18:** `Location` → `Context` from `'../../types'`.
- **State variable** `locations: Location[]` → `contexts: Context[]`.
- **`handleChangeLocation`** (line 175): rename to `handleChangeContext`; parameter type `Location` → `Context`.
- **All `identifyRoomFromPhoto` callsites** (line 226): → `identifyContextFromPhoto`.
- **UI labels** "Change Location", "Location updated", "Location Match", "Pick Manually", "Pick Room", "Tap to set location" — canvas decision on exact new copy; forge updates strings.

### `app/(tabs)/rooms.tsx`
- **Import line 11:** `getLocations`, `upsertLocation`, `deleteLocation` → `getContexts`, `upsertContext`, `deleteContext`.
- **Import line 12:** `describeRoomForRegistration` → `describeContextFromPhoto` from `'../../lib/vision'`.
- **Import line 13:** `Location` → `Context` from `'../../types'`.
- **State variable** `locations: Location[]` → `contexts: Context[]`.
- **`confirmDeleteRoom`** (line 128): rename to `confirmDeleteContext`; parameter type `Location` → `Context`.
- **`loc: Location`** (line 115): → `ctx: Context`.
- **Tab label** "Rooms" (line 188) — rename to "Contexts" or "Topics" — canvas decision.
- **`describeRoomForRegistration` callsite** (line 84): → `describeContextFromPhoto`.

### `app/review/[id].tsx`
- **Import line 15:** `getLocations` → `getContexts`.
- **No TypeScript `Location` type import** in this file — no type change needed.
- The `location_id` and `location_name` fields on `Task` and `Issue` objects passed through this screen are column names that are not being renamed; no changes to those references.

---

## Migration v3 Spec (exact SQL)

The migration must:
1. Rename `locations` to `contexts`.
2. Add the `context_type` column to `contexts` with a default that maps existing villa-room rows to `'space'`.
3. Bump `user_version` to 3.

```sql
BEGIN;

ALTER TABLE locations RENAME TO contexts;

ALTER TABLE contexts ADD COLUMN context_type TEXT NOT NULL DEFAULT 'space';

PRAGMA user_version = 3;

COMMIT;
```

**Rationale for `DEFAULT 'space'`:** All rows that existed before v3 are physical rooms (seeded by `DEFAULT_LOCATIONS` in v1 or created manually via the Rooms screen). Assigning them `context_type = 'space'` is lossless and semantically correct.

**Rationale for not recreating the table:** SQLite `ALTER TABLE ... RENAME TO` is atomic and preserves all row data, indexes, and triggers. A DROP + CREATE approach would delete existing user-registered rooms. The `ALTER TABLE ... ADD COLUMN` form is also atomic and appends without rewriting rows.

**expo-sqlite execution note:** In `lib/database.ts`, `db.execAsync()` is used for multi-statement DDL. The v3 block should use `db.execAsync()` consistent with v1, not individual `runAsync` calls, so the `BEGIN`/`COMMIT` wrapper is honoured as a single batch.

---

## Related

- `types/index.ts` — `Location` interface and `DEFAULT_LOCATIONS` (to be removed)
- `lib/database.ts` — migration history (v1 creates `locations`, v2 adds columns, v3 renames)
- `lib/vision.ts` — vision functions to rename
- Memory: `VillaAssistant/.claude/memory/` — project pivot to Meet AI
