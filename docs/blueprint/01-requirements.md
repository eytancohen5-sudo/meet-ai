# Phase 3 Blueprint — 01: Product Requirements

**Date:** 2026-06-11
**Status:** Approved (challenger verdict: APPROVE-WITH-CUTLINE, applied throughout)
**Authors:** villa (product), amended per challenger's binding review

---

## Product thesis

Meet AI is a pocket chief-of-staff for a hands-on manager. Its one job: turn a spoken walkthrough or meeting into a working task board, fast enough to act on the same day.

The weekly rhythm it serves: Monday morning, Eytan walks the property (or sits in a meeting) with the phone recording; within minutes of finishing, Claude has organized it into a summary, assigned tasks with due dates, open issues, ideas, and decisions; in two taps each staff member receives their own list by WhatsApp/SMS; through the week Eytan checks tasks off from one aggregate list sorted by what's due; next Monday's walkthrough starts from what's still open. Everything between "I said it out loud" and "it got done" should require zero typing and zero memory.

**Hard constraint:** single-owner mode. The Supabase multi-user layer is shelved by decision (ADRs 004–006 stay decided-but-shelved). No requirement may depend on a second logged-in user. Handoff happens via the iOS share sheet, not via accounts.

---

## Phase 3 requirements (IN — challenger cut line applied)

### R1 (P1) — First-run: recording and organized in five minutes

**Outcome (as amended):** No blocking onboarding form. First launch shows a **SetupCard** on Home with three self-ticking checklist rows: record your first meeting (points at the FAB), add your team (optional), connect Claude (inline key paste + Test button + console.anthropic.com link). If the key is missing at organize time, the Review screen itself offers an inline paste field + "Save & organize" — never a dead-end error. Settings gains a **"Test key"** button that verifies the key with a minimal API call (key never logged — challenger amendment 12).

**Why:** the API key is required for the core feature and today nothing asks for it until organize silently fails — the first session is the whole sales pitch.

**Acceptance:** fresh install, no instructions, the user records a 1-minute test and sees an organized task list in under 5 minutes. The user cannot reach a silent organize failure: every missing-key path surfaces an inline capture field.

### R2 (P1) — Capture is sacred: never blocked, never lost

**Outcome (as amended — challenger amendments 1, 2, 7):** Recording works with no API key, no people, no topics selected. **Auto-close at launch wins:** at app launch / Home load, any session with status `recording`/`paused` whose id ≠ the live in-memory store's `sessionId` is immediately set to a new status **`interrupted`**, with `ended_at` = timestamp of its last persisted transcript line (or `started_at` if none). The user sees an amber banner: "Your recording from [time] was interrupted — it's saved," with Review and Organize actions. The recovery screen renders only for `interrupted` — no code path treats it as live, and there is no "resume" of a dead session. `interrupted` is a new `SessionStatus` value (TEXT column — **no migration**); every status filter in the app must handle it.

**Why:** the current "Still going" banner re-enters a screen that unconditionally re-records and overwrites `audio_uri` — one bad tap destroys a morning's walkthrough. Verified in code: `app/session/[id].tsx:112–131` starts capture unconditionally on mount; `handleStop` writes to the fixed path `sessions/${id}.m4a`.

**Acceptance (reworded per challenger amendment 2):** force-quit mid-recording, reopen: zero **persisted** transcript lines lost (lines are written to SQLite per final utterance — verified), and re-entry can never overwrite the session's audio. *"Audio intact" is not implementable for force-kills* — the recorder's temp file URI dies with the process; audio of a crashed session was never finalized. Optional forge improvement: persist `recorder.uri` to the session row at record-start for best-effort salvage.

### R3 (P1) — Organizer brain v2: rules, not vibes

**Outcome:** The Claude prompt gets explicit business rules (full contract in ADR-007):

- **Priority:** high = safety, guest-impacting, blocking other work, or explicit urgency words ("today", "urgent", "before the guests arrive"); low = explicit deferral ("no rush", "whenever", "someday"); medium = everything else.
- **Assignment:** assign only when a name or unambiguous role is spoken; never guess; unassigned tasks stay unassigned and the review/tasks UI surfaces them in an "Unassigned" group with one-tap assignment.
- **Context types:** the prompt receives each context rendered as `id (type): name` and uses the type — a `space` is where an issue physically is; a `document` or `website` is subject matter, not a location.
- **Attribution honesty (R9-partial merged here):** the prompt is told speaker attribution may be incomplete and to rely on names spoken in the text ("Maria, please…") for assignment.
- **`next_steps`: removed from the prompt entirely** (see kill-list). Challenger amendment 3: removed from the prompt, from `OrganizedSession`, AND from canvas's Review spec — no reserved UI slot.
- **Guardrails (challenger amendment 6):** keep the lenient brace-extraction parser; add "Return ONLY the JSON object"; bump `max_tokens` 4096 → 8192 (long meetings already risk truncated JSON).

