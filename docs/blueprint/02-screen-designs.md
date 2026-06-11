# Phase 3 Blueprint — 02: Screen Designs

**Date:** 2026-06-11
**Status:** Approved (challenger cut line applied — only IN-scope screens specified in full; cut items noted inline and logged in 01-requirements Phase 4 backlog)
**Authors:** canvas (design), amended per challenger's binding review

Grounded in: `app/(tabs)/_layout.tsx`, `index.tsx`, `tasks.tsx`, `rooms.tsx`, `settings.tsx`, `app/session/new.tsx`, `app/session/[id].tsx`, `app/review/[id].tsx`, `components/SessionCard.tsx`, `TaskCard.tsx`, `TranscriptLine.tsx`, `tailwind.config.js` (brand/bg/surface/border/text/recording tokens — the `navy`/`gold`/`app` tokens are legacy, never used in new specs).

**Sequencing note (challenger amendment 9):** these specs were drawn from a pre-Phase-2 snapshot. Forge starts from the **landed** Phase 2 tree (S1–S7), not this snapshot; rebase before the first commit. Where Phase 2 already shipped a behavior (tap-to-play, media images, visible errors), the spec keeps it.

---

## Design principles (5)

1. **One primary action per screen, in the thumb zone.** Every screen has exactly one full-width or FAB action in the bottom third. Everything else is secondary and visually quieter.
2. **Record first, configure never (or later).** Nothing blocks the path from "open app" to "recording" except mic permission. Setup (key, people, places) happens at the moment it's needed, inline, never as a prerequisite form.
3. **No invisible affordances, no dead controls.** Every action is a visible button or a standard iOS swipe with a visible fallback. No long-press-only paths, no decorative disabled switches, no options that promise and don't deliver.
4. **Errors are banners with one verb.** Every failure renders as an inline NoticeBanner (amber = warning, red = error) with exactly one action ("Retry", "Add key", "Recover"). Never a bare Alert, never silence, never a dead end.
5. **Nothing the user creates ever silently disappears.** Done tasks have a home, interrupted recordings have a recovery path, deletes confirm once with the item named.

---

## Navigation + naming resolution

**Final tab bar (4 tabs, left to right):**

| Tab | Icon (Ionicons) | File | What lives there |
|---|---|---|---|
| **Home** | `mic` | `app/(tabs)/index.tsx` | Session list, record FAB, first-run SetupCard, interrupted-recording banner |
| **Tasks** | `checkbox-outline` | `app/(tabs)/tasks.tsx` | All tasks across sessions: Open / Done segments, grouped by person, per-person share, open-issues row |
| **Team** | `people-outline` | `app/(tabs)/team.tsx` (renamed from `rooms.tsx`) | People only. Person cards; Add Someone |
| **Settings** | `settings-outline` | `app/(tabs)/settings.tsx` | Name, API key (+ Test), Places list, transcription info, About |

**Naming rulings — final, used everywhere (screen titles, dialogs, empty states, hints):**

- **"Session"** = a recording. User-facing verb is **"Record"**. Never "walkthrough" in chrome (fine inside auto-titles).
- **Contexts → "Places."** One word, everywhere: "Where are you?", "Add a place", "Place" chip on tasks. "Spaces", "Context", "Starting Context", "Add Context" are all dead. Internal DB term `context` unchanged.
- **Staff → "Team"** (already mostly true). "Add Someone" stays.
- The **6-type context picker (Space/Product/Presentation/Website/Document/Other) is killed from UI.** Adding a place = typing a name, nothing else. Conflict resolved with villa: `context_type` stays as a **data field** because the organizer prompt uses it (R3 / ADR-007); inline creation defaults it to `'space'` and must also supply the NOT NULL `icon`/`color` defaults (`'📍'`, existing default color — challenger amendment 8).
- Place management lives in **Settings → Places** (rarely needed) and **inline "+ New place"** at every point of use (pre-flight sheet, recording-screen place picker). Places do NOT get a tab.

---

## Screen specs (Phase 3 scope)

### 1. Home — `app/(tabs)/index.tsx` (modify, M)

**Purpose:** See past sessions and start a new one in one tap.

