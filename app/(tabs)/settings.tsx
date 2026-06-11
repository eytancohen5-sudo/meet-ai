import React, { useState } from 'react';
import {
  View, Text, ScrollView, SafeAreaView,
  TextInput, TouchableOpacity, Alert, Switch, Linking,
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
    <SafeAreaView className="flex-1 bg-bg">
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
            />
          </View>

          {/* AI Section */}
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3">AI</Text>
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
            className={`py-4 rounded-2xl items-center ${saved ? 'bg-green-500' : 'bg-brand-600'}`}
            onPress={save}
          >
            <Text className="text-white font-semibold">
              {saved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
