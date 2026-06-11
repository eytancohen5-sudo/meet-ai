import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { StaffMember } from '../types';

type Props = {
  selected: boolean;
  onToggle: () => void;
} & (
  // Person chip: avatar initials + first name (pre-flight "Who's with you?").
  | { member: StaffMember; label?: never; icon?: never }
  // Place chip shares the shape: emoji icon + label (pre-flight "Where are you?").
  | { member?: never; label: string; icon?: string }
);

export function PersonChip({ member, label, icon, selected, onToggle }: Props) {
  const displayLabel = member ? member.name.split(' ')[0] : label;

  return (
    <TouchableOpacity
      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${selected ? 'bg-brand-50 border-brand-600' : 'bg-white border-border'}`}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      {member && (
        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: member.color + '30' }}>
          <Text className="font-bold text-[9px]" style={{ color: member.color }}>{member.avatar_initials}</Text>
        </View>
      )}
      {icon && <Text className="text-sm">{icon}</Text>}
      <Text className={`text-sm font-medium ${selected ? 'text-brand-600' : 'text-text-secondary'}`}>
        {displayLabel}
      </Text>
    </TouchableOpacity>
  );
}
