import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, SafeAreaView, TextInput, Modal,
  Image, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getContexts, upsertContext, deleteContext, getStaff, upsertStaff, deleteStaff } from '../../lib/database';
import { Context, ContextType, StaffMember, SPEAKER_COLORS } from '../../types';
import { nanoid } from '../_utils';

const CONTEXT_TYPES: { type: ContextType; label: string; icon: string }[] = [
  { type: 'space', label: 'Space', icon: '🏠' },
  { type: 'product', label: 'Product', icon: '📦' },
  { type: 'presentation', label: 'Presentation', icon: '📊' },
  { type: 'website', label: 'Website', icon: '🌐' },
  { type: 'document', label: 'Document', icon: '📄' },
  { type: 'other', label: 'Other', icon: '📍' },
];

export default function RoomsScreen() {
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center p-8">
        <Ionicons name="phone-portrait-outline" size={48} color="#D9E2EC" />
        <Text className="text-navy-800 font-semibold text-lg mt-4">Mobile app required</Text>
        <Text className="text-gray-400 text-sm mt-2 text-center">
          Recording is only available in the Meet AI mobile app.
        </Text>
      </SafeAreaView>
    );
  }

  const [contexts, setContexts] = useState<Context[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [tab, setTab] = useState<'rooms' | 'staff'>('rooms');

  // Add context form state
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [selectedContextType, setSelectedContextType] = useState<ContextType>('space');

  // Add staff state
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('');

  const load = useCallback(async () => {
    const [ctxs, stf] = await Promise.all([getContexts(), getStaff()]);
    setContexts(ctxs);
    setStaff(stf);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Add context flow ─────────────────────────────────────────────────────────

  const openAddRoom = () => {
    setRoomNameInput('');
    setSelectedContextType('space');
    setShowAddRoom(true);
  };

  const saveRoom = async () => {
    if (!roomNameInput.trim()) return;
    const selectedType = CONTEXT_TYPES.find(t => t.type === selectedContextType);
    const ctx: Context = {
      id: nanoid(),
      name: roomNameInput.trim(),
      icon: selectedType?.icon ?? '📍',
      color: '#6E8FAC',
      context_type: selectedContextType,
    };
    await upsertContext(ctx);
    setShowAddRoom(false);
    await load();
  };

  const confirmDeleteRoom = (ctx: Context) => {
    Alert.alert('Delete Context', `Remove "${ctx.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteContext(ctx.id);
          await load();
        },
      },
    ]);
  };

  // ── Staff ────────────────────────────────────────────────────────────────────

  const addStaff = async () => {
    if (!newStaffName.trim()) return;
    const member: StaffMember = {
      id: nanoid(),
      name: newStaffName.trim(),
      role: newStaffRole.trim(),
      color: SPEAKER_COLORS[staff.length % SPEAKER_COLORS.length],
      avatar_initials: newStaffName.trim().split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2),
      role_level: 'member',
    };
    await upsertStaff(member);
    setNewStaffName('');
    setNewStaffRole('');
    setShowAddStaff(false);
    await load();
  };

  const confirmDeleteStaff = (member: StaffMember) => {
    Alert.alert('Remove Staff', `Remove "${member.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteStaff(member.id); await load(); } },
    ]);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-navy-800">
      <View className="px-5 pt-4 pb-5">
        <Text className="text-white text-2xl font-bold tracking-tight">Spaces</Text>
        <Text className="text-navy-400 text-sm mt-1">Contexts and people.</Text>
      </View>

      <View className="flex-1 bg-app-bg rounded-t-3xl">
        {/* Tabs */}
        <View className="flex-row mx-4 mt-4 bg-gray-100 rounded-xl p-1">
          {(['rooms', 'staff'] as const).map(t => (
            <TouchableOpacity
              key={t}
              className={`flex-1 py-2.5 rounded-lg items-center ${tab === t ? 'bg-white shadow-sm' : ''}`}
              onPress={() => setTab(t)}
            >
              <Text className={`text-sm font-medium ${tab === t ? 'text-navy-800' : 'text-gray-500'}`}>
                {t === 'rooms' ? `Spaces (${contexts.length})` : `Team (${staff.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {tab === 'rooms' ? (
            <>
              {contexts.map(ctx => (
                <View key={ctx.id} className="bg-white rounded-2xl border border-app-border mb-3 overflow-hidden">
                  {/* Context photo or placeholder */}
                  {ctx.reference_image_uri ? (
                    <Image
                      source={{ uri: ctx.reference_image_uri }}
                      className="w-full h-36"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="w-full h-28 bg-gray-100 items-center justify-center">
                      <Text className="text-5xl">{ctx.icon}</Text>
                      <Text className="text-gray-400 text-xs mt-2">No photo yet</Text>
                    </View>
                  )}

                  <View className="p-3 flex-row items-center">
                    <Text className="text-xl mr-2">{ctx.icon}</Text>
                    <View className="flex-1">
                      <Text className="text-navy-800 font-semibold">{ctx.name}</Text>
                      {ctx.ai_description ? (
                        <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={2}>
                          {ctx.ai_description}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmDeleteRoom(ctx)}
                      className="p-2"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <TouchableOpacity
                className="border-2 border-dashed border-gray-200 rounded-2xl p-5 items-center mt-1"
                onPress={openAddRoom}
              >
                <View className="w-12 h-12 bg-navy-50 rounded-full items-center justify-center mb-2">
                  <Ionicons name="add-outline" size={24} color="#1E3A5F" />
                </View>
                <Text className="text-navy-800 font-semibold text-sm">Add a Space</Text>
                <Text className="text-gray-400 text-xs mt-1 text-center">
                  Name it and pick a type.
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {staff.map(member => (
                <View key={member.id} className="bg-white rounded-xl border border-app-border p-4 mb-2 flex-row items-center">
                  <View className="w-11 h-11 rounded-full items-center justify-center mr-3" style={{ backgroundColor: member.color + '30' }}>
                    <Text className="font-bold text-sm" style={{ color: member.color }}>{member.avatar_initials}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-navy-800 font-medium">{member.name}</Text>
                    {member.role ? <Text className="text-gray-400 text-xs mt-0.5">{member.role}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => confirmDeleteStaff(member)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                className="border-2 border-dashed border-gray-200 rounded-xl p-4 items-center mt-2"
                onPress={() => setShowAddStaff(true)}
              >
                <Ionicons name="person-add-outline" size={24} color="#9ca3af" />
                <Text className="text-gray-400 text-sm mt-1">Add Someone</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      {/* ── Add Context Modal ── */}
      <Modal visible={showAddRoom} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center px-5 pt-4 pb-4 border-b border-gray-100">
            <TouchableOpacity onPress={() => setShowAddRoom(false)} className="mr-3">
              <Ionicons name="close" size={24} color="#1E3A5F" />
            </TouchableOpacity>
            <Text className="text-navy-800 text-lg font-bold flex-1">Add Context</Text>
          </View>

          {/* Simple add context form — just name, type, icon */}
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {/* Context type selector */}
            <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
              {CONTEXT_TYPES.map(({ type, label, icon }) => (
                <TouchableOpacity
                  key={type}
                  className={`mr-2 px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${selectedContextType === type ? 'bg-navy-800 border-navy-800' : 'bg-white border-gray-200'}`}
                  onPress={() => setSelectedContextType(type)}
                >
                  <Text className="text-sm">{icon}</Text>
                  <Text className={`text-sm font-medium ${selectedContextType === type ? 'text-white' : 'text-gray-600'}`}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Context name */}
            <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Name</Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base mb-6"
              value={roomNameInput}
              onChangeText={setRoomNameInput}
              placeholder="e.g. Conference Room A"
              autoFocus
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-4 border border-gray-200 rounded-xl items-center"
                onPress={() => setShowAddRoom(false)}
              >
                <Text className="text-gray-600 font-medium">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-4 rounded-xl items-center ${!roomNameInput.trim() ? 'bg-gray-300' : 'bg-navy-800'}`}
                onPress={saveRoom}
                disabled={!roomNameInput.trim()}
              >
                <Text className="text-white font-semibold">Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Add Staff Modal ── */}
      <Modal visible={showAddStaff} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-white p-6">
          <Text className="text-navy-800 text-xl font-bold mb-6">Add Someone</Text>

          <Text className="text-gray-600 text-sm mb-2 font-medium">Name</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 text-gray-800 mb-4"
            placeholder="e.g. Maria"
            value={newStaffName}
            onChangeText={setNewStaffName}
            autoFocus
          />

          <Text className="text-gray-600 text-sm mb-2 font-medium">Role (optional)</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 text-gray-800 mb-6"
            placeholder="e.g. Housekeeper"
            value={newStaffRole}
            onChangeText={setNewStaffRole}
          />

          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 py-4 border border-gray-200 rounded-xl items-center"
              onPress={() => setShowAddStaff(false)}
            >
              <Text className="text-gray-600 font-medium">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-4 bg-navy-800 rounded-xl items-center"
              onPress={addStaff}
            >
              <Text className="text-white font-semibold">Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
