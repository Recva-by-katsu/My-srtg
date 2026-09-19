/**
 * Database schema (SQLite dialect used by Cloudflare D1).
 *
 * This module is the single source of truth for the DDL. It is executed either
 *  - from the Cloudflare dashboard (Storage & Databases -> D1 -> Console, paste
 *    the contents of `database/schema.sql`), or
 *  - from the admin dashboard (Admin -> Settings -> Initialize database), which
 *    runs these exact statements through the D1 HTTP API. No CLI required.
 *
 * `database/schema.sql` mirrors this file for copy/paste use in the dashboard.
 */

export const SCHEMA_VERSION = 1;

export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS storages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL,
    bucket TEXT NOT NULL,
    access_key_id TEXT NOT NULL,
    secret_access_key TEXT NOT NULL,
    endpoint TEXT,
    region TEXT NOT NULL DEFAULT 'auto',
    limit_bytes INTEGER NOT NULL DEFAULT 0,
    used_bytes INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'active',
    last_checked_at TEXT,
    last_error TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_storages_status ON storages (status, priority)`,
  `CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    download_id TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    category TEXT NOT NULL DEFAULT 'other',
    storage_id TEXT NOT NULL,
    bucket TEXT NOT NULL,
    object_key TEXT NOT NULL,
    etag TEXT,
    download_count INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'public',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (storage_id) REFERENCES storages (id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_files_created_at ON files (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_files_storage ON files (storage_id)`,
  `CREATE INDEX IF NOT EXISTS idx_files_visibility ON files (visibility)`,
  `CREATE INDEX IF NOT EXISTS idx_files_filename ON files (filename)`,
  `CREATE TABLE IF NOT EXISTS upload_sessions (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    storage_id TEXT NOT NULL,
    bucket TEXT NOT NULL,
    object_key TEXT NOT NULL,
    upload_id TEXT,
    part_size INTEGER NOT NULL DEFAULT 8388608,
    parts_total INTEGER NOT NULL DEFAULT 0,
    parts_uploaded INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    visibility TEXT NOT NULL DEFAULT 'public',
    file_id TEXT,
    client_fingerprint TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_uploads_status ON upload_sessions (status, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_state_expires ON app_state (expires_at)`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `INSERT INTO meta (key, value) VALUES ('schema_version', '${SCHEMA_VERSION}')
   ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
];

export const SCHEMA_SQL = `${SCHEMA_STATEMENTS.join(";\n\n")};\n`;
