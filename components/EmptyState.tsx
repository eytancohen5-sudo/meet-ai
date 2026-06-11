import React, { ComponentProps } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon, title, body, action }: Props) {
  return (
    <View className="items-center py-16">
      <Ionicons name={icon} size={56} color="#E5E7EB" />
      <Text className="text-text-primary font-semibold text-lg mt-4">{title}</Text>
      <Text className="text-text-secondary text-sm mt-2 text-center px-8">{body}</Text>
      {action && (
        <TouchableOpacity
          className="bg-brand-600 rounded-xl px-5 py-3 mt-5"
          onPress={action.onPress}
          activeOpacity={0.7}
        >
          <Text className="text-white font-semibold text-sm">{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
