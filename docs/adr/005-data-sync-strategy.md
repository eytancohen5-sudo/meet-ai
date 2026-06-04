# ADR-005: Hybrid Sync — SQLite Primary on Device, Supabase as Sync Target

**Date:** 2026-06-04
**Status:** Accepted
**Deciders:** Boss (Eytan)

---

## Context

The app is adding Supabase as a backend to support multi-user access — team members need to see sessions, tasks, and profiles recorded by the session owner. The core constraint is that recording sessions happens during live meetings, which may occur in areas with no internet connectivity. Any architecture that requires a network call on the hot path (record, transcribe, organize) is a non-starter.

Two options were considered:

- **Supabase-primary:** All writes go directly to Supabase; SQLite is a read cache. Requires internet during recording. Rejected.
- **Hybrid (chosen):** SQLite is the write-primary store on device. Supabase receives a copy of completed data after the fact. Recording and review work fully offline. Sync happens opportunistically.

---

## Decision

**SQLite is the primary store for all in-session writes.** The recording, transcript lines, extracted tasks, ideas, issues, and decisions all land in SQLite first, regardless of connectivity.

**Supabase is the sync target** — a durable, shared copy of data that team members and the web portal can read. It is not the source of truth for session data; it is a downstream replica of it.

**Supabase is authoritative** only for identity and team membership:
- `auth.users` — login, tokens, session credentials
- `profiles` — team member records, roles, display names
- Invite codes — owned by Supabase, never by the device

**Sync is non-blocking.** No sync call is ever awaited on the UI thread. Failures are caught, logged, and retried on the next foreground event. The user is never blocked or notified of a sync failure unless the retry count exceeds a future threshold (not yet defined).

---

## Sync Table

| Data | Direction | Trigger |
|---|---|---|
| Sessions (metadata, status, summary) | device → Supabase | `status` changes to `complete` |
| Transcript lines | device → Supabase | on session complete (batched with session) |
| Tasks | device → Supabase | on create; on status change (open → done) |
| Ideas | device → Supabase | on session complete |
| Issues | device → Supabase | on session complete |
| Decisions | device → Supabase | on session complete |
| Team members / profiles | bidirectional | on app foreground if `last_synced_at` stale > 5 min |
| Contexts (rooms, etc.) | device → Supabase | on create or update |
| Audio files | NOT synced | too large; owner device only — see Known Limitations |

Foreground sync also re-pushes any session or task that has `synced_at IS NULL` (i.e., a prior push failed and was not retried yet).

---

## Conflict Resolution Rules

1. **Default: last-write-wins** on non-critical scalar fields (session name, task title, context label, etc.). The record with the more recent `updated_at` timestamp overwrites the other.

2. **Task status: `done` always wins.** If a device has a task marked `open` and Supabase has it as `done`, the device adopts `done` — never the reverse. A completed task cannot be re-opened by a stale local copy.

3. **Auth and profiles: Supabase wins.** The device never overwrites `auth.users`. Profile pulls from Supabase overwrite the local cache unconditionally on foreground sync.

4. **Session transcript lines: append-only.** Lines are never updated after creation; they are only inserted. No conflict can arise.

5. **Deleted records:** Soft-delete only (a `deleted_at` timestamp). Hard deletes are not supported at this time. A record deleted locally is pushed to Supabase with its `deleted_at` set; Supabase does not propagate deletes back to devices.

---

## Known Limitations

- **Audio files are owner-device only.** Audio is never uploaded to Supabase. Team members cannot access recordings. The web portal has no audio playback. This is an intentional trade-off to avoid storage costs and privacy complexity at this stage. It is a known gap.

- **Schema must stay in sync.** Supabase tables are required to mirror SQLite column-for-column, with the exception of columns that contain device-only data (specifically `audio_uri`). Any SQLite migration that adds or renames a column requires a matching Supabase migration. Atlas owns both schemas simultaneously (see ADR-004 if applicable).

- **No real-time push to devices.** Team members do not receive live updates during an active session. They see data after the owner's session is marked complete and synced. Real-time subscriptions (Supabase Realtime) are out of scope for this version.