**Acceptance:** "Maria, the pool pump is leaking, fix it today" → high-priority task, assigned Maria, tagged Pool; "someone should repaint the gate sometime" → low priority, unassigned, surfaced for assignment at review.

### R4 (P1) — Due dates: extract → store → show → act

**Outcome (contract per challenger amendment 5):** The prompt includes the session start date **with weekday** (today it contains only times — Claude cannot resolve "by Friday" without it). Claude returns `"due_date": "YYYY-MM-DD" | null` alongside the existing spoken-phrase description; `lib/organization.ts` validates with `^\d{4}-\d{2}-\d{2}$`, stores epoch ms at local midnight into the existing `tasks.due_date` column, and discards on invalid — appending the spoken phrase to notes when unresolved so nothing is extracted-and-discarded. No JS date-parsing library. Due dates appear on every task card as a chip; the aggregate open-tasks list is grouped **Overdue / Today / This week / Later / No date**; overdue = `due_date < startOfToday`, visually flagged. Due date is editable from the task list (edit sheet, R5).

**Why:** this is the spine of the weekly rhythm — and today the app extracts the date phrase and throws it away. Challenger verified the pipe is 90% built: `tasks.due_date INTEGER` exists since schema v1, `addTask` already binds it, `Task.due_date?: number` exists. The only gaps are prompt → map → save → UI. **No schema migration.**

**Acceptance:** record "fix the pump by Friday" on Monday → task shows Friday's date, sits under "This week", moves to "Overdue" on Saturday if unchecked.

### R5 (P1) — Task lifecycle: open → done → findable history (core)

**Outcome (as cut):** Checking off a task moves it to a **Done** segment on the Tasks tab — it never vanishes. Unchecking restores it to Open. A **minimal task edit sheet** (assignee / due date / priority / delete) is reachable from the aggregate list — R4 requires due-date editing anyway, so one sheet covers all corrections including deleting a mis-extracted task.

**Cut (Phase 4):** "Done · yesterday" completion timestamps — no `completed_at` column exists; that needs migration v4 (logged in the Phase 4 backlog, keeps "no migration in Phase 3" true). Undo-toast choreography is also cut — the Done segment itself is the undo path.

**Acceptance:** check a task off Monday, find it and uncheck it Friday.

### R6 (P1) — Handoff: each person gets their list in two taps

**Outcome:** From the Tasks tab, each assignee group header carries a share icon → iOS share sheet with that person's open tasks as a clean text digest (title, due date, location, notes). From Review, the existing whole-session share gains a pre-step action sheet: "Everything" / "Just [person]'s tasks" when ≥1 assignee exists, and includes due dates when present.

**Why:** the product currently dead-ends at Eytan's screen; staff don't use the app (single-owner mode), so the message IS the handoff.

**Acceptance:** finish organizing → two taps → Maria's tasks are in a WhatsApp draft.

### R7 (P1) — One vocabulary, everywhere

**Outcome:** Finish the half-done rename, with canvas's final copy rulings: contexts are **"Places"**, staff are **"Team"**, a recording is a **"Session"** (verb: "Record"). The Spaces tab becomes the **Team** tab (`rooms.tsx` → `team.tsx` — rename verified safe, only route reference is `_layout.tsx`); Places management moves to Settings → Places plus inline "+ New place" at points of use. The new-session hint pointing at a nonexistent "Team tab" is replaced by an inline "+ Add" chip. The 6-type context picker leaves the UI; `context_type` survives as a data field (defaults `'space'`) because the organizer prompt uses it (R3). Inline name-only place creation must supply the NOT NULL defaults: `context_type 'space'`, icon `'📍'`, existing default color (challenger amendment 8).

**Acceptance:** grep the UI copy — each concept has exactly one name. "Spaces", "Context", "Starting Context", "Add Context", "Rooms" no longer appear in user-facing strings.

### R8 (P2, minimal) — Issues get an aggregate home

**Outcome (as cut):** A collapsed **"Open issues (n)"** row at the bottom of the Tasks tab's Open segment, expanding inline to issue cards (severity dot + title + session), each with a **resolve** action. The `issues.status` field already exists; this needs one new query + one update function. Villa's full topic/severity grouping: Phase 4.

