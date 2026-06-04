import { supabase } from './supabase';
import { getSession, getTranscriptLines, getTasks, getIdeas, getIssues, getDecisions } from './database';

const isSyncEnabled = (): boolean => {
  return !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
};

/** Push a completed session and all its data to Supabase. */
export async function syncSessionToSupabase(sessionId: string): Promise<void> {
  if (!isSyncEnabled()) return;
  try {
    const [session, lines, tasks, ideas, issues, decisions] = await Promise.all([
      getSession(sessionId),
      getTranscriptLines(sessionId),
      getTasks(sessionId),
      getIdeas(sessionId),
      getIssues(sessionId),
      getDecisions(sessionId),
    ]);
    if (!session) return;

    const { audio_uri: _omit, ...sessionData } = session as typeof session & { audio_uri?: string };
    await supabase.from('sessions').upsert(sessionData, { onConflict: 'id' });
    if (lines.length) await supabase.from('transcript_lines').upsert(lines, { onConflict: 'id' });
    if (tasks.length) await supabase.from('tasks').upsert(tasks, { onConflict: 'id' });
    if (ideas.length) await supabase.from('ideas').upsert(ideas, { onConflict: 'id' });
    if (issues.length) await supabase.from('issues').upsert(issues, { onConflict: 'id' });
    if (decisions.length) await supabase.from('decisions').upsert(decisions, { onConflict: 'id' });
  } catch (err) {
    console.warn('[sync] syncSessionToSupabase failed:', err);
  }
}

/** Push a single task status update to Supabase. */
export async function syncTaskUpdate(taskId: string, status: 'open' | 'done'): Promise<void> {
  if (!isSyncEnabled()) return;
  try {
    await supabase.from('tasks').update({ status }).eq('id', taskId);
  } catch (err) {
    console.warn('[sync] syncTaskUpdate failed:', err);
  }
}

/** Push a team member profile update to Supabase. */
export async function syncTeamMember(member: { id: string; name: string; email?: string; role_level: string; invite_code?: string; avatar_url?: string }): Promise<void> {
  if (!isSyncEnabled()) return;
  try {
    await supabase.from('profiles').upsert({
      display_name: member.name,
      email: member.email,
      invite_code: member.invite_code,
      avatar_url: member.avatar_url,
    }, { onConflict: 'email' });
  } catch (err) {
    console.warn('[sync] syncTeamMember failed:', err);
  }
}
