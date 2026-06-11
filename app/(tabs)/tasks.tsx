import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  Modal, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { TaskCard } from '../../components/TaskCard';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/EmptyState';
import { NoticeBanner } from '../../components/NoticeBanner';
import { PersonChip } from '../../components/PersonChip';
import {
  getAllTasks, updateTaskStatus, updateTask, deleteTask, addTask,
  getAllOpenIssues, updateIssueStatus, getStaff,
} from '../../lib/database';
import { TAB_SCREEN_EDGES } from '../../lib/ui';
import { useSettings } from '../../stores/settings';
import { Task, Issue, StaffMember } from '../../types';

type TaskRow = Task & { session_title: string };
type IssueRow = Issue & { session_title: string };

const UNASSIGNED_KEY = '__unassigned__';

// ── Local-midnight date helpers (binding due-date contract: no date library) ──

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

// Date component arithmetic — the constructor normalizes overflow and stays on
// local midnight across DST, unlike adding n*24h to an epoch.
function addDays(baseMs: number, days: number): number {
  const d = new Date(baseMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

function formatFullDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const SEVERITY_DOT: Record<Issue['severity'], string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-gray-400',
};

const PRIORITY_OPTIONS: { value: Task['priority']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
];

interface TaskGroup {
  key: string;            // staff id, or UNASSIGNED_KEY
  label: string;          // 'You' | person name | 'Unassigned'
  member?: StaffMember;   // avatar color/initials for named groups
  unassigned: boolean;
  tasks: TaskRow[];
}

export default function TasksScreen() {
  const ownerName = useSettings((s) => s.ownerName);

  const [segment, setSegment] = useState<'Open' | 'Done'>('Open');
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  // Tasks toggled since the last load. A checked task keeps its place (green
  // check + strikethrough) until the next list refresh — checked tasks never
  // vanish under the finger (design principle 5).
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());
  const [issuesExpanded, setIssuesExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Task edit sheet (R5): draft state applied on Save.
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draftAssignee, setDraftAssignee] = useState<string | null>(null);
  const [draftDue, setDraftDue] = useState<number | null>(null);
  const [draftPriority, setDraftPriority] = useState<Task['priority']>('medium');

  const load = useCallback(async () => {
    try {
      const [taskRows, issueRows, staffRows] = await Promise.all([
        getAllTasks(),
        getAllOpenIssues(),
        getStaff(),
      ]);
      setTasks(taskRows);
      setIssues(issueRows);
      setStaff(staffRows);
      setToggledIds(new Set());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Segment switch counts as a list refresh: toggled tasks settle into their
  // new segment (check off in Open → it's waiting in Done).
  const changeSegment = (next: string) => {
    setSegment(next === 'Done' ? 'Done' : 'Open');
    load();
  };

  // ── Segment membership ────────────────────────────────────────────────────
  // A task belongs to the segment matching its status at last load; toggling
  // flips status but not membership until the next refresh.

  const belongsToDone = useCallback(
    (t: TaskRow) => (t.status === 'done') !== toggledIds.has(t.id),
    [toggledIds]
  );

  const openSegmentTasks = useMemo(
    () => tasks.filter((t) => !belongsToDone(t)),
    [tasks, belongsToDone]
  );
  const doneSegmentTasks = useMemo(
    () => tasks.filter(belongsToDone),
    [tasks, belongsToDone]
  );

  const openCount = useMemo(() => tasks.filter((t) => t.status === 'open').length, [tasks]);
  const doneCount = tasks.length - openCount;

  // ── Open segment: group by assignee — "You" first, A–Z, Unassigned last ───

  const groups = useMemo<TaskGroup[]>(() => {
    const ownerNorm = ownerName.trim().toLowerCase();
    const grouped = new Map<string, TaskGroup>();
    const ensure = (key: string, make: () => TaskGroup): TaskGroup => {
      let g = grouped.get(key);
      if (!g) {
        g = make();
        grouped.set(key, g);
      }
      return g;
    };

    for (const task of openSegmentTasks) {
      const id = task.assigned_to;
      const name = task.assigned_to_name;
      // A dangling assigned_to (member removed from Team) groups as Unassigned —
      // keeps Team's "their tasks stay and become Unassigned" promise.
      if (id && name) {
        ensure(id, () => ({
          key: id,
          label: name.trim().toLowerCase() === ownerNorm ? 'You' : name,
          member: staff.find((m) => m.id === id),
          unassigned: false,
          tasks: [],
        })).tasks.push(task);
      } else {
        ensure(UNASSIGNED_KEY, () => ({
          key: UNASSIGNED_KEY,
          label: 'Unassigned',
          unassigned: true,
          tasks: [],
        })).tasks.push(task);
      }
    }

    const weight = (g: TaskGroup) => (g.unassigned ? 2 : g.label === 'You' ? 0 : 1);
    const sorted = [...grouped.values()].sort(
      (a, b) => weight(a) - weight(b) || a.label.localeCompare(b.label)
    );
    // Within a group: due date ascending — overdue first, no-date last (R4;
    // the Overdue/Today/This week/Later/No date grouping is expressed as the
    // due chips + this sort, per 02-screen-designs).
    for (const g of sorted) {
      g.tasks.sort(
        (a, b) =>
          (a.due_date ?? Number.MAX_SAFE_INTEGER) - (b.due_date ?? Number.MAX_SAFE_INTEGER) ||
          b.created_at - a.created_at
      );
    }
    return sorted;
  }, [openSegmentTasks, staff, ownerName]);

  // ── Check-off / reopen ────────────────────────────────────────────────────

  const handleToggle = async (id: string, status: 'open' | 'done') => {
    try {
      await updateTaskStatus(id, status);
    } catch {
      return; // DB write failed — leave the UI untouched
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    setToggledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Per-person share (R6): plain-text digest via the iOS share sheet ──────

  const shareGroup = async (group: TaskGroup) => {
    const open = group.tasks.filter((t) => t.status === 'open');
    if (open.length === 0) return;
    const today = startOfToday();
    const lines = open.map((t) => {
      const parts = [`• ${t.title}`];
      const meta: string[] = [];
      if (t.due_date) {
        meta.push(`Due: ${formatFullDate(t.due_date)}${t.due_date < today ? ' (overdue)' : ''}`);
      }
      if (t.location_name) meta.push(`Place: ${t.location_name}`);
      if (meta.length > 0) parts.push(`  ${meta.join(' · ')}`);
      if (t.notes) parts.push(`  Note: ${t.notes}`);
      return parts.join('\n');
    });
    const recipient = group.label === 'You' ? ownerName : group.label;
    const header = `${recipient} — ${open.length} task${open.length === 1 ? '' : 's'} from Meet AI:`;
    try {
      await Share.share({ message: `${header}\n\n${lines.join('\n')}` });
    } catch {
      // OS share sheet needs no error state (02-screen-designs).
    }
  };

  // ── Edit sheet ────────────────────────────────────────────────────────────

  const openEdit = (task: Task) => {
    setEditingTask(task);
    // A dangling assignee id (deleted member) is presented as Unassigned.
    setDraftAssignee(task.assigned_to && task.assigned_to_name ? task.assigned_to : null);
    setDraftDue(task.due_date ?? null);
    setDraftPriority(task.priority);
  };

  const closeEdit = () => setEditingTask(null);

  const saveEdits = async () => {
    if (!editingTask) return;
    const clearsAssignee = editingTask.assigned_to != null && draftAssignee === null;
    const clearsDue = editingTask.due_date != null && draftDue === null;
    try {
      if (clearsAssignee || clearsDue) {
        // updateTask's Partial<Task> signature cannot express writing SQL NULL
        // (its runtime maps null → NULL via `?? null`, but Task's optionals
        // reject null — T1 typing gap, flagged to atlas). Until the signature
        // is widened, clear fields by rewriting the row through addTask, which
        // binds omitted optionals as NULL. Same id + created_at: a rewrite of
        // the same task, not a new one.
        await deleteTask(editingTask.id);
        await addTask({
          id: editingTask.id,
          session_id: editingTask.session_id,
          title: editingTask.title,
          assigned_to: draftAssignee ?? undefined,
          location_id: editingTask.location_id ?? undefined,
          status: editingTask.status,
          priority: draftPriority,
          due_date: draftDue ?? undefined,
          notes: editingTask.notes ?? undefined,
          created_at: editingTask.created_at,
        });
      } else {
        const updates: Partial<Task> = { priority: draftPriority };
        if (draftAssignee !== null) updates.assigned_to = draftAssignee;
        if (draftDue !== null) updates.due_date = draftDue;
        await updateTask(editingTask.id, updates);
      }
    } catch {
      Alert.alert("Couldn't save changes", 'Please try again.');
      return;
    }
    setEditingTask(null);
    await load();
  };

  const confirmDeleteTask = () => {
    if (!editingTask) return;
    const task = editingTask;
    Alert.alert(`Delete "${task.title}"?`, 'This removes the task for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTask(task.id);
          setEditingTask(null);
          await load();
        },
      },
    ]);
  };

  // ── Issues (R8-minimal) ───────────────────────────────────────────────────

  const resolveIssue = async (issue: IssueRow) => {
    try {
      await updateIssueStatus(issue.id, 'resolved');
      setIssues((prev) => prev.filter((i) => i.id !== issue.id));
    } catch {
      // Row stays; the next refresh retries.
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const today = startOfToday();
  const quickDueOptions = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: 'Next week', value: addDays(today, 7) },
  ];

  return (
    <SafeAreaView edges={TAB_SCREEN_EDGES} className="flex-1 bg-bg">
      <View className="px-5 pt-4 pb-3">
        <Text className="text-text-primary text-2xl font-bold tracking-tight">Tasks</Text>
        <Text className="text-text-secondary text-sm mt-1">
          {openCount} open · {doneCount} done
        </Text>
      </View>

      <SegmentedControl segments={['Open', 'Done']} active={segment} onChange={changeSegment} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B5BDB" />}
        showsVerticalScrollIndicator={false}
      >
        {loadError && (
          <View className="mb-3">
            <NoticeBanner
              variant="error"
              message="Couldn't load your tasks"
              actionLabel="Retry"
              onAction={load}
            />
          </View>
        )}

        {segment === 'Open' ? (
          <>
            {groups.length === 0 && !loadError ? (
              <EmptyState
                icon="checkmark-done-circle-outline"
                title="All caught up!"
                body="No open tasks. Complete sessions will appear here."
              />
            ) : (
              groups.map((group) => {
                const openInGroup = group.tasks.filter((t) => t.status === 'open').length;
                const avatarColor = group.member?.color ?? '#3B5BDB';
                const avatarInitials =
                  group.member?.avatar_initials ||
                  initialsFor(group.label === 'You' ? ownerName : group.label);
                return (
                  <View key={group.key} className="mb-5">
                    <View className="flex-row items-center mb-2">
                      {group.unassigned ? (
                        <View className="w-7 h-7 rounded-full bg-amber-50 items-center justify-center">
                          <View className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        </View>
                      ) : (
                        <View
                          className="w-7 h-7 rounded-full items-center justify-center"
                          style={{ backgroundColor: avatarColor + '30' }}
                        >
                          <Text className="font-bold text-[10px]" style={{ color: avatarColor }}>
                            {avatarInitials}
                          </Text>
                        </View>
                      )}
                      <Text className="text-text-primary text-sm font-semibold ml-2">{group.label}</Text>
                      <Text className="text-text-tertiary text-sm ml-1.5">{openInGroup}</Text>
                      <View className="flex-1" />
                      <TouchableOpacity
                        onPress={() => shareGroup(group)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="share-outline" size={18} color="#3B5BDB" />
                      </TouchableOpacity>
                    </View>
                    {group.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        sessionTitle={task.session_title}
                        onToggle={handleToggle}
                        onEdit={openEdit}
                        compact
                      />
                    ))}
                  </View>
                );
              })
            )}

            {issues.length > 0 && (
              <View className="bg-white rounded-xl border border-border mt-1">
                <TouchableOpacity
                  className="flex-row items-center p-4"
                  onPress={() => setIssuesExpanded((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="warning-outline" size={18} color="#D97706" />
                  <Text className="text-text-primary text-sm font-semibold ml-2">
                    Open issues ({issues.length})
                  </Text>
                  <View className="flex-1" />
                  <Ionicons
                    name={issuesExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#6B7280"
                  />
                </TouchableOpacity>
                {issuesExpanded &&
                  issues.map((issue) => (
                    <View key={issue.id} className="flex-row items-center px-4 py-3 border-t border-border">
                      <View className={`w-2.5 h-2.5 rounded-full mr-3 ${SEVERITY_DOT[issue.severity]}`} />
                      <View className="flex-1 pr-3">
                        <Text className="text-text-primary text-sm font-medium" numberOfLines={2}>
                          {issue.title}
                        </Text>
                        <Text className="text-text-tertiary text-xs mt-0.5" numberOfLines={1}>
                          {issue.session_title}
                        </Text>
                      </View>
                      <TouchableOpacity
                        className="bg-brand-50 rounded-full px-3 py-1.5"
                        onPress={() => resolveIssue(issue)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text className="text-brand-600 text-xs font-semibold">Resolve</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </View>
            )}
          </>
        ) : doneSegmentTasks.length === 0 && !loadError ? (
          <EmptyState
            icon="checkmark-done-circle-outline"
            title="Nothing done yet"
            body="It'll feel good when there is."
          />
        ) : (
          doneSegmentTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              sessionTitle={task.session_title}
              onToggle={handleToggle}
              onEdit={openEdit}
              compact
            />
          ))
        )}
      </ScrollView>

      {/* ── Task edit sheet: assignee / due date / priority / delete (R5) ── */}
      <Modal
        visible={editingTask !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEdit}
      >
        {editingTask && (
          <View className="flex-1 bg-white">
            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
              <Text className="text-text-primary text-xl font-bold">Edit task</Text>
              <Text className="text-text-secondary text-sm mt-2 leading-snug">{editingTask.title}</Text>

              <Text className="text-text-secondary text-sm font-medium mt-6 mb-2">Assigned to</Text>
              <View className="flex-row flex-wrap gap-2">
                <PersonChip
                  label="Unassigned"
                  selected={draftAssignee === null}
                  onToggle={() => setDraftAssignee(null)}
                />
                {staff.map((member) => (
                  <PersonChip
                    key={member.id}
                    member={member}
                    selected={draftAssignee === member.id}
                    onToggle={() => setDraftAssignee(member.id)}
                  />
                ))}
              </View>

              <Text className="text-text-secondary text-sm font-medium mt-6 mb-2">Due date</Text>
              {draftDue !== null ? (
                <View className="flex-row items-center justify-between border border-border rounded-xl px-3 py-2.5 mb-2">
                  <TouchableOpacity
                    onPress={() => setDraftDue(addDays(draftDue, -1))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-back" size={20} color="#3B5BDB" />
                  </TouchableOpacity>
                  <Text className="text-text-primary text-base font-medium">{formatFullDate(draftDue)}</Text>
                  <TouchableOpacity
                    onPress={() => setDraftDue(addDays(draftDue, 1))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-forward" size={20} color="#3B5BDB" />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text className="text-text-tertiary text-sm mb-2">No due date</Text>
              )}
              <View className="flex-row flex-wrap gap-2">
                {quickDueOptions.map((option) => {
                  const isSelected = draftDue === option.value;
                  return (
                    <TouchableOpacity
                      key={option.label}
                      className={`px-3 py-2 rounded-full border ${isSelected ? 'bg-brand-50 border-brand-600' : 'bg-white border-border'}`}
                      onPress={() => setDraftDue(option.value)}
                      activeOpacity={0.7}
                    >
                      <Text className={`text-sm font-medium ${isSelected ? 'text-brand-600' : 'text-text-secondary'}`}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {draftDue !== null && (
                  <TouchableOpacity
                    className="px-3 py-2 rounded-full border bg-white border-border"
                    onPress={() => setDraftDue(null)}
                    activeOpacity={0.7}
                  >
                    <Text className="text-sm font-medium text-text-secondary">Clear</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text className="text-text-secondary text-sm font-medium mt-6 mb-2">Priority</Text>
              <View className="flex-row gap-2">
                {PRIORITY_OPTIONS.map((option) => {
                  const isSelected = draftPriority === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      className={`flex-1 py-2.5 rounded-xl border items-center ${isSelected ? 'bg-brand-50 border-brand-600' : 'bg-white border-border'}`}
                      onPress={() => setDraftPriority(option.value)}
                      activeOpacity={0.7}
                    >
                      <Text className={`text-sm font-medium ${isSelected ? 'text-brand-600' : 'text-text-secondary'}`}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                className="flex-row items-center justify-center gap-2 border border-red-200 bg-red-50 rounded-xl py-3.5 mt-8"
                onPress={confirmDeleteTask}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
                <Text className="text-red-600 font-semibold text-sm">Delete task</Text>
              </TouchableOpacity>

              <View className="flex-row gap-3 mt-4">
                <TouchableOpacity
                  className="flex-1 py-4 border border-border rounded-xl items-center"
                  onPress={closeEdit}
                >
                  <Text className="text-text-secondary font-medium">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 py-4 rounded-xl items-center bg-brand-600"
                  onPress={saveEdits}
                >
                  <Text className="text-white font-semibold">Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}
