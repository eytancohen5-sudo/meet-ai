# CLAUDE.md — Meet AI
Source of truth for all agents and the main Claude Code session.

## 1. Project identity
- **Project:** Meet AI — iOS mobile app for managers and teams to record, transcribe, and AI-organize meetings
- **Operator:** Eytan
- **Mission:** Help managers and team leads capture actionable tasks, decisions, and insights from meetings and walkthroughs using voice recording + Claude AI
- **Apps in scope:**
  - `.` — The full React Native / Expo app

## 2. Repository layout

```
VillaAssistant/
├── CLAUDE.md                    # this file
├── AGENTS.md                    # Expo v56 reminder
├── app.json                     # Expo config (iOS only, bundle ID, permissions)
├── app/                         # expo-router routes
│   ├── (tabs)/                  # tab navigation layout
│   ├── session/[id].tsx         # session detail screen
│   ├── review/[id].tsx          # AI-organized review screen
│   └── session/new.tsx          # new session configuration
├── components/                  # shared UI components
│   ├── SessionCard.tsx
│   ├── TaskCard.tsx
│   └── TranscriptLine.tsx
├── lib/                         # business logic (PROTECTED — see §9)
│   ├── database.ts              # SQLite schema + all migrations (protected)
│   ├── organization.ts          # Anthropic Claude API integration (forge steward)
│   └── transcription.ts        # speech-to-text pipeline
├── stores/                      # Zustand state
│   ├── session.ts               # active recording session state
│   └── settings.ts              # API key + owner name
├── types/                       # TypeScript types + DEFAULT_LOCATIONS
├── assets/                      # app icons, images
├── .claude/
│   ├── agents/                  # 3 agents: forge, canvas, villa
│   └── commands/                # 3 slash commands
├── global.css                   # NativeWind base styles
├── tailwind.config.js           # Tailwind v3 config
├── metro.config.js
├── babel.config.js
└── tsconfig.json
```

## 3. Data sources

| Source | Access via | What it gives us |
|---|---|---|
| Local SQLite | `lib/database.ts` → expo-sqlite | Sessions, transcripts, tasks, ideas, issues, decisions, staff, contexts |
| Anthropic Claude API | `lib/organization.ts` | AI extraction of tasks/ideas/issues/decisions from transcripts |
| iOS mic/speech | `lib/transcription.ts` + expo-speech-recognition | Real-time transcript lines |
| iOS camera/photos | expo-camera + expo-image-picker | Media attached to sessions |

Note: `@supabase/supabase-js` is in deps; the Supabase layer (auth/sync/invites) is built but shelved — do not activate without explicit decision.

## 4. Workstreams

1. **Recording pipeline** — `lib/transcription.ts` + `stores/session.ts` + `app/session/new.tsx`
2. **AI organization** — `lib/organization.ts` + `app/review/[id].tsx`
3. **Data layer** — `lib/database.ts` (protected, see §9)
4. **UI / navigation** — `app/` routes + `components/` (canvas designs; forge implements)
5. **Settings / config** — `stores/settings.ts` + API key management

## 5. Team roster — Agents

All agents at `.claude/agents/`. No entry-point agent: the main window plans and builds (§8).

| Agent | Role |
|---|---|
| `forge` | **Fullstack builder.** Only agent that writes production code. |
| `villa` | **Villa operations domain expert.** Task/meeting logic. Advisory-only. |
| `canvas` | **Mobile UI/UX design.** NativeWind screen specs. Advisory + design author. |

Retired 2026-10-03 (lean setup) to `docs/archive/agents/`: `champ`, `challenger`, `reviewer`, `sentinel`, `atlas`, `scribe`. There is no default challenger, reviewer or scribe.

## 6. Command index

| Command | When to use |
|---|---|
| `/deploy` | Full release: rebase → build → smoke test → commit → push |
| `/smoke-test` | Pre/post-deploy smoke test protocol (simulator-based) |
| `/record` | New meeting session workflow: configure → record → organize → review |

## 7. Workflow conventions

### Build flow
The main window plans and builds, with `forge` for the code. `villa` / `canvas` are consulted when a task needs domain or design input. Tests (below) pass before a change is called done.

### Deploy = commit first (inseparable)
```
git fetch && git pull --rebase origin main
git add <relevant files>
git commit -m "..."
[build command]
git push origin main
```

