# Archive — Meet AI (VillaAssistant), retired 2026-10-03

Moved here unchanged (`git mv`) on branch `lean-setup-2026-10-03`. Nothing in this folder is binding.
To bring a file back, `git mv` it to `.claude/agents/` or `.claude/commands/`.
Why: the lean setup. How work runs now: `CLAUDE.md` §8; where it stands: `STATE.md` in the parent folder.

## `agents/` (from `.claude/agents/`)
- `champ.md` — Chief of Staff, the mandatory first stop of every session; archived 2026-10-03 by the org-wide lean setup (Eytan approved 2026-10-03).
- `challenger.md` — adversarial reviewer of champ's plan before any code; archived 2026-10-03 by the org-wide lean setup (Eytan approved 2026-10-03).
- `reviewer.md` — code-quality reviewer before sentinel's gate; archived 2026-10-03 by the org-wide lean setup (Eytan approved 2026-10-03).
- `scribe.md` — ADR writer, triggered by champ; archived 2026-10-03 by the org-wide lean setup (Eytan approved 2026-10-03).
- `atlas.md` — SQLite schema steward and release prep; archived 2026-10-03 by the org-wide lean setup (Eytan approved 2026-10-03). Its migration rules now sit in `CLAUDE.md` §9.
- `sentinel.md` — security and smoke-test gate (SENTINEL CLEAR / BLOCK); archived 2026-10-03 by the org-wide lean setup (Eytan approved 2026-10-03).

## `commands/` (from `.claude/commands/`)
- `review.md` — `/review`, the reviewer + sentinel clearance step before atlas deploys; it existed only to run archived roles, so it went with them; archived 2026-10-03 by the org-wide lean setup (Eytan approved 2026-10-03).

Kept: `forge` (builder), `canvas` (screen design author), `villa` (domain specialist); commands `/deploy`, `/smoke-test`, `/record`
(the first two now say "smoke test passed" instead of "SENTINEL CLEAR").
