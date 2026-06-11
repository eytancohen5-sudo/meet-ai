import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../types';

interface Props {
  task: Task;
  onToggle?: (id: string, status: 'open' | 'done') => void;
  compact?: boolean;
}

const PRIORITY_CONFIG = {
  low: { color: '#6b7280', label: 'Low' },
  medium: { color: '#f59e0b', label: 'Med' },
  high: { color: '#ef4444', label: 'High' },
};

export function TaskCard({ task, onToggle, compact = false }: Props) {
  const isDone = task.status === 'done';
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;

  return (
    <View className={`bg-white rounded-xl border border-border ${compact ? 'p-3' : 'p-4'} mb-2`}>
      <View className="flex-row items-start gap-3">
        <TouchableOpacity
          onPress={() => onToggle?.(task.id, isDone ? 'open' : 'done')}
          className="mt-0.5"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={isDone ? '#22c55e' : '#d1d5db'}
          />
        </TouchableOpacity>

        <View className="flex-1">
          <Text
            className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-text-secondary' : 'text-text-primary'}`}
          >
            {task.title}
          </Text>

          <View className="flex-row flex-wrap gap-2 mt-2">
            {task.assigned_to_name && (
              <View className="flex-row items-center gap-1 bg-brand-50 px-2 py-0.5 rounded-full">
                <Ionicons name="person-outline" size={10} color="#3B5BDB" />
                <Text className="text-xs text-brand-600">{task.assigned_to_name}</Text>
              </View>
            )}
            {task.location_name && (
              <View className="flex-row items-center gap-1 bg-bg px-2 py-0.5 rounded-full">
                <Ionicons name="location-outline" size={10} color="#6B7280" />
                <Text className="text-xs text-text-secondary">{task.location_name}</Text>
              </View>
            )}
            <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: priority.color + '20' }}>
              <Text className="text-xs font-medium" style={{ color: priority.color }}>{priority.label}</Text>
            </View>
          </View>

          {task.notes && !compact && (
            <Text className="text-xs text-text-secondary mt-2 leading-relaxed">{task.notes}</Text>
          )}
        </View>
      </View>
    </View>
  );
}
