# KATSU R2 Manager

**Satu storage pool pribadi dari banyak akun Cloudflare R2 — dengan public download center, admin dashboard, dan upload multipart yang bisa dilanjutkan. Semuanya disiapkan lewat browser: tanpa terminal, tanpa CLI, tanpa VPS.**

Bayangkan Anda punya beberapa akun Cloudflare (masing-masing dengan kuota gratis R2 10 GB). Katsu R2 Manager menggabungkannya menjadi satu ruang penyimpanan logis: unggah satu file, sistem otomatis memilih bucket dengan ruang bebas terbesar, lalu membagikan satu tautan unduhan publik yang rapi — tanpa pernah memperlihatkan Account ID, nama bucket, atau object key kepada pengunjung.

---

## Isi README

1. [Fitur](#fitur)
2. [Cara kerja (arsitektur)](#cara-kerja-arsitektur)
3. [Struktur proyek](#struktur-proyek)
4. [Persiapan di Cloudflare](#persiapan-di-cloudflare-dashboard-saja)
5. [Deploy](#deploy)
6. [Environment variables](#environment-variables)
7. [Setup Assistant — konfigurasi tanpa terminal](#setup-assistant--konfigurasi-tanpa-terminal)
8. [Memakai dashboard admin](#memakai-dashboard-admin)
9. [Download Center publik](#download-center-publik)
10. [Keamanan](#keamanan)
11. [Dokumentasi lengkap](#dokumentasi-lengkap)
12. [Catatan & batasan](#catatan--batasan)

---

## Fitur

### 🌐 Public Download Center (`/`)
- Daftar file publik dengan ikon per tipe, ukuran, jumlah unduhan, dan pencarian.
- Halaman detail per file (`/file/<id>`) dengan tombol unduh, salin tautan, dan bagikan.
- Streaming `/download/<id>` dengan **HTTP Range** — unduhan bisa dijeda/dilanjutkan dan video bisa di-seek.
- Tidak ada Account ID, bucket, object key, atau kredensial yang pernah dikirim ke browser.

### 🛡️ Admin Dashboard (`/admin`)
- Login username + password (hash PBKDF2-SHA256), cookie sesi HttpOnly bertanda tangan HMAC, proteksi CSRF, dan rate limiting.
- Ringkasan: total file, total ukuran, total unduhan, jumlah storage R2, kapasitas pool (`8 GB / 10 GB` per storage), file terbaru, dan file paling sering diunduh.
- Diagnostik konfigurasi + tombol inisialisasi database sekali klik.

### 🗄️ Multi R2 Storage Manager (`/admin/storage`)
- Tambah, ubah, nonaktifkan, dan hapus storage. Field: **Storage Name, Account ID, Bucket Name, Access Key ID, Secret Access Key, Storage Limit** (+ prioritas, endpoint, region, catatan).
- **Tes koneksi 4 langkah**: akses bucket → baca daftar objek → tulis file uji → hapus file uji, lengkap dengan durasi tiap langkah dan pesan error yang mudah dipahami.
- **Sinkronkan pemakaian**: mengukur ulang isi bucket sehingga angka `used/limit` akurat.
- Kredensial **dienkripsi AES-256-GCM** sebelum disimpan dan hanya dipakai di backend.

### ⬆️ Upload System (`/admin/upload`)
- Drag & drop, pemilih file, **upload satu folder**, dan **ambil foto/video langsung dari kamera** (mobile).
- Multipart upload **langsung dari browser ke R2** lewat presigned URL: memori konstan, file 5 GB+ aman.
- Progres per file dan per bagian, kecepatan, perkiraan waktu selesai.
- **Pause / resume / cancel** per file maupun seluruh antrean, retry otomatis dengan backoff, dan **lanjut setelah reload/tutup tab** (antrean disimpan di IndexedDB + sesi dicatat di server dan direkonsiliasi lewat `ListParts`).
- Pemilihan storage otomatis: baca ukuran file → periksa semua storage → pilih yang kapasitasnya cukup dengan ruang bebas terbesar (prioritas sebagai tie-breaker). Bisa juga dipaksa manual.

### 📁 File Manager (`/admin/files`)
- Cari, filter (storage, kategori, visibilitas), urutkan, dan paginasi.
- Ganti nama, ubah publik/privat, salin tautan unduhan, bagikan (Web Share API di mobile), hapus (opsional hapus objeknya di R2), dan lihat lokasi fisik `storage / bucket / object key`.
- **Pindahkan file antar storage/bucket** lintas akun dengan progres bertahap — tautan unduhan publik tidak berubah.
- **Seleksi banyak file** sekaligus: salin banyak tautan, ubah visibilitas massal, hapus massal.

### 📚 Dokumentasi (`/docs`)
12 modul berbahasa Indonesia dengan sidebar, pencarian, daftar isi, dan tampilan responsif: Getting Started, Cloudflare R2 Setup, Database Setup, Deployment, Environment Variables, Adding Storage, Upload Guide, File Management, Download System, Security, Troubleshooting, FAQ.

### 🎨 Desain
Dark mode premium, efek glass, animasi halus, mobile-first — terinspirasi Google Drive, dashboard Cloudflare, dan SaaS modern.

---

## Cara kerja (arsitektur)

```
                 ┌──────────────────────────────────────────────┐
   Browser       │            KATSU R2 Manager (Next.js)         │
  ┌─────────┐    │                                               │
  │Pengunjung│───▶  /            Download Center (publik)        │
  └─────────┘    │  /file/<id>   Halaman detail + tautan         │
                 │  /download/<id>  streaming + HTTP Range       │
  ┌─────────┐    │                                               │
  │  Admin  │───▶  /admin/*     Dashboard (login, CSRF, rate limit)
  └─────────┘    │  /api/*       Route handlers (validasi Zod)   │
                 │  /setup       Setup Assistant (tanpa CLI)     │
                 │  /docs        Dokumentasi                     │
                 └───────┬───────────────────────────┬───────────┘
                         │                           │
              metadata (HTTP API)          presigned URL per bagian
                         ▼                           ▼
              ┌────────────────────┐      ┌─────────────────────────┐
              │ Cloudflare D1 / KV │      │  Cloudflare R2 (N akun) │
              │ files, storages,   │      │  bucket A · bucket B ·  │
              │ upload_sessions    │      │  bucket C  → 1 pool     │
              └────────────────────┘      └─────────────────────────┘
```

**Alur upload:** browser meminta sesi ke `/api/admin/uploads/init` → server memilih storage, membuka multipart upload di R2, dan mengembalikan presigned URL per bagian → browser mengunggah potongan file **langsung ke R2** (melewati server, jadi tidak membebani CPU worker) → browser memanggil `/api/admin/uploads/complete` → server merakit objek dan menyimpan metadata file.

**Alur unduhan:** pengunjung membuka `/download/<id>` → server mencari metadata, menaikkan penghitung, lalu mengalirkan byte dari R2 (atau memberi presigned URL / meneruskan ke worker mandiri, tergantung `DOWNLOAD_MODE`).

---

## Struktur proyek

```
.
├── app/
│   ├── page.tsx                     Download Center (publik)
│   ├── file/[id]/page.tsx           Halaman detail file publik
│   ├── download/[id]/route.ts       Streaming unduhan + HTTP Range
│   ├── admin/
│   │   ├── layout.tsx               Metadata admin (noindex)
│   │   ├── login/page.tsx           Form login
│   │   └── (panel)/                 Ringkasan · Storage · Upload · Files · Pengaturan
│   ├── api/
│   │   ├── admin/                   overview, storages, files, uploads, jobs, database
│   │   ├── auth/                    login, logout, session
│   │   ├── public/                  files, stats, file/<id>
│   │   └── health/route.ts          Probe status (dipakai /setup)
│   ├── docs/                        Situs dokumentasi (sidebar, TOC, pencarian)
│   └── setup/page.tsx               Setup Assistant tanpa CLI
├── components/
│   ├── admin/                       Shell dashboard + tiap halaman admin
│   ├── docs/ · public/ · site/ · ui/
├── database/
│   ├── schema.sql                   DDL (salinan lib/db/schema.ts)
│   ├── seed.sql                     Data contoh opsional
│   └── README.md                    Panduan database & backup
├── docs/                            Sumber konten dokumentasi (TypeScript)
├── lib/
│   ├── api/          guard (auth+CSRF+rate limit), validasi Zod, response envelope
│   ├── auth/         password PBKDF2, sesi HMAC, CSRF, cookie
│   ├── client/       helper fetch browser + tipe respons
│   ├── config/       seluruh environment variables dalam satu tempat
│   ├── db/           adapter D1 / KV / memory + vault enkripsi kredensial
│   ├── r2/           klien S3 (SigV4 buatan sendiri), XML, storage manager
│   ├── security/     rate limit, sanitasi nama file, state store
│   ├── services/     storages, uploads, files, downloads (logika bisnis)
│   ├── upload/       mesin upload multipart browser + antrean IndexedDB
│   └── utils/        crypto Web API, format, id, logger
├── public/                          logo, manifest, robots.txt
├── workers/
│   ├── download-worker.ts           Worker unduhan mandiri (OPSIONAL)
│   └── README.md                    Cara deploy worker tanpa terminal
├── open-next.config.ts              Adapter Next.js → Cloudflare Workers
├── wrangler.jsonc                   Konfigurasi Worker (dibaca dashboard)
├── .env.example                     Referensi seluruh environment variables
└── README.md
```

---

## Persiapan di Cloudflare (dashboard saja)

Semua langkah ini dilakukan dengan klik di dashboard — tidak ada satu pun perintah terminal.

### 1. Buat bucket R2
1. Cloudflare Dashboard → **R2 Object Storage** → **Create bucket**.
2. Beri nama (huruf kecil, angka, strip), pilih lokasi, klik **Create**.
3. Ulangi untuk setiap akun/bucket yang ingin digabungkan ke pool.

> Kuota gratis R2: **10 GB penyimpanan**, 1 juta operasi Class A, 10 juta operasi Class B per bulan, dan **egress nol biaya**.

### 2. Buat API Token R2 (per akun)
1. Masih di menu **R2 Object Storage** → **API Tokens** (kanan atas) → **Create API Token**.
2. Pilih **Object Read & Write**, batasi ke bucket yang diinginkan (atau semua bucket).
3. **Create token** → salin **Access Key ID** dan **Secret Access Key**.
   > Secret hanya ditampilkan sekali. Simpan di tempat aman — Anda akan menempelnya di Admin → Storage R2.

### 3. Buat database
- **D1 (disarankan):** Storage & Databases → **D1** → **Create database** → salin **Database ID**.
- **KV (alternatif ringan):** Workers & Pages → **KV** → **Create namespace** → salin **Namespace ID**.

### 4. Buat API Token untuk database
1. **My Profile** → **API Tokens** → **Create Token** → **Custom token**.
2. Permissions: **Account → D1 → Edit** (atau **Workers KV → Edit**).
3. Account Resources: pilih akun Anda → **Continue to summary** → **Create Token** → salin.
4. Salin juga **Account ID** dari halaman overview akun.

> Token ini tidak memerlukan izin R2. Kredensial tiap bucket diisi lewat dashboard admin dan disimpan terenkripsi.

---

## Deploy

### Opsi A — Cloudflare Workers / Pages (disarankan)

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Connect to Git** → pilih repositori ini.
2. Isi formulir build (ini **isian formulir di dashboard**, bukan perintah yang Anda jalankan):

   | Field | Nilai |
   | --- | --- |
   | **Project name** | `katsu-r2-manager` (harus sama dengan `name` di `wrangler.jsonc`) |
   | **Build command** | `npx opennextjs-cloudflare build` |
   | **Build output directory** | *(kosongkan — `wrangler.jsonc` sudah menunjuk `.open-next`)* |
   | **Root directory** | `/` |

3. **Settings → Variables and Secrets** → tambahkan environment variables (lihat bagian berikutnya). Pilih tipe **Secret** untuk nilai rahasia.
4. **Deploy**. Tidak perlu binding D1/KV/R2 — aplikasi memakai HTTP API Cloudflare.
5. Buka `https://<proyek>.workers.dev/setup` untuk melanjutkan konfigurasi.

> Ingin memakai domain sendiri? **Settings → Domains & Routes → Add → Custom domain**.

### Opsi B — Vercel

1. Vercel Dashboard → **Add New → Project** → impor repositori ini (framework Next.js terdeteksi otomatis).
2. **Settings → Environment Variables** → tempel variabel untuk **Production**, **Preview**, dan **Development**.
3. **Deploy**. Database tetap di Cloudflare (D1/KV) dan diakses lewat HTTP API, jadi isi `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, dan `DATABASE_ID`.
4. Buka `https://<proyek>.vercel.app/setup`.

> **Deploy ulang wajib** setelah menambah/mengubah environment variables agar nilainya terbaca.

---

## Environment variables

Referensi lengkap dengan penjelasan tiap baris ada di [`.env.example`](.env.example) dan di dokumentasi `/docs/environment-variables`.

### Wajib

| Variabel | Contoh | Keterangan |
| --- | --- | --- |
| `ADMIN_USERNAME` | `katsu` | Username login admin |
| `ADMIN_PASSWORD_HASH` | `pbkdf2-sha256$100000$…` | Dibuat di `/setup` (langkah 2) |
| `SESSION_SECRET` | *(43 karakter acak)* | Penanda tangan cookie sesi — dibuat di `/setup` |
| `CREDENTIAL_ENCRYPTION_KEY` | *(43 karakter acak)* | Kunci AES-256-GCM untuk kredensial R2 — dibuat di `/setup` |
| `DATABASE_DRIVER` | `d1` | `d1` \| `kv` \| `memory` |
| `DATABASE_ID` | *(UUID)* | ID database D1 (bila driver `d1`) |
| `KV_NAMESPACE_ID` | *(UUID)* | ID namespace KV (bila driver `kv`) |
| `CLOUDFLARE_ACCOUNT_ID` | *(32 hex)* | Account ID Cloudflare |
| `CLOUDFLARE_API_TOKEN` | *(token)* | Izin **D1:Edit** atau **KV:Edit** |

### Opsional (default sudah aman)

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `APP_URL` | *(origin request)* | URL publik aplikasi |
| `APP_NAME` | `Katsu R2 Manager` | Nama yang tampil di UI |
| `PASSWORD_PBKDF2_ITERATIONS` | `100000` | Turunkan ke `25000` bila paket gratis Cloudflare menolak login karena batas CPU |
| `SESSION_TTL_HOURS` | `12` | Masa berlaku sesi (7× lebih lama bila "Ingat saya") |
| `DOWNLOAD_MODE` | `stream` | `stream` \| `redirect` \| `worker` |
| `DOWNLOAD_WORKER_URL` | — | Wajib bila `DOWNLOAD_MODE=worker` |
| `DOWNLOAD_SIGNING_SECRET` | = `SESSION_SECRET` | Penanda tangan tautan unduhan |
| `DOWNLOAD_LINK_TTL_SECONDS` | `21600` | Umur tautan bertanda tangan |
| `PUBLIC_LISTING` | `true` | Tampilkan daftar file di halaman utama |
| `DOWNLOAD_INLINE_CONTENT_TYPES` | `false` | Buka di browser alih-alih mengunduh |
| `STORAGE_OBJECT_PREFIX` | `files` | Prefiks object key di bucket |
| `DEFAULT_PART_SIZE_MB` | `8` | Ukuran bagian multipart (min. 5 MB) |
| `MAX_UPLOAD_SIZE_GB` | `20` | Batas ukuran file per upload |
| `MAX_CONCURRENT_PARTS` | `3` | Bagian paralel per file (1–8) |
| `STORAGE_PROBE_KEY` | `.katsu/connection-probe.txt` | Object uji untuk Tes koneksi |
| `RATE_LIMIT_*` | lihat `.env.example` | Batas percobaan login, API, dan unduhan |
| `DEMO_MODE` | `false` | Data contoh in-memory untuk mencoba UI tanpa R2 |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

---

## Setup Assistant — konfigurasi tanpa terminal

Buka **`/setup`** pada aplikasi yang sudah ter-deploy. Halaman ini memandu enam langkah dan menghasilkan sendiri semua nilai rahasia:

| Langkah | Yang terjadi |
| --- | --- |
| **1 · Status sistem** | Membaca `/api/health` dan menampilkan driver database, status skema, dan variabel yang masih kurang |
| **2 · Password admin** | Membuat `ADMIN_PASSWORD_HASH` dengan PBKDF2-SHA256 **di browser Anda** — password tidak pernah dikirim ke server |
| **3 · Kunci rahasia** | Mengacak `SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, dan `DOWNLOAD_SIGNING_SECRET` (256-bit, Web Crypto) |
| **4 · Database** | Panduan D1/KV + tombol **Inisialisasi sekarang** yang memasang seluruh skema |
| **5 · Storage R2** | Panduan membuat bucket & API Token, lalu tautan ke Admin → Storage R2 |
| **6 · Deploy** | Pratinjau seluruh environment variables siap salin-tempel ke dashboard hosting |

> Nilai rahasia dibuat dan disimpan di perangkat Anda. Simpan salinannya di password manager: `CREDENTIAL_ENCRYPTION_KEY` yang hilang berarti kredensial R2 setiap storage harus diisi ulang.

---

## Memakai dashboard admin

| Halaman | Alamat | Yang bisa dilakukan |
| --- | --- | --- |
| Ringkasan | `/admin` | Statistik, kapasitas pool, diagnostik, file terbaru, upload tertunda |
| Storage R2 | `/admin/storage` | Tambah/edit/nonaktifkan/hapus storage, tes koneksi 4 langkah, sinkronkan pemakaian |
| Upload | `/admin/upload` | Drag & drop, folder, kamera, progres, jeda/lanjut, pengaturan bagian & paralelisme |
| File Manager | `/admin/files` | Cari, filter, ganti nama, visibilitas, salin/bagikan tautan, pindah antar bucket, hapus, aksi massal |
| Pengaturan | `/admin/settings` | Status database, pasang/perbarui skema, laporan environment, info sesi & keamanan |
| Login | `/admin/login` | Autentikasi admin |

**Urutan pemakaian pertama kali:**

1. Isi environment variables → deploy → buka `/setup` → buat hash & secret → tempel ke dashboard → deploy ulang.
2. Buka `/setup` lagi → **Inisialisasi sekarang** (atau `/admin` → Pengaturan → Pasang skema).
3. Login ke `/admin` dengan `ADMIN_USERNAME` dan password yang Anda buat.
4. `/admin/storage` → **Tambah storage** → isi detail bucket → **Simpan** (tes koneksi otomatis berjalan).
5. `/admin/upload` → pilih file → tunggu selesai → salin tautan unduhannya.
6. Bagikan tautan `/download/<id>` atau arahkan pengunjung ke `/`.

---

## Download Center publik

| Rute | Fungsi |
| --- | --- |
| `/` | Daftar file publik (bisa dimatikan dengan `PUBLIC_LISTING=false`) |
| `/file/<id>` | Halaman detail file: ukuran, tipe, jumlah unduhan, tombol unduh, salin & bagikan tautan |
| `/download/<id>` | Aliran byte dengan dukungan `Range`, `Accept-Ranges: bytes`, `ETag`, dan `Content-Disposition` aman |
| `/api/public/files` · `/api/public/stats` · `/api/public/file/<id>` | JSON publik (dipakai halaman depan, tanpa kredensial) |
| `/api/health` | Status sistem (dipakai `/setup`) |

Pengunjung hanya melihat `download_id` pendek — tidak pernah Account ID, bucket, object key, atau kredensial.

---

## Keamanan

- **Kredensial R2 hanya di backend.** Access Key & Secret dienkripsi **AES-256-GCM** (`enc:v1:`) sebelum masuk database dan hanya didekripsi saat menandatangani permintaan S3. API hanya mengembalikan nilai bertopeng.
- **Autentikasi admin.** Password diverifikasi dengan **PBKDF2-SHA256** (iterations dapat diatur). Cookie sesi HttpOnly, `SameSite=Strict`, ditandatangani HMAC, dengan masa berlaku yang bisa dikonfigurasi.
- **Proteksi CSRF.** Pola *double-submit*: cookie `katsu_csrf` + header `x-katsu-csrf` pada setiap request mutasi.
- **Rate limiting.** Login, API admin, dan unduhan dibatasi per IP/sesi dengan jendela waktu yang dapat dikonfigurasi.
- **Validasi input.** Semua body & query di-parse dengan **Zod**; nama file disanitasi (path traversal, karakter kontrol, nama device Windows, panjang berlebih); object key dibangun dari segmen yang dibersihkan.
- **Lapisan proxy.** `proxy.ts` menolak `/admin/*` dan `/api/admin/*` tanpa sesi valid sebelum handler berjalan — dan setiap handler memverifikasi ulang sesinya.
- **Unduhan bertanda tangan.** Mode `redirect`/`worker` memakai token HMAC berumur pendek; file privat selalu menolak permintaan tanpa token.
- **Tidak ada indeksasi panel.** `/admin` dan `/setup` mengirim `robots: noindex`.

---

## Dokumentasi lengkap

Tersedia di dalam aplikasi pada rute **`/docs`** (sidebar, pencarian, daftar isi, responsif):

| Modul | Isi |
| --- | --- |
| Getting Started | Gambaran sistem & alur pemakaian pertama |
| Cloudflare R2 Setup | Membuat bucket, API Token, CORS, dan kuota gratis |
| Database Setup | D1 vs KV, inisialisasi, backup & restore |
| Deployment | Cloudflare Workers/Pages dan Vercel, langkah demi langkah |
| Environment Variables | Referensi seluruh variabel |
| Adding Storage | Menghubungkan akun R2 & memahami tes koneksi |
| Upload Guide | Multipart, resume, pengaturan bagian & paralelisme |
| File Management | Cari, rename, visibilitas, pindah antar bucket, aksi massal |
| Download System | Range/resume, mode stream/redirect/worker, tautan |
| Security | Model ancaman & setiap lapisan proteksi |
| Troubleshooting | Tabel gejala → penyebab → solusi |
| FAQ | Pertanyaan umum (termasuk "perlu terminal tidak?") |

Panduan database juga ada di [`database/README.md`](database/README.md), dan panduan worker unduhan opsional di [`workers/README.md`](workers/README.md).

---

## Catatan & batasan

- **CPU Worker paket gratis.** Cloudflare membatasi 10 ms CPU/request pada paket gratis, sedangkan verifikasi PBKDF2 butuh lebih. `wrangler.jsonc` proyek ini meminta `limits.cpu_ms = 30000` (butuh paket paid) — bila Anda memakai paket gratis, buat hash dengan `PASSWORD_PBKDF2_ITERATIONS=25000` di `/setup`.
- **Maksimal 10.000 bagian per file** (aturan S3/R2). File sangat besar otomatis memakai ukuran bagian lebih besar; batas absolut objek R2 adalah 5 TiB.
- **Pindah file lintas akun** dilakukan bertahap (baca range dari bucket asal → unggah bagian ke bucket tujuan) karena R2 tidak mendukung `CopyObject` antar akun. Progresnya terlihat di dialog dan bisa dibatalkan.
- **`DOWNLOAD_MODE=redirect`** lebih ringan tetapi URL sementaranya memuat nama bucket & account id. Pakai `stream` bila ingin semuanya tersembunyi.
- **Driver `kv`** bersifat *eventually consistent* dan kurang cocok untuk koleksi file yang sangat besar; gunakan `d1` untuk produksi.
- **Data contoh.** `database/seed.sql` dan `DEMO_MODE=true` disediakan untuk mencoba UI — keduanya memakai kredensial placeholder, jadi hapus/matikan sebelum produksi.

---

## Teknologi

Next.js (App Router, TypeScript) · React · Tailwind CSS · Cloudflare R2 (S3 API + SigV4 buatan sendiri) · Cloudflare D1 / KV (HTTP API) · Web Crypto API · Zod · OpenNext for Cloudflare · lucide-react

## Lisensi

MIT — gunakan, ubah, dan sebarkan bebas.
