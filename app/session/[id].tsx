import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, Modal, FlatList, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useActiveSession } from '../../stores/session';
import {
  addTranscriptLine, addMediaItem, updateSession, getContexts, getStaff, getSession,
} from '../../lib/database';
import { saveAudioToDocuments, formatDuration, getRecordingElapsed, markRecordingStart, markPauseStart, markResumed } from '../../lib/transcription';
import {
  useAudioRecorder,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import { TranscriptLineView } from '../../components/TranscriptLine';
import { TranscriptLine, Context, StaffMember } from '../../types';
import { nanoid } from '../_utils';

// Deterministic failures — retrying the same start options can never succeed.
const FATAL_SPEECH_ERRORS = new Set<string>([
  'not-allowed',
  'service-not-allowed',
  'language-not-supported',
  'bad-grammar',
]);

// Bounded restarts for genuinely transient failures (network, audio-capture, interrupted, busy).
const MAX_TRANSIENT_RESTARTS = 5;

function fatalErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'Microphone or speech recognition permission was denied. Enable both in iOS Settings, then start a new session.';
    case 'service-not-allowed':
      return 'Speech recognition is not available on this device right now.';
    case 'language-not-supported':
      return 'The transcription language (English) is not supported on this device.';
    case 'bad-grammar':
      return 'Speech recognition rejected the session configuration.';
    default:
      return 'Speech recognition stopped and cannot recover.';
  }
}

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
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // Speech recognition lifecycle — refs (not async state) so the stop/pause/error
  // races inside native event callbacks see the truth synchronously.
  const recognitionStartElapsed = useRef(0); // seconds into the audio file when this recognition cycle began
  const pausedRef = useRef(false);
  const stoppingRef = useRef(false);
  const fatalRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transientRestartsRef = useRef(0);

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript ?? '';
    if (text.trim()) {
      // The recognizer is demonstrably healthy — reset the transient failure budget.
      transientRestartsRef.current = 0;
    }
    if (event.isFinal && text.trim()) {
      // Elapsed seconds into the recording (pause-aware) — matches the audio
      // file timeline, so review tap-to-play can seekTo(start_time) directly.
      const startTime = recognitionStartElapsed.current;
      const endTime = Math.max(getRecordingElapsed(), startTime);
      const line: TranscriptLine = {
        id: nanoid(),
        session_id: id,
        speaker_id: activeSpeakerId,
        speaker_name: activeSpeakerId === 'me' ? 'You' : (staff.find(s => s.id === activeSpeakerId)?.name ?? activeSpeakerId),
        speaker_color: activeSpeakerId === 'me' ? '#3B5BDB' : (staff.find(s => s.id === activeSpeakerId)?.color ?? '#6b7280'),
        text: text.trim(),
        start_time: startTime,
        end_time: endTime,
        timestamp: Date.now(),
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
      recognitionStartElapsed.current = getRecordingElapsed();
      scrollRef.current?.scrollToEnd({ animated: true });
    } else {
      setPendingText(text);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'aborted') {
      // Fired by our own stop()/abort() — never blanket-restart on it.
      // The 'end' handler decides, gated by the paused/stopping/fatal refs.
      return;
    }
    if (FATAL_SPEECH_ERRORS.has(event.error)) {
      fatalRef.current = true;
      clearPendingRestart();
      console.warn('Speech recognition fatal error:', event.error);
      setRecognitionError(fatalErrorMessage(event.error));
      return;
    }
    if (event.error !== 'no-speech') {
      console.warn('Speech recognition error:', event.error);
    }
    if (stoppingRef.current || pausedRef.current || fatalRef.current) return;
    if (event.error === 'no-speech') {
      // Expected outcome of silence — this restart IS the continuous-listening
      // loop working as designed, so it does not consume the failure budget.
      scheduleRestart(500);
      return;
    }
    // Transient failure (network, audio-capture, interrupted, busy, …):
    // bounded restarts with exponential backoff (1s → 2s → 4s → 8s → 8s).
    transientRestartsRef.current += 1;
    if (transientRestartsRef.current > MAX_TRANSIENT_RESTARTS) {
      fatalRef.current = true;
      clearPendingRestart();
      setRecognitionError(
        `Speech recognition keeps failing (${event.error}). Audio is still being recorded, but new speech is no longer transcribed.`
      );
      return;
    }
    scheduleRestart(Math.min(1000 * 2 ** (transientRestartsRef.current - 1), 8000));
  });

  useSpeechRecognitionEvent('end', () => {
    if (stoppingRef.current || pausedRef.current || fatalRef.current) return;
    if (!useActiveSession.getState().isRecording) return;
    scheduleRestart(0);
  });

  function clearPendingRestart() {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  // Single funnel for all recognition restarts — the pending-timer guard makes
  // back-to-back 'error' + 'end' events impossible to double-start.
  function scheduleRestart(delayMs: number) {
    if (restartTimerRef.current !== null) return;
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (stoppingRef.current || pausedRef.current || fatalRef.current) return;
      if (!useActiveSession.getState().isRecording) return;
      startListening();
    }, delayMs);
  }

  function startListening() {
    recognitionStartElapsed.current = getRecordingElapsed();
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
    let cancelled = false;

    (async () => {
      // T11-3 guard: this screen auto-starts capture on mount, so deep-linking
      // meetai://session/<id> for a finished session would re-record it and
      // overwrite its .m4a. Check the persisted status BEFORE touching the
      // recorder — finished sessions belong on the review screen.
      try {
        const existing = await getSession(id);
        if (cancelled) return;
        if (existing && (existing.status === 'complete' || existing.status === 'processing')) {
          router.replace(`/review/${id}`);
          return;
        }
      } catch (err) {
        // Status unreadable (cold-start DB hiccup): fall through and record —
        // blocking a legitimate new session is worse than the rare re-check.
        console.error('Failed to read session status before recording:', err);
        if (cancelled) return;
      }

      // Start speech recognition
      startListening();

      // Start audio recording
      setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
        .then(() => recorder.prepareToRecordAsync())
        .then(() => recorder.record())
        .then(() => {
          markRecordingStart();
          // Re-anchor: startListening() above snapshotted getRecordingElapsed()
          // BEFORE markRecordingStart() reset the module-scope clock, so for any
          // session after the first it held the PREVIOUS session's elapsed time.
          // Recording starts now, so this recognition cycle began at 0s.
          recognitionStartElapsed.current = 0;
        })
        .catch(console.error);

      // Elapsed timer
      elapsedRef.current = setInterval(() => {
        setElapsed(getRecordingElapsed());
      }, 1000);
    })();

    return () => {
      cancelled = true;
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      clearPendingRestart();
    };
  }, []);

  const handlePauseResume = async () => {
    if (session.isPaused) {
      await recorder.record();
      markResumed();
      pausedRef.current = false;
      session.resumeSession();
      transientRestartsRef.current = 0;
      // Same options as the initial start (incl. contextualStrings).
      if (!fatalRef.current) startListening();
    } else {
      // Set the ref BEFORE stop(): the resulting 'end'/'aborted' events fire
      // before session.pauseSession() lands, and must not restart recognition.
      pausedRef.current = true;
      clearPendingRestart();
      ExpoSpeechRecognitionModule.stop();
      await recorder.pause();
      markPauseStart();
      session.pauseSession();
    }
  };

  // Normal stop path — also reachable from the recognition-error banner, so a
  // fatal speech error never strands the session as a 'recording' orphan.
  const finishSession = async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    setIsStopping(true);
    clearPendingRestart();
    ExpoSpeechRecognitionModule.stop();
    if (elapsedRef.current) clearInterval(elapsedRef.current);

    let savedUri: string | undefined;
    try {
      await recorder.stop();
      const uri = recorder.uri ?? null;
      savedUri = uri ? await saveAudioToDocuments(uri, id) : undefined;
    } catch (err) {
      // Audio finalize can fail when the recorder never started (e.g. fatal
      // permission error) — still close out the session below.
      console.error('Failed to finalize audio recording:', err);
    }

    try {
      await updateSession(id, {
        ended_at: Date.now(),
        status: 'processing',
        audio_uri: savedUri,
      });
      session.stopSession();
      router.replace(`/review/${id}`);
    } catch (err) {
      console.error(err);
      stoppingRef.current = false;
      setIsStopping(false);
    }
  };

  const handleStop = () => {
    Alert.alert(
      'End Session',
      'Stop recording and save the session?',
      [
        { text: 'Keep Recording', style: 'cancel' },
        { text: 'End Session', style: 'destructive', onPress: finishSession },
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
    ? { name: 'You', color: '#3B5BDB', initials: 'ME' }
    : staff.find(s => s.id === activeSpeakerId) ? {
        name: staff.find(s => s.id === activeSpeakerId)!.name,
        color: staff.find(s => s.id === activeSpeakerId)!.color,
        initials: staff.find(s => s.id === activeSpeakerId)!.avatar_initials,
      } : { name: 'Unknown', color: '#6b7280', initials: '?' };

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
    <SafeAreaView className="flex-1 bg-gray-950">
      <StatusBar style="light" />
      {/* Recording Header */}
      <View className="px-5 pt-3 pb-4">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full bg-red-500" style={{ opacity: session.isPaused ? 0.4 : 1 }} />
            <Text className="text-white font-bold text-base">
              {session.isPaused ? 'PAUSED' : recognitionError ? 'AUDIO ONLY' : 'RECORDING'}
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
          <Ionicons name="location" size={14} color="#D97706" />
          <Text className="text-white text-sm font-medium">
            {session.currentContextName ?? 'Where are you?'}
          </Text>
          <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {/* Speech recognition failure — visible, with a way out */}
      {recognitionError ? (
        <View className="mx-5 mb-3 bg-red-500/15 border border-red-500/60 rounded-xl p-3">
          <View className="flex-row items-center gap-2 mb-1">
            <Ionicons name="warning" size={16} color="#f87171" />
            <Text className="text-red-400 font-bold text-sm">Transcription stopped</Text>
          </View>
          <Text className="text-white/90 text-xs leading-5 mb-2.5">{recognitionError}</Text>
          <TouchableOpacity
            className="bg-red-500 rounded-lg px-4 py-2 self-start"
            onPress={finishSession}
            disabled={isStopping}
          >
            <Text className="text-white font-semibold text-sm">End session</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Transcript Area */}
      <View className="flex-1 bg-bg">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {session.transcriptLines.length === 0 && !pendingText ? (
            <View className="items-center py-12">
              <Ionicons name="mic-outline" size={40} color="#E5E7EB" />
              <Text className="text-text-secondary text-sm mt-3 text-center">
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
                      <Text className="text-xs font-bold text-text-secondary">{currentSpeaker.initials.charAt(0)}</Text>
                    </View>
                    <Text className="text-xs text-text-secondary italic">{currentSpeaker.name} (listening...)</Text>
                  </View>
                  <View className="ml-8 bg-gray-100 rounded-xl rounded-tl-sm p-3">
                    <Text className="text-text-secondary text-sm italic">{pendingText}</Text>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* Bottom Controls */}
        <View className="bg-white border-t border-border px-4 pt-3 pb-8">
          {/* Speaker chips — tap to switch, no modal */}
          {session.participantIds.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
            >
              {[{ id: 'me', name: 'You', color: '#3B5BDB', avatar_initials: 'ME' }, ...staff.filter(s => session.participantIds.includes(s.id))].map(p => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setActiveSpeakerId(p.id)}
                  className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${activeSpeakerId === p.id ? 'border-brand-600 bg-brand-50' : 'border-border bg-white'}`}
                >
                  <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: p.color + '30' }}>
                    <Text className="text-xs font-bold" style={{ color: p.color }}>{p.avatar_initials?.charAt(0) ?? '?'}</Text>
                  </View>
                  <Text className={`text-xs font-medium ${activeSpeakerId === p.id ? 'text-text-primary' : 'text-text-secondary'}`}>{p.name}</Text>
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
              <Ionicons name={session.isPaused ? 'play' : 'pause'} size={26} color="#3B5BDB" />
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
          <View className="flex-row items-center px-5 pt-4 pb-4 border-b border-border">
            <Text className="text-text-primary text-lg font-bold flex-1">Where are you?</Text>
            <TouchableOpacity onPress={() => setShowContextPicker(false)}>
              <Ionicons name="close" size={24} color="#3B5BDB" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={contexts}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                className={`mb-2 rounded-xl border overflow-hidden ${session.currentContextId === item.id ? 'border-brand-600' : 'border-border'}`}
                onPress={() => handleChangeContext(item)}
              >
                {item.reference_image_uri ? (
                  <Image
                    source={{ uri: item.reference_image_uri }}
                    style={{ width: '100%', height: 80 }}
                    resizeMode="cover"
                  />
                ) : null}
                <View className={`flex-row items-center px-4 py-3 ${session.currentContextId === item.id ? 'bg-brand-50' : 'bg-white'}`}>
                  <Text className="text-xl mr-3">{item.icon}</Text>
                  <Text className={`flex-1 font-medium ${session.currentContextId === item.id ? 'text-text-primary' : 'text-text-primary'}`}>
                    {item.name}
                  </Text>
                  {session.currentContextId === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color="#3B5BDB" />
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
