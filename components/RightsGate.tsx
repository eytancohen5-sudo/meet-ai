import React from 'react';
import { useAuth } from '../stores/auth';
import {
  canViewAllSessions,
  canManageTeam,
  canOrganizeSession,
  canManageContexts,
} from '../lib/rights';

interface Props {
  require: 'viewAllSessions' | 'manageTeam' | 'organizeSession' | 'manageContexts';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

const CHECKERS = {
  viewAllSessions: canViewAllSessions,
  manageTeam: canManageTeam,
  organizeSession: canOrganizeSession,
  manageContexts: canManageContexts,
} as const;

export function RightsGate({ require, fallback = null, children }: Props) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  const rightsUser = user ? { id: user.id, role: user.role } : null;
  const check = CHECKERS[require];
  if (!check(rightsUser)) return <>{fallback}</>;
  return <>{children}</>;
}
