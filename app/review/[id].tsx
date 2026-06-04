import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Share, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import {
  getSession, getTranscriptLines, getTasks, getIdeas, getIssues,
  getDecisions, getMediaItems, addTask, addIdea, addIssue, addDecision,
  updateTaskStatus, updateSession,
} from '../../lib/database';
import { organizeSession } from '../../lib/organization';
import { syncSessionToSupabase, syncTaskUpdate } from '../../lib/sync';
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
  const { anthropicApiKey } = useSettings();

  const [session, setSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [organizing, setOrganizing] = useState(false);

  // Audio playback
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
    return () => { soundRef.current?.unloadAsync(); };
  }, [id]);

  const loadAll = async () => {
    const [sess, lines, t, i, iss, d, m] = await Promise.all([
      getSession(id),
      getTranscriptLines(id),
      getTasks(id),
      getIdeas(id),
      getIssues(id),
      getDecisions(id),
      getMediaItems(id),
    ]);
    setSession(sess);
    setTranscript(lines);
    setTasks(t);
    setIdeas(i);
    setIssues(iss);
    setDecisions(d);
    setMedia(m);

    // Auto-organize if processing and we have a transcript
    if (sess?.status === 'processing' && lines.length > 0) {
      triggerOrganization(sess, lines);
    }
  };

  const triggerOrganization = async (sess: Session, lines: TranscriptLine[]) => {
    if (organizing) return;
    setOrganizing(true);
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
      syncSessionToSupabase(id).catch(console.warn); // non-blocking

      await loadAll();
    } catch (err) {
      console.error('Organization failed:', err);
      await updateSession(id, { status: 'complete' });
      await loadAll();
    } finally {
      setOrganizing(false);
    }
  };

  const handleTaskToggle = async (taskId: string, status: 'open' | 'done') => {
    await updateTaskStatus(taskId, status);
    syncTaskUpdate(taskId, status).catch(console.warn); // non-blocking
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

  const playAudioFromTime = async (startTime: number) => {
    if (!session?.audio_uri) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: session.audio_uri },
        { positionMillis: Math.max(0, startTime * 1000 - 500), shouldPlay: true }
      );
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          setPlaying(false);
          setPlayingLineId(null);
        }
      });
    } catch (err) {
      console.warn('Could not play audio:', err);
    }
  };

  const handleTranscriptLinePress = async (line: TranscriptLine) => {
    if (!session?.audio_uri) return;
    setPlayingLineId(line.id);
    await playAudioFromTime(line.start_time);
  };

  const stopPlayback = async () => {
    await soundRef.current?.stopAsync();
    setPlaying(false);
    setPlayingLineId(null);
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1 bg-navy-800 items-center justify-center">
        <ActivityIndicator color="white" size="large" />
      </SafeAreaView>
    );
  }

  const openCount = tasks.filter(t => t.status === 'open').length;

  return (
    <SafeAreaView className="flex-1 bg-navy-800">
      {/* Header */}
      <View className="px-5 pt-3 pb-4">
        <View className="flex-row items-center mb-2">
          <TouchableOpacity onPress={() => router.back()} className="mr-3" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-bold flex-1" numberOfLines={1}>{session.title}</Text>
          <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="share-outline" size={22} color="white" />
          </TouchableOpacity>
        </View>
        <View className="flex-row gap-3 flex-wrap">
          {session.context_name && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="location-outline" size={12} color="#9cb3c9" />
              <Text className="text-navy-400 text-xs">{session.context_name}</Text>
            </View>
          )}
          <View className="flex-row items-center gap-1">
            <Ionicons name="calendar-outline" size={12} color="#9cb3c9" />
            <Text className="text-navy-400 text-xs">
              {new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
          {openCount > 0 && (
            <View className="flex-row items-center gap-1 bg-orange-400/20 px-2 py-0.5 rounded-full">
              <Text className="text-orange-400 text-xs font-medium">{openCount} open task{openCount !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Organizing overlay */}
      {organizing && (
        <View className="absolute inset-0 bg-black/50 z-50 items-center justify-center">
          <View className="bg-white rounded-2xl p-6 items-center mx-8">
            <ActivityIndicator color="#1E3A5F" size="large" />
            <Text className="text-navy-800 font-semibold text-base mt-4">Reading the room...</Text>
            <Text className="text-gray-400 text-sm mt-1 text-center">Sorting out what matters.</Text>
          </View>
        </View>
      )}

      <View className="flex-1 bg-villa-bg rounded-t-3xl">
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
              className={`flex-row items-center gap-1.5 px-4 py-2 rounded-full border ${activeTab === tab.id ? 'bg-navy-800 border-navy-800' : 'bg-white border-gray-200'}`}
              onPress={() => setActiveTab(tab.id as Tab)}
            >
              <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.id ? 'white' : '#6b7280'} />
              <Text className={`text-sm font-medium ${activeTab === tab.id ? 'text-white' : 'text-gray-600'}`}>
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
              {/* Summary */}
              {session.summary ? (
                <View className="bg-white rounded-2xl border border-villa-border p-4 mb-4">
                  <View className="flex-row items-center gap-2 mb-2">
                    <Ionicons name="sparkles-outline" size={16} color="#C9A84C" />
                    <Text className="text-navy-800 font-semibold text-sm">AI Summary</Text>
                  </View>
                  <Text className="text-gray-700 text-sm leading-relaxed">{session.summary}</Text>
                </View>
              ) : null}

              {/* Quick stats */}
              <View className="flex-row gap-3 mb-4">
                {[
                  { label: 'Tasks', count: tasks.length, color: '#E06C1A', icon: 'checkbox-outline' },
                  { label: 'Ideas', count: ideas.length, color: '#C9A84C', icon: 'bulb-outline' },
                  { label: 'Issues', count: issues.length, color: '#ef4444', icon: 'warning-outline' },
                ].map(stat => (
                  <View key={stat.label} className="flex-1 bg-white rounded-2xl border border-villa-border p-3 items-center">
                    <Ionicons name={stat.icon as any} size={20} color={stat.color} />
                    <Text className="text-2xl font-bold text-navy-800 mt-1">{stat.count}</Text>
                    <Text className="text-gray-400 text-xs">{stat.label}</Text>
                  </View>
                ))}
              </View>

              {/* Issues */}
              {issues.length > 0 && (
                <View className="mb-4">
                  <Text className="text-navy-400 text-xs font-semibold uppercase tracking-wide mb-2">Issues</Text>
                  {issues.map(issue => (
                    <View key={issue.id} className="bg-white rounded-xl border border-villa-border p-3 mb-2">
                      <View className="flex-row items-center gap-2">
                        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[issue.severity] }} />
                        <Text className="text-gray-800 font-medium text-sm flex-1">{issue.title}</Text>
                        {issue.location_name && (
                          <Text className="text-gray-400 text-xs">{issue.location_name}</Text>
                        )}
                      </View>
                      {issue.description && (
                        <Text className="text-gray-500 text-xs mt-1 ml-4">{issue.description}</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Ideas */}
              {ideas.length > 0 && (
                <View className="mb-4">
                  <Text className="text-navy-400 text-xs font-semibold uppercase tracking-wide mb-2">Ideas</Text>
                  {ideas.map(idea => (
                    <View key={idea.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-2 flex-row gap-2">
                      <Text className="text-lg">💡</Text>
                      <View className="flex-1">
                        <Text className="text-gray-800 text-sm">{idea.text}</Text>
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
                  <Text className="text-navy-400 text-xs font-semibold uppercase tracking-wide mb-2">Decisions</Text>
                  {decisions.map(d => (
                    <View key={d.id} className="bg-green-50 border border-green-100 rounded-xl p-3 mb-2 flex-row gap-2">
                      <Ionicons name="checkmark-done-outline" size={16} color="#15803d" />
                      <Text className="flex-1 text-gray-800 text-sm">{d.text}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!session.summary && !organizing && (
                <TouchableOpacity
                  className="border-2 border-dashed border-gray-200 rounded-2xl p-6 items-center"
                  onPress={() => triggerOrganization(session, transcript)}
                >
                  <Ionicons name="sparkles-outline" size={28} color="#C9A84C" />
                  <Text className="text-navy-800 font-semibold mt-2">Organize with AI</Text>
                  <Text className="text-gray-400 text-xs mt-1 text-center">Pull what matters out of the transcript.</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {activeTab === 'tasks' && (
            <View>
              {tasks.length === 0 ? (
                <View className="items-center py-12">
                  <Ionicons name="checkbox-outline" size={40} color="#D9E2EC" />
                  <Text className="text-gray-400 text-sm mt-3 text-center">No tasks found.</Text>
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
              {playing && (
                <TouchableOpacity
                  className="flex-row items-center gap-2 bg-navy-50 border border-navy-100 rounded-xl p-3 mb-3"
                  onPress={stopPlayback}
                >
                  <View className="w-2 h-2 rounded-full bg-red-500" />
                  <Text className="text-navy-800 text-sm flex-1">Playing audio</Text>
                  <Ionicons name="stop-circle-outline" size={18} color="#1E3A5F" />
                </TouchableOpacity>
              )}
              {transcript.length === 0 ? (
                <View className="items-center py-12">
                  <Ionicons name="chatbubbles-outline" size={40} color="#D9E2EC" />
                  <Text className="text-gray-400 text-sm mt-3">Nothing recorded.</Text>
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
                  <Ionicons name="images-outline" size={40} color="#D9E2EC" />
                  <Text className="text-gray-400 text-sm mt-3">No media attached</Text>
                </View>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {media.map(item => (
                    <View key={item.id} className="w-[48%] aspect-square bg-gray-100 rounded-xl overflow-hidden">
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
