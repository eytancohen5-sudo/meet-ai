import { getSupabase } from './supabase';
import { UserRole } from '../types';

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
};

/** Send a magic-link OTP to the given email. */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true, // Supabase creates the auth account on first OTP; RLS + profiles table control access
    },
  });
  if (error) throw error;
}

/** Verify the 6-digit OTP code entered by the user. */
export async function verifyOtp(email: string, token: string): Promise<AuthUser> {
  const { data, error } = await getSupabase().auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) throw error;
  if (!data.user) throw new Error('No user returned after OTP verification');

  // Fetch role from profiles table
  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('role_level')
    .eq('supabase_user_id', data.user.id)
    .single();

  return {
    id: data.user.id,
    email: data.user.email ?? email,
    role: (profile?.role_level ?? 'member') as UserRole,
  };
}

/** Get the currently authenticated user, or null if not logged in. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) return null;

  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('role_level')
    .eq('supabase_user_id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? '',
    role: (profile?.role_level ?? 'member') as UserRole,
  };
}

/** Sign out the current user. */
export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}
