import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, SafeAreaView, Modal, FlatList, Image, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from '@jamsch/expo-speech-recognition';
import { useActiveSession } from '../../stores/session';
import {
  addTranscriptLine, addMediaItem, updateSession, getContexts, getStaff,
} from '../../lib/database';
import { stopRecording, pauseRecording, resumeRecording, saveAudioToDocuments, formatDuration, getRecordingElapsed } from '../../lib/transcription';
import { TranscriptLineView } from '../../components/TranscriptLine';
import { TranscriptLine, Context, StaffMember } from '../../types';
import { nanoid } from '../_utils';

export default function ActiveSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useActiveSession();
  const scrollRef = useRef<ScrollView>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showContextPicker, setShowContextPicker] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string>('me');
  const [pendingText, setPendingText] = useState('');
  const [isStopping, setIsStopping] = useState(false);
  // Speech recognition
  const recognitionStartTime = useRef(Date.now());

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript ?? '';
    if (event.isFinal && text.trim()) {
      const now = Date.now();
      const startTime = (recognitionStartTime.current - Date.now() + now) / 1000;
      const line: TranscriptLine = {
        id: nanoid(),
        session_id: id,
        speaker_id: activeSpeakerId,
        speaker_name: activeSpeakerId === 'me' ? 'You' : (staff.find(s => s.id === activeSpeakerId)?.name ?? activeSpeakerId),
        speaker_color: activeSpeakerId === 'me' ? '#1E3A5F' : (staff.find(s => s.id === activeSpeakerId)?.color ?? '#6b7280'),
        text: text.trim(),
        start_time: startTime,
        end_time: startTime + 2,
        timestamp: now,
        context_id: session.currentContextId ?? undefined,
        context_name: session.currentContextName ?? undefined,
      };
      session.addTranscriptLine(line);
      addTranscriptLine({
        id: line.id,
        session_id: line.session_id,
        speaker_id: line.speaker_id,
        text: line.text,
        start_time: line.start_time,
        end_time: line.end_time,
        timestamp: line.timestamp,
        context_id: line.context_id,
      });
      setPendingText('');
      recognitionStartTime.current = Date.now();
      scrollRef.current?.scrollToEnd({ animated: true });
    } else {
      setPendingText(text);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (event.error !== 'no-speech') {
      console.warn('Speech recognition error:', event.error);
    }
    // Restart recognition automatically
    if (session.isRecording && !session.isPaused) {
      startListening();
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (session.isRecording && !session.isPaused && !isStopping) {
      startListening();
    }
  });

  function startListening() {
    recognitionStartTime.current = Date.now();
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      continuous: false,
      interimResults: true,
      contextualStrings: staff.map(s => s.name),
    });
  }

  useEffect(() => {
    Promise.all([getContexts(), getStaff()]).then(([ctxs, stf]) => {
      setContexts(ctxs);
      setStaff(stf);
    });
  }, []);

  useEffect(() => {
    // Start speech recognition
    startListening();

    // Elapsed timer
    elapsedRef.current = setInterval(() => {
      setElapsed(getRecordingElapsed());
    }, 1000);

    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, []);

  const handlePauseResume = async () => {
    if (session.isPaused) {
      await resumeRecording();
      session.resumeSession();
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        continuous: false,
        interimResults: true,
      });
    } else {
      ExpoSpeechRecognitionModule.stop();
      await pauseRecording();
      session.pauseSession();
    }
  };

  const handleStop = () => {
    Alert.alert(
      'End Session',
      'Stop recording and save the session?',
      [
        { text: 'Keep Recording', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            setIsStopping(true);
            ExpoSpeechRecognitionModule.stop();
            if (elapsedRef.current) clearInterval(elapsedRef.current);

            try {
              const uri = await stopRecording();
              const savedUri = uri ? await saveAudioToDocuments(uri, id) : undefined;
              await updateSession(id, {
                ended_at: Date.now(),
                status: 'processing',
                audio_uri: savedUri,
              });
              session.stopSession();
              router.replace(`/review/${id}`);
            } catch (err) {
              console.error(err);
              setIsStopping(false);
            }
          },
        },
      ]
    );
  };

  const handleChangeContext = async (ctx: Context) => {
    setShowContextPicker(false);
    session.updateContext(ctx.id, ctx.name);
    await updateSession(id, { context_id: ctx.id });
  };

  const handleCameraPress = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await addMediaItem({
        id: nanoid(),
        session_id: id,
        uri: asset.uri,
        type: (asset.type === 'video' ? 'video' : 'photo') as 'photo' | 'video',
        created_at: Date.now(),
      });
    }
  };

  const currentSpeaker = activeSpeakerId === 'me'
    ? { name: 'You', color: '#1E3A5F', initials: 'ME' }
    : staff.find(s => s.id === activeSpeakerId) ? {
        name: staff.find(s => s.id === activeSpeakerId)!.name,
        color: staff.find(s => s.id === activeSpeakerId)!.color,
        initials: staff.find(s => s.id === activeSpeakerId)!.avatar_initials,
      } : { name: 'Unknown', color: '#6b7280', initials: '?' };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center p-8">
        <Ionicons name="phone-portrait-outline" size={48} color="#D9E2EC" />
        <Text className="text-navy-800 font-semibold text-lg mt-4">Mobile app required</Text>
        <Text className="text-gray-400 text-sm mt-2 text-center">
          Recording is only available in the Meet AI mobile app.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950">
      {/* Recording Header */}
      <View className="px-5 pt-3 pb-4">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full bg-red-500" style={{ opacity: session.isPaused ? 0.4 : 1 }} />
            <Text className="text-white font-bold text-base">
              {session.isPaused ? 'PAUSED' : 'RECORDING'}
            </Text>
          </View>
          <Text className="text-red-400 font-mono text-xl font-bold">
            {formatDuration(elapsed)}
          </Text>
        </View>

        {/* Context chip */}
        <TouchableOpacity
          className="flex-row items-center gap-2 bg-white/10 rounded-xl px-3 py-2 self-start"
          onPress={() => setShowContextPicker(true)}
        >
          <Ionicons name="location" size={14} color="#C9A84C" />
          <Text className="text-white text-sm font-medium">
            {session.currentContextName ?? 'Where are you?'}
          </Text>
          <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {/* Transcript Area */}
      <View className="flex-1 bg-villa-bg">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {session.transcriptLines.length === 0 && !pendingText ? (
            <View className="items-center py-12">
              <Ionicons name="mic-outline" size={40} color="#D9E2EC" />
              <Text className="text-gray-400 text-sm mt-3 text-center">
                Listening. Say something.
              </Text>
            </View>
          ) : (
            <>
              {session.transcriptLines.map(line => (
                <TranscriptLineView
                  key={line.id}
                  line={line}
                  isOwner={line.speaker_id === 'me'}
                />
              ))}
              {pendingText ? (
                <View className="mb-3 opacity-50">
                  <View className="flex-row items-center gap-2 mb-1">
                    <View className="w-6 h-6 rounded-full bg-gray-200 items-center justify-center">
                      <Text className="text-xs font-bold text-gray-500">{currentSpeaker.initials.charAt(0)}</Text>
                    </View>
                    <Text className="text-xs text-gray-400 italic">{currentSpeaker.name} (listening...)</Text>
                  </View>
                  <View className="ml-8 bg-gray-100 rounded-xl rounded-tl-sm p-3">
                    <Text className="text-gray-500 text-sm italic">{pendingText}</Text>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* Bottom Controls */}
        <View className="bg-white border-t border-villa-border px-4 pt-3 pb-8">
          {/* Speaker chips — tap to switch, no modal */}
          {session.participantIds.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
            >
              {[{ id: 'me', name: 'You', color: '#1E3A5F', avatar_initials: 'ME' }, ...staff.filter(s => session.participantIds.includes(s.id))].map(p => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setActiveSpeakerId(p.id)}
                  className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${activeSpeakerId === p.id ? 'border-navy-800 bg-navy-100' : 'border-gray-200 bg-white'}`}
                >
                  <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: p.color + '30' }}>
                    <Text className="text-xs font-bold" style={{ color: p.color }}>{p.avatar_initials?.charAt(0) ?? '?'}</Text>
                  </View>
                  <Text className={`text-xs font-medium ${activeSpeakerId === p.id ? 'text-navy-800' : 'text-gray-600'}`}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Action buttons */}
          <View className="flex-row items-center justify-between">
            <TouchableOpacity
              className="w-12 h-12 bg-gray-100 rounded-full items-center justify-center"
              onPress={handleCameraPress}
            >
              <Ionicons name="camera-outline" size={22} color="#4b5563" />
            </TouchableOpacity>

            <TouchableOpacity
              className="w-16 h-16 bg-gray-100 rounded-full items-center justify-center"
              onPress={handlePauseResume}
            >
              <Ionicons name={session.isPaused ? 'play' : 'pause'} size={26} color="#1E3A5F" />
            </TouchableOpacity>

            <TouchableOpacity
              className="w-16 h-16 bg-red-500 rounded-full items-center justify-center"
              onPress={handleStop}
              disabled={isStopping}
              style={{ shadowColor: '#ef4444', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6 }}
            >
              <Ionicons name="stop" size={26} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Context Picker Modal */}
      <Modal visible={showContextPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center px-5 pt-4 pb-4 border-b border-gray-100">
            <Text className="text-navy-800 text-lg font-bold flex-1">Where are you?</Text>
            <TouchableOpacity onPress={() => setShowContextPicker(false)}>
              <Ionicons name="close" size={24} color="#1E3A5F" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={contexts}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                className={`mb-2 rounded-xl border overflow-hidden ${session.currentContextId === item.id ? 'border-navy-800' : 'border-gray-200'}`}
                onPress={() => handleChangeContext(item)}
              >
                {item.reference_image_uri ? (
                  <Image
                    source={{ uri: item.reference_image_uri }}
                    style={{ width: '100%', height: 80 }}
                    resizeMode="cover"
                  />
                ) : null}
                <View className={`flex-row items-center px-4 py-3 ${session.currentContextId === item.id ? 'bg-navy-50' : 'bg-white'}`}>
                  <Text className="text-xl mr-3">{item.icon}</Text>
                  <Text className={`flex-1 font-medium ${session.currentContextId === item.id ? 'text-navy-800' : 'text-gray-800'}`}>
                    {item.name}
                  </Text>
                  {session.currentContextId === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color="#1E3A5F" />
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
