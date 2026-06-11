# ADR-008: Interrupted-Session Status and Recovery Semantics

**Date:** 2026-06-11
**Status:** Accepted
**Deciders:** Eytan (villa authored, canvas designed the surfaces, challenger amended and verified)

---

## Context

The app has a verified data-loss footgun. If the app dies mid-recording (crash, force-quit, iOS reclaim), the session row stays at status `'recording'`. On next launch, Home shows a red "Still going" banner that routes back into the recording screen — whose mount effect (`app/session/[id].tsx:112–131`, challenger-verified) **unconditionally** starts speech recognition and `recorder.record()`, and whose stop handler writes audio to the fixed path `sessions/${id}.m4a`, overwriting `audio_uri`. One tap on the banner destroys a morning's walkthrough.

Facts that shape the design:

- `stores/session.ts` is in-memory zustand with no persistence — after a cold start, `store.sessionId === id && isRecording` cleanly distinguishes a backgrounded *live* recording from a corpse. The test the recovery design needs already exists.
- Transcript lines are persisted to SQLite per final utterance — they survive a force-kill.
- The recorder's temp file URI dies with the process (`recorder.uri` is only read at stop) — **finalized audio of a force-killed session cannot be guaranteed.** Villa's original "audio intact" acceptance is not implementable for force-kills and was reworded (challenger amendment 2).
- `sessions.status` is a plain TEXT column — adding a status value requires **no migration**; schema stays at v3.
- This is single-owner, offline-first; no shelved-layer involvement.

This is an architecture-level state-machine change: it adds a value to `SessionStatus` that every status filter in the app must handle, and it supersedes the "resume a dead session" behavior entirely.

---

## Decision

1. **New `SessionStatus` value `'interrupted'`** (TEXT column, no migration v4).
2. **Launch auto-close wins (challenger amendment 1):** at app launch / Home load, *before* rendering the session list, any session with status `'recording'`/`'paused'` whose id ≠ the live in-memory store's `sessionId` is immediately set to `'interrupted'`, with `ended_at` = timestamp of its last persisted transcript line (or `started_at` if none). Implemented as `markInterruptedSessions(liveSessionId)` in `lib/database.ts` (atlas-stewarded code addition, no schema change).
3. **There is no resume of a dead session.** The recording screen's live-capture mount path may only run when the in-memory store confirms this id is the live recording. For `'interrupted'` sessions it renders a static, read-only recovery layout: saved transcript + "Save & review" (primary) + "Discard" (single confirm). No code path can re-enter the path that re-records and overwrites `audio_uri`.
4. **Home surfaces:** amber recovery banner ("Your recording from [time] was interrupted — it's saved") for `'interrupted'` sessions; the red banner survives only for a genuinely live backgrounded recording (`store.sessionId === id && isRecording`) and returns to the live screen without re-initializing.
5. **Acceptance, reworded:** force-quit mid-recording, reopen → zero *persisted* transcript lines lost, and re-entry can never overwrite the session's audio. Optional forge improvement (non-binding): persist `recorder.uri` to the session row at record-start for best-effort audio salvage.
6. **Every status filter/switch must handle `'interrupted'`** (challenger amendment 7): Home activeSession find, SessionCard styling (amber "Interrupted"), review guards. Forge sweeps all status switches in T3.

## Options considered

### Option A — Launch auto-close to `'interrupted'` + read-only recovery (chosen)
Pros: closes the footgun window at the earliest possible moment; the corpse is reclassified before any UI can treat it as live; honest about what is recoverable (transcript yes, finalized audio no); no migration.
Cons: every status switch must be swept for the new value; an interrupted session cannot be continued — the user re-records.

### Option B — Lazy recovery: reclassify only when the session screen is opened (canvas's original)
Pros: smaller change, no launch-time DB write.
Cons: rejected — between launch and open, the session still carries a "live" status that other code paths (Home banner, review guards) treat as resumable; the footgun window stays open.

### Option C — Guard the mount effect only, keep statuses as-is
Pros: smallest diff.
Cons: the dead session remains status `'recording'` forever — the banner logic, session list, and any future status consumer must each independently re-derive "actually dead"; one missed consumer recreates the bug.

### Option D — True resume: persist recorder state and continue the recording
Pros: matches the old banner's implied promise.
Cons: not implementable — the OS-owned recorder file handle and URI die with the process; "resume" would silently start a new recording over the old path, which is exactly the bug. A feature that promises resume must be able to deliver it.

## Consequences

**Positive:** the data-loss class is eliminated structurally, not behaviorally — no reachable code path can overwrite a dead session's audio; interrupted work is visibly preserved and one tap from Organize; capture stays sacred (recording requires no key, no people, no places).

**Negative:** `'interrupted'` propagates to every status consumer — a sweep cost now and a contract every future status consumer must honor; users lose the (false) affordance of resuming; finalized audio of force-killed sessions is acknowledged as best-effort only.

**Risks:** a missed status switch renders an interrupted session oddly (e.g. styled as live) — detect via T3's grep sweep of status switches plus the sentinel force-quit drill (record → force-quit → relaunch → verify amber banner, intact transcript, unchanged `audio_uri`). Ordering race if `markInterruptedSessions` runs before the zustand store initializes — the live `sessionId` must be read first; T1/T3 sequence this. On first launch after this update, legacy stuck sessions are auto-closed in bulk — expected and desirable, but the banner copy must read as reassurance, not alarm.

## Related

- Blueprint: `docs/blueprint/01-requirements.md` (R2), `docs/blueprint/02-screen-designs.md` (Home banner, Recording recovery state), `docs/blueprint/04-build-spec.md` (binding semantics, tasks T1/T3)
- Files: `types/index.ts` (`SessionStatus`), `lib/database.ts` (`markInterruptedSessions` — atlas), `app/(tabs)/index.tsx`, `app/session/[id].tsx`, `stores/session.ts`, `components/SessionCard.tsx`
- ADR-007 (organize is offered from recovery via Review), challenger review 2026-06-11, amendments 1, 2, 7

---

*Authored by villa (product) and canvas (design), challenged by challenger, assembled by scribe — 2026-06-11, Phase 3 of the rescue engagement.*
