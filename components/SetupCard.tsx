import React, { ComponentProps } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SetupStep {
  done: boolean;
  label: string;
  sublabel?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

interface Props {
  steps: SetupStep[];
  /** Inline key-capture slot — rendered below the steps (Screen 9: expanded "Connect Claude" paste field). */
  children?: React.ReactNode;
}

export function SetupCard({ steps, children }: Props) {
  return (
    <View className="bg-surface rounded-2xl border border-border p-4">
      {steps.map((step, index) => (
        <TouchableOpacity
          key={step.label}
          className={`flex-row items-center gap-3 py-2.5 ${index > 0 ? 'border-t border-border' : ''}`}
          onPress={step.onPress}
          activeOpacity={0.7}
        >
          <Ionicons
            name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={step.done ? '#22c55e' : '#d1d5db'}
          />
          {step.icon && <Ionicons name={step.icon} size={18} color="#3B5BDB" />}
          <View className="flex-1">
            <Text
              className={`text-sm font-medium ${step.done ? 'line-through text-text-secondary' : 'text-text-primary'}`}
            >
              {step.label}
            </Text>
            {step.sublabel && (
              <Text className="text-text-secondary text-xs mt-0.5">{step.sublabel}</Text>
            )}
          </View>
          {!step.done && <Ionicons name="chevron-forward" size={16} color="#6B7280" />}
        </TouchableOpacity>
      ))}
      {children}
    </View>
  );
}
