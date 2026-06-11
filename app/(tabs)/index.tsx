import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, RefreshControl, TextInput, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import Anthropic from '@anthropic-ai/sdk';
import { SessionCard } from '../../components/SessionCard';
import { NoticeBanner } from '../../components/NoticeBanner';
import { SetupCard, SetupStep } from '../../components/SetupCard';
import {
  getSessions, deleteSession, markInterruptedSessions,
  getStaff, getSetting, setSetting,
} from '../../lib/database';
import { useActiveSession } from '../../stores/session';
import { useSettings } from '../../stores/settings';
import { Session } from '../../types';

type KeyTestState = 'idle' | 'testing' | 'rejected' | 'unreachable';

// Settings-table flag (key-value row, no schema change). Once set, the
// first-run SetupCard never renders again — "dismisses for good" (Screen 9)
// survives even if every session is later deleted.
const SETUP_COMPLETE_KEY = 'setup_complete';

export default function SessionsScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Re-render when liveness changes; null whenever nothing is genuinely live.
  const liveSessionId = useActiveSession(s => (s.isRecording ? s.sessionId : null));

  // First-run SetupCard state (Screen 9 / R1). setupComplete starts true so
  // nothing flashes before the persisted flag has been read.
  const [staffCount, setStaffCount] = useState(0);
  const [setupComplete, setSetupComplete] = useState(true);
  const [keyCaptureOpen, setKeyCaptureOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyTest, setKeyTest] = useState<KeyTestState>('idle');
  const anthropicApiKey = useSettings(s => s.anthropicApiKey);
  const settingsLoaded = useSettings(s => s.isLoaded);
  const setApiKey = useSettings(s => s.setApiKey);

  const load = useCallback(async () => {
    // ADR-008 launch auto-close (challenger amendment 1): reclassify dead
    // 'recording'/'paused' rows to 'interrupted' BEFORE the list renders, so no
    // UI can ever treat a corpse as live. The live store id is read first —
    // a genuinely live backgrounded recording is never swept.
    await markInterruptedSessions(useActiveSession.getState().sessionId);
    const [data, staff, setupFlag] = await Promise.all([
      getSessions(),
      getStaff(),
      getSetting(SETUP_COMPLETE_KEY),
    ]);
    setSessions(data);
    setStaffCount(staff.length);
    setSetupComplete(setupFlag === '1');
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Swipe-left Delete (Screen 1): ONE confirmation with the item named —
  // "deletes confirm once" (design principle 5). The long-press path with two
  // stacked Alerts is removed (kill list); Review's overflow menu stays the
  // discoverable delete, this swipe is the accelerator.
  const confirmDelete = (session: Session, swipeable: SwipeableMethods) => {
    Alert.alert(
      `Delete "${session.title}"?`,
      'Transcript, tasks and audio go with it.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => swipeable.close() },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSession(session.id);
              await load();
            } catch (err) {
              console.error('Failed to delete session:', err);
              swipeable.close();
            }
          },
        },
      ]
    );
  };

  const hasSession = sessions.length > 0;
  const hasKey = settingsLoaded && anthropicApiKey.trim().length > 0;

  // Gone for good: once a session exists AND a key is saved, persist the
  // dismissal so the card never comes back (Screen 9). The flag value is a
  // plain '1' — no key material, no PII.
  useEffect(() => {
    if (!setupComplete && hasSession && hasKey) {
      setSetupComplete(true);
      setSetting(SETUP_COMPLETE_KEY, '1').catch(() => {
        // Non-fatal: the condition re-evaluates on next load and retries.
      });
    }
  }, [setupComplete, hasSession, hasKey]);

  // Inline key capture (Screen 9). Same contract as the Settings "Test key"
  // button (challenger amendment 12): one minimal API call, and the key is
  // NEVER logged — no console output of any kind on this path. The key is
  // persisted only when the test passes; the green tick on the "Connect
  // Claude" row is the success feedback. Failures save nothing and report
  // inline. Settings (and Review's missing-key card, T8) remain the save
  // paths that don't require a successful test.
  const testAndSaveKey = async () => {
    if (!settingsLoaded || keyTest === 'testing') return;
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setKeyTest('testing');
    try {
      const anthropic = new Anthropic({ apiKey: trimmed });
      await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      await setApiKey(trimmed);
      setKeyInput('');
      setKeyTest('idle');
    } catch (err) {
      if (err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403)) {
        setKeyTest('rejected');
      } else {
        setKeyTest('unreachable');
      }
    }
  };

  // Visibility (Screen 9): full three-row card until the first recording
  // exists; then a one-row reminder until a key is saved; then gone for good
  // (handled by the effect above). settingsLoaded gates rendering so the
  // "Connect Claude" tick never flickers while the store hydrates.
  const showSetup = settingsLoaded && !setupComplete;
  const showFullSetup = showSetup && !hasSession;
  const showReminder = showSetup && hasSession && !hasKey;

  const setupSteps: SetupStep[] = [
    {
      done: hasSession,
      label: 'Record your first meeting',
      sublabel: 'Tap the red button below.',
      icon: 'mic-outline',
      onPress: () => router.push('/session/new'),
    },
    {
      done: staffCount > 0,
      label: 'Add your team',
      sublabel: '(optional — tasks can stay yours)',
      icon: 'person-add-outline',
      onPress: () => router.navigate('/(tabs)/team'),
    },
    {
      done: hasKey,
      label: 'Connect Claude',
      sublabel: "Recording works without it. Organizing doesn't.",
      icon: 'sparkles-outline',
      onPress: () => { if (!hasKey) setKeyCaptureOpen(open => !open); },
    },
  ];

  const reminderStep: SetupStep[] = [
    {
      done: false,
      label: '1 step left: connect Claude',
      icon: 'sparkles-outline',
      onPress: () => setKeyCaptureOpen(open => !open),
    },
  ];

  // Red banner ONLY for a store-confirmed live recording (ADR-008 §4). After the
  // auto-close sweep, any remaining 'recording'/'paused' row IS the live one —
  // but the in-memory store stays the source of truth, never the persisted status.
  const liveSession = sessions.find(
    s => (s.status === 'recording' || s.status === 'paused') && s.id === liveSessionId
  );
  // Amber recovery banner for the most recent interrupted session; older ones
  // still render in the list as amber "Interrupted" cards (getSessions is newest-first).
  const interruptedSession = sessions.find(s => s.status === 'interrupted');
  const pastSessions = sessions.filter(s => s.id !== liveSession?.id);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-bg">
      {/* Header */}
      <View className="px-5 pt-4 pb-5">
        <Text className="text-text-primary text-2xl font-bold tracking-tight">Meet AI</Text>
        <Text className="text-text-secondary text-sm mt-1">Your meetings, on the record.</Text>
      </View>

      <View className="flex-1 bg-bg">
        <ScrollView
          contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B5BDB" />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* First-run SetupCard (Screen 9 / R1) — above the list. Full
              checklist before the first recording; one-row reminder after it
              until a key is saved; never rendered again once both exist. */}
          {(showFullSetup || showReminder) && (
            <View className="mb-4">
              <SetupCard steps={showFullSetup ? setupSteps : reminderStep}>
                {keyCaptureOpen && !hasKey && (
                  <View className="border-t border-border mt-1 pt-3">
                    <Text className="text-text-secondary text-xs mb-2">
                      Paste your Anthropic API key. Get one at{' '}
                      <Text
                        className="text-brand-600"
                        onPress={() => Linking.openURL('https://console.anthropic.com')}
                      >
                        console.anthropic.com
                      </Text>
                    </Text>
                    <TextInput
                      className="border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary bg-bg"
                      value={keyInput}
                      onChangeText={(text) => {
                        setKeyInput(text);
                        if (keyTest !== 'idle') setKeyTest('idle');
                      }}
                      placeholder="sk-ant-..."
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={settingsLoaded}
                    />
                    <View className="flex-row items-center mt-2">
                      <TouchableOpacity
                        className={`rounded-xl px-4 py-2 ${
                          !settingsLoaded || !keyInput.trim() || keyTest === 'testing'
                            ? 'bg-gray-300'
                            : 'bg-brand-600'
                        }`}
                        onPress={testAndSaveKey}
                        disabled={!settingsLoaded || !keyInput.trim() || keyTest === 'testing'}
                      >
                        <Text className="text-white text-xs font-semibold">Test</Text>
                      </TouchableOpacity>
                      <View className="flex-1 ml-3">
                        {keyTest === 'testing' && (
                          <View className="flex-row items-center gap-2">
                            <ActivityIndicator size="small" color="#3B5BDB" />
                            <Text className="text-text-secondary text-xs">Checking key…</Text>
                          </View>
                        )}
                        {keyTest === 'rejected' && (
                          <Text className="text-red-600 text-xs font-medium">
                            Key rejected — check console.anthropic.com
                          </Text>
                        )}
                        {keyTest === 'unreachable' && (
                          <Text className="text-red-600 text-xs font-medium">
                            Couldn't reach Anthropic — check your connection and try again.
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                )}
              </SetupCard>
            </View>
          )}

          {/* Live recording banner — red, store-confirmed live only (ADR-008 §4) */}
          {liveSession && (
            <TouchableOpacity
              className="bg-recording rounded-2xl p-4 mb-4 flex-row items-center"
              onPress={() => router.push(`/session/${liveSession.id}`)}
            >
              <View className="w-2.5 h-2.5 bg-white rounded-full mr-3 opacity-90" />
              <View className="flex-1">
                <Text className="text-white font-semibold text-sm">Recording — tap to return</Text>
                <Text className="text-red-100 text-xs mt-0.5" numberOfLines={1}>{liveSession.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          )}

          {/* Interrupted recovery banner — amber reassurance, opens the read-only
              recovery layout. Replaces the old red "Still going" footgun that
              re-recorded dead sessions over their own audio (ADR-008). */}
          {interruptedSession && (
            <TouchableOpacity
              className="mb-4"
              activeOpacity={0.8}
              onPress={() => router.push(`/session/${interruptedSession.id}`)}
            >
              <NoticeBanner
                variant="warning"
                message={`Recording interrupted — ${interruptedSession.title} · it's saved`}
                actionLabel="Open"
                onAction={() => router.push(`/session/${interruptedSession.id}`)}
              />
            </TouchableOpacity>
          )}

          {/* First-run, the SetupCard takes the empty state's place (Screen 1). */}
          {sessions.length === 0 && !showFullSetup ? (
            <View className="items-center py-16">
              <Ionicons name="mic-outline" size={56} color="#E5E7EB" />
              <Text className="text-text-primary font-semibold text-lg mt-4">Nothing here yet.</Text>
              <Text className="text-text-secondary text-sm mt-2 text-center px-8">
                Hit the button below to start your first walkthrough. It listens so you don't have to remember.
              </Text>
            </View>
          ) : (
            <>
              {pastSessions.length > 0 && (
                <>
                  <Text className="text-text-primary font-semibold text-sm mb-3 uppercase tracking-wide">
                    Recent
                  </Text>
                  {pastSessions.map(session => (
                    // Swipe-left reveals a visible red Delete button (Screen 1:
                    // never full-swipe auto-delete). ReanimatedSwipeable rides
                    // the installed gesture-handler 2.31 + reanimated 4.3 —
                    // no new deps (challenger-verified in the blueprint).
                    <ReanimatedSwipeable
                      key={session.id}
                      friction={2}
                      rightThreshold={36}
                      overshootRight={false}
                      renderRightActions={(_progress, _translation, methods) => (
                        // mb-3 mirrors the card's own bottom margin so the
                        // button aligns with the card face, not the gap.
                        <View className="mb-3 pl-2">
                          <TouchableOpacity
                            className="flex-1 w-20 bg-recording rounded-2xl items-center justify-center"
                            onPress={() => confirmDelete(session, methods)}
                          >
                            <Ionicons name="trash-outline" size={20} color="white" />
                            <Text className="text-white text-xs font-semibold mt-1">Delete</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    >
                      <SessionCard
                        session={session}
                        // Interrupted sessions open the read-only recovery layout —
                        // never Review (its guards land in T8) and never live capture.
                        onPress={() => router.push(
                          session.status === 'interrupted'
                            ? `/session/${session.id}`
                            : `/review/${session.id}`
                        )}
                      />
                    </ReanimatedSwipeable>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>

        {/* FAB — bg-recording + mic per the Home design (Screen 1): recording
            is the identity action, and the SetupCard's first step points at
            "the red button below". */}
        <TouchableOpacity
          className="absolute bottom-8 right-5 w-16 h-16 bg-recording rounded-full items-center justify-center shadow-lg"
          onPress={() => router.push('/session/new')}
          style={{
            shadowColor: '#E53E3E',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Ionicons name="mic" size={30} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
