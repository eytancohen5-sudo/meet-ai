import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, SafeAreaView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { TaskCard } from '../../components/TaskCard';
import { getAllOpenTasks, updateTaskStatus } from '../../lib/database';
import { Task } from '../../types';

export default function TasksScreen() {
  const [tasks, setTasks] = useState<(Task & { session_title: string })[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getAllOpenTasks();
    setTasks(data as (Task & { session_title: string })[]);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleToggle = async (id: string, status: 'open' | 'done') => {
    await updateTaskStatus(id, status);
    await load();
  };

  const grouped = tasks.reduce<Record<string, (Task & { session_title: string })[]>>((acc, task) => {
    const key = task.session_title ?? 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});

  return (
    <SafeAreaView className="flex-1 bg-navy-800">
      <View className="px-5 pt-4 pb-5">
        <Text className="text-white text-2xl font-bold tracking-tight">Open Tasks</Text>
        <Text className="text-navy-400 text-sm mt-1">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} pending
        </Text>
      </View>

      <View className="flex-1 bg-app-bg rounded-t-3xl">
        <ScrollView
          contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E3A5F" />}
          showsVerticalScrollIndicator={false}
        >
          {tasks.length === 0 ? (
            <View className="items-center py-16">
              <Ionicons name="checkmark-done-circle-outline" size={56} color="#D9E2EC" />
              <Text className="text-navy-800 font-semibold text-lg mt-4">All caught up!</Text>
              <Text className="text-navy-400 text-sm mt-2 text-center px-8">
                No open tasks. Complete sessions will appear here.
              </Text>
            </View>
          ) : (
            Object.entries(grouped).map(([sessionTitle, sessionTasks]) => (
              <View key={sessionTitle} className="mb-5">
                <Text className="text-navy-400 text-xs font-semibold uppercase tracking-wide mb-2">
                  {sessionTitle}
                </Text>
                {sessionTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={handleToggle}
                    compact
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
