-- =============================================================================
--  Katsu R2 Manager - skema database (Cloudflare D1 / SQLite)
-- =============================================================================
--
--  Berkas ini adalah salinan persis dari `lib/db/schema.ts` (satu sumber
--  kebenaran di aplikasi). Anda TIDAK WAJIB menjalankannya manual: dashboard
--  admin punya tombol otomatis.
--
--  CARA PAKAI (tanpa terminal):
--
--  Opsi A - otomatis (disarankan)
--    1. Isi environment variables DATABASE_DRIVER=d1 dan DATABASE_ID.
--    2. Login ke /admin, buka Pengaturan, tekan "Pasang skema".
--       (Atau dari halaman /setup -> langkah 4 -> "Inisialisasi sekarang".)
--
--  Opsi B - lewat dashboard Cloudflare
--    1. Cloudflare Dashboard -> Storage & Databases -> D1 -> pilih database Anda.
--    2. Buka tab "Console".
--    3. Salin seluruh isi berkas ini, tempel ke editor console.
--    4. Tekan "Execute" / jalankan. Selesai - tabel langsung tersedia.
--
--  Skrip ini idempoten (CREATE TABLE IF NOT EXISTS), jadi aman dijalankan
--  berulang kali. Data yang sudah ada tidak dihapus.
--
--  Tabel yang dibuat:
--    storages         - akun/bucket Cloudflare R2 dalam storage pool
--    files            - metadata file + ID unduhan publik
--    upload_sessions  - sesi multipart yang bisa dilanjutkan (resume)
--    app_state        - state sementara (rate limit, progres move job) dengan TTL
--    meta             - versi skema dan penanda instalasi
--
--  Keamanan: kolom access_key_id dan secret_access_key menyimpan nilai
--  TERENKRIPSI (prefiks "enc:v1:") - jangan pernah menempel kredensial polos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS storages (
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
  );

CREATE INDEX IF NOT EXISTS idx_storages_status ON storages (status, priority);

CREATE TABLE IF NOT EXISTS files (
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
  );

CREATE INDEX IF NOT EXISTS idx_files_created_at ON files (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_files_storage ON files (storage_id);

CREATE INDEX IF NOT EXISTS idx_files_visibility ON files (visibility);

CREATE INDEX IF NOT EXISTS idx_files_filename ON files (filename);

CREATE TABLE IF NOT EXISTS upload_sessions (
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
  );

CREATE INDEX IF NOT EXISTS idx_uploads_status ON upload_sessions (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER
  );

CREATE INDEX IF NOT EXISTS idx_state_expires ON app_state (expires_at);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

INSERT INTO meta (key, value) VALUES ('schema_version', '1')
   ON CONFLICT (key) DO UPDATE SET value = excluded.value;
