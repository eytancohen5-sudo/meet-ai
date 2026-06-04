import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, SafeAreaView, TextInput, Modal,
  Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getLocations, upsertLocation, deleteLocation, getStaff, upsertStaff, deleteStaff } from '../../lib/database';
import { describeRoomForRegistration } from '../../lib/vision';
import { Location, StaffMember, SPEAKER_COLORS } from '../../types';
import { useSettings } from '../../stores/settings';
import { nanoid } from '../_utils';

export default function RoomsScreen() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [tab, setTab] = useState<'rooms' | 'staff'>('rooms');

  // Add room flow state
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [addStep, setAddStep] = useState<'photo' | 'confirm'>('photo');
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [savedImageUri, setSavedImageUri] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ suggested_name: string; description: string; icon: string } | null>(null);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [identifying, setIdentifying] = useState(false);

  // Add staff state
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('');

  const { anthropicApiKey } = useSettings();

  const load = useCallback(async () => {
    const [locs, stf] = await Promise.all([getLocations(), getStaff()]);
    setLocations(locs);
    setStaff(stf);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Add room flow ────────────────────────────────────────────────────────────

  const openAddRoom = () => {
    setAddStep('photo');
    setCapturedImageUri(null);
    setSavedImageUri(null);
    setAiResult(null);
    setRoomNameInput('');
    setShowAddRoom(true);
  };

  const handleTakePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const tempUri = result.assets[0].uri;
    setCapturedImageUri(tempUri);
    analyzePhoto(tempUri);
  };

  const handlePickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const tempUri = result.assets[0].uri;
    setCapturedImageUri(tempUri);
    analyzePhoto(tempUri);
  };

  const analyzePhoto = async (uri: string) => {
    setIdentifying(true);
    setAddStep('confirm');
    try {
      const result = await describeRoomForRegistration(uri, anthropicApiKey || undefined);
      setAiResult(result);
      setRoomNameInput(result.suggested_name);
    } catch (err) {
      console.error('Vision error:', err);
      Alert.alert('Could not identify room', 'AI analysis failed. You can still name it manually.');
      setAiResult({ suggested_name: 'New Room', description: '', icon: '📍' });
      setRoomNameInput('New Room');
    } finally {
      setIdentifying(false);
    }
  };

  const saveRoom = async () => {
    if (!roomNameInput.trim()) return;

    // Persist image to documents directory so it survives cache clears
    let persistedUri = capturedImageUri;
    if (capturedImageUri) {
      try {
        const roomId = nanoid();
        const destDir = `${FileSystem.documentDirectory}rooms/`;
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
        const dest = `${destDir}${roomId}.jpg`;
        await FileSystem.copyAsync({ from: capturedImageUri, to: dest });
        persistedUri = dest;
      } catch (err) {
        console.warn('Could not persist room image:', err);
      }
    }

    const loc: Location = {
      id: nanoid(),
      name: roomNameInput.trim(),
      icon: aiResult?.icon ?? '📍',
      color: '#6E8FAC',
      reference_image_uri: persistedUri ?? undefined,
      ai_description: aiResult?.description ?? undefined,
    };
    await upsertLocation(loc);
    setShowAddRoom(false);
    await load();
  };

  const confirmDeleteRoom = (loc: Location) => {
    Alert.alert('Delete Room', `Remove "${loc.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          // Delete persisted image if it exists
          if (loc.reference_image_uri?.startsWith(FileSystem.documentDirectory ?? '')) {
            await FileSystem.deleteAsync(loc.reference_image_uri, { idempotent: true });
          }
          await deleteLocation(loc.id);
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
        <Text className="text-white text-2xl font-bold tracking-tight">Your Villa</Text>
        <Text className="text-navy-400 text-sm mt-1">Rooms, spaces & staff</Text>
      </View>

      <View className="flex-1 bg-villa-bg rounded-t-3xl">
        {/* Tabs */}
        <View className="flex-row mx-4 mt-4 bg-gray-100 rounded-xl p-1">
          {(['rooms', 'staff'] as const).map(t => (
            <TouchableOpacity
              key={t}
              className={`flex-1 py-2.5 rounded-lg items-center ${tab === t ? 'bg-white shadow-sm' : ''}`}
              onPress={() => setTab(t)}
            >
              <Text className={`text-sm font-medium ${tab === t ? 'text-navy-800' : 'text-gray-500'}`}>
                {t === 'rooms' ? `Rooms (${locations.length})` : `Staff (${staff.length})`}
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
              {locations.map(loc => (
                <View key={loc.id} className="bg-white rounded-2xl border border-villa-border mb-3 overflow-hidden">
                  {/* Room photo or placeholder */}
                  {loc.reference_image_uri ? (
                    <Image
                      source={{ uri: loc.reference_image_uri }}
                      className="w-full h-36"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="w-full h-28 bg-gray-100 items-center justify-center">
                      <Text className="text-5xl">{loc.icon}</Text>
                      <Text className="text-gray-400 text-xs mt-2">No photo yet</Text>
                    </View>
                  )}

                  <View className="p-3 flex-row items-center">
                    <Text className="text-xl mr-2">{loc.icon}</Text>
                    <View className="flex-1">
                      <Text className="text-navy-800 font-semibold">{loc.name}</Text>
                      {loc.ai_description ? (
                        <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={2}>
                          {loc.ai_description}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmDeleteRoom(loc)}
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
                  <Ionicons name="camera-outline" size={24} color="#1E3A5F" />
                </View>
                <Text className="text-navy-800 font-semibold text-sm">Add Room with Photo</Text>
                <Text className="text-gray-400 text-xs mt-1 text-center">
                  Take a photo — AI will identify the space automatically
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {staff.map(member => (
                <View key={member.id} className="bg-white rounded-xl border border-villa-border p-4 mb-2 flex-row items-center">
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
                <Text className="text-gray-400 text-sm mt-1">Add Staff Member</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      {/* ── Add Room Modal ── */}
      <Modal visible={showAddRoom} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center px-5 pt-4 pb-4 border-b border-gray-100">
            <TouchableOpacity onPress={() => setShowAddRoom(false)} className="mr-3">
              <Ionicons name="close" size={24} color="#1E3A5F" />
            </TouchableOpacity>
            <Text className="text-navy-800 text-lg font-bold flex-1">
              {addStep === 'photo' ? 'Add a Room' : 'Confirm Room'}
            </Text>
          </View>

          {addStep === 'photo' ? (
            /* Step 1: Take or choose a photo */
            <View className="flex-1 px-5 pt-8">
              <View className="bg-navy-50 rounded-2xl p-5 mb-6 items-center">
                <View className="w-16 h-16 bg-navy-100 rounded-full items-center justify-center mb-3">
                  <Ionicons name="camera" size={32} color="#1E3A5F" />
                </View>
                <Text className="text-navy-800 font-semibold text-base text-center">
                  Point your camera at the room
                </Text>
                <Text className="text-navy-400 text-sm mt-2 text-center leading-relaxed">
                  Claude will automatically identify the space and name it for you
                </Text>
              </View>

              <TouchableOpacity
                className="bg-navy-800 rounded-2xl py-4 items-center flex-row justify-center gap-3 mb-3"
                onPress={handleTakePhoto}
                style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }}
              >
                <Ionicons name="camera" size={22} color="white" />
                <Text className="text-white font-bold text-base">Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="border border-gray-200 rounded-2xl py-4 items-center flex-row justify-center gap-3"
                onPress={handlePickFromLibrary}
              >
                <Ionicons name="images-outline" size={22} color="#4b5563" />
                <Text className="text-gray-700 font-medium text-base">Choose from Library</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Step 2: Confirm name & save */
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              {/* Photo preview */}
              {capturedImageUri && (
                <View className="rounded-2xl overflow-hidden mb-5 border border-gray-100">
                  <Image
                    source={{ uri: capturedImageUri }}
                    style={{ width: '100%', height: 200 }}
                    resizeMode="cover"
                  />
                  {identifying && (
                    <View className="absolute inset-0 bg-black/40 items-center justify-center">
                      <ActivityIndicator color="white" size="large" />
                      <Text className="text-white font-medium mt-3">Analysing room...</Text>
                    </View>
                  )}
                </View>
              )}

              {/* AI result badge */}
              {aiResult && !identifying && (
                <View className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 flex-row gap-2">
                  <Ionicons name="sparkles-outline" size={18} color="#15803d" />
                  <View className="flex-1">
                    <Text className="text-green-800 font-medium text-sm">AI identified this room</Text>
                    <Text className="text-green-600 text-xs mt-1 leading-relaxed">
                      {aiResult.description}
                    </Text>
                  </View>
                </View>
              )}

              {/* Room name */}
              <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Room Name</Text>
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base mb-6"
                value={roomNameInput}
                onChangeText={setRoomNameInput}
                placeholder="e.g. Master Bedroom"
                editable={!identifying}
                autoFocus={!identifying}
              />

              {/* Retake button */}
              <TouchableOpacity
                className="flex-row items-center justify-center gap-2 mb-4"
                onPress={() => { setAddStep('photo'); setCapturedImageUri(null); setAiResult(null); }}
              >
                <Ionicons name="refresh-outline" size={16} color="#6b7280" />
                <Text className="text-gray-500 text-sm">Take a different photo</Text>
              </TouchableOpacity>

              <View className="flex-row gap-3">
                <TouchableOpacity
                  className="flex-1 py-4 border border-gray-200 rounded-xl items-center"
                  onPress={() => setShowAddRoom(false)}
                >
                  <Text className="text-gray-600 font-medium">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 py-4 rounded-xl items-center ${identifying || !roomNameInput.trim() ? 'bg-gray-300' : 'bg-navy-800'}`}
                  onPress={saveRoom}
                  disabled={identifying || !roomNameInput.trim()}
                >
                  <Text className="text-white font-semibold">Save Room</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Add Staff Modal ── */}
      <Modal visible={showAddStaff} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-white p-6">
          <Text className="text-navy-800 text-xl font-bold mb-6">Add Staff Member</Text>

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
              <Text className="text-white font-semibold">Add Staff</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