**Layout (top→bottom):**
- Header: "Meet AI" title + tagline (keep current `px-5 pt-4`, `text-text-primary text-2xl font-bold`).
- **SetupCard** (first-run only, see Screen 9) — above the list.
- **Interrupted-session banner** (challenger amendment 1 — auto-close semantics): at launch / Home load, any session with status `recording`/`paused` whose id ≠ the live store's `sessionId` is **immediately set to `interrupted`** (with `ended_at` = last transcript line, or `started_at` if none) *before* anything renders. The banner is amber, not red: `bg-amber-50 border border-amber-200 rounded-2xl p-4`, icon `alert-circle`, text "Recording interrupted — [title] · it's saved", chevron. Tapping opens the Recording screen in **Recovery state** (Screen 6), which renders only for `interrupted` status. This replaces the red "Still going" banner that resurrected dead sessions into a re-recording screen (the `audio_uri` overwrite footgun). If the in-memory session IS live (user backgrounded mid-recording: `store.sessionId === id && isRecording`), the banner is red `bg-recording` "Recording — tap to return", and tapping returns to the live screen without re-initializing.
- Session list: SessionCards, newest first, single "Recent" header. Cards **swipe-left** to reveal a red Delete button (visible button, not full-swipe auto-delete) with **one** confirmation: "Delete '[title]'? Transcript, tasks and audio go with it." (`Alert.alert`, single confirm — ConfirmSheet component cut to Phase 4.) Delete also exists in Review's overflow menu (Screen 7) — the swipe is the accelerator, the menu is the discoverable path. Long-press path removed. Swipe uses the already-installed `react-native-gesture-handler` 2.31 + reanimated 4.3 — no new deps (challenger-verified).
- FAB: bottom-right, 64pt, **`bg-recording`** (not brand blue — recording is the identity action), icon `mic` (not `add`). Opens the Pre-flight sheet.

**Primary action:** FAB → record. **Secondary:** tap card → Review; swipe → delete; pull-to-refresh.
**Empty state:** keep current copy ("Hit the button below…") with `mic-outline` 56pt in `#E5E7EB`; first-run, SetupCard takes its place.
**Error states:** DB load failure (Phase 2 S7) → red NoticeBanner "Couldn't load sessions" + "Retry".
**Resolves:** stale "Still going" data-loss footgun; undiscoverable long-press delete; double-confirm delete.

### 2. Tasks — `app/(tabs)/tasks.tsx` (modify, **L** — challenger effort correction)

**Purpose:** Everything that needs doing, by person, plus proof of what got done.

**Layout:**
- Header: "Tasks" + count subtitle.
- **Segmented control: `Open | Done`** (new SegmentedControl component, extracted from the rooms.tsx pill pattern: `flex-row mx-4 bg-bg rounded-xl p-1`, active segment `bg-white shadow-sm`).
- **Open segment:** grouped **by assignee** (Tasks is the delegation hub). Group order: "You" first, then people A–Z, **"Unassigned" last with an amber dot** (the R3 surface for never-guess assignments — one-tap assign via the edit sheet). Group header row: avatar initials + name + count + **share icon (`share-outline`)** on the right — opens the iOS share sheet with that person's open list as plain text ("Maria — 3 tasks from Meet AI: …"). This is the single-owner handoff: WhatsApp/SMS, no accounts. Each TaskCard shows the session title as a meta line (`text-text-tertiary text-xs`) and a **due chip** when `due_date` exists: `bg-brand-50` "by Fri"; overdue `bg-red-50 text-red-600` "overdue". Within groups, order by due date (overdue first, no-date last). The list-level grouping Overdue / Today / This week / Later / No date from R4 is expressed as the due chips + sort; person grouping is primary on this tab.
- **Task edit sheet** (cut-line addition, R5-core): tapping a task's overflow (or long edge) opens a small sheet — assignee picker (person chips + Unassigned), due date (iOS date picker), priority (3 pills), Delete task (single confirm). One sheet covers R4 due-editing, R5 corrections, and the Unassigned one-tap assignment.
- At the bottom of Open: a collapsed **"Open issues (n)"** row (chevron) expanding inline to issue cards (severity dot + title + session name) with a **Resolve** action on each (R8-minimal).
- **Done segment:** flat list, newest first, strikethrough titles, session meta line. Tap circle to reopen (this is the undo path — undo toast cut). **No "Done · yesterday" timestamps** — no `completed_at` column exists; deferred to Phase 4 / migration v4.
- **Check-off UX:** tap circle → haptic + green check + strikethrough; task moves to Done on next list refresh. Checked tasks never vanish.

