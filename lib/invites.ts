import * as Crypto from 'expo-crypto';
import { getStaff, upsertStaff } from './database';
import { StaffMember } from '../types';

/** Generate a CSPRNG-backed invite code via expo-crypto. */
async function generateCode(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(24);
  // Convert to URL-safe base64 (no padding, replace +/ with -_)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return base64; // ~32 URL-safe chars
}

const APP_DOMAIN = process.env.EXPO_PUBLIC_APP_DOMAIN ?? 'https://meetai.app';

/** Assign an invite code to a staff member (idempotent — returns existing code if already set). */
export async function getOrCreateInviteCode(staffId: string): Promise<string | null> {
  const staff = await getStaff();
  const member = staff.find(s => s.id === staffId);
  if (!member) return null;
  if (member.invite_code) return member.invite_code;
  const code = await generateCode();
  await upsertStaff({ ...member, invite_code: code });
  return code;
}

/** Generate the web invite URL for a staff member. */
export function generateInviteLink(inviteCode: string): string {
  return `${APP_DOMAIN}/invite/${inviteCode}`;
}

/** Generate the deep link for mobile. */
export function generateInviteDeepLink(inviteCode: string): string {
  return `meetai://invite/${inviteCode}`;
}

/** Look up a staff member by their invite code. Returns null if not found. */
export async function resolveInviteCode(code: string): Promise<StaffMember | null> {
  const staff = await getStaff();
  return staff.find(s => s.invite_code === code) ?? null;
}
