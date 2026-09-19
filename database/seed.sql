-- =============================================================================
--  Katsu R2 Manager - data contoh (OPSIONAL, hanya untuk mencoba UI)
-- =============================================================================
--
--  Jalankan SETELAH database/schema.sql.
--
--  Yang Anda dapatkan: satu storage contoh + lima baris file, sehingga dashboard
--  admin, pencarian, filter, dan statistik langsung terlihat terisi.
--
--  PERINGATAN
--   * Kredensial di bawah adalah PLACEHOLDER ("enc:v1:REPLACE_ME"). Storage contoh
--     ini TIDAK terhubung ke bucket R2 mana pun: tes koneksi akan gagal dan
--     unduhan akan mengembalikan error sampai Anda menambah storage asli lewat
--     Admin -> Storage R2.
--   * Ukuran dan jumlah unduhan hanyalah angka di metadata; objeknya tidak ada.
--   * HAPUS data contoh sebelum produksi (lihat bagian paling bawah berkas ini).
--
--  Alternatif tanpa menyentuh database: set DEMO_MODE=true. Aplikasi memakai data
--  contoh in-memory dan tidak menghubungi R2 sama sekali.
--
--  Cara menjalankan (tanpa terminal):
--   Cloudflare Dashboard -> Storage & Databases -> D1 -> database Anda ->
--   tab Console -> tempel berkas ini -> Execute.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Storage contoh
-- ---------------------------------------------------------------------------
INSERT INTO storages (
  id, name, account_id, bucket, access_key_id, secret_access_key,
  endpoint, region, limit_bytes, used_bytes, priority, status,
  last_checked_at, last_error, notes, created_at, updated_at
) VALUES (
  'sto_demo_0001',
  'R2 Contoh (demo)',
  '00000000000000000000000000000000',
  'katsu-demo-bucket',
  'enc:v1:REPLACE_ME',
  'enc:v1:REPLACE_ME',
  NULL,
  'auto',
  10737418240,          -- 10 GB (kuota gratis R2)
  3489660928,           -- ~3.25 GB "terpakai"
  100,
  'disabled',           -- dinonaktifkan agar tidak dipilih untuk upload sungguhan
  NULL,
  'Data contoh - tambahkan storage asli lewat Admin > Storage R2',
  'Storage demo bawaan seed.sql. Tidak terhubung ke bucket nyata.',
  datetime('now'),
  datetime('now')
) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- File contoh
-- ---------------------------------------------------------------------------
INSERT INTO files (
  id, download_id, filename, original_name, size, content_type, category,
  storage_id, bucket, object_key, etag, download_count, visibility,
  created_at, updated_at
) VALUES
  ('fil_demo_0001', 'demo1a2b3c', 'liburan-bali-2026.mp4', 'Liburan Bali 2026.mp4',
   2147483648, 'video/mp4', 'video',
   'sto_demo_0001', 'katsu-demo-bucket', 'files/2026/01/fil_demo_0001/liburan-bali-2026.mp4',
   NULL, 128, 'public', datetime('now', '-9 days'), datetime('now', '-9 days')),

  ('fil_demo_0002', 'demo4d5e6f', 'foto-keluarga.jpg', 'Foto Keluarga.jpg',
   4823431, 'image/jpeg', 'image',
   'sto_demo_0001', 'katsu-demo-bucket', 'files/2026/02/fil_demo_0002/foto-keluarga.jpg',
   NULL, 47, 'public', datetime('now', '-7 days'), datetime('now', '-7 days')),

  ('fil_demo_0003', 'demo7g8h9i', 'arsip-proyek.zip', 'Arsip Proyek.zip',
   1073741824, 'application/zip', 'archive',
   'sto_demo_0001', 'katsu-demo-bucket', 'files/2026/02/fil_demo_0003/arsip-proyek.zip',
   NULL, 12, 'public', datetime('now', '-5 days'), datetime('now', '-5 days')),

  ('fil_demo_0004', 'demo0j1k2l', 'laporan-keuangan.pdf', 'Laporan Keuangan.pdf',
   1843200, 'application/pdf', 'document',
   'sto_demo_0001', 'katsu-demo-bucket', 'files/2026/03/fil_demo_0004/laporan-keuangan.pdf',
   NULL, 3, 'private', datetime('now', '-2 days'), datetime('now', '-2 days')),

  ('fil_demo_0005', 'demo3m4n5o', 'podcast-episode-12.mp3', 'Podcast Episode 12.mp3',
   58720256, 'audio/mpeg', 'audio',
   'sto_demo_0001', 'katsu-demo-bucket', 'files/2026/03/fil_demo_0005/podcast-episode-12.mp3',
   NULL, 214, 'public', datetime('now', '-1 days'), datetime('now', '-1 days'))
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Verifikasi cepat (jalankan di Console D1 untuk memastikan data masuk)
-- ---------------------------------------------------------------------------
-- SELECT COUNT(*) AS total_files FROM files;
-- SELECT name, status, used_bytes, limit_bytes FROM storages;

-- ---------------------------------------------------------------------------
-- HAPUS data contoh sebelum produksi
-- ---------------------------------------------------------------------------
-- DELETE FROM files WHERE id LIKE 'fil_demo_%';
-- DELETE FROM storages WHERE id = 'sto_demo_0001';
