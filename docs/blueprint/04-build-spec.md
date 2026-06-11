# Phase 3 Blueprint — 04: Build Spec

**Date:** 2026-06-11
**Status:** Approved — engineering translation of 01-requirements + 02-screen-designs, per challenger's cut line
**Owners:** forge (all application code, including protected `lib/organization.ts`) · atlas (ONLY `lib/database.ts` / schema). Forge and atlas never touch the same file in parallel tasks.

---

## Ground rules

1. **Start from the landed Phase 2 tree** (challenger amendment 9). The canvas snapshot predates Phase 2 S4/S6 landing. `git fetch && git pull --rebase origin main` before the first commit; re-verify line references after rebase — all line numbers in this blueprint are approximate post-rebase.
2. **No schema migration.** `user_version` stays 3. Every task below fits v3 (challenger-verified). If any task appears to need a column, STOP — that is an ADR conversation first (ADR-007/008/009 do not authorize schema changes; the `tasks.completed_at` candidate is logged for Phase 4 / migration v4).
3. **No new native dependencies.** Swipe-delete uses installed `react-native-gesture-handler` 2.31 + reanimated 4.3. `expo-notifications` is explicitly out (Phase 4).
4. **Protected files:** `lib/organization.ts` (forge steward, ADR-007 governs the change), `lib/database.ts` (atlas steward, ADR — none needed, no migration, but atlas owns the task).
5. **NativeWind v4 `className` only; Tailwind v3 classes verified against `tailwind.config.js`; iOS only; Expo SDK 56 docs before any Expo/RN code.**
6. **t() key architecture preserved**; EN copy only; no new translation work.
7. **Serialization:** tasks listed as touching the same file must run sequentially in the order given, never in parallel.

---

## The two data decisions (binding)

### Due-date contract (challenger amendment 5)

- The prompt includes the **session start date with weekday** (e.g. "Monday, 2026-06-08") — today it contains only times, so Claude cannot resolve "by Friday".
- Claude returns per task: `"due_date": "YYYY-MM-DD" | null` **alongside** the existing spoken-phrase field (`due_date_description`).
- `lib/organization.ts` validates with `^\d{4}-\d{2}-\d{2}$`; valid → epoch ms at **local midnight** stored into the existing `tasks.due_date INTEGER` (schema v1 column; `addTask` already binds it); invalid/null → discard the date and **append the spoken phrase to the task's notes** so nothing is extracted-and-discarded.
- Overdue = `due_date < startOfToday` (local). **No JS date-parsing library.**

### Interrupted-session semantics (ADR-008, challenger amendment 1)

- New `SessionStatus` value **`'interrupted'`** — TEXT column, no migration.
- At app launch / Home load, BEFORE rendering the session list: every session with status `'recording'`/`'paused'` whose id ≠ the live store's `sessionId` is set to `'interrupted'`, `ended_at` = last persisted transcript line timestamp (or `started_at` if none).
- The recording screen's live-capture mount path may only run when the in-memory store confirms this id is the live recording; `'interrupted'` renders the read-only recovery layout. No code path resumes a dead session.
- **Every status filter/switch must handle `'interrupted'`** (amendment 7): Home activeSession find, SessionCard styling, review guards.

---

## Build tasks

### T1 — Data-layer functions — **atlas** — `lib/database.ts` ONLY

New functions (code, not schema — all fit v3; challenger amendment 10):
- `markInterruptedSessions(liveSessionId: string | null)` — the launch auto-close: `UPDATE sessions SET status='interrupted', ended_at=<last transcript line ts | started_at> WHERE status IN ('recording','paused') AND id != ?`.
- `updateTask(id, partial)` — assignee / due_date / priority / status / notes.
- `deleteTask(id)`.
- `getAllTasks()` — all tasks across sessions incl. done, with session title joined (Tasks tab Done segment + person grouping).
- `getAllOpenIssues()` — open issues across sessions with session title (R8-minimal).
- `updateIssueStatus(id, status)` — resolve action.
- `deleteSession(...)` — add `FileSystem.deleteAsync(sessions/${id}.m4a, { idempotent: true })` (amendment 11; orphaned audio leak).

**Acceptance evidence:** Jest run green (`npm test`); fresh-install simulator boot shows `user_version` = 3 (no migration ran); deleting a session removes its `.m4a` from the documents directory (verify via FileSystem listing before/after).

### T2 — Shared components — **forge** — NEW files only (parallel-safe with T1)

`components/NoticeBanner.tsx`, `components/SegmentedControl.tsx`, `components/EmptyState.tsx`, `components/PersonChip.tsx`, `components/SetupCard.tsx`, `components/PersonCard.tsx` — props per 02-screen-designs component inventory. No `StyleSheet.create`; `className` only.

**Acceptance evidence:** each component renders in at least one consuming screen by end of phase; `npm test` green; no Tailwind classes outside `tailwind.config.js`.

### T3 — Recording screen rework + session lifecycle — **forge** — depends on T1

