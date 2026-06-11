import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TranscriptLine as TLine } from '../types';

interface Props {
  line: TLine;
  isOwner?: boolean;
  onPress?: (line: TLine) => void;
}

export function TranscriptLineView({ line, isOwner, onPress }: Props) {
  const isMe = line.speaker_id === 'me' || isOwner;
  const time = new Date(line.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <TouchableOpacity
      onPress={() => onPress?.(line)}
      activeOpacity={onPress ? 0.6 : 1}
      className="mb-3"
    >
      <View className="flex-row items-center gap-2 mb-1">
        <View
          className="w-6 h-6 rounded-full items-center justify-center"
          style={{ backgroundColor: line.speaker_color + '30' }}
        >
          <Text className="text-xs font-bold" style={{ color: line.speaker_color }}>
            {line.speaker_name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text className="text-xs font-semibold" style={{ color: line.speaker_color }}>
          {isMe ? 'You' : line.speaker_name}
        </Text>
        {line.context_name && (
          <View className="bg-brand-50 px-2 py-0.5 rounded-full">
            <Text className="text-xs text-brand-600">{line.context_name}</Text>
          </View>
        )}
        <Text className="text-xs text-text-secondary ml-auto">{time}</Text>
      </View>

      <View
        className="ml-8 rounded-xl rounded-tl-sm p-3"
        style={{ backgroundColor: isMe ? '#EDF2FF' : '#F8F9FB' }}
      >
        <Text className="text-text-primary text-sm leading-relaxed">{line.text}</Text>
      </View>
    </TouchableOpacity>
  );
}
