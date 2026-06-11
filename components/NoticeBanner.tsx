import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  variant: 'info' | 'warning' | 'error';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
}

const VARIANT_CONFIG = {
  info: {
    container: 'bg-brand-50 border-brand-200',
    text: 'text-brand-800',
    icon: 'information-circle' as const,
    color: '#3B5BDB',
  },
  warning: {
    container: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    icon: 'alert-circle' as const,
    color: '#D97706',
  },
  error: {
    container: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    icon: 'alert-circle' as const,
    color: '#DC2626',
  },
};

export function NoticeBanner({ variant, message, actionLabel, onAction, dismissible = false }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const config = VARIANT_CONFIG[variant];

  // A new message re-surfaces a previously dismissed banner.
  useEffect(() => {
    setDismissed(false);
  }, [message]);

  if (dismissed) return null;

  return (
    <View className={`flex-row items-center gap-2.5 rounded-2xl border p-4 ${config.container}`}>
      <Ionicons name={config.icon} size={18} color={config.color} />
      <Text className={`flex-1 text-sm leading-snug ${config.text}`}>{message}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-sm font-semibold" style={{ color: config.color }}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
      {dismissible && (
        <TouchableOpacity
          onPress={() => setDismissed(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color={config.color} />
        </TouchableOpacity>
      )}
    </View>
  );
}
