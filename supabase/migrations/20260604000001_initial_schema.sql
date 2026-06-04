-- Meet AI — Initial Schema
-- Migration: 20260604000001_initial_schema.sql
-- Run via: supabase db push OR supabase migration up
-- This file mirrors the local SQLite schema (post-migration-v3) with Supabase-specific columns.
-- Note: org_id is added to all tables as required by ADR-006 (RLS policies depend on it).

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- Profiles table (maps to local staff table)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID NOT NULL,                        -- required for RLS isolation (ADR-006 §known-limitations-5)
  org_owner_id UUID,                           -- future multi-org support; NULL = same-org as creator
  display_name TEXT NOT NULL,
  email TEXT,
  role_level TEXT NOT NULL DEFAULT 'member' CHECK (role_level IN ('owner', 'manager', 'member')),
  invite_code TEXT UNIQUE,
  avatar_url TEXT,
  color TEXT NOT NULL DEFAULT '#1E3A5F',
  avatar_initials TEXT NOT NULL DEFAULT '',
  staff_role TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Contexts table (was locations)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contexts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📍',
  color TEXT NOT NULL DEFAULT '#6E8FAC',
  context_type TEXT NOT NULL DEFAULT 'space',
  ai_description TEXT,
  org_id UUID NOT NULL,                        -- required for RLS isolation
  -- note: reference_image_uri is not synced (local file path); avatar_url in Supabase Storage is separate
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Sessions table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  context_id TEXT REFERENCES contexts(id) ON DELETE SET NULL,
  started_at BIGINT NOT NULL,
  ended_at BIGINT,
  status TEXT NOT NULL DEFAULT 'recording',
  summary TEXT,
  org_id UUID NOT NULL,                        -- required for RLS isolation
  -- audio_uri intentionally excluded (owner-device only per ADR-005)
  owner_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at BIGINT
);

-- ─────────────────────────────────────────────
-- Session participants
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_participants (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),        -- ADR-006 uses user_id as the FK column name in policies
  org_id UUID NOT NULL,                        -- required for RLS isolation
  PRIMARY KEY (session_id, profile_id)
);

-- ─────────────────────────────────────────────
-- Transcript lines
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcript_lines (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker_id TEXT NOT NULL,                    -- 'me' or staff id
  text TEXT NOT NULL,
  start_time REAL NOT NULL DEFAULT 0,
  end_time REAL NOT NULL DEFAULT 0,
  timestamp BIGINT NOT NULL,
  context_id TEXT REFERENCES contexts(id) ON DELETE SET NULL,
  org_id UUID NOT NULL,                        -- required for RLS isolation
  deleted_at BIGINT
);

-- ─────────────────────────────────────────────
-- Tasks
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  context_id TEXT REFERENCES contexts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date BIGINT,
  notes TEXT,
  org_id UUID NOT NULL,                        -- required for RLS isolation
  created_at BIGINT NOT NULL,
  deleted_at BIGINT
);

-- ─────────────────────────────────────────────
-- Ideas
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source TEXT NOT NULL,
  category TEXT,
  org_id UUID NOT NULL,                        -- required for RLS isolation
  created_at BIGINT NOT NULL,
  deleted_at BIGINT
);

-- ─────────────────────────────────────────────
-- Issues
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  context_id TEXT REFERENCES contexts(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  org_id UUID NOT NULL,                        -- required for RLS isolation
  created_at BIGINT NOT NULL,
  deleted_at BIGINT
);

-- ─────────────────────────────────────────────
-- Decisions
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  made_by TEXT NOT NULL DEFAULT 'owner',
  org_id UUID NOT NULL,                        -- required for RLS isolation
  created_at BIGINT NOT NULL,
  deleted_at BIGINT
);

-- ─────────────────────────────────────────────
-- Media items (metadata only — actual files in Supabase Storage)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  transcript_line_id TEXT REFERENCES transcript_lines(id) ON DELETE SET NULL,
  storage_path TEXT,                           -- Supabase Storage path (null if not yet uploaded)
  type TEXT NOT NULL DEFAULT 'photo' CHECK (type IN ('photo', 'video')),
  note TEXT,
  org_id UUID NOT NULL,                        -- required for RLS isolation
  created_at BIGINT NOT NULL
);

-- ─────────────────────────────────────────────
-- Indexes (required for RLS performance per ADR-006 §known-limitations-6)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_supabase_user_id
  ON profiles (supabase_user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_org_id
  ON profiles (org_id);

CREATE INDEX IF NOT EXISTS idx_session_participants_user_id
  ON session_participants (user_id);

CREATE INDEX IF NOT EXISTS idx_session_participants_session_id
  ON session_participants (session_id);

CREATE INDEX IF NOT EXISTS idx_sessions_org_id
  ON sessions (org_id);

CREATE INDEX IF NOT EXISTS idx_tasks_org_id
  ON tasks (org_id);

CREATE INDEX IF NOT EXISTS idx_transcript_lines_session_id
  ON transcript_lines (session_id);

-- ─────────────────────────────────────────────
-- Updated_at trigger function (reusable)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
