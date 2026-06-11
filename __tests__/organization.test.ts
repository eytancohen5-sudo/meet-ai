// Organizer prompt contract v2 fixture tests (ADR-007, build-spec T4).
// Pure Node — exercises the exported lib/organization.ts helpers without an
// API call. Fixtures simulate the model's parsed JSON response.
import { describe, test, expect } from '@jest/globals';
import {
  formatSessionDate,
  resolveDueDate,
  buildOrganizerPrompt,
  mapOrganizedResponse,
} from '../lib/organization';
import { StaffMember, Context, TranscriptLine } from '../types';

const staff: StaffMember[] = [
  { id: 'staff-maria', name: 'Maria', role: 'Housekeeping', color: '#1E3A5F', avatar_initials: 'M', role_level: 'member' },
];

const contexts: Context[] = [
  { id: 'ctx-pool', name: 'Pool', icon: '🏊', color: '#1A6B8A', context_type: 'space' },
  { id: 'ctx-manual', name: 'Operations Manual', icon: '📄', color: '#B8943A', context_type: 'document' },
];

// Monday, 2026-06-08 local midnight
const MONDAY = new Date(2026, 5, 8).getTime();

const transcript: TranscriptLine[] = [
  {
    id: 'l1', session_id: 's1', speaker_id: 'me', speaker_name: 'You', speaker_color: '#000',
    text: 'Maria, the pool pump is leaking, fix it today.',
    start_time: 0, end_time: 3, timestamp: MONDAY + 9 * 3600 * 1000,
  },
];

// --- Prompt content (binding contract amendments 3, 5, 6) ---

describe('buildOrganizerPrompt — contract v2 content', () => {
  const prompt = buildOrganizerPrompt(transcript, staff, contexts, 'Morning walkthrough', MONDAY);

  test('includes session start date with weekday', () => {
    expect(prompt).toContain('SESSION DATE: Monday, 2026-06-08');
  });

  test('renders contexts as "id (type): name"', () => {
    expect(prompt).toContain('ctx-pool (space): Pool');
    expect(prompt).toContain('ctx-manual (document): Operations Manual');
  });

  test('states the priority rules (urgency / deferral keywords)', () => {
    expect(prompt).toContain('"high" = safety risks, guest-impacting problems');
    expect(prompt).toContain('"today", "urgent", "before the guests arrive"');
    expect(prompt).toContain('"no rush", "whenever", "someday"');
    expect(prompt).toContain('"medium" = everything else');
  });

  test('states never-guess assignment — unassigned stays unassigned', () => {
    expect(prompt).toContain('Never guess an assignee');
    expect(prompt).toContain('leave it unassigned');
  });

  test('states context-type semantics (space = physical; document/website = subject matter)', () => {
    expect(prompt).toContain('"space" context is a physical location');
    expect(prompt).toContain('subject matter');
  });

  test('states attribution may be incomplete', () => {
    expect(prompt).toContain('Speaker attribution may be incomplete');
  });

  test('requests due_date as YYYY-MM-DD alongside due_date_description', () => {
    expect(prompt).toContain('"due_date": "YYYY-MM-DD or null"');
    expect(prompt).toContain('due_date_description');
  });

  test('contains no next_steps anywhere', () => {
    expect(prompt).not.toContain('next_steps');
  });

  test('ends with the JSON-only guardrail', () => {
    expect(prompt.trim().endsWith('Return ONLY the JSON object.')).toBe(true);
  });
});

describe('formatSessionDate', () => {
  test('formats weekday + ISO date', () => {
    expect(formatSessionDate(MONDAY)).toBe('Monday, 2026-06-08');
    expect(formatSessionDate(new Date(2026, 5, 12).getTime())).toBe('Friday, 2026-06-12');
  });
});

// --- Due-date validation (binding contract) ---

describe('resolveDueDate', () => {
  test('valid YYYY-MM-DD -> epoch ms at local midnight, notes untouched', () => {
    const { due_date, notes } = resolveDueDate('2026-06-12', 'by Friday', 'check paint');
    expect(due_date).toBe(new Date(2026, 5, 12).getTime());
    expect(new Date(due_date!).getHours()).toBe(0);
    expect(notes).toBe('check paint');
  });

  test('malformed date string -> no due_date, phrase appended to notes', () => {
    const { due_date, notes } = resolveDueDate('next Friday', 'by Friday', 'check paint');
    expect(due_date).toBeUndefined();
    expect(notes).toBe('check paint\nDue: by Friday');
  });

  test('null date with phrase -> phrase becomes notes when none exist', () => {
    const { due_date, notes } = resolveDueDate(null, 'sometime', undefined);
    expect(due_date).toBeUndefined();
    expect(notes).toBe('Due: sometime');
  });

  test('null date and no phrase -> nothing changes', () => {
    const { due_date, notes } = resolveDueDate(null, null, undefined);
    expect(due_date).toBeUndefined();
    expect(notes).toBeUndefined();
  });

  test('regex-passing impossible date (rollover) -> treated as invalid, phrase to notes', () => {
    const { due_date, notes } = resolveDueDate('2026-02-31', 'end of February', undefined);
    expect(due_date).toBeUndefined();
    expect(notes).toBe('Due: end of February');
  });
});

