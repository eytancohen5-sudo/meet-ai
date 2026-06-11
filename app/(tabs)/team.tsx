import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, TextInput, Modal,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { getStaff, upsertStaff, deleteStaff, getAllOpenTasks } from '../../lib/database';
import { TAB_SCREEN_EDGES } from '../../lib/ui';
import { StaffMember, SPEAKER_COLORS } from '../../types';
import { nanoid } from '../_utils';
import { PersonCard } from '../../components/PersonCard';
import { EmptyState } from '../../components/EmptyState';
import { NoticeBanner } from '../../components/NoticeBanner';

function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function TeamScreen() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState(false);

  // Add / edit sheet state. editingMember null = adding a new person.
  const [showPersonSheet, setShowPersonSheet] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [roleInput, setRoleInput] = useState('');

  const load = useCallback(async () => {
    try {
      const [stf, openTasks] = await Promise.all([getStaff(), getAllOpenTasks()]);
      const counts: Record<string, number> = {};
      for (const task of openTasks) {
        if (task.assigned_to) {
          counts[task.assigned_to] = (counts[task.assigned_to] ?? 0) + 1;
        }
      }
      setStaff(stf);
      setOpenCounts(counts);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Add / edit ───────────────────────────────────────────────────────────────

  const openAddPerson = () => {
    setEditingMember(null);
    setNameInput('');
    setRoleInput('');
    setShowPersonSheet(true);
  };

  const openEditPerson = (member: StaffMember) => {
    setEditingMember(member);
    setNameInput(member.name);
    setRoleInput(member.role);
    setShowPersonSheet(true);
  };

  const savePerson = async () => {
    const name = nameInput.trim();
    if (!name) return;
    const member: StaffMember = editingMember
      ? { ...editingMember, name, role: roleInput.trim(), avatar_initials: initialsFor(name) }
      : {
          id: nanoid(),
          name,
          role: roleInput.trim(),
          color: SPEAKER_COLORS[staff.length % SPEAKER_COLORS.length],
          avatar_initials: initialsFor(name),
          role_level: 'member',
        };
    await upsertStaff(member);
    setShowPersonSheet(false);
    await load();
  };

  // ── Remove ───────────────────────────────────────────────────────────────────

  const confirmRemovePerson = (member: StaffMember) => {
    Alert.alert(`Remove "${member.name}"?`, 'Their tasks stay and become Unassigned.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await deleteStaff(member.id);
          await load();
        },
      },
    ]);
  };

  // ── Per-card overflow: Edit name/role · Remove ───────────────────────────────

  const openPersonOverflow = (member: StaffMember) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Edit name/role', 'Remove'],
        cancelButtonIndex: 0,
        destructiveButtonIndex: 2,
      },
      (buttonIndex) => {
        if (buttonIndex === 1) openEditPerson(member);
        if (buttonIndex === 2) confirmRemovePerson(member);
      }
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={TAB_SCREEN_EDGES} className="flex-1 bg-bg">
      <View className="px-5 pt-4 pb-2">
        <Text className="text-text-primary text-2xl font-bold tracking-tight">Team</Text>
        <Text className="text-text-secondary text-sm mt-1">The people in your meetings.</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {loadError && (
          <View className="mb-3">
            <NoticeBanner
              variant="error"
              message="Couldn't load your team"
              actionLabel="Retry"
              onAction={load}
            />
          </View>
        )}

        {staff.length === 0 && !loadError ? (
          <EmptyState
            icon="person-add-outline"
            title="No team yet"
            body="Add people so tasks can land on someone."
            action={{ label: 'Add Someone', onPress: openAddPerson }}
          />
        ) : (
          <>
            {staff.map(member => (
              <PersonCard
                key={member.id}
                member={member}
                openTaskCount={openCounts[member.id]}
                onPress={() => router.navigate('/(tabs)/tasks')}
                onOverflow={() => openPersonOverflow(member)}
              />
            ))}
            <TouchableOpacity
              className="border-2 border-dashed border-border rounded-xl p-4 items-center mt-2"
              onPress={openAddPerson}
            >
              <Ionicons name="person-add-outline" size={24} color="#6B7280" />
              <Text className="text-text-secondary text-sm mt-1">Add Someone</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* ── Add / Edit Person Sheet ── */}
      <Modal visible={showPersonSheet} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-white p-6">
          <Text className="text-text-primary text-xl font-bold mb-6">
            {editingMember ? 'Edit name/role' : 'Add Someone'}
          </Text>

          <Text className="text-text-secondary text-sm mb-2 font-medium">Name</Text>
          <TextInput
            className="border border-border rounded-xl px-4 py-3 text-text-primary mb-4"
            placeholder="e.g. Maria"
            value={nameInput}
            onChangeText={setNameInput}
            autoFocus
          />

          <Text className="text-text-secondary text-sm mb-2 font-medium">Role (optional)</Text>
          <TextInput
            className="border border-border rounded-xl px-4 py-3 text-text-primary mb-6"
            placeholder="e.g. Housekeeper"
            value={roleInput}
            onChangeText={setRoleInput}
          />

          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 py-4 border border-border rounded-xl items-center"
              onPress={() => setShowPersonSheet(false)}
            >
              <Text className="text-text-secondary font-medium">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 py-4 rounded-xl items-center ${!nameInput.trim() ? 'bg-gray-300' : 'bg-brand-600'}`}
              onPress={savePerson}
              disabled={!nameInput.trim()}
            >
              <Text className="text-white font-semibold">{editingMember ? 'Save' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
