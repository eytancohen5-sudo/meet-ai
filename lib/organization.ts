// Organizer prompt contract v2 — governed by ADR-007 (forge steward).
// Single Claude API call; lenient brace-extraction parser preserved.
// The pure helpers below are exported ONLY for the Node smoke suite —
// production code goes through organizeSession.
import Anthropic from '@anthropic-ai/sdk';
import { TranscriptLine, OrganizedSession, StaffMember, Context } from '../types';

const DUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// "Monday, 2026-06-08" — weekday included so the model can resolve "by Friday"
// relative to the session date (ADR-007, challenger amendment 5).
export function formatSessionDate(startMs: number): string {
  const d = new Date(startMs);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${weekday}, ${y}-${m}-${day}`;
}

// Due-date contract (ADR-007): the model returns "YYYY-MM-DD" | null alongside
// the spoken phrase. Valid -> epoch ms at LOCAL midnight. Invalid/null -> no
// date, and the spoken phrase (if any) is appended to notes so nothing is
// extracted-and-discarded. No date-parsing library.
export function resolveDueDate(
  rawDate: unknown,
  spokenPhrase: unknown,
  notes: string | undefined
): { due_date: number | undefined; notes: string | undefined } {
  if (typeof rawDate === 'string' && DUE_DATE_RE.test(rawDate)) {
    const [y, m, d] = rawDate.split('-').map(Number);
    const localMidnight = new Date(y, m - 1, d);
    // Reject regex-passing but impossible dates (e.g. "2026-02-31") that the
    // Date constructor would silently roll over — fail-soft into the notes path.
    if (
      localMidnight.getFullYear() === y &&
      localMidnight.getMonth() === m - 1 &&
      localMidnight.getDate() === d
    ) {
      return { due_date: localMidnight.getTime(), notes };
    }
  }
  const phrase =
    typeof spokenPhrase === 'string' && spokenPhrase.trim().length > 0
      ? spokenPhrase.trim()
      : undefined;
  if (!phrase) return { due_date: undefined, notes };
  const dueNote = `Due: ${phrase}`;
  return { due_date: undefined, notes: notes ? `${notes}\n${dueNote}` : dueNote };
}

export function buildOrganizerPrompt(
  transcript: TranscriptLine[],
  staff: StaffMember[],
  locations: Context[],
  sessionTitle: string,
  sessionStartedAt: number
): string {
  const staffMap = Object.fromEntries(staff.map(s => [s.id, s.name]));
  const locationMap = Object.fromEntries(locations.map(l => [l.id, l.name]));

  const transcriptText = transcript
    .map(line => {
      const speaker = line.speaker_id === 'me' ? 'You' : (staffMap[line.speaker_id] ?? line.speaker_id);
      const location = line.context_id ? ` [${locationMap[line.context_id] ?? line.context_id}]` : '';
      const time = new Date(line.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return `[${time}]${location} ${speaker}: ${line.text}`;
    })
    .join('\n');

  // Contexts rendered as "id (type): name" (ADR-003 discriminator, ADR-007 §4).
  const contextsBlock = locations.length
    ? locations.map(l => `${l.id} (${l.context_type}): ${l.name}`).join('\n')
    : '(none)';

  return `You are an intelligent meeting organizer. Analyze this meeting transcript and extract structured information.

SESSION: "${sessionTitle}"
SESSION DATE: ${formatSessionDate(sessionStartedAt)}
PARTICIPANTS: You + ${staff.map(s => s.name).join(', ')}
CONTEXTS (each as "id (type): name"):
${contextsBlock}

TRANSCRIPT:
${transcriptText}

Return a JSON object with this exact structure:
{
  "summary": "2-3 sentence overview of the meeting",
  "tasks": [
    {
      "title": "specific actionable task",
      "assigned_to": "staff member name or null",
      "location_id": "a context id from CONTEXTS above, or null",
      "priority": "low|medium|high",
      "due_date": "YYYY-MM-DD or null",
      "due_date_description": "the spoken phrase for when it is due if mentioned, else null",
      "notes": "any relevant details"
    }
  ],
  "ideas": [
    {
      "text": "the idea",
      "source": "speaker name",
      "category": "improvement|process|strategic|technical|other"
    }
  ],
  "issues": [
    {
      "title": "short title",
      "description": "what was said",
      "location_id": "a context id from CONTEXTS above, or null",
      "severity": "low|medium|high"
    }
  ],
  "decisions": [
    {
      "text": "what was decided",
      "made_by": "you or staff name"
    }
  ]
}

Rules:
- Tasks are specific, actionable items (assign X, schedule Y, deliver Z, follow up on W)
- Ideas are suggestions or proposals (could be good to..., what if we..., we should consider...)
- Issues are problems noted (broken, not working, blocked, needs attention, behind schedule)
- Decisions are agreed-upon choices (we will, decided to, confirmed, going with)
- Priority: "high" = safety risks, guest-impacting problems, work that blocks other work, or explicit urgency ("today", "urgent", "before the guests arrive"); "low" = explicit deferral ("no rush", "whenever", "someday"); "medium" = everything else
- Assignment: assign a task only when a person's name or an unambiguous role is spoken for it. Never guess an assignee — if nobody is named, use null and leave it unassigned
- Contexts: a "space" context is a physical location — where an issue or task physically is; a "document" or "website" context is subject matter being discussed, not a location
- Speaker attribution may be incomplete or wrong; rely on names spoken in the text itself ("Maria, please...") rather than the speaker labels
- due_date: resolve relative phrases ("by Friday", "tomorrow", "today") against the SESSION DATE above and return the calendar date as YYYY-MM-DD; if no due date is mentioned or it cannot be resolved, use null and still report the spoken phrase in due_date_description
- Be concise but complete
- Only include items clearly stated in the transcript
- Return ONLY the JSON object.`;
}

// Lenient mapping over the parsed model JSON: per-field ?? fallbacks, tolerant
// to additive and subtractive field changes (ADR-007 §7 — parser kept lenient).
export function mapOrganizedResponse(
  parsed: Record<string, unknown>,
  staff: StaffMember[]
): OrganizedSession {
  return {
    summary: (parsed.summary as string) ?? '',
    tasks: ((parsed.tasks as Record<string, unknown>[]) ?? []).map((t: Record<string, unknown>) => {
      const { due_date, notes } = resolveDueDate(t.due_date, t.due_date_description, t.notes as string | undefined);
      return {
        title: t.title as string,
        assigned_to: findStaffId(t.assigned_to as string | null, staff),
        location_id: t.location_id as string | undefined,
        priority: (t.priority as string ?? 'medium') as 'low' | 'medium' | 'high',
        due_date,
        notes,
      };
    }),
    ideas: ((parsed.ideas as Record<string, unknown>[]) ?? []).map((i: Record<string, unknown>) => ({
      text: i.text as string,
      source: findStaffId(i.source as string, staff) ?? 'me',
      source_name: i.source as string,
      category: i.category as string | undefined,
    })),
    issues: ((parsed.issues as Record<string, unknown>[]) ?? []).map((i: Record<string, unknown>) => ({
      title: i.title as string,
      description: i.description as string | undefined,
      location_id: i.location_id as string | undefined,
      severity: (i.severity as string ?? 'medium') as 'low' | 'medium' | 'high',
    })),
    decisions: ((parsed.decisions as Record<string, unknown>[]) ?? []).map((d: Record<string, unknown>) => ({
      text: d.text as string,
      made_by: findStaffId(d.made_by as string, staff) ?? 'me',
    })),
  };
}

export async function organizeSession(
  transcript: TranscriptLine[],
  staff: StaffMember[],
  locations: Context[],
  sessionTitle: string,
  apiKey?: string,
  // Session start in epoch ms; falls back to the first transcript line's
  // timestamp (same calendar day in practice) when the caller predates v2.
  sessionStartedAt?: number
): Promise<OrganizedSession> {
  if (!apiKey) throw new Error('API key not configured. Add your Anthropic API key in Settings.');
  const anthropic = new Anthropic({ apiKey });

  const startMs = sessionStartedAt ?? transcript[0]?.timestamp ?? Date.now();
  const prompt = buildOrganizerPrompt(transcript, staff, locations, sessionTitle, startMs);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  const parsed = JSON.parse(jsonMatch[0]);

  return mapOrganizedResponse(parsed, staff);
}

function findStaffId(name: string | null, staff: StaffMember[]): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  if (lower === 'owner' || lower === 'you' || lower === 'me') return 'me';
  const found = staff.find(s => s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase()));
  return found?.id ?? undefined;
}
