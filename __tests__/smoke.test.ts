// Smoke tests — verify the three highest-risk paths work
import { organizeSession } from '../lib/organization';

// 1. organizeSession throws (not silently fails) when no API key provided
test('organizeSession throws on missing API key', async () => {
  await expect(
    organizeSession([], [], [], 'test session', undefined)
  ).rejects.toThrow('API key not configured');
});

// 2. organizeSession throws on empty string API key
test('organizeSession throws on empty API key', async () => {
  await expect(
    organizeSession([], [], [], 'test session', '')
  ).rejects.toThrow('API key not configured');
});

// 3. upsertStaff SQL has correct column count (verified structurally)
test('upsertStaff includes all 11 columns', async () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../lib/database.ts'), 'utf8');
  // The INSERT OR REPLACE must list all 11 columns
  expect(src).toContain('email, role_level, invite_code, supabase_user_id, avatar_url');
  // The VALUES must have 11 placeholders
  const match = src.match(/INSERT OR REPLACE INTO staff[\s\S]*?VALUES \(([\s\S]*?)\)/);
  expect(match).toBeTruthy();
  const placeholders = match![1].split(',').map((s: string) => s.trim()).filter((s: string) => s === '?');
  expect(placeholders).toHaveLength(11);
});
