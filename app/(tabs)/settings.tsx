import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView,
  TextInput, TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import Anthropic from '@anthropic-ai/sdk';
import { useSettings } from '../../stores/settings';
import { getContexts } from '../../lib/database';

type KeyTestState = 'idle' | 'testing' | 'pass' | 'rejected' | 'unreachable';

export default function SettingsScreen() {
  const { anthropicApiKey, ownerName, isLoaded, setApiKey, setOwnerName } = useSettings();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [ownerNameInput, setOwnerNameInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [keyTest, setKeyTest] = useState<KeyTestState>('idle');
  const [placeCount, setPlaceCount] = useState<number | null>(null);
  const seededRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Seed inputs exactly once, after the async settings load completes.
  // Before that, inputs are non-editable and the blur handlers no-op, so a
  // persisted key can never be overwritten by the empty pre-load state
  // (Phase 2 S3 key-wipe guard). After seeding, blur persists exactly what
  // is in the field — deliberately clearing the key and blurring out is a
  // supported path.
  useEffect(() => {
    if (isLoaded && !seededRef.current) {
      seededRef.current = true;
      setApiKeyInput(anthropicApiKey);
      setOwnerNameInput(ownerName);
    }
  }, [isLoaded, anthropicApiKey, ownerName]);

  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  // Refresh the Places count whenever the tab regains focus (e.g. returning
  // from the Places screen after adding or deleting one).
  useFocusEffect(useCallback(() => {
    let active = true;
    getContexts()
      .then((contexts) => { if (active) setPlaceCount(contexts.length); })
      .catch(() => { if (active) setPlaceCount(null); });
    return () => { active = false; };
  }, []));

  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    timersRef.current.push(setTimeout(() => setter(false), 2000));
  };

  const saveName = async () => {
    if (!isLoaded || !seededRef.current) return;
    const trimmed = ownerNameInput.trim() || 'Owner';
    if (trimmed !== ownerNameInput) setOwnerNameInput(trimmed);
    if (trimmed === ownerName) return;
    await setOwnerName(trimmed);
    flash(setNameSaved);
  };

  const saveKey = async () => {
    if (!isLoaded || !seededRef.current) return;
    const trimmed = apiKeyInput.trim();
    if (trimmed !== apiKeyInput) setApiKeyInput(trimmed);
    if (trimmed === anthropicApiKey) return;
    await setApiKey(trimmed);
    setKeyTest('idle'); // a changed key invalidates any previous test result
    flash(setKeySaved);
  };

  // Minimal real API call against the stored key (challenger amendment 12).
  // The key is NEVER logged — no console output of any kind on this path;
  // pass/fail is reported inline only.
  const testKey = async () => {
    if (!isLoaded || keyTest === 'testing') return;
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    if (trimmed !== anthropicApiKey) await setApiKey(trimmed);
    setKeyTest('testing');
    try {
      const anthropic = new Anthropic({ apiKey: trimmed });
      await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      setKeyTest('pass');
    } catch (err) {
      if (err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403)) {
        setKeyTest('rejected');
      } else {
        setKeyTest('unreachable');
      }
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-bg">
      <View className="px-5 pt-4 pb-5">
        <Text className="text-text-primary text-2xl font-bold tracking-tight">Settings</Text>
        <Text className="text-text-secondary text-sm mt-1">A few things to set up.</Text>
      </View>

      <View className="flex-1 bg-bg">
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Section */}
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3 mt-2">Profile</Text>
          <View className="bg-white rounded-2xl border border-border p-4 mb-4">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-text-secondary text-xs">Your Name</Text>
              {nameSaved && <Text className="text-green-600 text-xs">Saved ✓</Text>}
            </View>
            <TextInput
              className="text-text-primary text-base font-medium"
              value={ownerNameInput}
              onChangeText={setOwnerNameInput}
              onBlur={saveName}
              placeholder="Owner"
              returnKeyType="done"
              editable={isLoaded}
            />
          </View>

          {/* AI Section */}
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3">AI</Text>
          {isLoaded && !anthropicApiKey && (
            <View className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-3 flex-row gap-2 items-center">
              <Ionicons name="warning-outline" size={18} color="#B45309" />
              <Text className="flex-1 text-xs text-amber-700 font-semibold leading-relaxed">
                API key required — the AI organizing step won't run until you add a key below.
              </Text>
            </View>
          )}
          <View className="bg-white rounded-2xl border border-border p-4 mb-2">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-text-primary font-medium">Anthropic API Key</Text>
              {keySaved && <Text className="text-green-600 text-xs">Saved ✓</Text>}
            </View>
            <Text className="text-text-secondary text-xs mb-3">
              Needed for the organizing step. Get one at console.anthropic.com
            </Text>
            <View className="flex-row items-center border border-border rounded-xl overflow-hidden">
              <TextInput
                className="flex-1 px-3 py-3 text-sm text-text-primary"
                value={apiKeyInput}
                onChangeText={setApiKeyInput}
                onBlur={saveKey}
                placeholder="sk-ant-..."
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
                editable={isLoaded}
              />
              <TouchableOpacity className="px-3 py-3" onPress={() => setShowKey(!showKey)}>
                <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center mt-3">
              <TouchableOpacity
                className={`rounded-xl px-4 py-2 ${
                  !isLoaded || !apiKeyInput.trim() || keyTest === 'testing' ? 'bg-gray-300' : 'bg-brand-600'
                }`}
                onPress={testKey}
                disabled={!isLoaded || !apiKeyInput.trim() || keyTest === 'testing'}
              >
                <Text className="text-white text-xs font-semibold">Test key</Text>
              </TouchableOpacity>
              <View className="flex-1 ml-3">
                {keyTest === 'testing' && (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#3B5BDB" />
                    <Text className="text-text-secondary text-xs">Checking key…</Text>
                  </View>
                )}
                {keyTest === 'pass' && (
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                    <Text className="text-green-600 text-xs font-medium">Key works</Text>
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

          <View className="bg-brand-50 rounded-xl p-3 mb-6 flex-row gap-2">
            <Ionicons name="information-circle-outline" size={18} color="#3B5BDB" />
            <Text className="flex-1 text-xs text-brand-600 leading-relaxed">
              Without a key, sessions are saved but the AI sorting step won't run. Transcripts are still yours.
            </Text>
          </View>

          {/* Places Section */}
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3">Places</Text>
          <TouchableOpacity
            className="bg-white rounded-2xl border border-border p-4 mb-6 flex-row items-center justify-between"
            onPress={() => router.push('/places')}
            activeOpacity={0.7}
          >
            <Text className="text-text-primary font-medium">
              Places{placeCount !== null ? ` (${placeCount})` : ''}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#6B7280" />
          </TouchableOpacity>

          {/* Speech Recognition Section */}
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3">Transcription</Text>
          <View className="bg-white rounded-2xl border border-border divide-y divide-gray-100 mb-6">
            <View className="p-4 flex-row items-center gap-3">
              <Ionicons name="shield-checkmark-outline" size={20} color="#16A34A" />
              <View className="flex-1">
                <Text className="text-text-primary font-medium text-sm">On-device transcription</Text>
                <Text className="text-text-secondary text-xs mt-0.5">Always on. Audio never leaves your phone.</Text>
              </View>
            </View>
            <View className="p-4">
              <Text className="text-text-primary font-medium text-sm mb-1">Transcription Engine</Text>
              <View className="bg-green-50 px-3 py-2 rounded-lg mt-1">
                <Text className="text-green-700 text-xs font-medium">iOS Speech Recognition (On-Device)</Text>
                <Text className="text-green-600 text-xs mt-0.5">Works without internet · Supports 50+ languages</Text>
              </View>
            </View>
          </View>

          {/* About */}
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3">About</Text>
          <View className="bg-white rounded-2xl border border-border p-4 mb-4">
            <Text className="text-text-secondary text-xs leading-relaxed">
              Meet AI v1.0{'\n'}
              Powered by Anthropic Claude · iOS Speech Recognition{'\n'}
              Built for Expo SDK 56
            </Text>
            <Text className="text-text-secondary text-xs leading-relaxed mt-3">
              Built half out of love for the craft, half because rent exists. Both are true.
            </Text>
            <Text className="text-text-secondary text-xs leading-relaxed mt-1">
              Still don't get the point?{' '}
              <Text
                className="text-text-primary"
                onPress={() => Linking.openURL('mailto:eytancohen5@gmail.com')}
              >
                Mail us
              </Text>
              {' '}— we'll build your thing in ten seconds. Give or take.
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