Files: `types/index.ts` (add `'interrupted'` to `SessionStatus`), `app/(tabs)/index.tsx`, `app/session/[id].tsx`, `components/SessionCard.tsx`, `stores/session.ts`.

- Home: call `markInterruptedSessions(store.sessionId)` on load before render; replace the red "Still going" banner with the amber interrupted banner (red live-return banner kept for genuinely live `store.sessionId === id && isRecording`).
- Recording screen: guard the mount effect — live capture starts ONLY when the store confirms this id is live; render the Recovery layout (read-only transcript, "Save & review" primary, "Discard" with single confirm) for `'interrupted'`. Kill the unconditional `recorder.record()` path for non-live sessions (the `audio_uri` overwrite footgun, verified at `session/[id].tsx:112–131`).
- Delete the per-utterance speaker chips row (~303–322) and the place-picker images (~370–376); add "+ New place" pinned row to the place picker with NOT NULL defaults (`'space'` / `'📍'` / default color — amendment 8).
- Stop → action sheet ("End & organize" / "Keep recording").
- SessionCard: `interrupted` style (amber, "Interrupted"); sweep every status switch (amendment 7).
- Optional best-effort: persist `recorder.uri` to the session row at record-start (amendment 2).

**Acceptance evidence:** simulator: start recording, force-quit, relaunch → session shows amber "Interrupted", all persisted transcript lines present, opening it shows the recovery layout, `audio_uri` unchanged after any interaction; grep confirms no path calls `record()` for a non-live session.

### T4 — Organizer prompt contract v2 — **forge** (protected file; ADR-007 governs) — SERIALIZED after T3 (both touch `types/index.ts`)

Files: `lib/organization.ts`, `types/index.ts` (`OrganizedSession`: remove `next_steps`, add resolved `due_date`).

- Add session start date with weekday; contexts rendered as `id (type): name`; priority rules; never-guess assignment; context-type semantics; attribution-may-be-incomplete line; remove `next_steps`; add "Return ONLY the JSON object."; `max_tokens` 4096 → 8192; keep the lenient brace-extraction parser; due-date validation/mapping per the binding contract above.

**Acceptance evidence:** fixture tests: (a) "Maria, the pool pump is leaking, fix it today" → `priority:'high'`, assignee Maria, context Pool, due_date = session date; (b) "someone should repaint the gate sometime" → `priority:'low'`, unassigned; (c) "by Friday" on a Monday session resolves to that Friday; (d) malformed date string → task saved, no due_date, phrase appended to notes; (e) response JSON contains no `next_steps`. Key never logged.

### T5 — Card components rework — **forge** — `components/TaskCard.tsx`, `components/TranscriptLine.tsx` (parallel-safe with T3/T4)

- TaskCard: due chip (relative "by Fri", overdue red), `sessionTitle` meta line, edit-sheet trigger.
- TranscriptLine: drop per-speaker color bubbles/avatars; single neutral bubble; keep `onPress` tap-to-play + playing highlight (amendment 4 — tap stays tap-to-play).

**Acceptance evidence:** snapshot/visual check in Tasks tab and Review transcript; overdue task renders red chip when device date passes due_date.

### T6 — Tasks tab rework (L) — **forge** — `app/(tabs)/tasks.tsx` — depends on T1, T2, T5

Open/Done segments (SegmentedControl); Open grouped by assignee ("You" first, A–Z, "Unassigned" last with amber dot); per-person share icon → share sheet text digest (title, due date, place, notes); due chips + overdue-first sort; task edit sheet (assignee/due date/priority/delete — uses `updateTask`/`deleteTask`); collapsed "Open issues (n)" row with inline expand + Resolve (uses `getAllOpenIssues`/`updateIssueStatus`); Done segment with reopen (no timestamps — Phase 4).

**Acceptance evidence:** check a task off, switch to Done, uncheck → back in Open; share a person's group → share sheet contains only their open tasks with due dates; resolve an issue from a 3-sessions-old session without opening it; delete a mis-extracted task with one confirm.

### T7 — Team tab — **forge** — `app/(tabs)/rooms.tsx` → `app/(tabs)/team.tsx`, `app/(tabs)/_layout.tsx`

Rename file (safe — only route ref is `_layout.tsx:41`); people-only list with PersonCard (open-task badge only if trivial); tap → Tasks tab filtered to person (Person detail route is Phase 4); edit/remove with "tasks become Unassigned" confirm copy; keep Add Someone sheet; remove the context/staff inner segments and all context gallery rendering.

**Acceptance evidence:** app navigates Home/Tasks/Team/Settings; no route or import references `rooms`; removing a person leaves their tasks visible under Unassigned.

### T8 — Review rework (L) — **forge** — `app/review/[id].tsx` — SERIALIZED after T3 (status guards) and T4 (types)

