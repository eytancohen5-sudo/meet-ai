// 'interrupted' (ADR-008): a 'recording'/'paused' session whose process died —
// reclassified by the launch auto-close (markInterruptedSessions). Plain TEXT
// status value, no schema migration. Every status switch must handle it.
export type SessionStatus = 'recording' | 'processing' | 'complete' | 'paused' | 'interrupted';

export type UserRole = 'owner' | 'manager' | 'member';

export type ContextType = 'space' | 'product' | 'presentation' | 'website' | 'document' | 'other';

export interface Context {
  id: string;
  name: string;
  icon: string;
  color: string;
  context_type: ContextType;
  reference_image_uri?: string;  // local photo used to visually identify this context
  ai_description?: string;       // Claude's description of the context for matching
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  color: string;
  voice_sample_uri?: string;
  avatar_initials: string;
  // New fields for Meet AI platform
  email?: string;
  role_level: UserRole;
  invite_code?: string;
  supabase_user_id?: string;
  avatar_url?: string;
}

export interface Session {
  id: string;
  title: string;
  context_id?: string;
  context_name?: string;
  started_at: number;
  ended_at?: number;
  status: SessionStatus;
  summary?: string;
  audio_uri?: string;
  participant_ids: string[];
  participant_names?: string[];
  task_count?: number;
  idea_count?: number;
}

export interface TranscriptLine {
  id: string;
  session_id: string;
  speaker_id: string;
  speaker_name: string;
  speaker_color: string;
  text: string;
  start_time: number;
  end_time: number;
  timestamp: number;
  context_id?: string;
  context_name?: string;
}

export interface Task {
  id: string;
  session_id: string;
  title: string;
  assigned_to?: string;
  assigned_to_name?: string;
  location_id?: string;
  location_name?: string;
  status: 'open' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date?: number;
  notes?: string;
  created_at: number;
}

// R2: update payload for updateTask. For the nullable columns (assigned_to,
// due_date, notes) `null` means "write SQL NULL" (clear the field) while
// undefined/absent means "leave unchanged" — Partial<Task> could not express
// NULL, which forced a non-atomic deleteTask+addTask rewrite at the Tasks tab
// edit sheet. Scope matches build-spec T1: assignee / due date / priority /
// status / notes only.
export type TaskUpdate = {
  assigned_to?: string | null;
  due_date?: number | null;
  notes?: string | null;
  priority?: Task['priority'];
  status?: Task['status'];
};

export interface Idea {
  id: string;
  session_id: string;
  text: string;
  source: string;
  source_name: string;
  category?: string;
  created_at: number;
}

export interface Issue {
  id: string;
  session_id: string;
  title: string;
  description?: string;
  location_id?: string;
  location_name?: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  created_at: number;
}

export interface Decision {
  id: string;
  session_id: string;
  text: string;
  made_by: string;
  created_at: number;
}

export interface MediaItem {
  id: string;
  session_id: string;
  transcript_line_id?: string;
  uri: string;
  type: 'photo' | 'video';
  note?: string;
  thumbnail_uri?: string;
  created_at: number;
}

// Prompt contract v2 (ADR-007): next_steps removed entirely. Each task carries
// a resolved due_date (epoch ms at LOCAL midnight) via Task.due_date; when the
// model's date is invalid/null the spoken phrase is appended to notes instead.
export interface OrganizedSession {
  summary: string;
  tasks: Omit<Task, 'id' | 'session_id' | 'created_at' | 'status'>[];
  ideas: Omit<Idea, 'id' | 'session_id' | 'created_at'>[];
  issues: Omit<Issue, 'id' | 'session_id' | 'created_at' | 'status'>[];
  decisions: Omit<Decision, 'id' | 'session_id' | 'created_at'>[];
}

export const SPEAKER_COLORS = [
  '#1E3A5F',
  '#C9501A',
  '#2D7A3E',
  '#7B4F9E',
  '#B8943A',
  '#1A6B8A',
  '#8B3252',
  '#4A6741',
];