### Deploy authorization
Once sentinel clears and smoke tests are green, deploy without waiting for further confirmation.

### Propose go-live when ready
End the message with: *"Ready to deploy — want me to push this live?"* when a build is complete and only deploy remains.

### Lasting decisions get an ADR
When Eytan makes a lasting decision (architecture, data model, something shelved or removed), the main window records it in `docs/adr/` (Context / Decision / Consequences). No ADR for routine changes.

### Parallel sessions discipline
Multiple sessions may be active on this repo simultaneously.
- Always `git fetch && git pull --rebase origin main` before any commit or push.
- Never force-push.
- Stage files by explicit name only — never `git add -A` or `git add .` (prevents silently including parallel-session work).
- Immediately before `git add`, re-read the file to confirm your expected changes are still present — a parallel session can overwrite the working tree between your Write and your commit.
- Before writing to a file you haven't touched this session, run `git status`. Any `M` or `??` entries you didn't create may be parallel-session work — surface them before overwriting.

### Comprehension threshold — ask vs. proceed
Score every non-trivial request on five axes (Intent, Scope, Constraints, Success criterion, Risk) — each 0–2, max 10. Run one Read/Grep/Glob pass before marking any axis below 2. Threshold: 9–10 → proceed silently; 7–8 → proceed and state 1–2 assumptions; 5–6 → ask one question; 0–4 → stop, ask at most two questions. Same rubric as Eytan's global "Ask or proceed" rule (`~/.claude/CLAUDE.md`).

### Test runner
`npm test` (Jest via jest-expo preset — `jest --watchAll=false`)

## 8. How a session works
1. **One task per window.** Read `STATE.md` first — it lives in the parent folder, outside this repo: `/Users/esmacbookprom2/Claude Projects/Vocal Assistant App/STATE.md` — and update it last (what changed, what Eytan should look at, what is next). Then the window closes; no window runs for days.
2. **No entry-point agent** (Eytan, 2026-10-03). The main window plans and builds; it calls `forge`, `canvas` or `villa` when a task needs them. No default challenger, reviewer or scribe.
3. **One app per session.** Declare at start; no cross-app work.
4. **Rollback decisions → memory before session ends.**

## 9. Security posture

**Protected files:**
| File | Steward | Why |
|---|---|---|
| `lib/database.ts` | main window | SQLite migrations — changes affect persisted device data, cannot be reversed |
| `lib/organization.ts` | `forge` | Claude API integration — prompt changes affect data quality for all sessions |

**Schema changes:** each one is a new migration step in `migrate()` that bumps `user_version` and carries a comment; no silent column renames; test it on a fresh simulator database before calling it done (details: `docs/archive/agents/atlas.md`).

**Never commit:** `.env*`, API keys in plaintext, private keys, session tokens.
**Anthropic API key:** stored only in SQLite `settings` table via `stores/settings.ts`. Never hardcoded. Never logged.

**Expo-specific:**
- Always read Expo v56 docs at https://docs.expo.dev/versions/v56.0.0/ before writing any Expo/RN code
- NativeWind v4: `className` prop only — NEVER `StyleSheet.create` for styled components
- Tailwind v3 (not v4) — verify classes against `tailwind.config.js`
- iOS-only — no Android code paths
- New architecture enabled (`newArchEnabled: true`) — check third-party lib compatibility

**Operational fragilities:**
- API key missing → "Organize" silently fails; always check settings on first launch
- SQLite migration failure → app crash on cold start; test on fresh simulator before shipping
- `@supabase/supabase-js` is in deps but the Supabase layer (auth/sync/invites) is NOT active — do not enable without explicit decision
- Multi-user layer (lib/auth.ts, lib/sync.ts, lib/invites.ts, app/auth/, app/(member)/, app/invite/) is built but shelved — single-owner mode only until further notice

## 10. Glossary
| Term | Definition |
|---|---|
| **ADR** | Architecture Decision Record — Context / Decision / Consequences |
| **organize** | The AI step: sending a transcript to Claude and extracting tasks/ideas/issues/decisions |
| **session** | A recorded meeting or walkthrough |
| **transcript line** | One utterance from one speaker at one timestamp, optionally tagged to a context |
