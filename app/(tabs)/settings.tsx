import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView,
  TextInput, TouchableOpacity, Alert, Switch, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../../stores/settings';

export default function SettingsScreen() {
  const { anthropicApiKey, ownerName, isLoaded, setApiKey, setOwnerName } = useSettings();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [ownerNameInput, setOwnerNameInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const seededRef = useRef(false);

  // Seed inputs exactly once, after the async settings load completes.
  // Before that, inputs are non-editable and Save is disabled, so a
  // persisted key can never be overwritten by the empty pre-load state.
  // After seeding, Save persists exactly what is in the field —
  // deliberately clearing the key and saving '' is a supported path.
  useEffect(() => {
    if (isLoaded && !seededRef.current) {
      seededRef.current = true;
      setApiKeyInput(anthropicApiKey);
      setOwnerNameInput(ownerName);
    }
  }, [isLoaded, anthropicApiKey, ownerName]);

  const save = async () => {
    if (!isLoaded) return;
    await Promise.all([
      setApiKey(apiKeyInput.trim()),
      setOwnerName(ownerNameInput.trim() || 'Owner'),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            <Text className="text-text-secondary text-xs mb-1">Your Name</Text>
            <TextInput
              className="text-text-primary text-base font-medium"
              value={ownerNameInput}
              onChangeText={setOwnerNameInput}
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
                API key required — the AI organizing step won't run until you add a key below and save.
              </Text>
            </View>
          )}
          <View className="bg-white rounded-2xl border border-border p-4 mb-2">
            <Text className="text-text-primary font-medium mb-1">Anthropic API Key</Text>
            <Text className="text-text-secondary text-xs mb-3">
              Needed for the organizing step. Get one at console.anthropic.com
            </Text>
            <View className="flex-row items-center border border-border rounded-xl overflow-hidden">
              <TextInput
                className="flex-1 px-3 py-3 text-sm text-text-primary"
                value={apiKeyInput}
                onChangeText={setApiKeyInput}
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
          </View>

          <View className="bg-brand-50 rounded-xl p-3 mb-6 flex-row gap-2">
            <Ionicons name="information-circle-outline" size={18} color="#3B5BDB" />
            <Text className="flex-1 text-xs text-brand-600 leading-relaxed">
              Without a key, sessions are saved but the AI sorting step won't run. Transcripts are still yours.
            </Text>
          </View>

          {/* Speech Recognition Section */}
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3">Transcription</Text>
          <View className="bg-white rounded-2xl border border-border divide-y divide-gray-100 mb-6">
            <View className="p-4 flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-text-primary font-medium text-sm">Offline Mode</Text>
                <Text className="text-text-secondary text-xs mt-0.5">Runs on your device. No internet needed, no audio sent anywhere.</Text>
              </View>
              <Switch value={true} disabled />
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

          <TouchableOpacity
            className={`py-4 rounded-2xl items-center ${
              !isLoaded ? 'bg-gray-300' : saved ? 'bg-green-500' : 'bg-brand-600'
            }`}
            onPress={save}
            disabled={!isLoaded}
          >
            <Text className="text-white font-semibold">
              {!isLoaded ? 'Loading…' : saved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
