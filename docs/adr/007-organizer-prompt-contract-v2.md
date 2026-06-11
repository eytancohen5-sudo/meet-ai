# ADR-007: Organizer Prompt Contract v2

**Date:** 2026-06-11
**Status:** Accepted
**Deciders:** Eytan (villa authored, canvas consulted, challenger amended and verified)

---

## Context

`lib/organization.ts` is a protected file (forge steward): it holds the single Claude API call (model `claude-sonnet-4-6`) that turns a transcript into the app's entire output — summary, tasks, ideas, issues, decisions. Prompt changes affect the data quality of every future session, so the contract must be decided before code.

The current prompt is a first draft with four verified defects:

1. **Due dates are extracted and discarded.** The prompt asks for a spoken-phrase `due_date_description`; the schema has carried `tasks.due_date INTEGER` since v1 and `addTask` already binds it — but no resolved date is ever requested, mapped, or saved. Worse, the prompt contains only *times*, not the session date, so Claude cannot resolve "by Friday" even if asked.
2. **`next_steps` is paid for and thrown away.** The prompt requests it, `OrganizedSession` carries it, and nothing persists or displays it. Every real next step is either a task or a decision.
3. **No business rules.** Priority and assignment are left to the model's vibes: no urgency keywords, no rule against guessing assignees, and `context_type` (added in ADR-003 precisely for "future Claude prompting that varies by type") is never sent.
4. **Truncation risk.** `max_tokens` is 4096; long meetings already risk truncated JSON, which throws in the lenient brace-extraction parser (`/\{[\s\S]*\}/` + per-field `??` fallbacks — verified tolerant to additive and subtractive field changes).

Constraints shaping the option space: no schema migration (v3 final for Phase 3), no new dependencies (no JS date-parsing library), API key never logged, single API call preserved, the parser's leniency preserved.

---

## Decision

Rewrite the organizer prompt and response contract as **v2**:

1. **Due-date contract (challenger amendment 5):** the prompt includes the session start date **with weekday**; Claude returns per task `"due_date": "YYYY-MM-DD" | null` alongside the spoken phrase; `organization.ts` validates with `^\d{4}-\d{2}-\d{2}$`, stores epoch ms at local midnight into the existing `tasks.due_date`, and on invalid/null discards the date while appending the spoken phrase to the task's notes — nothing is extracted-and-discarded. Overdue = `due_date < startOfToday`, computed client-side.
2. **Priority rules:** high = safety, guest-impacting, blocking other work, or explicit urgency ("today", "urgent", "before the guests arrive"); low = explicit deferral ("no rush", "whenever", "someday"); medium = everything else.
3. **Assignment rules:** assign only when a name or unambiguous role is spoken; never guess; unassigned stays unassigned (the UI surfaces an "Unassigned" group with one-tap assignment).
4. **Context types:** contexts rendered to the prompt as `id (type): name`; a `space` is where an issue physically is; a `document`/`website` is subject matter, not a location.
5. **Attribution honesty:** the prompt states speaker attribution may be incomplete and assignment should rely on names spoken in the text ("Maria, please…") — this is what makes deleting the per-utterance speaker chips (R9-partial) safe.
6. **`next_steps` removed entirely** — from the prompt, from `OrganizedSession`, and from the Review UI spec (challenger amendment 3: no reserved dead slot).
7. **Guardrails (challenger amendment 6):** add "Return ONLY the JSON object."; bump `max_tokens` 4096 → 8192; keep the lenient brace-extraction parser unchanged.
8. **"Test key" verification** (Settings/SetupCard) uses a minimal API call and never logs the key (challenger amendment 12).

No schema migration. No new dependencies.

## Options considered

### Option A — Full contract v2 in one pass (chosen)
Pros: fixes all four defects together; one ADR'd change to a protected file instead of four; due dates and rules land with the UI that displays them, so acceptance is end-to-end testable.
Cons: largest single prompt diff to date; requires fixture tests to detect extraction regressions.

### Option B — Incremental patch (add due_date only, keep next_steps)
Pros: smallest diff.
Cons: keeps paying tokens for data that is never persisted; leaves priority/assignment to vibes; fails success criterion 2 (zero extract-and-discard); guarantees a second protected-file change later.

### Option C — Switch to structured output / tool-use JSON schema
Pros: schema-enforced response shape.
Cons: replaces the proven lenient parser with a stricter contract — higher regression risk on a protected file for no Phase 3 requirement; can be revisited later.

### Option D — Resolve dates client-side with a parsing library (chrono-node etc.)
Pros: no reliance on the model for date math.
Cons: new dependency on a fragile build path; locale/phrasing fragility; the model already has the transcript context and, once given the session date + weekday, resolution is trivial.

## Consequences

**Positive:** due dates become the spine of the weekly rhythm (extract → store → show → act); priority and assignment become deterministic and testable; zero extract-and-discard; prompt is cheaper and sharper without `next_steps`; truncation-throw class addressed.

**Negative:** every future session's data quality depends on this contract — a bad rule is a systemic bug, not a one-off; previously organized sessions are unchanged (no backfill of due dates); fixture tests must be maintained alongside the prompt.

**Risks:** model returns malformed dates → mitigated by regex validation + phrase-to-notes fallback (fail-soft, never fail-silent). Extraction quality regression → mitigated by T4's fixture acceptance tests ("Maria, the pool pump is leaking, fix it today" → high/Maria/Pool/today; "someone should repaint the gate sometime" → low/unassigned; Monday "by Friday" → that Friday; malformed date → notes; no `next_steps` in response). 8192 max_tokens raises per-call cost ceiling on very long meetings → acceptable, truncated-JSON failures cost more.

## Related

- Blueprint: `docs/blueprint/01-requirements.md` (R3, R4, R9-partial), `docs/blueprint/04-build-spec.md` (binding due-date contract, task T4)
- Files: `lib/organization.ts` (protected, forge steward), `types/index.ts` (`OrganizedSession`: remove `next_steps`, add resolved `due_date`)
- ADR-003 (context_type discriminator — this ADR finally delivers its "future Claude prompting" rationale), ADR-008 (session lifecycle), ADR-009 (vision removal)
- Challenger review 2026-06-11, amendments 3, 5, 6, 12

---

*Authored by villa (product) and canvas (design), challenged by challenger, assembled by scribe — 2026-06-11, Phase 3 of the rescue engagement.*
