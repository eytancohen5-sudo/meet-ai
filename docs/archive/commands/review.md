# /review — Pre-Deploy Code Review

Structured review by reviewer + sentinel before any feature ships.

## Trigger when:
- forge has finished a feature
- A bug fix touches core recording pipeline, AI organization, or SQLite schema
- Any change to `lib/database.ts` or `lib/organization.ts`

## Step 1 — reviewer (code quality)
- Idiomatic React Native + Expo code
- NativeWind v4: `className` only — no `StyleSheet.create` for styled components
- Naming conventions, complexity, dead code
- No `as any` type shortcuts
- New behavior has test coverage (or missing coverage flagged as NON-BLOCKING)

## Step 2 — sentinel (security)
- Anthropic API key never in logs or error messages
- No transcript data leaving the device except to Anthropic API
- New SQLite tables have appropriate structure (no unbounded data)
- Camera/mic permissions properly gated

## Step 3 — regression risk
- Touches recording pipeline? → Run Priority 1 smoke tests
- Touches AI organization? → Run Priority 2 smoke tests
- Touches SQLite schema? → Test migration on fresh simulator DB
- Touches shared components? → Visual spot-check all screens using them

## Clearance required
Both reviewer and sentinel must clear before atlas deploys:
- `REVIEWER CLEAR` + `SENTINEL CLEAR` → atlas may proceed
- Either `BLOCK` → forge fixes, then re-submits
