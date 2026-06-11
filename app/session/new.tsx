import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  getContexts, getStaff, createSession, addParticipant,
  upsertContext, upsertStaff,
} from '../../lib/database';
import { Context, StaffMember, SPEAKER_COLORS } from '../../types';
import { useActiveSession } from '../../stores/session';
import { PersonChip } from '../../components/PersonChip';
import { NoticeBanner } from '../../components/NoticeBanner';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { nanoid } from '../_utils';

// Pre-flight sheet (Phase 3, screen 5): one breath between tap and record.
// Everything above the Start button is optional — zero required fields.
export default function NewSessionScreen() {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedContext, setSelectedContext] = useState<Context | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [starting, setStarting] = useState(false);

  // Inline creation — people and places are added right here, no detour to another screen.
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [addingPlace, setAddingPlace] = useState(false);
  const [newPlaceName, setNewPlaceName] = useState('');

  // 'mic' = permission denied (Open Settings deep link); 'start' = start failure.
  const [banner, setBanner] = useState<'mic' | 'start' | null>(null);

  const startSession = useActiveSession(s => s.startSession);

  useEffect(() => {
    Promise.all([getContexts(), getStaff()]).then(([ctxs, stf]) => {
      setContexts(ctxs);
      setStaff(stf);
    });
    const now = new Date();
    setTitle(`Walkthrough ${now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`);
  }, []);

  const toggleStaff = (id: string) => {
    const next = new Set(selectedStaff);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStaff(next);
  };

  const handleAddPerson = async () => {
    const name = newPersonName.trim();
    if (!name) return;
    const member: StaffMember = {
      id: nanoid(),
      name,
      role: '',
      color: SPEAKER_COLORS[staff.length % SPEAKER_COLORS.length],
      avatar_initials: name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2),
      role_level: 'member',
    };
    await upsertStaff(member);
    setStaff(await getStaff());
    // They were just added from the pre-flight sheet — they're in the room.
    setSelectedStaff(prev => new Set(prev).add(member.id));
    setNewPersonName('');
    setAddingPerson(false);
  };

  const handleAddPlace = async () => {
    const name = newPlaceName.trim();
    if (!name) return;
    // Name-only creation; NOT NULL defaults per challenger amendment 8.
    const ctx: Context = {
      id: nanoid(),
      name,
      icon: '📍',
      color: '#3B5BDB',
      context_type: 'space',
    };
    await upsertContext(ctx);
    setContexts(await getContexts());
    setSelectedContext(ctx);
    setNewPlaceName('');
    setAddingPlace(false);
  };

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    setBanner(null);

    // Phase 2 flow kept intact: requests BOTH microphone and speech recognition
    // permissions on iOS (network-based recognition needs SFSpeechRecognizer
    // authorization too).
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setBanner('mic');
      setStarting(false);
      return;
    }

    try {
      const sessionId = nanoid();
      const participantIds = Array.from(selectedStaff);

      await createSession({
        id: sessionId,
        title: title.trim() || 'Walkthrough',
        context_id: selectedContext?.id,
        started_at: Date.now(),
        status: 'recording',
      });

      for (const staffId of participantIds) {
        await addParticipant(sessionId, staffId);
      }

      // Recording is started by the session screen's useAudioRecorder hook;
      // permissions are requested here before navigating.
      startSession(
        sessionId,
        selectedContext?.id ?? null,
        selectedContext?.name ?? null,
        participantIds
      );

      router.replace(`/session/${sessionId}`);
    } catch (err) {
      console.error(err);
      setBanner('start');
      setStarting(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Auto-title — editable in place */}
        <View className="flex-row items-center gap-2 mb-6">
          <TextInput
            className="flex-1 text-text-primary text-lg font-semibold p-0"
            value={title}
            onChangeText={setTitle}
            placeholder="Session title"
            placeholderTextColor="#6B7280"
            returnKeyType="done"
          />
          <Ionicons name="create-outline" size={18} color="#6B7280" />
        </View>

        {/* People */}
        <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3">
          Who's with you?
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {staff.map(member => (
            <PersonChip
              key={member.id}
              member={member}
              selected={selectedStaff.has(member.id)}
              onToggle={() => toggleStaff(member.id)}
            />
          ))}
          <TouchableOpacity
            className="flex-row items-center gap-1 px-3 py-2 rounded-full border border-dashed border-border bg-white"
            onPress={() => setAddingPerson(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={14} color="#3B5BDB" />
            <Text className="text-brand-600 text-sm font-medium">Add</Text>
          </TouchableOpacity>
        </View>
        {addingPerson && (
          <View className="flex-row items-center gap-2 mt-3">
            <TextInput
              className="flex-1 bg-bg border border-border rounded-xl px-4 py-2.5 text-text-primary text-base"
              value={newPersonName}
              onChangeText={setNewPersonName}
              placeholder="Name"
              placeholderTextColor="#6B7280"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddPerson}
            />
            <TouchableOpacity
              className="bg-brand-600 rounded-xl px-4 py-2.5"
              onPress={handleAddPerson}
            >
              <Text className="text-white font-semibold text-sm">Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setAddingPerson(false); setNewPersonName(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        )}

        {/* Places — no "Ask me" chip: unselected simply means no place */}
        <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mt-6 mb-3">
          Where are you?
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {contexts.map(ctx => (
            <PersonChip
              key={ctx.id}
              label={ctx.name}
              icon={ctx.icon}
              selected={selectedContext?.id === ctx.id}
              onToggle={() => setSelectedContext(selectedContext?.id === ctx.id ? null : ctx)}
            />
          ))}
          <TouchableOpacity
            className="flex-row items-center gap-1 px-3 py-2 rounded-full border border-dashed border-border bg-white"
            onPress={() => setAddingPlace(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={14} color="#3B5BDB" />
            <Text className="text-brand-600 text-sm font-medium">New place</Text>
          </TouchableOpacity>
        </View>
        {addingPlace && (
          <View className="flex-row items-center gap-2 mt-3">
            <TextInput
              className="flex-1 bg-bg border border-border rounded-xl px-4 py-2.5 text-text-primary text-base"
              value={newPlaceName}
              onChangeText={setNewPlaceName}
              placeholder="Place name"
              placeholderTextColor="#6B7280"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddPlace}
            />
            <TouchableOpacity
              className="bg-brand-600 rounded-xl px-4 py-2.5"
              onPress={handleAddPlace}
            >
              <Text className="text-white font-semibold text-sm">Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setAddingPlace(false); setNewPlaceName(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Start — the one primary action, in the thumb zone */}
      <View className="px-5 pt-2 pb-3">
        {banner === 'mic' && (
          <View className="mb-3">
            <NoticeBanner
              variant="error"
              message="Microphone is off for Meet AI"
              actionLabel="Open Settings"
              onAction={() => Linking.openSettings()}
            />
          </View>
        )}
        {banner === 'start' && (
          <View className="mb-3">
            <NoticeBanner
              variant="error"
              message="Couldn't start the session — try again."
            />
          </View>
        )}
        <TouchableOpacity
          className={`py-4 rounded-2xl items-center flex-row justify-center gap-2 bg-recording ${starting ? 'opacity-50' : ''}`}
          onPress={handleStart}
          disabled={starting}
        >
          <Ionicons name="mic" size={22} color="white" />
          <Text className="text-white font-bold text-lg">
            {starting ? 'Starting...' : 'Start Recording'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