- **Single owner per session.** Sessions are recorded by one device. There is no collaborative recording or merge path for two devices recording the same meeting. Out of scope.

- **`last_synced_at` is local state only.** It tracks when the device last ran a foreground sync, not when Supabase last received data. A device that is wiped will re-push all unsynced sessions on next launch.

---

## Consequences

### New file: `lib/sync.ts`

This file is created as part of this decision. All sync logic lives here; no screen or store calls Supabase directly for push operations.

```typescript
// lib/sync.ts

/**
 * Push a completed session (metadata, transcript, tasks, ideas, issues,
 * decisions) to Supabase. Called after organize completes on the review screen.
 * Swallows all errors and logs them.
 */
export async function syncSessionToSupabase(sessionId: string): Promise<void>

/**
 * Push a single task's current state to Supabase.
 * Called whenever task status changes (create, open → done).
 * Swallows all errors and logs them.
 */
export async function syncTaskUpdate(taskId: string): Promise<void>

/**
 * Push a local team member / staff profile record to Supabase.
 * Called from settings screen on profile save.
 * Swallows all errors and logs them.
 */
export async function syncTeamMember(staffId: string): Promise<void>

/**
 * Pull the current team member list from Supabase and upsert into local
 * SQLite. Called on app foreground when last_synced_at is stale > 5 minutes.
 * Swallows all errors and logs them.
 */
export async function pullTeamFromSupabase(): Promise<void>
```

All four functions return `Promise<void>` and must never throw. Errors are caught internally and written to the console (and optionally to a local `sync_errors` log table for future diagnostics).

### Changes to existing files

| File | Required change |
|---|---|
| `app/review/[id].tsx` | Call `syncSessionToSupabase(sessionId)` after organize completes (fire-and-forget, do not await in render path) |
| `app/(tabs)/tasks.tsx` | Call `syncTaskUpdate(taskId)` whenever a task is toggled done |
| `app/(tabs)/settings.tsx` | Call `syncTeamMember(staffId)` when a staff profile is saved |
| `app/_layout.tsx` | On `AppState` change to `active`, check `last_synced_at`; if stale > 5 min, call `pullTeamFromSupabase()` |
| `lib/database.ts` | Add `last_synced_at` and `synced_at` columns via migration v3 (see below) |

### Supabase schema notes

The following tables must exist in Supabase and mirror the SQLite schema, excluding device-only columns.

**Tables required:**

| Table | Key columns | Notes |
|---|---|---|
| `sessions` | `id`, `title`, `status`, `room_id`, `user_id`, `created_at`, `updated_at` | No `audio_uri` column |
| `transcript_lines` | `id`, `session_id`, `speaker`, `text`, `timestamp_ms`, `created_at` | Append-only |
| `tasks` | `id`, `session_id`, `title`, `status`, `assignee_id`, `created_at`, `updated_at` | `status` enum: `open`, `done` |
| `ideas` | `id`, `session_id`, `text`, `created_at` | |
| `issues` | `id`, `session_id`, `text`, `created_at` | |
| `decisions` | `id`, `session_id`, `text`, `created_at` | |
| `profiles` | `id`, `user_id`, `display_name`, `role`, `updated_at` | Supabase-authoritative |
| `contexts` | `id`, `label`, `type`, `user_id`, `created_at`, `updated_at` | Rooms, etc. |

**SQLite migration v3 additions (required before `lib/sync.ts` is wired up):**

```sql
-- sessions table
ALTER TABLE sessions ADD COLUMN synced_at INTEGER;       -- unix ms, null = not yet synced
ALTER TABLE sessions ADD COLUMN last_synced_at INTEGER;  -- last foreground sync attempt

-- tasks table
ALTER TABLE tasks ADD COLUMN synced_at INTEGER;          -- null = pending push
```

Row-level security on all Supabase tables: users may only read/write rows where `user_id = auth.uid()` or where they are a member of the owning team (policy to be defined in ADR-006 or equivalent).

---

## Notes

This decision keeps the on-device experience fast and resilient. The trade-off is eventual consistency: a team member may see data that is minutes behind the owner's device. That lag is acceptable for the current use case (post-meeting review by the team). If real-time collaboration becomes a requirement, this ADR will need to be revisited.
