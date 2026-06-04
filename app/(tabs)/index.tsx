import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, RefreshControl, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SessionCard } from '../../components/SessionCard';
import { getSessions, deleteSession } from '../../lib/database';
import { Session } from '../../types';

export default function SessionsScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
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

  const activeSession = sessions.find(s => s.status === 'recording' || s.status === 'paused');
  const pastSessions = sessions.filter(s => s.status !== 'recording' && s.status !== 'paused');

  return (
    <SafeAreaView className="flex-1 bg-navy-800">
      {/* Header */}
      <View className="px-5 pt-4 pb-5">
        <Text className="text-white text-2xl font-bold tracking-tight">Meet AI</Text>
        <Text className="text-navy-400 text-sm mt-1">Your meetings, on the record.</Text>
      </View>

      <View className="flex-1 bg-villa-bg rounded-t-3xl">
        <ScrollView
          contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E3A5F" />}
          showsVerticalScrollIndicator={false}
        >
          {/* Active session banner */}
          {activeSession && (
            <TouchableOpacity
              className="bg-red-500 rounded-2xl p-4 mb-4 flex-row items-center"
              onPress={() => router.push(`/session/${activeSession.id}`)}
            >
              <View className="w-2.5 h-2.5 bg-white rounded-full mr-3 opacity-90" />
              <View className="flex-1">
                <Text className="text-white font-semibold text-sm">Still going</Text>
                <Text className="text-red-100 text-xs mt-0.5" numberOfLines={1}>{activeSession.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          )}

          {sessions.length === 0 ? (
            <View className="items-center py-16">
              <Ionicons name="mic-outline" size={56} color="#D9E2EC" />
              <Text className="text-navy-800 font-semibold text-lg mt-4">Nothing here yet.</Text>
              <Text className="text-navy-400 text-sm mt-2 text-center px-8">
                Hit the button below to start your first walkthrough. It listens so you don't have to remember.
              </Text>
            </View>
          ) : (
            <>
              {pastSessions.length > 0 && (
                <>
                  <Text className="text-navy-800 font-semibold text-sm mb-3 uppercase tracking-wide">
                    Recent Sessions
                  </Text>
                  {pastSessions.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onPress={() => router.push(`/review/${session.id}`)}
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
          className="absolute bottom-8 right-5 w-16 h-16 bg-navy-800 rounded-full items-center justify-center shadow-lg"
          onPress={() => router.push('/session/new')}
          style={{
            shadowColor: '#1E3A5F',
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
