-- Migration: 0001_competitor_intelligence.sql
-- Purpose: Schema for tracking competitor accounts, profile snapshots, media snapshots, and collection runs.

CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY,
  instagram_id TEXT NOT NULL UNIQUE,
  ig_id TEXT,
  username TEXT NOT NULL,
  name TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_competitors_username ON competitors(username);
CREATE INDEX IF NOT EXISTS idx_competitors_is_active ON competitors(is_active);

CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id TEXT PRIMARY KEY,
  competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL,
  followers_count INTEGER NOT NULL DEFAULT 0,
  follows_count INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  biography TEXT,
  website TEXT,
  profile_picture_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_comp_captured ON competitor_snapshots(competitor_id, captured_at);

CREATE TABLE IF NOT EXISTS competitor_media (
  id TEXT PRIMARY KEY,
  instagram_media_id TEXT NOT NULL UNIQUE,
  competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  caption TEXT,
  media_type TEXT NOT NULL,
  media_product_type TEXT,
  permalink TEXT,
  published_at TEXT NOT NULL,
  children_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_media_comp_pub ON competitor_media(competitor_id, published_at);

CREATE TABLE IF NOT EXISTS competitor_media_snapshots (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES competitor_media(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL,
  like_count INTEGER,
  comments_count INTEGER,
  view_count INTEGER
);

CREATE INDEX IF NOT EXISTS idx_media_snapshots_id_captured ON competitor_media_snapshots(media_id, captured_at);

CREATE TABLE IF NOT EXISTS collection_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  accounts_requested INTEGER NOT NULL DEFAULT 0,
  accounts_successful INTEGER NOT NULL DEFAULT 0,
  accounts_failed INTEGER NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON collection_runs(started_at);
