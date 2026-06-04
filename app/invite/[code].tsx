import React, { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { getStaff } from '../../lib/database';
import { StaffMember } from '../../types';

type ScreenState = 'loading' | 'found' | 'not_found';

export default function InviteRedemptionScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [state, setState] = useState<ScreenState>('loading');
  const [member, setMember] = useState<StaffMember | null>(null);

  useEffect(() => {
    if (!code) {
      setState('not_found');
      return;
    }
    resolveInvite(code);
  }, [code]);

  const resolveInvite = async (inviteCode: string) => {
    try {
      const staff = await getStaff();
      const found = staff.find((s) => s.invite_code === inviteCode) ?? null;
      if (found) {
        setMember(found);
        setState('found');
        // Brief welcome moment before redirecting
        setTimeout(() => {
          const email = found.email ?? '';
          router.replace({
            pathname: '/auth/login',
            params: email ? { email } : {},
          });
        }, 1800);
      } else {
        setState('not_found');
      }
    } catch {
      setState('not_found');
    }
  };

  if (state === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-navy-800 items-center justify-center">
        <ActivityIndicator color="white" size="large" />
        <Text className="text-navy-400 text-sm mt-4">Checking invite...</Text>
      </SafeAreaView>
    );
  }

  if (state === 'not_found') {
    return (
      <SafeAreaView className="flex-1 bg-navy-800 items-center justify-center px-8">
        <View className="w-16 h-16 bg-red-500/20 rounded-full items-center justify-center mb-6">
          <Ionicons name="close-circle-outline" size={36} color="#ef4444" />
        </View>
        <Text className="text-white text-xl font-bold text-center mb-2">
          Invalid invite link
        </Text>
        <Text className="text-navy-400 text-sm text-center leading-relaxed">
          This invite link is invalid or has expired.{'\n'}Contact your manager to get a new one.
        </Text>
      </SafeAreaView>
    );
  }

  // state === 'found' — show brief welcome before redirect
  return (
    <SafeAreaView className="flex-1 bg-navy-800 items-center justify-center px-8">
      <View className="w-16 h-16 bg-gold-500 rounded-full items-center justify-center mb-6">
        <Ionicons name="hand-right-outline" size={32} color="#1e3a5f" />
      </View>
      <Text className="text-white text-xl font-bold text-center mb-2">
        Welcome, {member?.name ?? 'there'}!
      </Text>
      <Text className="text-navy-400 text-sm text-center leading-relaxed mb-6">
        Enter your email to continue joining the team.
      </Text>
      <ActivityIndicator color="#c9a84c" size="small" />
    </SafeAreaView>
  );
}
