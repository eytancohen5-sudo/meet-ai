# Phase 3 Blueprint — 03: Kill-List

**Date:** 2026-06-11
**Status:** Approved (every kill carries challenger's safety verification)
**Authors:** villa (product kills) + canvas (design kills), verified by challenger

Each entry: what dies, the business reason, and the safety check that says it can die without breaking anything.

---

## 1. `lib/vision.ts` — photo→context identification (DELETE THE FILE)

**Business reason:** Zero users can reach it, it adds camera friction plus extra paid API calls per use, and topic selection is already one tap — it does not serve the weekly rhythm.
**Includes:** the `reference_image_uri` / `ai_description` rendering in `rooms.tsx` (lines ~152–173) and the context-picker images in `app/session/[id].tsx` (~370–376) — the screens render fields that nothing can ever set.
**Challenger verification:** grep across all ts/tsx finds zero importers of `lib/vision.ts`; the only references are in `docs/adr/003-context-model.md`. Safe to delete the file and the image rendering. Schema columns stay dormant — **no migration needed**.
**ADR:** ADR-009 (partially supersedes ADR-003's field-retention rationale).

## 2. "Offline Mode" decorative switch — Settings (`settings.tsx` ~83–89)

**Business reason:** The app is already offline-first except organize; a permanently disabled toggle only advertises brokenness.
**Replacement:** static info row — "On-device transcription · Always on. Audio never leaves your phone."
**Challenger verification:** pure UI; no state or logic behind it. No risk.

## 3. "Ask me" context option — new-session flow (`session/new.tsx` ~115–123)

**Business reason:** It never asks. A dead option in the new-session flow erodes trust; place selection is already optional.
**Replacement:** unselected simply means no place; the recording screen's "Set place" chip is the real "ask me later".
**Challenger verification:** UI-only option with no downstream consumer. No risk.

## 4. `next_steps` in the organizer output — prompt, types, and UI slot

**Business reason:** Every real next step is either a task or a decision; we currently pay tokens to extract data we never persist or display. Removing it sharpens the prompt.
**Scope (challenger amendment 3 — villa wins, fully):** removed from the prompt, from `OrganizedSession`, AND canvas's reserved "Next steps card" in the Review spec is deleted too — it would never render (dead spec).
**Challenger verification:** `result.next_steps` is returned and dropped today — never persisted, never read by review. The JSON parser is lenient (greedy brace extraction + per-field `??` fallbacks); removing a field is contract-safe.
**ADR:** ADR-007.

## 5. "Resume" of dead recording sessions — the "Still going" banner (`index.tsx` ~74–86)

**Business reason:** Resuming into a screen that re-records is a data-loss feature, not a convenience. One bad tap destroys a morning's walkthrough.
**Replacement:** R2 recovery behavior — launch auto-close to `interrupted` + amber banner + read-only recovery screen (ADR-008).
**Challenger verification:** footgun confirmed in code — `session/[id].tsx:112–131` unconditionally starts capture on mount; stop writes to the fixed path `sessions/${id}.m4a`, overwriting `audio_uri`. The replacement is implementable with zero shelved-layer involvement: the in-memory zustand store cleanly distinguishes a live backgrounded recording from a corpse after cold start.

## 6. Per-utterance speaker chips — Recording screen (`session/[id].tsx` ~303–322) + speaker coloring in `TranscriptLine`

**Business reason:** Tapping a chip before every utterance during a walkthrough is unusable with hands full — and the chips vanished anyway when no participants were picked. The AI can infer assignments from names spoken in the text, which is the honest mechanism.
**Replacement:** prompt told attribution may be incomplete, assignment from spoken names (ADR-007). Participants stay as session metadata on SessionCard. Conflict resolved: challenger ruled delete ships; the sticky "Speaker: You ▾" pill fallback is not built. Post-hoc correction is Phase 4 (gesture collides with tap-to-play).
**Challenger verification:** deletion + one prompt line; no data dependency breaks — speaker fields on existing lines remain valid legacy data.

## 7. Context type picker — 6 emoji types (`rooms.tsx` ~13–20, 239–254)

**Business reason:** Six abstract type choices in the add-a-place dialog is configuration nobody asked for. Adding a place = typing a name.
**Scope:** UI only. The `context_type` **field survives** — the organizer prompt uses it (R3: a `space` is where an issue is; a `document`/`website` is subject matter). Inline creation defaults `'space'` / `'📍'` / default color (NOT NULL columns — challenger amendment 8).
**Challenger verification:** field is NOT NULL with usable defaults; no migration; prompt consumer keeps it meaningful.

## 8. Long-press-only session delete + double confirm (`index.tsx` ~29–54)

**Business reason:** Undiscoverable; test sessions pile up and bury real ones.
**Replacement:** swipe-left visible Delete + Review overflow menu, single confirmation naming the item (R10). Rides along: `deleteSession` gains `FileSystem.deleteAsync` of the orphaned `sessions/${id}.m4a` (challenger amendment 11 — pre-existing leak, more exposed by a visible delete).
**Challenger verification:** swipe needs no new deps (gesture-handler 2.31 + reanimated 4.3 installed).

## 9. Full-screen organizing jail overlay (`review/[id].tsx` ~224–232)

**Business reason:** It jails the user during the slowest operation in the app.
**Replacement:** non-blocking progress card atop the Summary tab; other tabs stay browsable.
**Challenger verification:** UI-only; organize call is unaffected.

## 10. Settings Save button

**Business reason:** Forced a scroll-to-save on every visit; people forget and lose edits.
**Replacement:** auto-save on blur with inline "Saved ✓" (Phase 2 S3 key-wipe guard preserved).
**Challenger verification:** UI-only; settings store API unchanged.

## 11. `Platform.OS === 'web'` fallback blocks (rooms, new, session)

**Business reason:** iOS-only app; dead branches are reading cost and drift risk.
**Replacement:** none — engineering cleanup. No design replacement needed.
**Challenger verification:** app is iOS-only by config (`app.json`); branches are unreachable.

## 12. "Spaces" tab + rooms/staff inner segments — structural

**Business reason:** A five-screen app where the same thing is called Spaces, Context, Rooms, and Team reads as broken. The tab mixed two unrelated nouns.
**Replacement:** Team tab (people only) + Settings → Places + inline place creation (R7).
**Challenger verification:** `rooms.tsx` → `team.tsx` rename is safe — the only route reference is `app/(tabs)/_layout.tsx:41`; no `router.push('/rooms')` anywhere.

## 13. Unused `Animated` import — `review/[id].tsx`

**Business reason:** housekeeping, not a product item. Forge/reviewer sweep.

---

## Designed-out (not killed — deliberately not built this phase)

- **No aggregate views for ideas/decisions** — they live in session Review where their context is. Villa rated a library P3; canvas designed it out; challenger deferred the disagreement to Phase 4 rather than arbitrating in code. Issues DO get the collapsed row in Tasks (R8-minimal).
- **No ConfirmSheet component, no undo toast** — single `Alert.alert` confirm and the Done segment (as the undo path) satisfy every requirement as written.

---

*Authored by villa (product) and canvas (design), challenged by challenger, assembled by scribe — 2026-06-11, Phase 3 of the rescue engagement.*
