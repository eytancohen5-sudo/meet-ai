import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, SafeAreaView, Modal, FlatList, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from '@jamsch/expo-speech-recognition';
import { useActiveSession } from '../../stores/session';
import {
  addTranscriptLine, addMediaItem, updateSession, getLocations, getStaff,
} from '../../lib/database';
import { identifyRoomFromPhoto } from '../../lib/vision';
import { useSettings } from '../../stores/settings';
import { stopRecording, pauseRecording, resumeRecording, saveAudioToDocuments, formatDuration, getRecordingElapsed } from '../../lib/transcription';
import { TranscriptLineView } from '../../components/TranscriptLine';
import { TranscriptLine, Location, StaffMember } from '../../types';
import { nanoid } from '../_utils';

export default function ActiveSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useActiveSession();
  const scrollRef = useRef<ScrollView>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [locations, setLocations] = useState<Location[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showSpeakerPicker, setShowSpeakerPicker] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string>('me');
  const [pendingText, setPendingText] = useState('');
  const [isStopping, setIsStopping] = useState(false);
  const [identifyingLocation, setIdentifyingLocation] = useState(false);

  const { anthropicApiKey } = useSettings();

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
        location_id: session.currentLocationId ?? undefined,
        location_name: session.currentLocationName ?? undefined,
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
        location_id: line.location_id,
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
    Promise.all([getLocations(), getStaff()]).then(([locs, stf]) => {
      setLocations(locs);
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

  const handleChangeLocation = async (loc: Location) => {
    setShowLocationPicker(false);
    session.updateLocation(loc.id, loc.name);
    await updateSession(id, { location_id: loc.id });
  };

  const handleCameraPress = () => {
    Alert.alert(
      'Camera',
      'What would you like to do?',
      [
        {
          text: '📸  Attach photo to transcript',
          onPress: () => captureAndAttach(),
        },
        {
          text: '📍  Identify my location',
          onPress: () => captureAndIdentifyRoom(),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const captureAndAttach = async () => {
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
      Alert.alert('📎 Attached', 'Photo linked to this moment in the session.');
    }
  };

  const captureAndIdentifyRoom = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setIdentifyingLocation(true);
    try {
      const match = await identifyRoomFromPhoto(
        result.assets[0].uri,
        locations,
        anthropicApiKey || undefined
      );

      if (match.matched_id && match.confidence >= 0.6) {
        // High-confidence match — auto-tag without asking
        session.updateLocation(match.matched_id, match.matched_name ?? match.suggested_name);
        await updateSession(id, { location_id: match.matched_id });
        Alert.alert(
          `📍 ${match.matched_name}`,
          `Location updated${match.confidence >= 0.85 ? '' : ' (matched with moderate confidence)'}.`,
          [{ text: 'OK' }]
        );
      } else if (match.matched_id && match.confidence >= 0.4) {
        // Lower confidence — ask user to confirm
        Alert.alert(
          'Location Match',
          `This looks like "${match.matched_name}" — is that right?`,
          [
            {
              text: `Yes, I'm in ${match.matched_name}`,
              onPress: async () => {
                session.updateLocation(match.matched_id!, match.matched_name!);
                await updateSession(id, { location_id: match.matched_id! });
              },
            },
            {
              text: 'No, pick manually',
              onPress: () => setShowLocationPicker(true),
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        // No match — show manual picker with the suggested name
        Alert.alert(
          'Room Not Recognised',
          `This looks like "${match.suggested_name}" but it's not in your saved rooms. Pick a room manually or add this one in Spaces.`,
          [
            { text: 'Pick Manually', onPress: () => setShowLocationPicker(true) },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
    } catch (err) {
      console.error('Room identification failed:', err);
      Alert.alert('Could Not Identify', 'AI identification failed. Pick the room manually.', [
        { text: 'Pick Room', onPress: () => setShowLocationPicker(true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } finally {
      setIdentifyingLocation(false);
    }
  };

  const currentSpeaker = activeSpeakerId === 'me'
    ? { name: 'You', color: '#1E3A5F', initials: 'ME' }
    : staff.find(s => s.id === activeSpeakerId) ? {
        name: staff.find(s => s.id === activeSpeakerId)!.name,
        color: staff.find(s => s.id === activeSpeakerId)!.color,
        initials: staff.find(s => s.id === activeSpeakerId)!.avatar_initials,
      } : { name: 'Unknown', color: '#6b7280', initials: '?' };

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

        {/* Location */}
        <TouchableOpacity
          className="flex-row items-center gap-2 bg-white/10 rounded-xl px-3 py-2 self-start"
          onPress={() => setShowLocationPicker(true)}
        >
          <Ionicons name="location" size={14} color="#C9A84C" />
          <Text className="text-white text-sm font-medium">
            {session.currentLocationName ?? 'Tap to set location'}
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
                Listening... Start talking to see your transcript here.
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
          {/* Speaker indicator */}
          <TouchableOpacity
            className="flex-row items-center justify-center gap-2 bg-gray-50 rounded-xl py-2.5 mb-3"
            onPress={() => setShowSpeakerPicker(true)}
          >
            <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: currentSpeaker.color + '30' }}>
              <Text className="text-xs font-bold" style={{ color: currentSpeaker.color }}>{currentSpeaker.initials.charAt(0)}</Text>
            </View>
            <Text className="text-sm text-gray-600">Speaking as <Text className="font-semibold text-gray-800">{currentSpeaker.name}</Text></Text>
            <Ionicons name="swap-horizontal-outline" size={14} color="#9ca3af" />
          </TouchableOpacity>

          {/* Action buttons */}
          <View className="flex-row items-center justify-between">
            <TouchableOpacity
              className="w-12 h-12 bg-gray-100 rounded-full items-center justify-center"
              onPress={handleCameraPress}
              disabled={identifyingLocation}
            >
              {identifyingLocation
                ? <ActivityIndicator size="small" color="#1E3A5F" />
                : <Ionicons name="camera-outline" size={22} color="#4b5563" />
              }
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

            <TouchableOpacity
              className="w-12 h-12 bg-gray-100 rounded-full items-center justify-center"
              onPress={() => setShowLocationPicker(true)}
            >
              <Ionicons name="location-outline" size={22} color="#4b5563" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Location Picker Modal */}
      <Modal visible={showLocationPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center px-5 pt-4 pb-4 border-b border-gray-100">
            <Text className="text-navy-800 text-lg font-bold flex-1">Change Location</Text>
            <TouchableOpacity onPress={() => setShowLocationPicker(false)}>
              <Ionicons name="close" size={24} color="#1E3A5F" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={locations}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                className={`mb-2 rounded-xl border overflow-hidden ${session.currentLocationId === item.id ? 'border-navy-800' : 'border-gray-200'}`}
                onPress={() => handleChangeLocation(item)}
              >
                {item.reference_image_uri ? (
                  <Image
                    source={{ uri: item.reference_image_uri }}
                    style={{ width: '100%', height: 80 }}
                    resizeMode="cover"
                  />
                ) : null}
                <View className={`flex-row items-center px-4 py-3 ${session.currentLocationId === item.id ? 'bg-navy-50' : 'bg-white'}`}>
                  <Text className="text-xl mr-3">{item.icon}</Text>
                  <Text className={`flex-1 font-medium ${session.currentLocationId === item.id ? 'text-navy-800' : 'text-gray-800'}`}>
                    {item.name}
                  </Text>
                  {session.currentLocationId === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color="#1E3A5F" />
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Speaker Picker Modal */}
      <Modal visible={showSpeakerPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center px-5 pt-4 pb-4 border-b border-gray-100">
            <Text className="text-navy-800 text-lg font-bold flex-1">Who's Speaking?</Text>
            <TouchableOpacity onPress={() => setShowSpeakerPicker(false)}>
              <Ionicons name="close" size={24} color="#1E3A5F" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={[
              { id: 'me', name: 'You (Owner)', color: '#1E3A5F', avatar_initials: 'ME', role: '' },
              ...staff.filter(s => session.participantIds.includes(s.id)),
            ]}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                className={`flex-row items-center p-4 mb-2 rounded-xl border ${activeSpeakerId === item.id ? 'border-navy-800 bg-navy-50' : 'border-gray-200 bg-white'}`}
                onPress={() => { setActiveSpeakerId(item.id); setShowSpeakerPicker(false); }}
              >
                <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: item.color + '30' }}>
                  <Text className="font-bold text-sm" style={{ color: item.color }}>{item.avatar_initials?.charAt(0) ?? '?'}</Text>
                </View>
                <Text className={`flex-1 font-medium ${activeSpeakerId === item.id ? 'text-navy-800' : 'text-gray-800'}`}>
                  {item.name}
                </Text>
                {activeSpeakerId === item.id && (
                  <Ionicons name="checkmark-circle" size={22} color="#1E3A5F" />
                )}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
