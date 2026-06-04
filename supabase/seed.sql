-- Development seed — creates one owner profile
-- Replace values before running against production
-- Run via: supabase db seed OR psql -f seed.sql

INSERT INTO profiles (id, display_name, email, role_level, avatar_initials, invite_code, org_id)
VALUES (
  uuid_generate_v4(),
  'Owner',
  'owner@example.com',
  'owner',
  'OW',
  'dev-owner-invite-code',
  uuid_generate_v4()  -- generates a stable org_id for the dev environment
) ON CONFLICT DO NOTHING;
