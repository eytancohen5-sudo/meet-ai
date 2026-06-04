import * as SQLite from 'expo-sqlite';
import { Session, TranscriptLine, Task, Idea, Issue, Decision, MediaItem, Location, StaffMember } from '../types';
import { DEFAULT_LOCATIONS } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('villa_assistant.db');
    await migrate(db);
  }
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  const { user_version } = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version') ?? { user_version: 0 };

  if (user_version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '📍',
        color TEXT NOT NULL DEFAULT '#6E8FAC',
        reference_image_uri TEXT,
        ai_description TEXT
      );

      CREATE TABLE IF NOT EXISTS staff (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#1E3A5F',
        voice_sample_uri TEXT,
        avatar_initials TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        location_id TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        status TEXT NOT NULL DEFAULT 'recording',
        summary TEXT,
        audio_uri TEXT
      );

      CREATE TABLE IF NOT EXISTS session_participants (
        session_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        PRIMARY KEY (session_id, staff_id)
      );

      CREATE TABLE IF NOT EXISTS transcript_lines (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        speaker_id TEXT NOT NULL,
        text TEXT NOT NULL,
        start_time REAL NOT NULL DEFAULT 0,
        end_time REAL NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        location_id TEXT
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        assigned_to TEXT,
        location_id TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'medium',
        due_date INTEGER,
        notes TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ideas (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        text TEXT NOT NULL,
        source TEXT NOT NULL,
        category TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        location_id TEXT,
        severity TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        text TEXT NOT NULL,
        made_by TEXT NOT NULL DEFAULT 'owner',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS media_items (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        transcript_line_id TEXT,
        uri TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'photo',
        note TEXT,
        thumbnail_uri TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      PRAGMA user_version = 1;
    `);

    // Seed default locations
    for (const loc of DEFAULT_LOCATIONS) {
      await db.runAsync(
        'INSERT OR IGNORE INTO locations (id, name, icon, color) VALUES (?, ?, ?, ?)',
        loc.id, loc.name, loc.icon, loc.color
      );
    }
  }

  // v2 — replace qr_code/description with reference_image_uri/ai_description
  if (user_version < 2) {
    // ALTER TABLE doesn't allow multiple columns in one statement in SQLite
    try { await db.runAsync('ALTER TABLE locations ADD COLUMN reference_image_uri TEXT'); } catch {}
    try { await db.runAsync('ALTER TABLE locations ADD COLUMN ai_description TEXT'); } catch {}
    await db.runAsync('PRAGMA user_version = 2');
  }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function createSession(session: Omit<Session, 'participant_ids' | 'participant_names' | 'task_count' | 'idea_count'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO sessions (id, title, location_id, started_at, status) VALUES (?, ?, ?, ?, ?)',
    session.id, session.title, session.location_id ?? null, session.started_at, session.status
  );
}

export async function updateSession(id: string, updates: Partial<Session>): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.location_id !== undefined) { fields.push('location_id = ?'); values.push(updates.location_id ?? null); }
  if (updates.ended_at !== undefined) { fields.push('ended_at = ?'); values.push(updates.ended_at ?? null); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.summary !== undefined) { fields.push('summary = ?'); values.push(updates.summary ?? null); }
  if (updates.audio_uri !== undefined) { fields.push('audio_uri = ?'); values.push(updates.audio_uri ?? null); }
  if (fields.length === 0) return;
  values.push(id);
  await db.runAsync(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, ...values);
}

export async function getSessions(): Promise<Session[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string; title: string; location_id: string | null; location_name: string | null;
    started_at: number; ended_at: number | null; status: string; summary: string | null;
    audio_uri: string | null; task_count: number; idea_count: number;
  }>(`
    SELECT s.*,
      l.name as location_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.session_id = s.id) as task_count,
      (SELECT COUNT(*) FROM ideas i WHERE i.session_id = s.id) as idea_count
    FROM sessions s
    LEFT JOIN locations l ON s.location_id = l.id
    ORDER BY s.started_at DESC
  `);

  return Promise.all(rows.map(async (row) => {
    const participants = await db.getAllAsync<{ staff_id: string; name: string }>(
      'SELECT sp.staff_id, st.name FROM session_participants sp JOIN staff st ON sp.staff_id = st.id WHERE sp.session_id = ?',
      row.id
    );
    return {
      ...row,
      location_id: row.location_id ?? undefined,
      location_name: row.location_name ?? undefined,
      ended_at: row.ended_at ?? undefined,
      status: row.status as Session['status'],
      summary: row.summary ?? undefined,
      audio_uri: row.audio_uri ?? undefined,
      participant_ids: participants.map(p => p.staff_id),
      participant_names: participants.map(p => p.name),
      task_count: row.task_count,
      idea_count: row.idea_count,
    };
  }));
}

export async function getSession(id: string): Promise<Session | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string; title: string; location_id: string | null; location_name: string | null;
    started_at: number; ended_at: number | null; status: string; summary: string | null; audio_uri: string | null;
  }>(`
    SELECT s.*, l.name as location_name
    FROM sessions s LEFT JOIN locations l ON s.location_id = l.id
    WHERE s.id = ?
  `, id);
  if (!row) return null;
  const participants = await db.getAllAsync<{ staff_id: string; name: string }>(
    'SELECT sp.staff_id, st.name FROM session_participants sp JOIN staff st ON sp.staff_id = st.id WHERE sp.session_id = ?',
    id
  );
  return {
    ...row,
    location_id: row.location_id ?? undefined,
    location_name: row.location_name ?? undefined,
    ended_at: row.ended_at ?? undefined,
    status: row.status as Session['status'],
    summary: row.summary ?? undefined,
    audio_uri: row.audio_uri ?? undefined,
    participant_ids: participants.map(p => p.staff_id),
    participant_names: participants.map(p => p.name),
  };
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM sessions WHERE id = ?', id);
  await db.runAsync('DELETE FROM session_participants WHERE session_id = ?', id);
  await db.runAsync('DELETE FROM transcript_lines WHERE session_id = ?', id);
  await db.runAsync('DELETE FROM tasks WHERE session_id = ?', id);
  await db.runAsync('DELETE FROM ideas WHERE session_id = ?', id);
  await db.runAsync('DELETE FROM issues WHERE session_id = ?', id);
  await db.runAsync('DELETE FROM decisions WHERE session_id = ?', id);
  await db.runAsync('DELETE FROM media_items WHERE session_id = ?', id);
}

// ── Participants ───────────────────────────────────────────────────────────────

export async function addParticipant(sessionId: string, staffId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO session_participants (session_id, staff_id) VALUES (?, ?)',
    sessionId, staffId
  );
}

// ── Transcript ─────────────────────────────────────────────────────────────────

export async function addTranscriptLine(line: Omit<TranscriptLine, 'speaker_name' | 'speaker_color' | 'location_name'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO transcript_lines (id, session_id, speaker_id, text, start_time, end_time, timestamp, location_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    line.id, line.session_id, line.speaker_id, line.text, line.start_time, line.end_time, line.timestamp, line.location_id ?? null
  );
}

export async function getTranscriptLines(sessionId: string): Promise<TranscriptLine[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string; session_id: string; speaker_id: string; text: string;
    start_time: number; end_time: number; timestamp: number;
    location_id: string | null; location_name: string | null;
    speaker_name: string | null; speaker_color: string | null;
  }>(`
    SELECT tl.*,
      l.name as location_name,
      COALESCE(st.name, 'You') as speaker_name,
      COALESCE(st.color, '#1E3A5F') as speaker_color
    FROM transcript_lines tl
    LEFT JOIN locations l ON tl.location_id = l.id
    LEFT JOIN staff st ON tl.speaker_id = st.id
    WHERE tl.session_id = ?
    ORDER BY tl.start_time ASC
  `, sessionId);
  return rows.map(r => ({
    ...r,
    location_id: r.location_id ?? undefined,
    location_name: r.location_name ?? undefined,
    speaker_name: r.speaker_name ?? 'You',
    speaker_color: r.speaker_color ?? '#1E3A5F',
  }));
}

// ── Tasks ──────────────────────────────────────────────────────────────────────

export async function addTask(task: Task): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO tasks (id, session_id, title, assigned_to, location_id, status, priority, due_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    task.id, task.session_id, task.title, task.assigned_to ?? null, task.location_id ?? null,
    task.status, task.priority, task.due_date ?? null, task.notes ?? null, task.created_at
  );
}

export async function getTasks(sessionId: string): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Task & { assigned_to_name: string | null; location_name: string | null }>(
    `SELECT t.*, st.name as assigned_to_name, l.name as location_name
     FROM tasks t
     LEFT JOIN staff st ON t.assigned_to = st.id
     LEFT JOIN locations l ON t.location_id = l.id
     WHERE t.session_id = ?
     ORDER BY t.created_at ASC`, sessionId
  );
  return rows.map(r => ({ ...r, assigned_to_name: r.assigned_to_name ?? undefined, location_name: r.location_name ?? undefined }));
}

export async function updateTaskStatus(id: string, status: 'open' | 'done'): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE tasks SET status = ? WHERE id = ?', status, id);
}

export async function getAllOpenTasks(): Promise<(Task & { session_title: string })[]> {
  const db = await getDb();
  return db.getAllAsync<Task & { session_title: string; assigned_to_name: string | null; location_name: string | null }>(
    `SELECT t.*, s.title as session_title, st.name as assigned_to_name, l.name as location_name
     FROM tasks t
     JOIN sessions s ON t.session_id = s.id
     LEFT JOIN staff st ON t.assigned_to = st.id
     LEFT JOIN locations l ON t.location_id = l.id
     WHERE t.status = 'open'
     ORDER BY t.created_at DESC`
  );
}

// ── Ideas ──────────────────────────────────────────────────────────────────────

export async function addIdea(idea: Idea): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO ideas (id, session_id, text, source, category, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    idea.id, idea.session_id, idea.text, idea.source, idea.category ?? null, idea.created_at
  );
}

export async function getIdeas(sessionId: string): Promise<Idea[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Idea & { source_name: string | null }>(
    `SELECT i.*, COALESCE(st.name, 'You') as source_name
     FROM ideas i LEFT JOIN staff st ON i.source = st.id
     WHERE i.session_id = ?
     ORDER BY i.created_at ASC`, sessionId
  );
  return rows.map(r => ({ ...r, source_name: r.source_name ?? 'You' }));
}

// ── Issues ─────────────────────────────────────────────────────────────────────

export async function addIssue(issue: Issue): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO issues (id, session_id, title, description, location_id, severity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    issue.id, issue.session_id, issue.title, issue.description ?? null,
    issue.location_id ?? null, issue.severity, issue.status, issue.created_at
  );
}

export async function getIssues(sessionId: string): Promise<Issue[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Issue & { location_name: string | null }>(
    `SELECT i.*, l.name as location_name FROM issues i
     LEFT JOIN locations l ON i.location_id = l.id
     WHERE i.session_id = ? ORDER BY i.created_at ASC`, sessionId
  );
  return rows.map(r => ({ ...r, location_name: r.location_name ?? undefined }));
}

// ── Decisions ─────────────────────────────────────────────────────────────────

export async function addDecision(decision: Decision): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO decisions (id, session_id, text, made_by, created_at) VALUES (?, ?, ?, ?, ?)',
    decision.id, decision.session_id, decision.text, decision.made_by, decision.created_at
  );
}

export async function getDecisions(sessionId: string): Promise<Decision[]> {
  const db = await getDb();
  return db.getAllAsync<Decision>('SELECT * FROM decisions WHERE session_id = ? ORDER BY created_at ASC', sessionId);
}

// ── Media ──────────────────────────────────────────────────────────────────────

export async function addMediaItem(item: MediaItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO media_items (id, session_id, transcript_line_id, uri, type, note, thumbnail_uri, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    item.id, item.session_id, item.transcript_line_id ?? null, item.uri,
    item.type, item.note ?? null, item.thumbnail_uri ?? null, item.created_at
  );
}

export async function getMediaItems(sessionId: string): Promise<MediaItem[]> {
  const db = await getDb();
  return db.getAllAsync<MediaItem>('SELECT * FROM media_items WHERE session_id = ? ORDER BY created_at ASC', sessionId);
}

// ── Locations ─────────────────────────────────────────────────────────────────

export async function getLocations(): Promise<Location[]> {
  const db = await getDb();
  return db.getAllAsync<Location>('SELECT * FROM locations ORDER BY name ASC');
}

export async function upsertLocation(loc: Location): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO locations (id, name, icon, color, reference_image_uri, ai_description) VALUES (?, ?, ?, ?, ?, ?)',
    loc.id, loc.name, loc.icon, loc.color, loc.reference_image_uri ?? null, loc.ai_description ?? null
  );
}

export async function deleteLocation(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM locations WHERE id = ?', id);
}

// ── Staff ──────────────────────────────────────────────────────────────────────

export async function getStaff(): Promise<StaffMember[]> {
  const db = await getDb();
  return db.getAllAsync<StaffMember>('SELECT * FROM staff ORDER BY name ASC');
}

export async function upsertStaff(member: StaffMember): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO staff (id, name, role, color, voice_sample_uri, avatar_initials) VALUES (?, ?, ?, ?, ?, ?)',
    member.id, member.name, member.role, member.color,
    member.voice_sample_uri ?? null, member.avatar_initials
  );
}

export async function deleteStaff(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM staff WHERE id = ?', id);
}

// ── Settings ───────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}
