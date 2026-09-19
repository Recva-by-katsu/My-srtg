# Dokumentasi Katsu R2 Manager

Folder ini berisi **sumber konten dokumentasi** yang dirender di dalam website pada route `/docs`.

## Struktur

```
docs/
├── types.ts            # kontrak data (DocPage, DocGroup, DocSearchEntry)
├── registry.ts         # daftar halaman, pengelompokan sidebar, indeks pencarian
├── markdown.ts         # parser markdown ringan (heading, list, tabel, code, callout)
└── content/            # satu modul per halaman dokumentasi
    ├── getting-started.ts
    ├── r2-setup.ts
    ├── database-setup.ts
    ├── deployment.ts
    ├── environment-variables.ts
    ├── add-storage.ts
    ├── upload-guide.ts
    ├── file-management.ts
    ├── download-system.ts
    ├── security-guide.ts
    ├── troubleshooting.ts
    └── faq.ts
```

## Kenapa konten disimpan sebagai modul TypeScript?

Dokumentasi harus tersedia **di dalam website** (`/docs`) dan aplikasi ini berjalan di tiga runtime
sekaligus: Node.js (Vercel), workerd (Cloudflare Workers/Pages), dan browser. Menyimpan konten sebagai
modul TypeScript berarti:

- tidak butuh loader/plugin markdown tambahan (bundle kecil, build cepat),
- tidak ada pembacaan file system saat runtime (aman untuk Workers),
- sidebar, table of contents, dan indeks pencarian semuanya bertipe dan tervalidasi compiler.

Isi tiap halaman tetap ditulis dengan **markdown** (di dalam array baris), sehingga mudah dibaca dan
mudah di-diff. Fitur yang didukung: heading, paragraf, list bertingkat, tabel, code block dengan tombol
salin, tautan, serta callout `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!DANGER]`.

## Menambah halaman baru

1. Buat `docs/content/<slug>.ts` mengikuti bentuk halaman lain.
2. Daftarkan di `docs/registry.ts` (impor + tambahkan ke `DOC_PAGES`).
3. Halaman otomatis muncul di sidebar, pencarian, dan navigasi sebelumnya/berikutnya.

Tidak ada langkah build atau command tambahan - perubahan langsung terlihat setelah deploy ulang dari
dashboard Cloudflare/Vercel.
