import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TranscriptLine as TLine } from '../types';

interface Props {
  line: TLine;
  isOwner?: boolean;
  /** Highlights this line's bubble while its audio segment is playing. */
  isPlaying?: boolean;
  /** Tap-to-play — seeks session audio to this line (challenger amendment 4: tap stays tap-to-play). */
  onPress?: (line: TLine) => void;
}

export function TranscriptLineView({ line, isOwner, isPlaying = false, onPress }: Props) {
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
      disabled={!onPress}
      className="mb-3"
    >
      <View className="flex-row items-center gap-2 mb-1">
        <Text className="text-xs font-semibold text-text-secondary">
          {isMe ? 'You' : line.speaker_name}
        </Text>
        {line.context_name && (
          <View className="bg-brand-50 px-2 py-0.5 rounded-full">
            <Text className="text-xs text-brand-600">{line.context_name}</Text>
          </View>
        )}
        <Text className="text-xs text-text-tertiary ml-auto">{time}</Text>
      </View>

      <View
        className={`rounded-xl p-3 border ${isPlaying ? 'bg-brand-50 border-brand-100' : 'bg-surface border-border'}`}
      >
        <Text className="text-text-primary text-sm leading-relaxed">{line.text}</Text>
      </View>
    </TouchableOpacity>
  );
}
