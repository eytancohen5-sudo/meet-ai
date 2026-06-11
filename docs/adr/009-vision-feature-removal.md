# ADR-009: Remove Photo→Context Vision Feature (Amends ADR-003)

**Date:** 2026-06-11
**Status:** Accepted (partially supersedes the field-retention rationale of ADR-003)
**Deciders:** Eytan (villa authored the kill, canvas removed the surfaces, challenger verified safety)

---

## Context

ADR-003 (2026-06-04) generalized `Location` → `Context` and explicitly **retained** the `reference_image_uri` and `ai_description` fields, reasoning that "Claude vision can generate `ai_description` for any of them" — a product photo, a website screenshot, a room photo. That rationale assumed the photo→context vision feature (`lib/vision.ts`) would ship.

Phase 1 diagnosis (2026-06-11) found the assumption dead in practice:

- **`lib/vision.ts` has zero importers** — challenger-verified by grep across all ts/tsx; the only references are inside ADR-003's own text. `describeContextFromPhoto` and `identifyContextFromPhoto` are unreachable code.
- `rooms.tsx` *renders* `reference_image_uri`/`ai_description`, and the recording screen's context picker renders context images — but since nothing can ever set those fields, users see permanent blank placeholders (part of the "blank gray squares" UX complaint).
- The feature, if finished, would add camera friction plus extra paid API calls to solve a problem that is already one tap: topic ("place") selection.
- It does not serve the product's weekly rhythm (record → organize → handoff → check off), which Phase 3 is rebuilt around.

Separately, canvas's Phase 3 redesign removes the 6-type context picker (Space/Product/Presentation/Website/Document/Other) from the UI — adding a place becomes typing a name — while ADR-007's prompt contract *uses* `context_type`, so the field must survive as data.

Constraint: no schema migration in Phase 3 (`user_version` stays 3).

---

## Decision

1. **Delete `lib/vision.ts`** (both functions; the file). Zero importers — no callsite changes needed beyond the deletion itself.
2. **Remove all UI rendering of `reference_image_uri`/`ai_description`:** the context gallery in `rooms.tsx` (restructured into the Team tab + Settings → Places as plain name rows) and the image thumbnails in the recording screen's place picker.
3. **Remove the 6-type context-type picker from the UI.** Inline place creation is name-only and supplies the NOT NULL defaults: `context_type 'space'`, icon `'📍'`, existing default color (challenger amendment 8).
4. **Retain at the data layer, dormant:** the `contexts.reference_image_uri` and `ai_description` columns stay in the schema (no migration), and `context_type` stays populated because the ADR-007 prompt contract consumes it (`id (type): name` rendering; space = physical location, document/website = subject matter).
5. **This ADR partially supersedes ADR-003:** its decision to rename/generalize the Context model stands in full; its rationale for retaining the image/description fields ("Claude vision can generate…") is void. The columns now remain for data compatibility only, not in anticipation of vision.
6. Re-activating photo→context vision in any form is **out of scope for Phase 3** and would require a new ADR.

## Options considered

### Option A — Delete the code, keep the columns dormant (chosen)
Pros: removes unreachable code and the misleading blank-image UI; zero migration risk; zero data loss; cheapest reversal path (a future ADR could repopulate the columns).
Cons: two dormant columns of schema clutter; a future reader needs this ADR to know why they're empty.

### Option B — Keep `lib/vision.ts` for future re-activation
Pros: no deletion to reverse.
Cons: zero importers means it is already dead weight that rots against API/SDK changes, misleads agents into designing around it (rooms.tsx did exactly this), and keeps a paid-API surface nobody decided to ship.

### Option C — Migration v4 to drop `reference_image_uri`/`ai_description`
Pros: cleanest schema.
Cons: violates the Phase 3 no-migration constraint; destructive on devices with any legacy data; migration failure is the app's known crash-on-cold-start fragility — all cost, no user-visible benefit.

### Option D — Finish the vision feature instead
Pros: delivers what the columns were built for.
Cons: adds camera friction and per-photo API cost to a one-tap selection problem; serves no Phase 3 requirement or success criterion; rejected by villa's kill-list on weekly-rhythm grounds.

## Consequences

**Positive:** the kill-list's largest dead surface is gone; Places UI becomes honest (no permanently blank images, no type picker that changes nothing the user can see); one fewer paid-API surface; ADR-003's `context_type` finally earns its keep via the prompt instead of via vision.

**Negative:** re-activating vision later means rebuilding, not re-enabling (acceptable — there was nothing functional to re-enable); dormant columns persist in the schema until some future migration has independent cause to run.

**Risks:** minimal — the zero-importers claim was verified by challenger, not assumed; `tsc --noEmit` after deletion (build-spec T12 acceptance) catches any missed reference. If a legacy device somehow has populated image fields, the data is retained but invisible — acceptable, not destructive.

## Related

- **ADR-003** (`docs/adr/003-context-model.md`) — amended: Context model stands; vision field-retention rationale superseded by this ADR. (ADR-003 itself is unmodified; this record is the amendment.)
- ADR-007 (prompt contract consumes `context_type` — the reason it survives the UI kill)
- Blueprint: `docs/blueprint/03-kill-list.md` (item 1), `docs/blueprint/02-screen-designs.md` (Team tab, Places, place picker), `docs/blueprint/04-build-spec.md` (T12 kill sweep)
- Files: `lib/vision.ts` (deleted), `app/(tabs)/rooms.tsx` → `team.tsx`, `app/session/[id].tsx` (place picker), `app/places.tsx` (new, plain rows)

---

*Authored by villa (product) and canvas (design), challenged by challenger, assembled by scribe — 2026-06-11, Phase 3 of the rescue engagement.*
