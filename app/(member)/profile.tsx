import React from 'react';
import { View, Text, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../stores/auth';

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  owner: { label: 'Owner', color: '#1e3a5f', bg: '#d9e2ec' },
  manager: { label: 'Manager', color: '#c9501a', bg: '#fde9d9' },
  member: { label: 'Member', color: '#2d7a3e', bg: '#d4f0db' },
};

export default function MemberProfile() {
  const { user } = useAuth();

  const role = user?.role ?? 'member';
  const roleConfig = ROLE_CONFIG[role] ?? ROLE_CONFIG.member;
  const initials = (user?.email ?? '?')
    .split('@')[0]
    .split(/[._-]/)
    .map(p => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <SafeAreaView className="flex-1 bg-navy-800">
      <View className="px-5 pt-4 pb-5">
        <Text className="text-white text-2xl font-bold tracking-tight">My Profile</Text>
      </View>

      <View className="flex-1 bg-app-bg rounded-t-3xl px-5 pt-6">
        {/* Avatar */}
        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-full bg-navy-100 items-center justify-center mb-3">
            <Text className="text-navy-800 text-2xl font-bold">{initials}</Text>
          </View>
          <View
            className="px-3 py-1 rounded-full"
            style={{ backgroundColor: roleConfig.bg }}
          >
            <Text className="text-xs font-semibold" style={{ color: roleConfig.color }}>
              {roleConfig.label}
            </Text>
          </View>
        </View>

        {/* Profile card */}
        <View className="bg-white rounded-2xl border border-app-border p-5 mb-4">
          <View className="flex-row items-center gap-3 py-3 border-b border-app-border">
            <Ionicons name="mail-outline" size={18} color="#6e8fac" />
            <View className="flex-1">
              <Text className="text-gray-400 text-xs">Email</Text>
              <Text className="text-navy-800 text-sm font-medium mt-0.5">
                {user?.email ?? '—'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-3 py-3">
            <Ionicons name="shield-checkmark-outline" size={18} color="#6e8fac" />
            <View className="flex-1">
              <Text className="text-gray-400 text-xs">Role</Text>
              <Text className="text-navy-800 text-sm font-medium mt-0.5 capitalize">{role}</Text>
            </View>
          </View>
        </View>

        {/* Info note */}
        <View className="bg-navy-50 border border-navy-100 rounded-xl p-4 flex-row gap-3">
          <Ionicons name="information-circle-outline" size={18} color="#6e8fac" />
          <Text className="text-navy-400 text-sm flex-1 leading-relaxed">
            Contact your manager to update your profile details or change your role.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