**Primary action:** check-off. **Secondary:** per-person share; edit sheet; reopen from Done; tap card → its session Review (tasks tab); resolve issue.
**Empty states:** Open — keep "All caught up!". Done — `checkmark-done-circle-outline`, "Nothing done yet. It'll feel good when there is."
**Error states:** load failure → red NoticeBanner + Retry; share needs no error state (OS sheet).
**Resolves:** done-tasks-vanish-forever; task-handoff dead end; due dates thrown away (display side); issues aggregate gap; mis-extraction corrections.

### 3. Team — `app/(tabs)/team.tsx` (REPLACES `rooms.tsx`, M)

**Purpose:** Who you work with.

**Layout:**
- Header: "Team" + subtitle "The people in your meetings."
- **No inner segments.** One list: PersonCard per member — avatar initials (existing color system), name, role. Open-task count badge (`bg-brand-50 text-brand-600 rounded-full px-2`; zero = no badge) **rides along only if trivial** (challenger ruling); otherwise Phase 4. Tap card → **jump to Tasks tab filtered to that person** (Person detail route `app/person/[id].tsx` is CUT to Phase 4). Overflow per card: "Edit name/role", "Remove" (single confirm; "Their tasks stay and become Unassigned" stated in the confirm copy).
- Bottom: "Add Someone" dashed card (keep current pattern) → keep the existing simple name+role sheet.

**Primary action:** Add Someone / tap person.
**Empty state:** `person-add-outline`, "No team yet. Add people so tasks can land on someone." + Add button.
**Error states:** load failure banner + Retry.
**Resolves:** naming maze (no more Spaces-tab-containing-Spaces-and-Team); dead photo/`ai_description` rendering (context gallery gone — places move to Settings as plain rows; `lib/vision.ts` has zero importers and nothing can ever set those fields — ADR-009).

### 4. Settings — `app/(tabs)/settings.tsx` (modify, S)

**Purpose:** The few things to set once.

