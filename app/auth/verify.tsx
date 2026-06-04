import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { verifyOtp } from '../../lib/auth';
import { useAuth } from '../../stores/auth';

export default function VerifyScreen() {
  const { email, prefill_email } = useLocalSearchParams<{ email: string; prefill_email?: string }>();
  const resolvedEmail = email ?? prefill_email ?? '';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setUser = useAuth((s) => s.setUser);

  const handleVerify = async () => {
    const trimmed = code.trim().replace(/\s/g, '');
    if (trimmed.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const user = await verifyOtp(resolvedEmail, trimmed);
      setUser(user);
      router.replace('/(member)/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid or expired code. Try again.';
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
        {/* Back button */}
        <TouchableOpacity
          className="mt-4 ml-4 w-10 h-10 items-center justify-center"
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>

        <View className="flex-1 px-6 justify-center">
          {/* Header */}
          <View className="items-center mb-10">
            <View className="w-16 h-16 bg-gold-500 rounded-full items-center justify-center mb-4">
              <Ionicons name="mail-open-outline" size={30} color="#1e3a5f" />
            </View>
            <Text className="text-white text-2xl font-bold">Check your email</Text>
            <Text className="text-navy-400 text-sm mt-2 text-center px-4">
              We sent a 6-digit code to{'\n'}
              <Text className="text-gold-400 font-medium">{resolvedEmail}</Text>
            </Text>
          </View>

          {/* Card */}
          <View className="bg-white rounded-3xl p-6">
            <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase tracking-wide">
              Verification code
            </Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 text-navy-800 text-2xl font-bold tracking-widest mb-4 text-center"
              value={code}
              onChangeText={(v) => { setCode(v); setError(null); }}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={handleVerify}
            />

            {error && (
              <View className="flex-row items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
                <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
                <Text className="text-red-600 text-sm flex-1">{error}</Text>
              </View>
            )}

            <TouchableOpacity
              className={`py-4 rounded-2xl items-center ${loading ? 'bg-navy-400' : 'bg-navy-800'}`}
              onPress={handleVerify}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-white font-semibold text-base">Verify</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            className="mt-4 items-center"
            onPress={() => router.back()}
          >
            <Text className="text-navy-400 text-sm">Didn't get it? Go back to resend</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
