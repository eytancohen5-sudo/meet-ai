import React, { useState } from 'react';
import {
  View, Text, ScrollView, SafeAreaView,
  TextInput, TouchableOpacity, Alert, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../../stores/settings';

export default function SettingsScreen() {
  const { anthropicApiKey, ownerName, setApiKey, setOwnerName } = useSettings();
  const [apiKeyInput, setApiKeyInput] = useState(anthropicApiKey);
  const [ownerNameInput, setOwnerNameInput] = useState(ownerName);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await Promise.all([
      setApiKey(apiKeyInput.trim()),
      setOwnerName(ownerNameInput.trim() || 'Owner'),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <SafeAreaView className="flex-1 bg-navy-800">
      <View className="px-5 pt-4 pb-5">
        <Text className="text-white text-2xl font-bold tracking-tight">Settings</Text>
        <Text className="text-navy-400 text-sm mt-1">Configure your assistant</Text>
      </View>

      <View className="flex-1 bg-villa-bg rounded-t-3xl">
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Section */}
          <Text className="text-navy-400 text-xs font-semibold uppercase tracking-wide mb-3 mt-2">Profile</Text>
          <View className="bg-white rounded-2xl border border-villa-border p-4 mb-4">
            <Text className="text-gray-500 text-xs mb-1">Your Name</Text>
            <TextInput
              className="text-navy-800 text-base font-medium"
              value={ownerNameInput}
              onChangeText={setOwnerNameInput}
              placeholder="Owner"
              returnKeyType="done"
            />
          </View>

          {/* AI Section */}
          <Text className="text-navy-400 text-xs font-semibold uppercase tracking-wide mb-3">AI Configuration</Text>
          <View className="bg-white rounded-2xl border border-villa-border p-4 mb-2">
            <Text className="text-gray-800 font-medium mb-1">Anthropic API Key</Text>
            <Text className="text-gray-400 text-xs mb-3">
              Required for AI-powered meeting organization. Get yours at console.anthropic.com
            </Text>
            <View className="flex-row items-center border border-gray-200 rounded-xl overflow-hidden">
              <TextInput
                className="flex-1 px-3 py-3 text-sm text-gray-800"
                value={apiKeyInput}
                onChangeText={setApiKeyInput}
                placeholder="sk-ant-..."
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity className="px-3 py-3" onPress={() => setShowKey(!showKey)}>
                <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          </View>

          <View className="bg-blue-50 rounded-xl p-3 mb-6 flex-row gap-2">
            <Ionicons name="information-circle-outline" size={18} color="#2D5A8E" />
            <Text className="flex-1 text-xs text-navy-700 leading-relaxed">
              AI organization runs after each session ends. Without an API key, transcripts are saved but not organized automatically.
            </Text>
          </View>

          {/* Speech Recognition Section */}
          <Text className="text-navy-400 text-xs font-semibold uppercase tracking-wide mb-3">Transcription</Text>
          <View className="bg-white rounded-2xl border border-villa-border divide-y divide-gray-100 mb-6">
            <View className="p-4 flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-gray-800 font-medium text-sm">Offline Mode</Text>
                <Text className="text-gray-400 text-xs mt-0.5">Use on-device speech recognition (requires dev build)</Text>
              </View>
              <Switch value={true} disabled />
            </View>
            <View className="p-4">
              <Text className="text-gray-800 font-medium text-sm mb-1">Transcription Engine</Text>
              <View className="bg-green-50 px-3 py-2 rounded-lg mt-1">
                <Text className="text-green-700 text-xs font-medium">iOS Speech Recognition (On-Device)</Text>
                <Text className="text-green-600 text-xs mt-0.5">Works without internet · Supports 50+ languages</Text>
              </View>
            </View>
          </View>

          {/* About */}
          <Text className="text-navy-400 text-xs font-semibold uppercase tracking-wide mb-3">About</Text>
          <View className="bg-white rounded-2xl border border-villa-border p-4 mb-4">
            <Text className="text-gray-400 text-xs leading-relaxed">
              Villa Assistant v1.0{'\n'}
              Powered by Claude claude-sonnet-4-6 · iOS Speech Recognition{'\n'}
              Built for Expo SDK 56
            </Text>
          </View>

          <TouchableOpacity
            className={`py-4 rounded-2xl items-center ${saved ? 'bg-green-500' : 'bg-navy-800'}`}
            onPress={save}
          >
            <Text className="text-white font-semibold">
              {saved ? '✓ Saved' : 'Save Settings'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
