import { UserRole } from '../types';

export type RightsUser = { id: string; role: UserRole } | null;

/** Owner can do anything. Managers can do most things. Members are read-only on their slice. */
export function canViewAllSessions(user: RightsUser): boolean {
  return user?.role === 'owner' || user?.role === 'manager';
}

export function canViewSession(user: RightsUser, participantIds: string[]): boolean {
  if (!user) return false;
  if (canViewAllSessions(user)) return true;
  return participantIds.includes(user.id);
}

export function canManageTeam(user: RightsUser): boolean {
  return user?.role === 'owner';
}

export function canOrganizeSession(user: RightsUser): boolean {
  return user?.role === 'owner' || user?.role === 'manager';
}

export function canUpdateTask(user: RightsUser, assignedToId?: string): boolean {
  if (!user) return false;
  if (canOrganizeSession(user)) return true;
  return user.id === assignedToId;
}

export function canManageContexts(user: RightsUser): boolean {
  return user?.role === 'owner' || user?.role === 'manager';
}
