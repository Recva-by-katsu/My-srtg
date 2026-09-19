# Database · Katsu R2 Manager

Folder ini berisi skrip SQL yang dipakai aplikasi. **Tidak ada perintah terminal yang dibutuhkan** — semua langkah di bawah dilakukan lewat dashboard Cloudflare atau lewat tombol di dalam aplikasi.

| Berkas | Isi | Kapan dipakai |
| --- | --- | --- |
| `schema.sql` | Seluruh DDL (tabel + indeks + versi skema) | Saat pertama kali memasang aplikasi, atau setelah mengganti database |
| `seed.sql` | Data contoh untuk mencoba UI | Opsional, hanya untuk percobaan |

> `schema.sql` adalah salinan persis dari `lib/db/schema.ts`. Bila Anda memakai tombol **Pasang skema** di dashboard admin, aplikasi menjalankan statement yang sama — jadi keduanya tidak akan pernah berbeda isi.

---

## 1. Cara memasang skema

### Opsi A — otomatis dari aplikasi (paling mudah)

1. Isi environment variables berikut di dashboard hosting Anda:
   - `DATABASE_DRIVER=d1` (atau `kv`)
   - `DATABASE_ID` (atau `KV_NAMESPACE_ID`)
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN` (izin **Account → D1 → Edit**, atau **Workers KV → Edit**)
2. Deploy ulang aplikasi.
3. Buka `/setup` → langkah 4 → **Inisialisasi sekarang**, atau masuk ke `/admin` → **Pengaturan** → **Pasang skema**.

Aplikasi menjalankan `schema.sql` lewat HTTP API resmi Cloudflare. Skripnya idempoten (`CREATE TABLE IF NOT EXISTS`), jadi aman ditekan berulang kali dan tidak menghapus data yang sudah ada.

### Opsi B — lewat console D1 di dashboard Cloudflare

1. Cloudflare Dashboard → **Storage & Databases → D1** → pilih database Anda.
2. Buka tab **Console**.
3. Salin seluruh isi `schema.sql`, tempel ke editor.
4. Tekan **Execute**.
5. Pastikan `DATABASE_ID` di aplikasi menunjuk ke database yang sama.

---

## 2. Struktur tabel

### `storages` — akun/bucket R2 dalam pool

| Kolom | Keterangan |
| --- | --- |
| `id` | Kunci utama internal (tidak pernah ditampilkan ke publik) |
| `name` | Nama bebas yang tampil di dashboard admin (unik) |
| `account_id`, `bucket` | Lokasi bucket di Cloudflare |
| `access_key_id`, `secret_access_key` | **Terenkripsi AES-256-GCM** dengan prefiks `enc:v1:` — jangan isi manual dengan nilai polos |
| `endpoint`, `region` | Opsional; default endpoint R2 standar dan region `auto` |
| `limit_bytes`, `used_bytes` | Batas kapasitas dan pemakaian terakhir yang terukur |
| `priority` | Angka kecil dipilih lebih dulu saat ruang bebasnya setara |
| `status` | `active`, `disabled`, atau `error` |
| `last_checked_at`, `last_error`, `notes` | Hasil tes koneksi terakhir dan catatan bebas |

### `files` — metadata file & ID unduhan publik

| Kolom | Keterangan |
| --- | --- |
| `id` | Kunci utama internal |
| `download_id` | ID publik pendek yang muncul di URL `/download/<id>` dan `/file/<id>` |
| `filename`, `original_name` | Nama tersimpan (sudah disanitasi) dan nama asli saat diunggah |
| `size`, `content_type`, `category` | Ukuran byte, tipe MIME, dan kategori (video/image/archive/…) untuk ikon & filter |
| `storage_id`, `bucket`, `object_key` | Lokasi fisik objek di pool |
| `etag` | ETag dari R2 untuk validasi unduhan |
| `download_count` | Statistik unduhan |
| `visibility` | `public` (muncul di Download Center) atau `private` |

### `upload_sessions` — sesi multipart yang bisa dilanjutkan

Menyimpan `upload_id` dari R2, `part_size`, `parts_total`, `parts_uploaded`, `status`, dan `client_fingerprint` (nama:ukuran:lastModified) agar upload yang terputus bisa dilanjutkan dari perangkat lain atau setelah browser di-reload.

### `app_state` — state sementara dengan TTL

Dipakai untuk rate limiting, progres *move job* lintas akun, dan penanda internal. Barisnya punya `expires_at` dan dibersihkan otomatis.

### `meta` — versi skema

Berisi `schema_version` dan `installed_at` sehingga aplikasi tahu apakah skema sudah terpasang.

---

## 3. Driver yang didukung

| Driver | Cocok untuk | Catatan |
| --- | --- | --- |
| `d1` | Produksi (default) | SQL penuh: pencarian, filter, agregasi, dan indeks. Butuh `DATABASE_ID` |
| `kv` | Instalasi cepat / skala kecil | Menyimpan JSON per baris plus indeks ringan. Eventual consistency; pencarian lebih terbatas. Butuh `KV_NAMESPACE_ID` |
| `memory` | Demo & uji coba | Data hilang saat instance dimatikan. Aktif otomatis bila `DEMO_MODE=true` |

Pada driver `kv`, data disimpan dengan prefiks key berikut (berguna bila Anda ingin memeriksa isi namespace dari dashboard):

```
meta:schema       -> versi skema (penanda bahwa namespace sudah diinisialisasi)
idx:files         -> indeks: ringkasan semua file untuk pencarian & pengurutan
idx:storages      -> indeks: daftar ID storage
idx:uploads       -> indeks: daftar ID sesi upload (maks. 200 terbaru)
file:<id>         -> satu baris file (JSON)
storage:<id>      -> satu baris storage (JSON, kredensial tetap terenkripsi)
upload:<id>       -> satu sesi upload (JSON)
state:<key>       -> state sementara dengan TTL (rate limit, move job)
```

---

## 4. `seed.sql` — data contoh (opsional)

`seed.sql` mengisi satu storage contoh dan beberapa baris file agar dashboard tidak kosong saat pertama dibuka. Nilai kredensialnya adalah **placeholder** (`enc:v1:REPLACE_ME`) dan objeknya tidak benar-benar ada di R2, jadi:

- dashboard, pencarian, filter, dan statistik bisa dicoba langsung;
- unduhan akan gagal sampai Anda menambahkan storage asli lewat **Admin → Storage R2**;
- **hapus data contoh** sebelum produksi (lihat komentar di dalam berkas).

Ingin mencoba tanpa menyentuh database sama sekali? Set `DEMO_MODE=true` — aplikasi memakai data contoh in-memory dan tidak menghubungi R2.

---

## 5. Backup & pemulihan

**Cloudflare D1 (lewat dashboard):**

1. Storage & Databases → D1 → database Anda → tab **Backups** → **Create backup** / unduh backup otomatis.
2. Untuk memulihkan: buka backup → **Restore**, atau buat database baru lalu pakai tab **Console** untuk menempel hasil export.
3. Perbarui `DATABASE_ID` bila Anda berpindah ke database baru, lalu buka **Admin → Pengaturan → Periksa ulang**.

**Cloudflare KV:** salin nilai tiap key dari dashboard (Workers & Pages → KV → namespace → lihat keys). Karena kredensial terenkripsi, pastikan `CREDENTIAL_ENCRYPTION_KEY` tetap sama setelah pemulihan — bila tidak, isi ulang Access Key/Secret tiap storage.

> Objek file itu sendiri hidup di bucket R2 dan **tidak** ikut ter-backup bersama database. Database hanya menyimpan metadata.

---

## 6. Keamanan

- Kredensial R2 dienkripsi sebelum ditulis (`lib/db/vault.ts`, AES-256-GCM) dan tidak pernah dikirim ke browser — API hanya mengembalikan nilai bertopeng seperti `AKIA••••1234`.
- `download_id` adalah ID publik acak; `id`, `bucket`, dan `object_key` tidak pernah bocor ke halaman publik.
- Skema tidak menyimpan password admin sama sekali: verifikasi memakai `ADMIN_PASSWORD_HASH` dari environment variables.