// --- Fixture acceptance tests (T4 acceptance evidence a–e) ---

describe('mapOrganizedResponse — fixtures', () => {
  test('(a) "Maria, the pool pump is leaking, fix it today" -> high / Maria / Pool / due today', () => {
    const result = mapOrganizedResponse(
      {
        summary: 'Walkthrough.',
        tasks: [{
          title: 'Fix the leaking pool pump',
          assigned_to: 'Maria',
          location_id: 'ctx-pool',
          priority: 'high',
          due_date: '2026-06-08',
          due_date_description: 'today',
          notes: 'Pump is leaking',
        }],
      },
      staff
    );
    const task = result.tasks[0];
    expect(task.priority).toBe('high');
    expect(task.assigned_to).toBe('staff-maria');
    expect(task.location_id).toBe('ctx-pool');
    expect(task.due_date).toBe(MONDAY); // session date at local midnight
    expect(task.notes).toBe('Pump is leaking');
  });

  test('(b) "someone should repaint the gate sometime" -> low / unassigned', () => {
    const result = mapOrganizedResponse(
      {
        tasks: [{
          title: 'Repaint the gate',
          assigned_to: null,
          location_id: null,
          priority: 'low',
          due_date: null,
          due_date_description: 'sometime',
          notes: null,
        }],
      },
      staff
    );
    const task = result.tasks[0];
    expect(task.priority).toBe('low');
    expect(task.assigned_to).toBeUndefined();
    expect(task.due_date).toBeUndefined();
    expect(task.notes).toBe('Due: sometime');
  });

  test('(c) "by Friday" on a Monday session -> that Friday at local midnight', () => {
    const result = mapOrganizedResponse(
      {
        tasks: [{
          title: 'Order pool chemicals',
          assigned_to: 'Maria',
          priority: 'medium',
          due_date: '2026-06-12',
          due_date_description: 'by Friday',
        }],
      },
      staff
    );
    const due = result.tasks[0].due_date!;
    expect(due).toBe(new Date(2026, 5, 12).getTime());
    expect(new Date(due).getDay()).toBe(5); // Friday
  });

  test('(d) malformed date string -> task saved, no due_date, phrase appended to notes', () => {
    const result = mapOrganizedResponse(
      {
        tasks: [{
          title: 'Service the AC',
          assigned_to: null,
          priority: 'medium',
          due_date: 'Friday-ish',
          due_date_description: 'before the weekend',
          notes: 'Unit in the master bedroom',
        }],
      },
      staff
    );
    const task = result.tasks[0];
    expect(task.title).toBe('Service the AC');
    expect(task.due_date).toBeUndefined();
    expect(task.notes).toBe('Unit in the master bedroom\nDue: before the weekend');
  });

  test('(e) result contains no next_steps key', () => {
    const result = mapOrganizedResponse({ summary: 'x', next_steps: ['stale field'] }, staff);
    expect('next_steps' in result).toBe(false);
  });

  test('lenient parsing preserved: empty object maps to empty collections', () => {
    const result = mapOrganizedResponse({}, staff);
    expect(result.summary).toBe('');
    expect(result.tasks).toEqual([]);
    expect(result.ideas).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.decisions).toEqual([]);
  });
});

// --- Structural guards on the protected file (same style as smoke.test.ts) ---

describe('lib/organization.ts structural guards', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../lib/organization.ts'), 'utf8');

  test('max_tokens bumped to 8192', () => {
    expect(src).toContain('max_tokens: 8192');
    expect(src).not.toContain('max_tokens: 4096');
  });

  test('lenient brace-extraction parser unchanged', () => {
    expect(src).toContain('content.text.match(/\\{[\\s\\S]*\\}/)');
  });

  test('no console logging in the API path (key never logged)', () => {
    expect(src).not.toMatch(/console\.(log|warn|error|info|debug)/);
  });

  test('no next_steps in source', () => {
    expect(src).not.toContain('next_steps');
  });
});
