# Workers · Katsu R2 Manager

| Berkas | Status | Fungsi |
| --- | --- | --- |
| `download-worker.ts` | **Opsional** | Worker mandiri untuk melayani unduhan publik dengan dukungan HTTP Range/resume |
| `../wrangler.jsonc` | Dipakai saat deploy lewat dashboard | Konfigurasi aplikasi utama (Next.js via OpenNext) |
| `../open-next.config.ts` | Dipakai saat deploy lewat dashboard | Adapter Next.js → Cloudflare Workers |

## Apakah saya perlu `download-worker.ts`?

**Tidak.** Aplikasi utama sudah melayani `/download/[id]` sendiri, lengkap dengan:

- HTTP `Range` (resume unduhan, video seeking),
- `Content-Disposition` yang aman (nama file disanitasi, dukungan UTF-8),
- penghitung unduhan, dan
- tiga mode: `stream` (default), `redirect` (pre-signed URL R2), `worker`.

Worker mandiri berguna bila Anda ingin:

1. memisahkan beban bandwidth dari aplikasi utama,
2. memasang domain unduhan khusus (mis. `dl.domain-anda.com`), atau
3. memakai binding R2 langsung tanpa kredensial S3 di dalam kode.

## Cara deploy tanpa terminal

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Worker** → beri nama, mis. `katsu-download`.
2. **Settings → Bindings**
   - D1 database → nama variabel `DB` → pilih database Katsu yang sama dengan aplikasi.
   - R2 bucket → nama variabel `R2` → pilih bucket utama.
   - Bila file tersebar di beberapa bucket: buat satu binding R2 per bucket (mis. `R2_MEDIA`, `R2_BACKUP`), lalu tambahkan variabel teks `R2_BUCKET_BINDINGS` berisi pemetaan JSON:
     ```json
     { "katsu-media": "R2_MEDIA", "katsu-backup": "R2_BACKUP" }
     ```
3. **Settings → Variables and Secrets**
   - `DOWNLOAD_SIGNING_SECRET` (tipe **Secret**) — harus **sama persis** dengan nilai di aplikasi utama.
   - `ALLOWED_ORIGINS` (opsional) — daftar origin yang diizinkan, dipisah koma. Default `*`.
   - `REQUIRE_TOKEN` (opsional) — isi `false` hanya bila Anda mengizinkan akses langsung tanpa tautan bertanda tangan (file privat tetap butuh token).
4. Tempel isi `download-worker.ts` ke editor worker (atau hubungkan repositori Git dengan entry point `workers/download-worker.ts`), lalu **Save and deploy**.
5. Di aplikasi utama, set:
   - `DOWNLOAD_MODE=worker`
   - `DOWNLOAD_WORKER_URL=https://katsu-download.<subdomain-anda>.workers.dev` (atau domain khusus Anda)
6. Deploy ulang aplikasi. Setiap klik unduh kini diarahkan (302) ke worker dengan token bertanda tangan berumur pendek.

## Uji cepat

- `https://<worker-anda>.workers.dev/healthz` → `{ "ok": true, "database": true, "bucket": true }`
- Klik unduh dari Download Center → periksa header `Accept-Ranges: bytes`, lalu coba jeda/lanjutkan unduhan.

## Catatan keamanan

- Worker ini **tidak menyimpan Access Key/Secret** apa pun: akses R2 diberikan lewat binding oleh platform.
- Account ID, nama bucket, dan object key tidak pernah dikembalikan ke browser.
- Token diverifikasi dengan HMAC-SHA256 dan punya masa kedaluwarsa (`DOWNLOAD_LINK_TTL_SECONDS` di aplikasi).
- File dengan `visibility = 'private'` selalu menolak permintaan tanpa token yang valid.
