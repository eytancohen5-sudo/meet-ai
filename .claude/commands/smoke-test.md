# /smoke-test — Production Smoke Test Protocol

Sentinel's priority-ordered test suite. Run before and after every deploy.
Run `npm test` first, then perform manual checks on the iOS simulator.

## Priority 1 — Recording session (must PASS before any deploy)
- Open app → tap "New Session" → select participants + location → tap Record
- Speak a few words → confirm transcript lines appear in real time
- Stop recording → confirm session saved to SQLite (check session list)

## Priority 2 — AI organization (must PASS)
- Open a completed session → tap "Organize"
- Confirm Claude API call completes (loading state appears, then disappears)
- Confirm tasks, ideas, issues, decisions populate in the review screen
- No error toast or silent failure

## Priority 3 — Auth / Settings gate (must PASS)
- Go to Settings → save an Anthropic API key → verify it persists after app restart
- Attempt "Organize" with no API key set → confirm graceful error message (not crash)

## Priority 4 — Navigation + data integrity (should PASS)
- Tab navigation works without errors
- Session detail screen loads from session list
- Review screen loads for organized sessions
- Data survives simulator restart (SQLite persisted)

## Priority 5 — UI on small screen (should PASS for main flows)
- Test on iPhone SE (375×667) — no clipped text, tap targets accessible

## Output format
```
SMOKE TEST RUN — [date]
[TEST NAME] — PASS / FAIL / SKIP + reason

OVERALL: SENTINEL CLEAR / SENTINEL BLOCK
```
Priority 1–3 FAIL → SENTINEL BLOCK. All Priority 1–3 PASS → SENTINEL CLEAR.
