import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActionSheetIOS, ActivityIndicator, Alert, Modal, FlatList, Platform,
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
  getTranscriptLines, deleteSession, markInterruptedSessions, upsertContext,
} from '../../lib/database';
import { saveAudioToDocuments, formatDuration, getRecordingElapsed, markRecordingStart, markPauseStart, markResumed } from '../../lib/transcription';
import {
  useAudioRecorder,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import { TranscriptLineView } from '../../components/TranscriptLine';
import { NoticeBanner } from '../../components/NoticeBanner';
import { TranscriptLine, Context, StaffMember, Session } from '../../types';
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

// ADR-008 §3: the screen has exactly two layouts. 'live' may only be entered
// when the in-memory store confirms this id is the live recording; everything
// else resolves to the read-only recovery layout (or a redirect). There is no
// transition from any other mode into 'live'.
type ScreenMode = 'pending' | 'live' | 'recovery';

export default function ActiveSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useActiveSession();
  const scrollRef = useRef<ScrollView>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showContextPicker, setShowContextPicker] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [isStopping, setIsStopping] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  // Liveness is decided exactly once, at mount, from the in-memory store —
  // the persisted status is never consulted for the live path (ADR-008).
  const [mode, setMode] = useState<ScreenMode>(() =>
    useActiveSession.getState().isLiveSession(id) ? 'live' : 'pending'
  );
  const [recoverySession, setRecoverySession] = useState<Session | null>(null);
  const [recoveryLines, setRecoveryLines] = useState<TranscriptLine[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    // Recognition events are module-level: a non-live screen (recovery/pending)
    // must never persist lines under its session id from a stray recognition
    // session that is still winding down (ADR-008 — no writes for non-live).
    if (mode !== 'live') return;
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
      // All lines record as the session's voice (speaker chips removed, ADR-007):
      // the organize step assigns people from names spoken aloud.
      const line: TranscriptLine = {
        id: nanoid(),
        session_id: id,
        speaker_id: 'me',
        speaker_name: 'You',
        speaker_color: '#3B5BDB',
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
    // Non-live screens never manage (or restart) recognition.
    if (mode !== 'live') return;
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
    // Non-live screens never manage (or restart) recognition.
    if (mode !== 'live') return;
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

    // ADR-008 mount guard: live capture may start ONLY when the in-memory store
    // confirms this id is the live recording. A persisted 'recording' status is
    // never trusted — after a process death it is a corpse, and re-entering the
    // capture path would re-record over its audio (the verified footgun).
    if (mode === 'live') {
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
          // ADR-008 amendment 2 (best-effort, non-binding): persist the recorder's
          // temp URI at record-start so audio of a force-killed session has a
          // salvage chance. finishSession overwrites it with the saved Documents
          // path; if the recorder hasn't exposed a uri yet, this is a no-op.
          const tempUri = recorder.uri;
          if (tempUri) {
            updateSession(id, { audio_uri: tempUri }).catch(() => {});
          }
        })
        .catch(console.error);

      // Elapsed timer
      elapsedRef.current = setInterval(() => {
        setElapsed(getRecordingElapsed());
      }, 1000);
    } else {
      // Non-live: the recorder is NEVER touched on this path. Decide between
      // redirect (finished sessions) and the read-only recovery layout.
      (async () => {
        try {
          let existing = await getSession(id);
          if (cancelled) return;
          if (!existing) {
            router.replace('/(tabs)');
            return;
          }
          if (existing.status === 'complete' || existing.status === 'processing') {
            // Finished sessions belong on the review screen (deep-link guard).
            router.replace(`/review/${id}`);
            return;
          }
          if (existing.status === 'recording' || existing.status === 'paused') {
            // Corpse reached before Home's launch sweep ran (e.g. deep link):
            // launch auto-close wins (ADR-008 §2) — reclassify, then recover.
            await markInterruptedSessions(useActiveSession.getState().sessionId);
            existing = (await getSession(id)) ?? existing;
            if (cancelled) return;
          }
          const lines = await getTranscriptLines(id);
          if (cancelled) return;
          setRecoverySession(existing);
          setRecoveryLines(lines);
          setMode('recovery');
        } catch (err) {
          // Status unreadable: recording for a non-live session is never an
          // option, so surface the failure instead of falling through.
          console.error('Failed to load session for recovery:', err);
          if (!cancelled) setLoadError("Couldn't load this session. Go back and try again.");
        }
      })();
    }

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

  // Stop → native action sheet, not Alert (02-screen-designs, Recording screen).
  const handleStop = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['End & organize', 'Keep recording'],
        cancelButtonIndex: 1,
      },
      (buttonIndex) => {
        if (buttonIndex === 0) finishSession();
      }
    );
  };

  const handleChangeContext = async (ctx: Context) => {
    setShowContextPicker(false);
    session.updateContext(ctx.id, ctx.name);
    await updateSession(id, { context_id: ctx.id });
  };

  // "+ New place" pinned row — name-only creation with the NOT NULL defaults
  // (context_type 'space', icon 📍, schema default color — challenger amendment 8).
  const handleCreatePlace = () => {
    Alert.prompt(
      'New place',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async (name?: string) => {
            const trimmed = name?.trim();
            if (!trimmed) return;
            const ctx: Context = {
              id: nanoid(),
              name: trimmed,
              icon: '📍',
              color: '#6E8FAC',
              context_type: 'space',
            };
            try {
              await upsertContext(ctx);
              setContexts(await getContexts());
              await handleChangeContext(ctx);
            } catch (err) {
              console.error('Failed to create place:', err);
            }
          },
        },
      ],
      'plain-text'
    );
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

  // ── Recovery actions (ADR-008 §3) — status-only writes, audio_uri untouched ──

  const handleSaveAndReview = async () => {
    try {
      // ended_at was already set honestly by the launch auto-close (last
      // persisted transcript line). Organize is offered on the review screen.
      await updateSession(id, { status: 'processing' });
      router.replace(`/review/${id}`);
    } catch (err) {
      console.error('Failed to save interrupted session:', err);
      Alert.alert("Couldn't save", 'Something went wrong. Please try again.');
    }
  };

  const handleDiscard = () => {
    const title = recoverySession?.title ?? 'this recording';
    Alert.alert(
      'Discard recording?',
      `"${title}" and its transcript will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSession(id);
              router.replace('/(tabs)');
            } catch (err) {
              console.error('Failed to discard session:', err);
              Alert.alert("Couldn't discard", 'Something went wrong. Please try again.');
            }
          },
        },
      ]
    );
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

  // ── Recovery layout — static, read-only; no capture path exists here ─────────
  if (mode === 'recovery') {
    const endedAt = recoverySession?.ended_at ?? recoverySession?.started_at;
    const endedAtStr = endedAt
      ? new Date(endedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <SafeAreaView className="flex-1 bg-bg">
        <StatusBar style="dark" />
        <View className="bg-surface border-b border-border px-5 pt-3 pb-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="alert-circle" size={20} color="#D97706" />
            <Text className="text-text-primary font-bold text-lg">Recording interrupted</Text>
          </View>
          {recoverySession?.title ? (
            <Text className="text-text-secondary text-sm mt-1" numberOfLines={1}>
              {recoverySession.title}
            </Text>
          ) : null}
          <Text className="text-text-tertiary text-xs mt-1">
            {endedAtStr
              ? `Everything transcribed up to ${endedAtStr} is saved.`
              : 'Everything transcribed before the interruption is saved.'}
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {recoveryLines.length === 0 ? (
            <View className="items-center py-12">
              <Ionicons name="mic-off-outline" size={40} color="#E5E7EB" />
              <Text className="text-text-secondary text-sm mt-3 text-center px-8">
                Nothing was transcribed before the interruption.
              </Text>
            </View>
          ) : (
            recoveryLines.map(line => (
              <TranscriptLineView
                key={line.id}
                line={line}
                isOwner={line.speaker_id === 'me'}
              />
            ))
          )}
        </ScrollView>

        <View className="bg-surface border-t border-border px-5 pt-4 pb-2">
          <TouchableOpacity
            className="bg-brand-600 rounded-2xl py-4 items-center"
            onPress={handleSaveAndReview}
          >
            <Text className="text-white font-semibold text-base">Save & review</Text>
          </TouchableOpacity>
          <TouchableOpacity className="py-4 items-center" onPress={handleDiscard}>
            <Text className="text-red-600 font-medium text-sm">Discard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Pending — resolving a non-live session (spinner, or load failure) ────────
  if (mode === 'pending') {
    return (
      <SafeAreaView className="flex-1 bg-bg items-center justify-center">
        <StatusBar style="dark" />
        {loadError ? (
          <View className="w-full px-6">
            <NoticeBanner
              variant="error"
              message={loadError}
              actionLabel="Go back"
              onAction={() => router.replace('/(tabs)')}
            />
          </View>
        ) : (
          <ActivityIndicator color="#3B5BDB" />
        )}
      </SafeAreaView>
    );
  }

  // ── Live layout — only reachable when the store confirmed liveness at mount ──
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

        {/* Place chip */}
        <TouchableOpacity
          className="flex-row items-center gap-2 bg-white/10 rounded-xl px-3 py-2 self-start"
          onPress={() => setShowContextPicker(true)}
        >
          <Ionicons name="location" size={14} color="#D97706" />
          <Text className="text-white text-sm font-medium">
            {session.currentContextName ?? 'Set place'}
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
                      <Text className="text-xs font-bold text-text-secondary">Y</Text>
                    </View>
                    <Text className="text-xs text-text-secondary italic">Listening…</Text>
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

      {/* Place Picker Modal */}
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
            ListHeaderComponent={
              <TouchableOpacity
                className="mb-2 rounded-xl border border-dashed border-brand-600 bg-brand-50 flex-row items-center px-4 py-3"
                onPress={handleCreatePlace}
              >
                <Ionicons name="add-circle-outline" size={20} color="#3B5BDB" />
                <Text className="text-brand-600 font-medium ml-2">New place</Text>
              </TouchableOpacity>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                className={`mb-2 rounded-xl border flex-row items-center px-4 py-3 ${session.currentContextId === item.id ? 'border-brand-600 bg-brand-50' : 'border-border bg-white'}`}
                onPress={() => handleChangeContext(item)}
              >
                <Text className="text-xl mr-3">{item.icon}</Text>
                <Text className="flex-1 font-medium text-text-primary">
                  {item.name}
                </Text>
                {session.currentContextId === item.id && (
                  <Ionicons name="checkmark-circle" size={22} color="#3B5BDB" />
                )}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