Non-blocking organize progress card (kill the full-screen overlay); persistent failure NoticeBanner + Retry; inline missing-key card (paste field + "Save & organize" via `stores/settings.ts`); save path passes `due_date` through to `addTask` (the verified missing pipe at the review save callsite); "…" overflow with Delete session (single confirm; Rename is Phase 4); share upgrades (due dates included; "Everything" / "Just [person]'s tasks" pre-step); `'interrupted'` status guard; NO next-steps card (amendment 3); remove unused `Animated` import.

**Acceptance evidence:** organize with no key → inline card, paste key, organize succeeds without leaving the screen; kill network mid-organize → banner + Retry recovers; browse Transcript tab while organizing; share "Just Maria's tasks" → digest contains only hers with due dates; organized session's tasks carry due_date in SQLite.

### T9 — Pre-flight sheet — **forge** — `app/session/new.tsx` (replaced), modal registration in router layout if needed

Half-height sheet (fallback: full-screen route with identical content if `formSheet` fights expo-router); editable title row; person chips + inline "+ Add"; place chips + "+ New place" (defaults per amendment 8); NO "Ask me" chip; full-width Start Recording; mic-permission NoticeBanner with Settings deep link.

**Acceptance evidence:** Home → FAB → Start = 2 taps with zero team/places configured; "+ Add" creates a person without leaving the sheet; created place has `context_type='space'`, non-null icon/color.

### T10 — Settings + Places — **forge** — `app/(tabs)/settings.tsx`, `app/places.tsx` (NEW)

Auto-save on blur + "Saved ✓" (remove the bottom Save button; keep Phase 2 S3 key-wipe guard); "Test key" button — minimal API call, **key never logged** (amendment 12), inline pass/fail copy; Places row → `app/places.tsx` (name rows, trash + single confirm, name-only add with defaults); replace the disabled Offline Mode switch with the static on-device-transcription info row.

**Acceptance evidence:** valid key → green "Key works"; invalid key → inline red copy, nothing in console logs containing the key (grep simulator logs); name edit persists after blur + app restart; no Switch component remains in settings.

### T11 — First-run SetupCard — **forge** — `app/(tabs)/index.tsx` — SERIALIZED after T3 (same file)

Three self-ticking rows (record / add team / connect Claude with inline key capture + Test); shrinks to one-row reminder after first recording until key saved; dismisses for good when a session exists AND key saved.

**Acceptance evidence:** fresh simulator install → SetupCard visible; record 1-min test + paste key from card → organized task list, total elapsed < 5 min, no instructions used (R1 acceptance).

### T12 — Kill sweep + naming sweep — **forge** — LAST code task (touches many files; run after T3–T11 land)

Delete `lib/vision.ts` (zero importers — challenger-verified); remove `Platform.OS === 'web'` fallback blocks (rooms/team, new, session); grep-based copy sweep: "Spaces", "Context", "Starting Context", "Add Context", "Rooms", "Team tab" hint — each concept has exactly one name (Places / Team / Session per 02 rulings).

**Acceptance evidence:** `grep -ri` across `app/ components/` finds zero user-facing occurrences of the banned nouns; `tsc --noEmit` clean after vision deletion; `npm test` green.

### T13 — Verification gate — reviewer → sentinel → atlas

reviewer code-quality pass (separate from security); sentinel `/smoke-test` on a **fresh simulator** (migration-failure fragility) + R2 force-quit drill + first-run R1 drill; SENTINEL CLEAR required; atlas runs the release per `/deploy`.

---

## Suggested execution order

```
Wave 1 (parallel): T1 (atlas) | T2 (forge)
Wave 2:            T3 → T4        (serialized on types/index.ts)
Wave 3 (parallel): T5 | T7 | T9 | T10
Wave 4:            T6 → T8 → T11  (T6 needs T1/T2/T5; T8 after T3/T4; T11 after T3)
Wave 5:            T12 → T13
```

---

## DO-NOT-TOUCH list

- **Shelved Supabase layer:** `lib/auth.ts`, `lib/sync.ts`, `lib/invites.ts`, `app/auth/`, `app/(member)/`, `app/invite/`, `components/RightsGate.tsx`. Do not import, do not delete, do not refactor. `@supabase/supabase-js` stays in deps, never newly imported. ADRs 004–006 stay decided-but-shelved.
- **`.env*` / `.env.local`** — never read into code, never committed.
- **SQLite schema / migrations** — no migration v4; `user_version` stays 3. The `tasks.completed_at` candidate is Phase 4 and needs its own ADR.
- **EL/HE dictionaries** — frozen; t() keys preserved; EN copy only.
- **Anthropic API key** — SQLite settings via `stores/settings.ts` only; never hardcoded, never logged (including by "Test key").
- **Build-path patches** — the path-with-spaces build script patches (see memory `feedback_build_paths.md`) must not be reverted; no new native modules that force a pod install.

---

*Authored by villa (product) and canvas (design), challenged by challenger, assembled by scribe — 2026-06-11, Phase 3 of the rescue engagement.*
