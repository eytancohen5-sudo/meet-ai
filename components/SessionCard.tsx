import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '../types';
import { formatDuration } from '../lib/transcription';

interface Props {
  session: Session;
  onPress: () => void;
  onLongPress?: () => void;
}

const STATUS_CONFIG = {
  recording: { label: 'Recording', color: '#ef4444', icon: 'radio-button-on' as const },
  processing: { label: 'Processing', color: '#f59e0b', icon: 'hourglass-outline' as const },
  complete: { label: 'Complete', color: '#22c55e', icon: 'checkmark-circle' as const },
  paused: { label: 'Paused', color: '#6b7280', icon: 'pause-circle' as const },
};

export function SessionCard({ session, onPress, onLongPress }: Props) {
  const status = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.complete;
  const duration = session.ended_at
    ? formatDuration((session.ended_at - session.started_at) / 1000)
    : null;
  const date = new Date(session.started_at);
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-app-border"
      activeOpacity={0.7}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text className="text-navy-800 font-semibold text-base leading-tight" numberOfLines={2}>
            {session.title}
          </Text>
        </View>
        <View className="flex-row items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: status.color + '20' }}>
          <Ionicons name={status.icon} size={12} color={status.color} />
          <Text className="text-xs font-medium" style={{ color: status.color }}>
            {status.label}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-3 flex-wrap">
        {session.context_name && (
          <View className="flex-row items-center gap-1">
            <Ionicons name="location-outline" size={13} color="#6E8FAC" />
            <Text className="text-navy-400 text-xs">{session.context_name}</Text>
          </View>
        )}
        <View className="flex-row items-center gap-1">
          <Ionicons name="calendar-outline" size={13} color="#6E8FAC" />
          <Text className="text-navy-400 text-xs">{dateStr} · {timeStr}</Text>
        </View>
        {duration && (
          <View className="flex-row items-center gap-1">
            <Ionicons name="time-outline" size={13} color="#6E8FAC" />
            <Text className="text-navy-400 text-xs">{duration}</Text>
          </View>
        )}
      </View>

      {(session.participant_names?.length ?? 0) > 0 && (
        <View className="flex-row items-center gap-1 mt-2">
          <Ionicons name="people-outline" size={13} color="#6E8FAC" />
          <Text className="text-navy-400 text-xs" numberOfLines={1}>
            {session.participant_names?.join(', ')}
          </Text>
        </View>
      )}

      {session.status === 'complete' && (
        <View className="flex-row gap-3 mt-3 pt-3 border-t border-app-border">
          {(session.task_count ?? 0) > 0 && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="checkbox-outline" size={13} color="#E06C1A" />
              <Text className="text-xs text-orange-600">{session.task_count} task{session.task_count !== 1 ? 's' : ''}</Text>
            </View>
          )}
          {(session.idea_count ?? 0) > 0 && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="bulb-outline" size={13} color="#C9A84C" />
              <Text className="text-xs" style={{ color: '#C9A84C' }}>{session.idea_count} idea{session.idea_count !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}
