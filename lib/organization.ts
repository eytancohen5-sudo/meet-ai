import Anthropic from '@anthropic-ai/sdk';
import { TranscriptLine, OrganizedSession, StaffMember, Context } from '../types';

export async function organizeSession(
  transcript: TranscriptLine[],
  staff: StaffMember[],
  locations: Context[],
  sessionTitle: string,
  apiKey?: string
): Promise<OrganizedSession> {
  if (!apiKey) throw new Error('API key not configured. Add your Anthropic API key in Settings.');
  const anthropic = new Anthropic({ apiKey });

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

  const prompt = `You are an intelligent meeting organizer. Analyze this meeting transcript and extract structured information.

SESSION: "${sessionTitle}"
PARTICIPANTS: You + ${staff.map(s => s.name).join(', ')}

TRANSCRIPT:
${transcriptText}

Return a JSON object with this exact structure:
{
  "summary": "2-3 sentence overview of the meeting",
  "tasks": [
    {
      "title": "specific actionable task",
      "assigned_to": "staff member name or null",
      "location_id": "context id from this list: ${locations.map(l => l.id).join(', ')} or null",
      "priority": "low|medium|high",
      "due_date_description": "when if mentioned, else null",
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
      "location_id": "context id or null",
      "severity": "low|medium|high"
    }
  ],
  "decisions": [
    {
      "text": "what was decided",
      "made_by": "you or staff name"
    }
  ],
  "next_steps": ["bullet point action item"]
}

Rules:
- Tasks are specific, actionable items (assign X, schedule Y, deliver Z, follow up on W)
- Ideas are suggestions or proposals (could be good to..., what if we..., we should consider...)
- Issues are problems noted (broken, not working, blocked, needs attention, behind schedule)
- Decisions are agreed-upon choices (we will, decided to, confirmed, going with)
- Be concise but complete
- Only include items clearly stated in the transcript`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    summary: parsed.summary ?? '',
    tasks: (parsed.tasks ?? []).map((t: Record<string, unknown>) => ({
      title: t.title as string,
      assigned_to: findStaffId(t.assigned_to as string | null, staff),
      location_id: t.location_id as string | undefined,
      priority: (t.priority as string ?? 'medium') as 'low' | 'medium' | 'high',
      notes: t.notes as string | undefined,
    })),
    ideas: (parsed.ideas ?? []).map((i: Record<string, unknown>) => ({
      text: i.text as string,
      source: findStaffId(i.source as string, staff) ?? 'me',
      source_name: i.source as string,
      category: i.category as string | undefined,
    })),
    issues: (parsed.issues ?? []).map((i: Record<string, unknown>) => ({
      title: i.title as string,
      description: i.description as string | undefined,
      location_id: i.location_id as string | undefined,
      severity: (i.severity as string ?? 'medium') as 'low' | 'medium' | 'high',
    })),
    decisions: (parsed.decisions ?? []).map((d: Record<string, unknown>) => ({
      text: d.text as string,
      made_by: findStaffId(d.made_by as string, staff) ?? 'me',
    })),
    next_steps: parsed.next_steps ?? [],
  };
}

function findStaffId(name: string | null, staff: StaffMember[]): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  if (lower === 'owner' || lower === 'you' || lower === 'me') return 'me';
  const found = staff.find(s => s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase()));
  return found?.id ?? undefined;
}
