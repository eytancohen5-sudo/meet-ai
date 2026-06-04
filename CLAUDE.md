# CLAUDE.md — Villa Assistant
Source of truth for all agents and the main Claude Code session.

> **STOP. Before doing ANYTHING else — reading a file, running grep, touching code — invoke @champ via the Agent tool. This is mandatory for every session, every request, no matter how small it appears. There are no exceptions.**

## 1. Project identity
- **Project:** Villa Assistant — iOS mobile app for villa property managers to record, transcribe, and AI-organize staff meetings
- **Operator:** Boss (Eytan)
- **Mission:** Help villa property managers capture actionable tasks, decisions, and insights from staff walkthroughs using voice recording + Claude AI
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
│   ├── database.ts              # SQLite schema + all migrations (atlas steward)
│   ├── organization.ts          # Anthropic Claude API integration (forge steward)
│   └── transcription.ts        # speech-to-text pipeline
├── stores/                      # Zustand state
│   ├── session.ts               # active recording session state
│   └── settings.ts              # API key + owner name
├── types/                       # TypeScript types + DEFAULT_LOCATIONS
├── assets/                      # app icons, images
├── .claude/
│   ├── agents/                  # 9 specialist agents
│   └── commands/                # 4 slash commands
├── global.css                   # NativeWind base styles
├── tailwind.config.js           # Tailwind v3 config
├── metro.config.js
├── babel.config.js
└── tsconfig.json
```

## 3. Data sources

| Source | Access via | What it gives us |
|---|---|---|
| Local SQLite | `lib/database.ts` → expo-sqlite | Sessions, transcripts, tasks, ideas, issues, decisions, staff, locations |
| Anthropic Claude API | `lib/organization.ts` | AI extraction of tasks/ideas/issues/decisions from transcripts |
| iOS mic/speech | `lib/transcription.ts` + expo-speech-recognition | Real-time transcript lines |
| iOS camera/photos | expo-camera + expo-image-picker | Media attached to sessions |

Note: `@supabase/supabase-js` is in `package.json` but **not yet integrated**. Do not use without Boss's explicit approval.

## 4. Workstreams

1. **Recording pipeline** — `lib/transcription.ts` + `stores/session.ts` + `app/session/new.tsx`
2. **AI organization** — `lib/organization.ts` + `app/review/[id].tsx`
3. **Data layer** — `lib/database.ts` (atlas-owned; all schema changes go through atlas)
4. **UI / navigation** — `app/` routes + `components/` (canvas designs; forge implements)
5. **Settings / config** — `stores/settings.ts` + API key management

## 5. Team roster — Agents

All agents at `.claude/agents/`. Default entry point: **`champ`**.

| Agent | Role |
|---|---|
| `champ` | **Chief of Staff.** Mandatory first stop. Decomposes requests, emits routing plan. |
| `challenger` | **Adversarial plan reviewer.** Reviews champ's plan before forge builds. Read-only. |
| `forge` | **Fullstack builder.** Only agent that writes production code. |
| `reviewer` | **Code quality reviewer.** Idioms, naming, complexity — separate from sentinel. Read-only. |
| `sentinel` | **Security + QA guardian.** Block-deploy authority. Nothing ships without SENTINEL CLEAR. |
| `atlas` | **Infrastructure + data.** SQLite schema, config, deploy pipeline. Runs releases after sentinel clears. |
| `villa` | **Villa operations domain expert.** Task/meeting logic. Advisory-only. |
| `canvas` | **Mobile UI/UX design.** NativeWind screen specs. Advisory + design author. |
| `scribe` | **ADR writer.** Documents architecture-level decisions under `docs/adr/`. |

## 6. Command index

| Command | When to use |
|---|---|
| `/deploy` | Full release: rebase → build → sentinel gate → commit → push |
| `/smoke-test` | Pre/post-deploy sentinel test protocol (simulator-based) |
| `/review` | Pre-deploy code review: quality + security + regression risk |
| `/record` | New meeting session workflow: configure → record → organize → review |

## 7. Workflow conventions

### Standard build flow
```
champ → challenger → forge → reviewer → sentinel → atlas
```
Advisory: villa, canvas in parallel when forge needs domain or design input.
scribe triggered for architecture-level decisions.

### Plan before code
champ emits routing plan → challenger reviews → forge builds. Never skip challenger.

### Security loop — two agents, never one
sentinel audits (read-only) → forge fixes. reviewer handles code quality separately.
Never combine audit and fix in one pass.

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

### Architecture decisions get ADRs
champ triggers scribe when a decision is architecture-level. ADR written before implementation.

### Parallel sessions discipline
Always `git fetch && git pull --rebase origin main` before any commit or push. Never force-push.

### Comprehension threshold — ask vs. proceed
Score every non-trivial request on five axes (Intent, Scope, Constraints, Success criterion, Risk) — each 0–2, max 10. Run one Read/Grep/Glob pass before marking any axis below 2. Threshold: 9–10 → proceed silently; 7–8 → proceed and state 1–2 assumptions; 5–6 → ask one question; 0–4 → stop, ask at most two questions. See champ agent for the full rubric.

### Test runner
`npm test` (Jest via jest-expo preset — `jest --watchAll=false`)

## 8. Champion — session rules
1. **@champ first, every session, no exceptions.**
2. **One app per session.** Declare at start; no cross-app work.
3. **Rollback decisions → memory before session ends.**
4. **Champ emits the plan; the main thread executes.**

## 9. Security posture

**Protected files:**
| File | Steward | Why |
|---|---|---|
| `lib/database.ts` | `atlas` | SQLite migrations — changes affect persisted device data, cannot be reversed |
| `lib/organization.ts` | `forge` | Claude API integration — prompt changes affect data quality for all sessions |

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
- `@supabase/supabase-js` in deps but NOT integrated — do not wire up without Boss's approval

## 10. Glossary
| Term | Definition |
|---|---|
| **champ** | Chief of Staff — mandatory session entry point |
| **challenger** | Adversarial plan reviewer — stress-tests routing plans before code |
| **sentinel** | Security + QA guardian — SENTINEL CLEAR or SENTINEL BLOCK |
| **atlas** | Infrastructure + data — owns SQLite schema and runs production deploys |
| **scribe** | ADR writer — Context / Decision / Consequences |
| **SENTINEL CLEAR** | Formal deploy clearance from sentinel |
| **SENTINEL BLOCK** | Deploy veto — forge must fix before proceeding |
| **SPEC** | champ's task validation: Specific, Programmatically evaluable, Explicit scope, Constrained output |
| **ADR** | Architecture Decision Record |
| **organize** | The AI step: sending a transcript to Claude and extracting tasks/ideas/issues/decisions |
| **session** | A recorded meeting walkthrough with staff |
| **transcript line** | One utterance from one speaker at one timestamp, optionally tagged to a location |