**Why:** an open issue is undone work; a leaking pump noted three Mondays ago must not live only inside that session's review tabs. Success criterion 5 depends on this and it's small.

**Acceptance:** an issue raised in any past session is findable and resolvable without remembering which session it came from.

### R9 (P2, partial) — Speaker attribution stops being a chore

**Outcome (as cut):** Per-utterance speaker chips are **deleted** from the recording screen, and TranscriptLine drops per-speaker color bubbles. All lines record as the session's voice; the organizer prompt is told attribution may be incomplete and to rely on names spoken in the text (folded into R3). Participants remain session metadata ("who was there") on the SessionCard.

**Cut (Phase 4):** post-hoc speaker correction ("tap line → pick person") — challenger amendment 4: transcript tap is already tap-to-play (Phase 2 S1); the correction gesture collides with it and needs its own design. Tap stays tap-to-play.

**Acceptance:** record a 3-person meeting without touching a single chip → tasks still land on the right people when names were spoken.

### R10 (P2) — Session management is visible

**Outcome:** Delete a session via swipe-left revealing a visible Delete button (not full-swipe auto-delete), with **one** confirmation naming the item, plus a discoverable Delete in Review's overflow menu. Long-press path and double-confirm removed. Forge fix rides along: `deleteSession` must also delete the orphaned `sessions/${id}.m4a` audio file (challenger amendment 11 — pre-existing leak, more exposed once delete is visible).

**Acceptance:** a new user deletes a session without being told how.

---

## Phase 4 backlog (OUT — logged, not deleted)

| Item | One-line reason for deferral |
|---|---|
| Person detail route `app/person/[id].tsx` | Whole new route; Tasks-tab grouping + share already delivers R6; Team tap can jump to Tasks filtered |
| R9 post-hoc speaker correction (tap line → pick person) | Collides with tap-to-play (Phase 2 S1); needs its own gesture design |
| R11 Ideas & decisions library | Villa P3 vs canvas designed-out — unresolved product disagreement; defer rather than arbitrate in code |
| R12 Due-today local notification | Requires new native dependency (`expo-notifications` not in package.json) + rebuild on the fragile path-with-spaces build; P3 polish |
| "Done · yesterday" completion timestamps | No `completed_at` column; needs **migration v4** — candidate logged for atlas, explicitly Phase 4 |
| R8 full: issues grouped by topic and severity | R8-minimal (collapsed row + resolve) covers the spine |
| Full-screen media viewer (swipe-down dismiss) | Polish; Phase 2 S6 grid rendering suffices |
| ConfirmSheet component | Single `Alert.alert` confirm satisfies every requirement as written |
| Undo-toast choreography on check-off | Done segment is the undo path |
| Review "Rename" overflow item | Scope creep; auto-titles + pre-flight title edit cover it |
| PersonCard open-task count badge | Rides along only if trivial; otherwise Phase 4 |

---

## Out of scope (Phase 3 must NOT attempt)

- Anything on the shelved Supabase layer: auth, sync, invites, member dashboard, RLS (ADRs 004–006 stay decided-but-shelved). No feature may require a second logged-in user.
- Automatic voice diarization (auto speaker ID from audio) — R9-partial solves the burden without it.
- Server-side or push notifications, calendar/reminders integrations, email sending.
- Android, web, iPad layouts.
- Re-activating photo→context vision in any form (ADR-009).
- New translation/localization work (EN-first policy; t() keys preserved).
- **SQLite schema migration v4** — every Phase 3 requirement fits the existing v3 schema (challenger-verified); if forge/atlas find otherwise, that's an ADR conversation first.

---

## Success criteria

1. A new user reaches their first organized task list in under 5 minutes from install, with no instructions and no silent failures.
2. Zero extract-and-discard: every field the organizer prompt asks Claude for is stored and visible somewhere in the UI (today `next_steps` and due dates both fail this — fixed by killing `next_steps` and shipping due dates end-to-end).
3. From a freshly organized session, any staff member's task list is in a WhatsApp/SMS draft in ≤ 2 taps.
4. Force-quitting mid-recording loses zero **persisted** transcript lines and can never lead to overwritten audio on reopen (reworded per challenger amendment 2 — finalized audio of a force-killed session cannot be guaranteed; best-effort salvage optional).
5. A task checked off on Monday is findable (and un-checkable) the following Friday; an issue raised three sessions ago is findable and resolvable without opening that session.

---

*Authored by villa (product) and canvas (design), challenged by challenger, assembled by scribe — 2026-06-11, Phase 3 of the rescue engagement.*
