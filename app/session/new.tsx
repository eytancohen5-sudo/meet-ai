import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getContexts, getStaff, createSession, addParticipant } from '../../lib/database';
import { Context, StaffMember } from '../../types';
import { useActiveSession } from '../../stores/session';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { nanoid } from '../_utils';

export default function NewSessionScreen() {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedContext, setSelectedContext] = useState<Context | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [showTitle, setShowTitle] = useState(false);
  const [starting, setStarting] = useState(false);

  const startSession = useActiveSession(s => s.startSession);

  useEffect(() => {
    Promise.all([getContexts(), getStaff()]).then(([ctxs, stf]) => {
      setContexts(ctxs);
      setStaff(stf);
    });
    const now = new Date();
    setTitle(`Walkthrough ${now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`);
  }, []);

  const toggleStaff = (id: string) => {
    const next = new Set(selectedStaff);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStaff(next);
  };

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);

    // Requests BOTH microphone and speech recognition permissions on iOS
    // (network-based recognition needs SFSpeechRecognizer authorization too).
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert(
        'Permissions Required',
        'Meet AI needs microphone and speech recognition access to record and transcribe sessions. Enable both in iOS Settings > Meet AI.'
      );
      setStarting(false);
      return;
    }

    try {
      const sessionId = nanoid();
      const participantIds = Array.from(selectedStaff);

      await createSession({
        id: sessionId,
        title: title.trim() || 'Walkthrough',
        context_id: selectedContext?.id,
        started_at: Date.now(),
        status: 'recording',
      });

      for (const staffId of participantIds) {
        await addParticipant(sessionId, staffId);
      }

      // Recording is now started by the session screen's useAudioRecorder hook
      // Permissions are requested here before navigating

      startSession(
        sessionId,
        selectedContext?.id ?? null,
        selectedContext?.name ?? null,
        participantIds
      );

      router.replace(`/session/${sessionId}`);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not start recording. Please try again.');
      setStarting(false);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center p-8">
        <Ionicons name="phone-portrait-outline" size={48} color="#E5E7EB" />
        <Text className="text-text-primary font-semibold text-lg mt-4">Mobile app required</Text>
        <Text className="text-text-secondary text-sm mt-2 text-center">
          Recording is only available in the Meet AI mobile app.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center px-5 pt-4 pb-4 border-b border-border">
        <TouchableOpacity onPress={() => router.back()} className="mr-3" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={24} color="#3B5BDB" />
        </TouchableOpacity>
        <Text className="text-text-primary text-lg font-bold flex-1">New Session</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Context */}
        <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3">Starting Context</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
          <TouchableOpacity
            className={`mr-2 px-4 py-3 rounded-xl border flex-row items-center gap-2 ${!selectedContext ? 'bg-brand-600 border-brand-600' : 'bg-white border-border'}`}
            onPress={() => setSelectedContext(null)}
          >
            <Ionicons name="help-outline" size={16} color={!selectedContext ? 'white' : '#6B7280'} />
            <Text className={`text-sm font-medium ${!selectedContext ? 'text-white' : 'text-text-secondary'}`}>
              Ask me
            </Text>
          </TouchableOpacity>
          {contexts.map(ctx => (
            <TouchableOpacity
              key={ctx.id}
              className={`mr-2 px-4 py-3 rounded-xl border flex-row items-center gap-2 ${selectedContext?.id === ctx.id ? 'border-brand-600 bg-brand-50' : 'bg-white border-border'}`}
              onPress={() => setSelectedContext(ctx)}
            >
              <Text className="text-base">{ctx.icon}</Text>
              <Text className={`text-sm font-medium ${selectedContext?.id === ctx.id ? 'text-text-primary' : 'text-text-secondary'}`}>
                {ctx.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Staff */}
        <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3">
          Who's with you?
        </Text>
        {staff.length === 0 ? (
          <View className="bg-bg rounded-xl p-4 mb-6 flex-row items-center gap-3">
            <Ionicons name="person-add-outline" size={20} color="#6B7280" />
            <Text className="text-text-secondary text-sm flex-1">
              No team members added yet. Head to the Team tab to add people.
            </Text>
          </View>
        ) : (
          <View className="mb-6">
            {staff.map(member => {
              const selected = selectedStaff.has(member.id);
              return (
                <TouchableOpacity
                  key={member.id}
                  className={`flex-row items-center p-3.5 mb-2 rounded-xl border ${selected ? 'border-brand-600 bg-brand-50' : 'border-border bg-white'}`}
                  onPress={() => toggleStaff(member.id)}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: member.color + '30' }}
                  >
                    <Text className="font-bold text-sm" style={{ color: member.color }}>
                      {member.avatar_initials}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className={`font-medium text-sm ${selected ? 'text-text-primary' : 'text-text-primary'}`}>
                      {member.name}
                    </Text>
                    {member.role ? (
                      <Text className="text-text-secondary text-xs mt-0.5">{member.role}</Text>
                    ) : null}
                  </View>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={22} color="#3B5BDB" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Session Title — collapsed by default */}
        <TouchableOpacity
          className="flex-row items-center gap-2 mb-3"
          onPress={() => setShowTitle(v => !v)}
        >
          <Ionicons name={showTitle ? 'chevron-down' : 'chevron-forward'} size={14} color="#6B7280" />
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide">
            {showTitle ? 'Session Title' : `Title: ${title}`}
          </Text>
        </TouchableOpacity>
        {showTitle && (
          <TextInput
            className="bg-bg border border-border rounded-xl px-4 py-3.5 text-text-primary text-base mb-4"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Monday Check-in"
            returnKeyType="done"
          />
        )}

        {/* Note */}
        <View className="bg-amber-50 rounded-xl p-3 mb-6 flex-row gap-2">
          <Ionicons name="mic-outline" size={16} color="#92400e" />
          <Text className="flex-1 text-xs text-amber-800 leading-relaxed">
            Recording starts the moment you tap. Change the context at any time.
          </Text>
        </View>
      </ScrollView>

      {/* Start Button */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pb-10 pt-4 bg-white border-t border-border">
        <TouchableOpacity
          className={`py-4 rounded-2xl items-center flex-row justify-center gap-2 ${starting ? 'bg-gray-400' : 'bg-red-500'}`}
          onPress={handleStart}
          disabled={starting}
          style={{
            shadowColor: '#ef4444',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
          }}
        >
          <Ionicons name="mic" size={22} color="white" />
          <Text className="text-white font-bold text-lg">
            {starting ? 'Starting...' : 'Start Recording'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
