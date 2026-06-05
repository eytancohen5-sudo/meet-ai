import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, SafeAreaView, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../stores/auth';
import { getAllOpenTasks, getSessions } from '../../lib/database';
import { supabase } from '../../lib/supabase';
import { TaskCard } from '../../components/TaskCard';
import { Task, Session } from '../../types';

const isSyncEnabled = (): boolean =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export default function MemberDashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData(user.id);
  }, [user]);

  const loadData = async (userId: string) => {
    setLoading(true);
    try {
      if (isSyncEnabled()) {
        // Fetch open tasks assigned to this user from Supabase
        const { data: supabaseTasks } = await supabase
          .from('tasks')
          .select('*')
          .eq('assigned_to', userId)
          .eq('status', 'open');

        // Fetch sessions this user participated in from Supabase
        const { data: supabaseSessions } = await supabase
          .from('sessions')
          .select('*')
          .contains('participant_ids', [userId])
          .order('started_at', { ascending: false })
          .limit(10);

        setTasks((supabaseTasks as Task[]) ?? []);
        setSessions((supabaseSessions as Session[]) ?? []);
      } else {
        // Fall back to local SQLite open tasks
        const allOpen = await getAllOpenTasks();
        const myTasks = allOpen.filter(t => t.assigned_to === userId);
        setTasks(myTasks);

        // Load all sessions and filter by participant
        const allSessions = await getSessions();
        const mySessions = allSessions.filter(s =>
          s.participant_ids?.includes(userId)
        );
        setSessions(mySessions.slice(0, 10));
      }
    } catch (err) {
      console.warn('[dashboard] loadData failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-navy-800 items-center justify-center">
        <ActivityIndicator color="white" size="large" />
      </SafeAreaView>
    );
  }

  const displayName = user?.email?.split('@')[0] ?? 'there';

  return (
    <SafeAreaView className="flex-1 bg-navy-800">
      <View className="px-5 pt-4 pb-5">
        <Text className="text-white text-2xl font-bold tracking-tight">
          Hi, {displayName}
        </Text>
        <Text className="text-navy-400 text-sm mt-1">Your open tasks and sessions</Text>
      </View>

      <View className="flex-1 bg-app-bg rounded-t-3xl">
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {Platform.OS === 'web' && (
            <View className="bg-gold-300/30 border border-gold-400/40 rounded-xl p-3 mb-4 flex-row items-center gap-2">
              <Ionicons name="information-circle-outline" size={18} color="#b8943a" />
              <Text className="text-gold-600 text-sm flex-1">
                Audio not available on web. Use the mobile app to record sessions.
              </Text>
            </View>
          )}

          {/* Open Tasks */}
          <Text className="text-navy-400 text-xs font-semibold uppercase tracking-wide mb-3">
            My Open Tasks ({tasks.length})
          </Text>

          {tasks.length === 0 ? (
            <View className="bg-white rounded-2xl border border-app-border p-6 items-center mb-6">
              <Ionicons name="checkmark-circle-outline" size={36} color="#D9E2EC" />
              <Text className="text-gray-400 text-sm mt-3 text-center">No open tasks assigned to you</Text>
            </View>
          ) : (
            <View className="mb-6">
              {tasks.map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
            </View>
          )}

          {/* Sessions */}
          <Text className="text-navy-400 text-xs font-semibold uppercase tracking-wide mb-3">
            Sessions I Was Part Of ({sessions.length})
          </Text>

          {sessions.length === 0 ? (
            <View className="bg-white rounded-2xl border border-app-border p-6 items-center">
              <Ionicons name="mic-outline" size={36} color="#D9E2EC" />
              <Text className="text-gray-400 text-sm mt-3 text-center">No sessions recorded yet</Text>
            </View>
          ) : (
            sessions.map(session => (
              <View key={session.id} className="bg-white rounded-xl border border-app-border p-4 mb-2">
                <Text className="text-navy-800 font-medium" numberOfLines={1}>{session.title}</Text>
                <View className="flex-row items-center gap-3 mt-1">
                  <Text className="text-gray-400 text-xs">
                    {new Date(session.started_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </Text>
                  {session.context_name && (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="location-outline" size={11} color="#9cb3c9" />
                      <Text className="text-navy-400 text-xs">{session.context_name}</Text>
                    </View>
                  )}
                  {(session.task_count ?? 0) > 0 && (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="checkbox-outline" size={11} color="#e06c1a" />
                      <Text className="text-orange-500 text-xs">{session.task_count} task{session.task_count !== 1 ? 's' : ''}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
