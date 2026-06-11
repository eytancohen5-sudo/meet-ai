import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../types';

interface Props {
  task: Task;
  onToggle?: (id: string, status: 'open' | 'done') => void;
  /** Opens the task edit sheet (assignee / due date / priority / delete). Card body becomes tappable when provided. */
  onEdit?: (task: Task) => void;
  /** Meta line under the title — which session this task came from. */
  sessionTitle?: string;
  compact?: boolean;
}

const PRIORITY_CONFIG = {
  low: { chip: 'bg-gray-100', text: 'text-gray-600', label: 'Low' },
  medium: { chip: 'bg-amber-50', text: 'text-amber-600', label: 'Med' },
  high: { chip: 'bg-red-50', text: 'text-red-600', label: 'High' },
};

const DAY_MS = 86400000;

/**
 * Relative due wording. Overdue = due_date < start of today (local) — binding
 * due-date contract, no date library. Done tasks never read as overdue; past
 * dates on done tasks fall back to the short date.
 */
function formatDueChip(dueDate: number, isDone: boolean): { label: string; overdue: boolean } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(dueDate);
  const shortDate = `by ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  if (dueDate < startOfToday) {
    return isDone ? { label: shortDate, overdue: false } : { label: 'overdue', overdue: true };
  }
  // Local midnights differ by n*24h ± 1h across DST — round, never floor.
  const days = Math.round((dueDate - startOfToday) / DAY_MS);
  if (days === 0) return { label: 'by today', overdue: false };
  if (days === 1) return { label: 'by tomorrow', overdue: false };
  if (days < 7) {
    return { label: `by ${due.toLocaleDateString('en-US', { weekday: 'short' })}`, overdue: false };
  }
  return { label: shortDate, overdue: false };
}

export function TaskCard({ task, onToggle, onEdit, sessionTitle, compact = false }: Props) {
  const isDone = task.status === 'done';
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const due = task.due_date ? formatDueChip(task.due_date, isDone) : null;

  return (
    <TouchableOpacity
      onPress={() => onEdit?.(task)}
      activeOpacity={onEdit ? 0.7 : 1}
      disabled={!onEdit}
      className={`bg-white rounded-xl border border-border ${compact ? 'p-3' : 'p-4'} mb-2`}
    >
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

          {sessionTitle ? (
            <Text className="text-text-tertiary text-xs mt-0.5" numberOfLines={1}>
              {sessionTitle}
            </Text>
          ) : null}

          <View className="flex-row flex-wrap gap-2 mt-2">
            {due && (
              <View
                className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${due.overdue ? 'bg-red-50' : 'bg-brand-50'}`}
              >
                <Ionicons
                  name="calendar-outline"
                  size={10}
                  color={due.overdue ? '#DC2626' : '#3B5BDB'}
                />
                <Text
                  className={`text-xs ${due.overdue ? 'text-red-600 font-medium' : 'text-brand-600'}`}
                >
                  {due.label}
                </Text>
              </View>
            )}
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
            <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${priority.chip}`}>
              <Text className={`text-xs font-medium ${priority.text}`}>{priority.label}</Text>
            </View>
          </View>

          {task.notes && !compact && (
            <Text className="text-xs text-text-secondary mt-2 leading-relaxed">{task.notes}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
