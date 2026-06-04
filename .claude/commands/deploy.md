# /deploy — Production Release Workflow

Full production release in this exact order.

## Pre-flight
1. `git fetch && git pull --rebase origin main`
2. `npm test` — must pass clean; fix errors before continuing
3. Confirm SENTINEL CLEAR is in hand — if not, run /smoke-test first
4. Verify `app.json` version is bumped if this is an App Store / TestFlight release

## Build
5. `npx expo export` for a local build verification, or `eas build --platform ios` for a production build
6. Confirm build completes without errors

## Commit + Push
7. `git add <relevant files> && git commit -m "deploy: [what shipped]"`
8. `git push origin main`

## Post-deploy
9. Ask sentinel to run /smoke-test on the simulator build to confirm healthy
10. Report to Boss: what shipped, build number, any known caveats

## Safety rules
- Never force-push to main
- If sentinel issued a BLOCK, do not proceed past step 2
- Fix build failures — do not skip or suppress errors
- Do not bump app.json version without Boss's direction
