# /record — New Meeting Session Workflow

The primary Meet AI workflow: start a meeting session, record it, and process the transcript into structured outputs.

## Steps

### 1. Configure the session
- Confirm participants: which staff members will be present? (drawn from `staff` table)
- Confirm starting context: which area or topic? (drawn from `contexts` table)
- Confirm session title or use auto-generated default

### 2. Start recording
- Review: does the participant list match the expected roles for this meeting type?
- canvas reviews: is the recording UI correctly showing status (recording, paused, elapsed time)?
- Tap Record → confirm microphone permission is active → confirm transcript lines begin appearing

### 3. During the session
- Move between locations: update location tag as walkthrough progresses
- Pause/resume as needed
- Monitor transcript quality — flag if speech recognition is producing garbled output

### 4. Stop and review transcript
- Stop recording → confirm all lines saved to SQLite
- Review transcript for speaker attribution accuracy
- Edit any mis-attributed lines before organizing

### 5. AI organization
- Tap "Organize" → confirm Anthropic API key is set in Settings
- Monitor loading state → confirm Claude returns valid JSON
- Review extracted: tasks, ideas, issues, decisions

### 6. Post-session
- Assign any unassigned tasks to specific staff members
- Set due dates on high-priority tasks
- Export or share the session summary if needed

## Hard stops — do NOT proceed if:
- No Anthropic API key set (sentinel has flagged this)
- Microphone permission denied — guide Eytan to iOS Settings to grant
- Claude API returns a parse error — do not silently discard; show the raw error to Eytan
- Session has zero transcript lines — do not trigger organize
