import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { sendMagicLink } from '../../lib/auth';

export default function LoginScreen() {
  const { email: prefillEmail } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await sendMagicLink(trimmed);
      router.push({ pathname: '/auth/verify', params: { email: trimmed } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send login link.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-navy-800">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1 px-6 justify-center">
          {/* Logo area */}
          <View className="items-center mb-10">
            <View className="w-16 h-16 bg-gold-500 rounded-2xl items-center justify-center mb-4">
              <Ionicons name="mic" size={32} color="#1e3a5f" />
            </View>
            <Text className="text-white text-2xl font-bold tracking-tight">Meet AI</Text>
            <Text className="text-navy-400 text-sm mt-1">Team meeting recorder</Text>
          </View>

          {/* Card */}
          <View className="bg-white rounded-3xl p-6">
            <Text className="text-navy-800 text-xl font-bold mb-1">Sign in</Text>
            <Text className="text-gray-400 text-sm mb-6">
              We'll send a one-time code to your email.
            </Text>

            <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase tracking-wide">
              Work email
            </Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 text-navy-800 text-base mb-4"
              value={email}
              onChangeText={(v) => { setEmail(v); setError(null); }}
              placeholder="you@yourcompany.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />

            {error && (
              <View className="flex-row items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
                <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
                <Text className="text-red-600 text-sm flex-1">{error}</Text>
              </View>
            )}

            <TouchableOpacity
              className={`py-4 rounded-2xl items-center ${loading ? 'bg-navy-400' : 'bg-navy-800'}`}
              onPress={handleSend}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-white font-semibold text-base">Send login link</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text className="text-navy-400 text-xs text-center mt-6 px-4">
            Access is restricted to invited team members only.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