**Layout:**
- Profile card: Your Name — **auto-saves on blur** with inline "Saved ✓" (`text-green-600 text-xs`). The big bottom Save button is removed.
- AI card: API key field (keep secure entry + eye toggle, keep Phase 2 S3 can't-silently-wipe guard) + a **"Test key"** button (`bg-brand-600` small): spinner → green "Key works" tick or red "Key rejected — check console.anthropic.com". Test uses a minimal API call and **never logs the key** (challenger amendment 12); failure copy inline only.
- **Places card** (new): row "Places (n)" with chevron → `app/places.tsx` (Screen 8).
- Transcription card: the disabled Offline Mode switch is **replaced** by a static info row — `shield-checkmark-outline`, "On-device transcription", "Always on. Audio never leaves your phone." No control at all.
- About card: keep.

**Primary action:** none needed — fields self-save.
**Error states:** key-test failure inline under the field (red text + retry); save failure banner.
**Resolves:** decorative Offline switch; API-key uncertainty.

### 5. Pre-flight sheet — REPLACES `app/session/new.tsx` full screen (M)

**Purpose:** One breath between tap and record. Everything optional.

Presented as a **half-height sheet** (expo-router modal, `formSheet` feel) — **fallback ruling (challenger):** if `formSheet` presentation fights expo-router, ship it as a full-screen route with identical content; the layout is the spec, the presentation is preference. Layout top→bottom:
- Grabber + auto-title as an editable text row (tap to edit in place — kills the chevron-collapsed title toggle).
- "Who's with you?" — **horizontal wrap of person chips** (initials + first name, tap to toggle, `bg-brand-50 border-brand-600` selected). Last chip: **"+ Add"** → inline name field, creates the person right there (kills the "go to the Team tab" detour). If no team exists, just the "+ Add" chip — no lecture card.
- "Where are you?" — same chip pattern from existing places + **"+ New place"** chip (name-only; defaults `context_type 'space'`, icon `'📍'`, default color — NOT NULL columns, challenger amendment 8). **No "Ask me" chip** — unselected simply means no place; the recording screen's "Set place" chip is the real "ask me later".
- Big **Start Recording** button, full-width, `bg-recording rounded-2xl py-4`, mic icon — reachable by thumb the instant the sheet opens; zero required fields above it.

**Primary action:** Start (2 taps total from Home to recording).
**Error states:** mic permission denied → inline red NoticeBanner "Microphone is off for Meet AI" + "Open Settings" (deep link), replacing the bare Alert.
**Resolves:** "Ask me" that never asks; the Team-tab hint pointing nowhere; setup-as-blocking-form; participant list friction.

### 6. Recording — `app/session/[id].tsx` (modify, L)

**Purpose:** Capture everything while Eytan's hands and eyes are elsewhere.

**Live state (keep the dark `bg-gray-950` header):**
- Header: status dot + RECORDING/PAUSED + mono timer (keep). Place chip below: "[place name]" or **"Set place"** → existing picker modal, with "+ New place" row pinned at top, **no photos in rows** (image rendering killed — ADR-009).
- Transcript area: live lines + pending ghost line (keep).
- **Speaker chips row: DELETED** (conflict resolved — challenger ruled delete ships; villa's prompt-honesty line covers assignment). All lines record as the session's voice; the organize step assigns from names spoken aloud ("Maria, fix the lamp") — ADR-007. Participants remain session metadata shown on the SessionCard.
- Bottom controls (white bar, keep): camera (48pt) — pause (64pt) — stop (64pt `bg-recording`). Stop → **action sheet**, not Alert: "**End & organize**" (primary), "Keep recording" (cancel).
- Speech-recognition errors (Phase 2 S2): amber NoticeBanner under the header — "Transcription hiccup — still recording audio" — auto-dismisses on recovery.

**Recovery state (the re-entry fix, ADR-008):** this screen renders the recovery layout **only for sessions with status `interrupted`** (set by the launch auto-close — challenger amendment 1; the lazy "recover when opened" variant is rejected because it leaves the footgun window open). Static layout: header "Recording interrupted", the saved transcript so far (read-only), and two buttons — "**Save & review**" (primary, `bg-brand-600`: marks ended, goes to Review, organize offered there) and "Discard" (text button, single confirm). The live-capture mount path must be unreachable for any non-live session: it may only start when the in-memory store confirms this id is the live recording. It must never re-enter the path that re-records and overwrites `audio_uri`.

**Resolves:** speaker-chip burden; chips-absent-without-participants; stale-session re-entry data loss; double-meaning End Session dialog.

### 7. Review — `app/review/[id].tsx` (modify, L)

**Purpose:** What the meeting produced, ready to act on or send.

**Layout:**
- Header: back, title, **share**, and a new **"…" overflow** with **Delete session** (single confirm). ("Rename" cut to Phase 4.) Meta chips row (keep).
- Tab pills (keep): Summary / Tasks (n) / Transcript / Media (n).
- **Organizing state:** replace the full-screen black overlay with a **non-blocking progress card** pinned atop the Summary tab: spinner + "Reading the room…" + sub-line. Transcript/Media tabs stay browsable while Claude works.
- **Organize failure (Phase 2 S4 base):** red NoticeBanner atop Summary — "Couldn't organize" + one-line reason + **"Retry"**. Not an Alert; persists until resolved.
- **Missing-key state:** if no API key, the Summary tab shows a brand-blue inline card: "Add your Claude key to organize this session" + paste field + "Save & organize" button right there (writes via `stores/settings.ts`, then triggers organize). No Settings detour at the moment of highest motivation. Second half of first-run.
- Summary tab: AI summary card, stat tiles, top tasks, issues, ideas, decisions (all keep). **No "Next steps" card** — challenger amendment 3: `next_steps` is removed from the prompt and `OrganizedSession`; a reserved slot would never render. Dead spec, deleted.
- Tasks tab: TaskCards with check-off + due chips (same card as Tasks tab). The save path must pass `due_date` through to `addTask` (the missing pipe — challenger-verified gap at the review save callsite).
- Transcript tab: tap-to-play (Phase 2 S1, keep), playing banner (keep). **Tap stays tap-to-play** — speaker-correction gesture cut (challenger amendment 4). TranscriptLine simplified per component ruling.
- Media tab: photo grid (Phase 2 S6 renders images). Full-screen viewer cut to Phase 4.
- Share (keep text format, two upgrades): include due dates when present; pre-step action sheet "Everything" / "Just [person]'s tasks" when ≥1 assignee exists.

**Empty states:** per tab, keep current copies.
**Resolves:** organize failures recoverable + visible; API key asked at moment of need; organizing jail; share-as-handoff.

### 8. Places list — `app/places.tsx` (NEW, S)

Plain name rows, trash with single confirm, "Add a place" name-only dialog (defaults per amendment 8). No photos, no types, no emoji picker. Deliberately boring and buried — creation happens inline where it's needed.

### 9. First-run experience (Home SetupCard + Review key capture, S)

No onboarding screens, no form. On first launch Home shows one **SetupCard** (`bg-surface rounded-2xl border border-border p-4`) with three checklist rows that tick themselves:
1. "Record your first meeting" — mic icon, points at the FAB ("the red button below").
2. "Add your team" — person icon → Team tab. "(optional — tasks can stay yours)".
3. "Connect Claude" — sparkles icon → expands an inline key paste field + "console.anthropic.com" link + Test button. Sub-line: "Recording works without it. Organizing doesn't."

Card auto-dismisses for good once a session exists AND a key is saved; until then it shrinks to a single-row reminder after the first recording ("1 step left: connect Claude"). The Review missing-key card (Screen 7) is the safety net — the user cannot reach a silent organize failure.

---

## Component inventory (cut line applied)

| Component | Ruling | Notes |
|---|---|---|
| `SessionCard` | **Modify** | Add `interrupted` status style (amber, "Interrupted" — every status switch must handle the new value, challenger amendment 7); keep counts row; participant names row stays; supports swipe-delete wrapper. |
| `TaskCard` | **Modify** | Add due chip (relative, overdue red), session meta line (`sessionTitle` prop), edit-sheet trigger. Priority/assignee/place chips keep. No done-timestamp (Phase 4). |
| `TranscriptLine` | **Modify** | Drop per-speaker color bubbles/avatars: timestamp right-aligned, place chip kept, single neutral bubble `bg-surface border border-border`. Keep `onPress` for tap-to-play + playing highlight. |
| `RightsGate` | **Untouched** | Shelved multi-user layer. |
| `NoticeBanner` (NEW) | `variant: 'info'\|'warning'\|'error'`, `message`, `actionLabel?`, `onAction?`, `dismissible?` | The single error/warning surface app-wide (principle 4). |
| `SegmentedControl` (NEW) | `segments: string[]`, `active`, `onChange` | Extracted from rooms.tsx pill pattern; used by Tasks (Open/Done). |
| `PersonChip` (NEW) | `member`, `selected`, `onToggle` | Pre-flight sheet; place chips share the shape (`label`, `icon?`). |
| `SetupCard` (NEW) | `steps: {done, label, onPress}[]`, inline key-capture slot | First-run only. |
| `EmptyState` (NEW) | `icon`, `title`, `body`, `action?` | Pattern is hand-rolled 7 times today. |
| `PersonCard` (NEW, conditional) | `member`, `openTaskCount?`, `onPress` | Team tab row; count badge only if trivial. |
| ~~`ConfirmSheet`~~ | **CUT → Phase 4** | Single `Alert.alert` confirm everywhere this phase. |

---

## Build-effort summary (challenger-corrected)

| Screen / item | Effort |
|---|---|
| Home (banner + auto-close wiring, swipe-delete, FAB restyle) | M |
| Tasks (segments, person grouping, share, done, due chips, issues row, edit sheet) | **L** (corrected from M) |
| Team tab (rename + restructure) | M |
| Settings (auto-save, Test key, Places row, switch removal) | S |
| Places list screen | S |
| Pre-flight sheet (replaces new.tsx) | M |
| Recording (chip removal, recovery state, stop sheet, error banner) | L |
| Review (inline errors, key capture, non-blocking organize, share upgrade, overflow) | L |
| First-run SetupCard | S |
| New shared components | M total, amortized |

---

*Authored by villa (product) and canvas (design), challenged by challenger, assembled by scribe — 2026-06-11, Phase 3 of the rescue engagement.*
