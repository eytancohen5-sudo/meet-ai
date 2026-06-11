import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StaffMember } from '../types';

interface Props {
  member: StaffMember;
  openTaskCount?: number;
  onPress: () => void;
  /** Per-card overflow trigger (Screen 3: "Edit name/role" / "Remove") — rendered only when provided. */
  onOverflow?: () => void;
}

export function PersonCard({ member, openTaskCount, onPress, onOverflow }: Props) {
  return (
    <TouchableOpacity
      className="bg-white rounded-xl border border-border p-4 mb-2 flex-row items-center"
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View className="w-11 h-11 rounded-full items-center justify-center mr-3" style={{ backgroundColor: member.color + '30' }}>
        <Text className="font-bold text-sm" style={{ color: member.color }}>{member.avatar_initials}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-text-primary font-medium">{member.name}</Text>
        {member.role ? <Text className="text-text-secondary text-xs mt-0.5">{member.role}</Text> : null}
      </View>
      {(openTaskCount ?? 0) > 0 && (
        <View className="bg-brand-50 rounded-full px-2 py-0.5 mr-1">
          <Text className="text-brand-600 text-xs font-semibold">{openTaskCount}</Text>
        </View>
      )}
      {onOverflow && (
        <TouchableOpacity
          onPress={onOverflow}
          className="p-2 -mr-2"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color="#6B7280" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
