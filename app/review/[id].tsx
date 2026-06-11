import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Alert, Animated, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import {
  getSession, getTranscriptLines, getTasks, getIdeas, getIssues,
  getDecisions, getMediaItems, addTask, addIdea, addIssue, addDecision,
  updateTaskStatus, updateSession,
} from '../../lib/database';
import { organizeSession } from '../../lib/organization';
import { getContexts, getStaff } from '../../lib/database';
import { TaskCard } from '../../components/TaskCard';
import { TranscriptLineView } from '../../components/TranscriptLine';
import { Session, TranscriptLine, Task, Idea, Issue, Decision, MediaItem } from '../../types';
import { useSettings } from '../../stores/settings';
import { nanoid } from '../_utils';

type Tab = 'summary' | 'tasks' | 'transcript' | 'media';

const SEVERITY_COLOR = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { anthropicApiKey, isLoaded: settingsLoaded } = useSettings();

  const [session, setSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [organizing, setOrganizing] = useState(false);
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  // Auto-organize fires at most once per mount; manual taps bypass this guard.
  const autoOrganizeAttempted = useRef(false);

  // Audio playback
  const player = useAudioPlayer(session?.audio_uri ? { uri: session.audio_uri } : null);
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, [id]);

  // Auto-organize only after settings have loaded — never on the cold-start race
  // (a missing-key verdict before isLoaded would be a false alarm). With no key,
  // the inline "API key required" affordance renders instead of an alert loop.
  useEffect(() => {
    if (!settingsLoaded || organizing || autoOrganizeAttempted.current) return;
    if (!session || session.status !== 'processing') return;
    if (transcript.length === 0) return;
    if (!anthropicApiKey) return;
    autoOrganizeAttempted.current = true;
    triggerOrganization(session, transcript);
  }, [settingsLoaded, anthropicApiKey, session, transcript, organizing]);

  const loadAll = async () => {
    try {
      setLoadError('');
      const [sessRow, lines, t, i, iss, d, m] = await Promise.all([
        getSession(id),
        getTranscriptLines(id),
        getTasks(id),
        getIdeas(id),
        getIssues(id),
        getDecisions(id),
        getMediaItems(id),
      ]);

      // A 'processing' session with no transcript can never organize — close the
      // dead end by marking it complete instead of leaving it stuck forever.
      let sess = sessRow;
      if (sess && sess.status === 'processing' && lines.length === 0) {
        await updateSession(id, { status: 'complete' });
        sess = { ...sess, status: 'complete' };
      }

      setSession(sess);
      setTranscript(lines);
      setTasks(t);
      setIdeas(i);
      setIssues(iss);
      setDecisions(d);
      setMedia(m);
      setLoadState('ready');
    } catch (err: unknown) {
      console.error('Failed to load session:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
      setLoadState('error');
    }
  };

  const triggerOrganization = async (sess: Session, lines: TranscriptLine[]) => {
    if (organizing) return;
    if (lines.length === 0) return;
    // Warn if transcript is very long (>500 lines may hit token limits)
    if (lines.length > 500) {
      Alert.alert('Long Recording', `This session has ${lines.length} transcript lines. Organization may take longer.`, [{ text: 'OK' }]);
    }
    setOrganizing(true);
    setOrganizeError(null);
    try {
      const [locs, staff] = await Promise.all([getContexts(), getStaff()]);
      const result = await organizeSession(lines, staff, locs, sess.title, anthropicApiKey || undefined);

      // Save organized data
      const now = Date.now();
      await Promise.all([
        ...result.tasks.map(t =>
          addTask({
            id: nanoid(),
            session_id: id,
            title: t.title,
            assigned_to: t.assigned_to,
            location_id: t.location_id,
            status: 'open',
            priority: t.priority ?? 'medium',
            notes: t.notes,
            created_at: now,
          })
        ),
        ...result.ideas.map(i =>
          addIdea({ id: nanoid(), session_id: id, text: i.text, source: i.source, source_name: i.source_name ?? '', category: i.category, created_at: now })
        ),
        ...result.issues.map(i =>
          addIssue({ id: nanoid(), session_id: id, title: i.title, description: i.description, location_id: i.location_id, severity: i.severity ?? 'medium', status: 'open', created_at: now })
        ),
        ...result.decisions.map(d =>
          addDecision({ id: nanoid(), session_id: id, text: d.text, made_by: d.made_by ?? 'me', created_at: now })
        ),
        updateSession(id, { status: 'complete', summary: result.summary }),
      ]);

      await loadAll();
    } catch (err: unknown) {
      console.error('Organization failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      const lower = message.toLowerCase();
      const isApiKeyError = lower.includes('api key') || lower.includes('authentication') || lower.includes('401');
      // Do NOT force-complete here — the session stays in its current status so the
      // "Organize with AI" retry affordance remains available.
      if (isApiKeyError) {
        setOrganizeError('Your Anthropic API key is missing or was rejected. Add or fix it in Settings, then retry.');
        Alert.alert(
          'API Key Required',
          'Add your Anthropic API key in Settings to organize sessions.',
          [
            { text: 'Open Settings', onPress: () => router.push('/(tabs)/settings') },
            { text: 'Not Now', style: 'cancel' },
          ]
        );
      } else {
        setOrganizeError(message);
        Alert.alert('Could Not Organize', 'Something went wrong. Your transcript is safe — tap "Organize with AI" to retry.', [{ text: 'OK' }]);
      }
    } finally {
      setOrganizing(false);
    }
  };

  const handleOrganizePress = () => {
    if (!session) return;
    if (transcript.length === 0) {
      Alert.alert('Nothing to Organize', 'This session has no transcript lines, so there is nothing for the AI to organize.', [{ text: 'OK' }]);
      return;
    }
    if (settingsLoaded && !anthropicApiKey) {
      Alert.alert(
        'API Key Required',
        'Add your Anthropic API key in Settings to organize sessions.',
        [
          { text: 'Open Settings', onPress: () => router.push('/(tabs)/settings') },
          { text: 'Not Now', style: 'cancel' },
        ]
      );
      return;
    }
    triggerOrganization(session, transcript);
  };

  const handleTaskToggle = async (taskId: string, status: 'open' | 'done') => {
    await updateTaskStatus(taskId, status);
    const updated = tasks.map(t => t.id === taskId ? { ...t, status } : t);
    setTasks(updated);
  };

  const handleShare = async () => {
    if (!session) return;
    const lines = [
      `# ${session.title}`,
      `${new Date(session.started_at).toLocaleString()}`,
      session.context_name ? `Context: ${session.context_name}` : '',
      '',
      session.summary ? `## Summary\n${session.summary}` : '',
      '',
      tasks.length > 0 ? `## Tasks (${tasks.length})\n${tasks.map(t => `- [ ] ${t.title}${t.assigned_to_name ? ` → ${t.assigned_to_name}` : ''}`).join('\n')}` : '',
      '',
      ideas.length > 0 ? `## Ideas\n${ideas.map(i => `- ${i.text}`).join('\n')}` : '',
      '',
      issues.length > 0 ? `## Issues\n${issues.map(i => `- [${i.severity}] ${i.title}`).join('\n')}` : '',
      '',
      decisions.length > 0 ? `## Decisions\n${decisions.map(d => `- ${d.text}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    await Share.share({ message: lines, title: session.title });
  };

  const handleTranscriptLinePress = async (line: TranscriptLine) => {
    if (!session?.audio_uri || !player) return;
    try {
      setPlayingLineId(line.id);
      // Legacy lines stored epoch seconds (~1.77e9) in start_time; seeking there
      // lands past the end of the file. Treat clearly-out-of-range values as
      // legacy and start from 0; clamp every seek to [0, duration].
      const duration = player.duration; // seconds; 0 if not yet determined
      const isLegacy = line.start_time > 86400 || (duration > 0 && line.start_time > duration);
      let target = isLegacy ? 0 : line.start_time - 0.5;
      target = Math.max(0, target);
      if (duration > 0) target = Math.min(target, duration);
      player.seekTo(target);
      player.play();
      // Clear indicator after 5 seconds
      setTimeout(() => setPlayingLineId(null), 5000);
    } catch (err) {
      console.warn('Could not play audio:', err);
      setPlayingLineId(null);
    }
  };

  const stopPlayback = () => {
    player?.pause();
    setPlayingLineId(null);
  };

  if (loadState === 'error') {
    return (
      <SafeAreaView className="flex-1 bg-bg items-center justify-center px-8">
        <Ionicons name="alert-circle-outline" size={44} color="#ef4444" />
        <Text className="text-text-primary font-bold text-base mt-3">Couldn't load this session</Text>
        {loadError ? (
          <Text className="text-text-secondary text-sm mt-1 text-center">{loadError}</Text>
        ) : null}
        <TouchableOpacity className="bg-brand-600 rounded-xl px-6 py-3 mt-5" onPress={loadAll}>
          <Text className="text-white font-semibold text-sm">Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity className="mt-4" onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text className="text-text-secondary text-sm">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!session) {
    if (loadState === 'ready') {
      return (
        <SafeAreaView className="flex-1 bg-bg items-center justify-center px-8">
          <Ionicons name="help-circle-outline" size={44} color="#9CA3AF" />
          <Text className="text-text-primary font-bold text-base mt-3">Session not found</Text>
          <Text className="text-text-secondary text-sm mt-1 text-center">This session may have been deleted.</Text>
          <TouchableOpacity className="bg-brand-600 rounded-xl px-6 py-3 mt-5" onPress={() => router.back()}>
            <Text className="text-white font-semibold text-sm">Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#3B5BDB" size="large" />
      </SafeAreaView>
    );
  }

  const openCount = tasks.filter(t => t.status === 'open').length;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      {/* Header */}
      <View className="px-5 pt-3 pb-4">
        <View className="flex-row items-center mb-2">
          <TouchableOpacity onPress={() => router.back()} className="mr-3" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#1A1D23" />
          </TouchableOpacity>
          <Text className="text-text-primary text-lg font-bold flex-1" numberOfLines={1}>{session.title}</Text>
          <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="share-outline" size={22} color="#1A1D23" />
          </TouchableOpacity>
        </View>
        <View className="flex-row gap-3 flex-wrap">
          {session.context_name && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="location-outline" size={12} color="#6B7280" />
              <Text className="text-text-secondary text-xs">{session.context_name}</Text>
            </View>
          )}
          <View className="flex-row items-center gap-1">
            <Ionicons name="calendar-outline" size={12} color="#6B7280" />
            <Text className="text-text-secondary text-xs">
              {new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
          {openCount > 0 && (
            <View className="flex-row items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full">
              <Text className="text-amber-700 text-xs font-medium">{openCount} open task{openCount !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Organizing overlay */}
      {organizing && (
        <View className="absolute inset-0 bg-black/50 z-50 items-center justify-center">
          <View className="bg-white rounded-2xl p-6 items-center mx-8">
            <ActivityIndicator color="#3B5BDB" size="large" />
            <Text className="text-text-primary font-semibold text-base mt-4">Reading the room...</Text>
            <Text className="text-text-secondary text-sm mt-1 text-center">Sorting out what matters.</Text>
          </View>
        </View>
      )}

      <View className="flex-1 bg-bg">
        {/* Tab Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, gap: 8 }}
          className="max-h-14"
        >
          {([
            { id: 'summary', label: 'Summary', icon: 'sparkles-outline' },
            { id: 'tasks', label: `Tasks (${tasks.length})`, icon: 'checkbox-outline' },
            { id: 'transcript', label: 'Transcript', icon: 'chatbubbles-outline' },
            { id: 'media', label: `Media (${media.length})`, icon: 'images-outline' },
          ] as const).map(tab => (
            <TouchableOpacity
              key={tab.id}
              className={`flex-row items-center gap-1.5 px-4 py-2 rounded-full border ${activeTab === tab.id ? 'bg-brand-600 border-brand-600' : 'bg-white border-border'}`}
              onPress={() => setActiveTab(tab.id as Tab)}
            >
              <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.id ? 'white' : '#6B7280'} />
              <Text className={`text-sm font-medium ${activeTab === tab.id ? 'text-white' : 'text-text-secondary'}`}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content */}
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'summary' && (
            <View>
              {/* Missing API key — loud, with a path to Settings */}
              {settingsLoaded && !anthropicApiKey && !session.summary && transcript.length > 0 && (
                <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Ionicons name="key-outline" size={16} color="#dc2626" />
                    <Text className="text-red-700 font-semibold text-sm">API key required</Text>
                  </View>
                  <Text className="text-red-600 text-xs leading-relaxed">
                    Add your Anthropic API key in Settings to organize this session with AI.
                  </Text>
                  <TouchableOpacity
                    className="bg-red-600 rounded-xl px-4 py-2 mt-3 self-start"
                    onPress={() => router.push('/(tabs)/settings')}
                  >
                    <Text className="text-white text-sm font-semibold">Open Settings</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Last organize attempt failed — visible, recoverable */}
              {organizeError && !organizing ? (
                <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Ionicons name="warning-outline" size={16} color="#dc2626" />
                    <Text className="text-red-700 font-semibold text-sm">Organization failed</Text>
                  </View>
                  <Text className="text-red-600 text-xs leading-relaxed">{organizeError}</Text>
                  <Text className="text-text-secondary text-xs mt-1">
                    Your transcript is safe — tap "Organize with AI" below to retry.
                  </Text>
                </View>
              ) : null}

              {/* Summary */}
              {session.summary ? (
                <View className="bg-white rounded-2xl border border-border p-4 mb-4">
                  <View className="flex-row items-center gap-2 mb-2">
                    <Ionicons name="sparkles-outline" size={16} color="#D97706" />
                    <Text className="text-text-primary font-semibold text-sm">AI Summary</Text>
                  </View>
                  <Text className="text-text-secondary text-sm leading-relaxed">{session.summary}</Text>
                </View>
              ) : null}

              {/* Quick stats */}
              <View className="flex-row gap-3 mb-4">
                {[
                  { label: 'Tasks', count: tasks.length, color: '#E06C1A', icon: 'checkbox-outline' },
                  { label: 'Ideas', count: ideas.length, color: '#D97706', icon: 'bulb-outline' },
                  { label: 'Issues', count: issues.length, color: '#ef4444', icon: 'warning-outline' },
                ].map(stat => (
                  <View key={stat.label} className="flex-1 bg-white rounded-2xl border border-border p-3 items-center">
                    <Ionicons name={stat.icon as any} size={20} color={stat.color} />
                    <Text className="text-2xl font-bold text-text-primary mt-1">{stat.count}</Text>
                    <Text className="text-text-secondary text-xs">{stat.label}</Text>
                  </View>
                ))}
              </View>

              {/* Top tasks preview */}
              {tasks.filter(t => t.status === 'open').length > 0 && (
                <View className="mb-4">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide">Open Tasks</Text>
                    {tasks.filter(t => t.status === 'open').length > 3 && (
                      <TouchableOpacity onPress={() => setActiveTab('tasks')}>
                        <Text className="text-brand-600 text-xs font-medium">See all →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {tasks.filter(t => t.status === 'open').slice(0, 3).map(task => (
                    <View key={task.id} className="bg-white rounded-xl border border-border p-3 mb-2 flex-row items-start gap-3">
                      <View className="w-5 h-5 rounded border-2 border-gray-300 mt-0.5" />
                      <View className="flex-1">
                        <Text className="text-text-primary text-sm font-medium">{task.title}</Text>
                        {task.assigned_to_name && (
                          <Text className="text-text-secondary text-xs mt-0.5">→ {task.assigned_to_name}</Text>
                        )}
                      </View>
                      <View className={`px-2 py-0.5 rounded-full ${task.priority === 'high' ? 'bg-red-50' : task.priority === 'low' ? 'bg-green-50' : 'bg-amber-50'}`}>
                        <Text className={`text-xs font-medium ${task.priority === 'high' ? 'text-red-600' : task.priority === 'low' ? 'text-green-600' : 'text-amber-600'}`}>
                          {task.priority}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Issues */}
              {issues.length > 0 && (
                <View className="mb-4">
                  <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-2">Issues</Text>
                  {issues.map(issue => (
                    <View key={issue.id} className="bg-white rounded-xl border border-border p-3 mb-2">
                      <View className="flex-row items-center gap-2">
                        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[issue.severity] }} />
                        <Text className="text-text-primary font-medium text-sm flex-1">{issue.title}</Text>
                        {issue.location_name && (
                          <Text className="text-text-secondary text-xs">{issue.location_name}</Text>
                        )}
                      </View>
                      {issue.description && (
                        <Text className="text-text-secondary text-xs mt-1 ml-4">{issue.description}</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Ideas */}
              {ideas.length > 0 && (
                <View className="mb-4">
                  <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-2">Ideas</Text>
                  {ideas.map(idea => (
                    <View key={idea.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-2 flex-row gap-2">
                      <Text className="text-lg">💡</Text>
                      <View className="flex-1">
                        <Text className="text-text-primary text-sm">{idea.text}</Text>
                        {idea.category && (
                          <Text className="text-amber-500 text-xs mt-1 capitalize">{idea.category}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Decisions */}
              {decisions.length > 0 && (
                <View className="mb-4">
                  <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-2">Decisions</Text>
                  {decisions.map(d => (
                    <View key={d.id} className="bg-green-50 border border-green-100 rounded-xl p-3 mb-2 flex-row gap-2">
                      <Ionicons name="checkmark-done-outline" size={16} color="#15803d" />
                      <Text className="flex-1 text-text-primary text-sm">{d.text}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!session.summary && !organizing && (
                transcript.length === 0 ? (
                  <View className="border-2 border-dashed border-border rounded-2xl p-6 items-center">
                    <Ionicons name="mic-off-outline" size={28} color="#9CA3AF" />
                    <Text className="text-text-primary font-semibold mt-2">Nothing to organize</Text>
                    <Text className="text-text-secondary text-xs mt-1 text-center">
                      No transcript was captured in this session, so there is nothing for the AI to organize.
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    className="border-2 border-dashed border-border rounded-2xl p-6 items-center"
                    onPress={handleOrganizePress}
                  >
                    <Ionicons name="sparkles-outline" size={28} color="#D97706" />
                    <Text className="text-text-primary font-semibold mt-2">Organize with AI</Text>
                    <Text className="text-text-secondary text-xs mt-1 text-center">Pull what matters out of the transcript.</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          )}

          {activeTab === 'tasks' && (
            <View>
              {tasks.length === 0 ? (
                <View className="items-center py-12">
                  <Ionicons name="checkbox-outline" size={40} color="#E5E7EB" />
                  <Text className="text-text-secondary text-sm mt-3 text-center">No tasks found.</Text>
                </View>
              ) : (
                tasks.map(task => (
                  <TaskCard key={task.id} task={task} onToggle={handleTaskToggle} />
                ))
              )}
            </View>
          )}

          {activeTab === 'transcript' && (
            <View>
              {player?.playing && (
                <TouchableOpacity
                  className="flex-row items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl p-3 mb-3"
                  onPress={stopPlayback}
                >
                  <View className="w-2 h-2 rounded-full bg-red-500" />
                  <Text className="text-text-primary text-sm flex-1">Playing audio</Text>
                  <Ionicons name="stop-circle-outline" size={18} color="#3B5BDB" />
                </TouchableOpacity>
              )}
              {transcript.length === 0 ? (
                <View className="items-center py-12">
                  <Ionicons name="chatbubbles-outline" size={40} color="#E5E7EB" />
                  <Text className="text-text-secondary text-sm mt-3">Nothing recorded.</Text>
                </View>
              ) : (
                transcript.map(line => (
                  <View key={line.id} style={{ opacity: playingLineId === line.id ? 0.7 : 1 }}>
                    <TranscriptLineView
                      line={line}
                      isOwner={line.speaker_id === 'me'}
                      onPress={session.audio_uri ? handleTranscriptLinePress : undefined}
                    />
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'media' && (
            <View>
              {media.length === 0 ? (
                <View className="items-center py-12">
                  <Ionicons name="images-outline" size={40} color="#E5E7EB" />
                  <Text className="text-text-secondary text-sm mt-3">No media attached</Text>
                </View>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {media.map(item => (
                    <View key={item.id} className="w-[48%] aspect-square bg-bg rounded-xl overflow-hidden">
                      {item.thumbnail_uri || item.type === 'photo' ? (
                        <Image
                          source={{ uri: item.thumbnail_uri || item.uri }}
                          className="w-full h-full"
                          resizeMode="cover"
                          accessibilityLabel={item.note || (item.type === 'video' ? 'Video thumbnail' : 'Session photo')}
                        />
                      ) : null}
                      {item.note && (
                        <View className="absolute bottom-0 left-0 right-0 bg-black/50 p-2 z-10">
                          <Text className="text-white text-xs">{item.note}</Text>
                        </View>
                      )}
                      {item.type === 'video' && (
                        <View className="absolute inset-0 items-center justify-center z-10">
                          <Ionicons name="play-circle" size={36} color="white" />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
