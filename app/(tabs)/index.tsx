import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SessionCard } from '../../components/SessionCard';
import { NoticeBanner } from '../../components/NoticeBanner';
import { getSessions, deleteSession, markInterruptedSessions } from '../../lib/database';
import { useActiveSession } from '../../stores/session';
import { Session } from '../../types';

export default function SessionsScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Re-render when liveness changes; null whenever nothing is genuinely live.
  const liveSessionId = useActiveSession(s => (s.isRecording ? s.sessionId : null));

  const load = useCallback(async () => {
    // ADR-008 launch auto-close (challenger amendment 1): reclassify dead
    // 'recording'/'paused' rows to 'interrupted' BEFORE the list renders, so no
    // UI can ever treat a corpse as live. The live store id is read first —
    // a genuinely live backgrounded recording is never swept.
    await markInterruptedSessions(useActiveSession.getState().sessionId);
    const data = await getSessions();
    setSessions(data);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleLongPress = (session: Session) => {
    Alert.alert(
      session.title,
      'What would you like to do?',
      [
        {
          text: 'Delete Session',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Delete Session', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteSession(session.id);
                  await load();
                },
              },
            ]);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Red banner ONLY for a store-confirmed live recording (ADR-008 §4). After the
  // auto-close sweep, any remaining 'recording'/'paused' row IS the live one —
  // but the in-memory store stays the source of truth, never the persisted status.
  const liveSession = sessions.find(
    s => (s.status === 'recording' || s.status === 'paused') && s.id === liveSessionId
  );
  // Amber recovery banner for the most recent interrupted session; older ones
  // still render in the list as amber "Interrupted" cards (getSessions is newest-first).
  const interruptedSession = sessions.find(s => s.status === 'interrupted');
  const pastSessions = sessions.filter(s => s.id !== liveSession?.id);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-bg">
      {/* Header */}
      <View className="px-5 pt-4 pb-5">
        <Text className="text-text-primary text-2xl font-bold tracking-tight">Meet AI</Text>
        <Text className="text-text-secondary text-sm mt-1">Your meetings, on the record.</Text>
      </View>

      <View className="flex-1 bg-bg">
        <ScrollView
          contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B5BDB" />}
          showsVerticalScrollIndicator={false}
        >
          {/* Live recording banner — red, store-confirmed live only (ADR-008 §4) */}
          {liveSession && (
            <TouchableOpacity
              className="bg-recording rounded-2xl p-4 mb-4 flex-row items-center"
              onPress={() => router.push(`/session/${liveSession.id}`)}
            >
              <View className="w-2.5 h-2.5 bg-white rounded-full mr-3 opacity-90" />
              <View className="flex-1">
                <Text className="text-white font-semibold text-sm">Recording — tap to return</Text>
                <Text className="text-red-100 text-xs mt-0.5" numberOfLines={1}>{liveSession.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          )}

          {/* Interrupted recovery banner — amber reassurance, opens the read-only
              recovery layout. Replaces the old red "Still going" footgun that
              re-recorded dead sessions over their own audio (ADR-008). */}
          {interruptedSession && (
            <TouchableOpacity
              className="mb-4"
              activeOpacity={0.8}
              onPress={() => router.push(`/session/${interruptedSession.id}`)}
            >
              <NoticeBanner
                variant="warning"
                message={`Recording interrupted — ${interruptedSession.title} · it's saved`}
                actionLabel="Open"
                onAction={() => router.push(`/session/${interruptedSession.id}`)}
              />
            </TouchableOpacity>
          )}

          {sessions.length === 0 ? (
            <View className="items-center py-16">
              <Ionicons name="mic-outline" size={56} color="#E5E7EB" />
              <Text className="text-text-primary font-semibold text-lg mt-4">Nothing here yet.</Text>
              <Text className="text-text-secondary text-sm mt-2 text-center px-8">
                Hit the button below to start your first walkthrough. It listens so you don't have to remember.
              </Text>
            </View>
          ) : (
            <>
              {pastSessions.length > 0 && (
                <>
                  <Text className="text-text-primary font-semibold text-sm mb-3 uppercase tracking-wide">
                    Recent
                  </Text>
                  {pastSessions.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      // Interrupted sessions open the read-only recovery layout —
                      // never Review (its guards land in T8) and never live capture.
                      onPress={() => router.push(
                        session.status === 'interrupted'
                          ? `/session/${session.id}`
                          : `/review/${session.id}`
                      )}
                      onLongPress={() => handleLongPress(session)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>

        {/* FAB */}
        <TouchableOpacity
          className="absolute bottom-8 right-5 w-16 h-16 bg-brand-600 rounded-full items-center justify-center shadow-lg"
          onPress={() => router.push('/session/new')}
          style={{
            shadowColor: '#3B5BDB',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Ionicons name="add" size={32} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
