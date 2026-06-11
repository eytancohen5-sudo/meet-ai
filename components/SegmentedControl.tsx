import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface Props {
  segments: string[];
  active: string;
  onChange: (segment: string) => void;
}

export function SegmentedControl({ segments, active, onChange }: Props) {
  return (
    <View className="flex-row mx-4 bg-bg rounded-xl p-1">
      {segments.map(segment => {
        const isActive = segment === active;
        return (
          <TouchableOpacity
            key={segment}
            className={`flex-1 py-2.5 rounded-lg items-center ${isActive ? 'bg-white shadow-sm' : ''}`}
            onPress={() => onChange(segment)}
          >
            <Text className={`text-sm font-medium ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>
              {segment}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
