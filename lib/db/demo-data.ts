import type { FileRecord, StorageRecord } from "@/lib/db/types";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

function iso(daysAgo: number, hour = 9): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  date.setUTCHours(hour, 12, 0, 0);
  return date.toISOString();
}

/**
 * Sample data for `DEMO_MODE=true`.
 *
 * It mirrors the scenario from the project brief: three R2 accounts with 10 GB
 * each, merged into a single 30 GB pool that visitors experience as one drive.
 * Credentials are obviously fake - demo mode never talks to Cloudflare.
 */
export function createDemoData(): { storages: StorageRecord[]; files: FileRecord[] } {
  const storages: StorageRecord[] = [
    {
      id: "stg_demo_r2_1",
      name: "R2 Server 1",
      accountId: "00000000000000000000000000000001",
      bucket: "katsu-pool-01",
      accessKeyId: "demo-access-key-1",
      secretAccessKey: "demo-secret-key-1",
      endpoint: null,
      region: "auto",
      limitBytes: 10 * GB,
      usedBytes: 8 * GB,
      priority: 10,
      status: "active",
      lastCheckedAt: iso(0, 6),
      lastError: null,
      notes: "Akun Cloudflare pertama (demo).",
      createdAt: iso(42),
      updatedAt: iso(0, 6),
    },
    {
      id: "stg_demo_r2_2",
      name: "R2 Server 2",
      accountId: "00000000000000000000000000000002",
      bucket: "katsu-pool-02",
      accessKeyId: "demo-access-key-2",
      secretAccessKey: "demo-secret-key-2",
      endpoint: null,
      region: "auto",
      limitBytes: 10 * GB,
      usedBytes: 3 * GB,
      priority: 20,
      status: "active",
      lastCheckedAt: iso(0, 6),
      lastError: null,
      notes: "Akun Cloudflare kedua (demo).",
      createdAt: iso(38),
      updatedAt: iso(0, 6),
    },
    {
      id: "stg_demo_r2_3",
      name: "R2 Server 3",
      accountId: "00000000000000000000000000000003",
      bucket: "katsu-pool-03",
      accessKeyId: "demo-access-key-3",
      secretAccessKey: "demo-secret-key-3",
      endpoint: null,
      region: "auto",
      limitBytes: 10 * GB,
      usedBytes: 10 * GB,
      priority: 30,
      status: "active",
      lastCheckedAt: iso(0, 6),
      lastError: null,
      notes: "Penuh - tidak akan dipilih untuk upload baru.",
      createdAt: iso(30),
      updatedAt: iso(0, 6),
    },
  ];

  const files: FileRecord[] = [
    demoFile({
      id: "file_demo_ubuntu",
      downloadId: "ubuntu2404",
      filename: "ubuntu-24.04.1-desktop-amd64.iso",
      size: Math.round(5.2 * GB),
      contentType: "application/x-iso9660-image",
      category: "archive",
      storageId: "stg_demo_r2_2",
      bucket: "katsu-pool-02",
      objectKey: "files/2026/08/file_demo_ubuntu-ubuntu-24.04.1-desktop-amd64.iso",
      downloads: 1284,
      daysAgo: 12,
    }),
    demoFile({
      id: "file_demo_blender",
      downloadId: "blender42",
      filename: "blender-4.2.0-linux-x64.tar.xz",
      size: Math.round(386 * MB),
      contentType: "application/x-xz",
      category: "archive",
      storageId: "stg_demo_r2_1",
      bucket: "katsu-pool-01",
      objectKey: "files/2026/08/file_demo_blender-blender-4.2.0-linux-x64.tar.xz",
      downloads: 412,
      daysAgo: 9,
    }),
    demoFile({
      id: "file_demo_movie",
      downloadId: "bigbuckbny",
      filename: "Big.Buck.Bunny.1080p.mp4",
      size: Math.round(1.6 * GB),
      contentType: "video/mp4",
      category: "video",
      storageId: "stg_demo_r2_2",
      bucket: "katsu-pool-02",
      objectKey: "files/2026/07/file_demo_movie-Big.Buck.Bunny.1080p.mp4",
      downloads: 2310,
      daysAgo: 21,
    }),
    demoFile({
      id: "file_demo_photos",
      downloadId: "photopack1",
      filename: "katsu-photo-archive-2026.zip",
      size: Math.round(4.3 * GB),
      contentType: "application/zip",
      category: "archive",
      storageId: "stg_demo_r2_3",
      bucket: "katsu-pool-03",
      objectKey: "files/2026/06/file_demo_photos-katsu-photo-archive-2026.zip",
      downloads: 96,
      daysAgo: 34,
    }),
    demoFile({
      id: "file_demo_report",
      downloadId: "q3report26",
      filename: "Laporan-Keuangan-Q3-2026.pdf",
      size: Math.round(2.4 * MB),
      contentType: "application/pdf",
      category: "document",
      storageId: "stg_demo_r2_1",
      bucket: "katsu-pool-01",
      objectKey: "files/2026/09/file_demo_report-Laporan-Keuangan-Q3-2026.pdf",
      downloads: 58,
      daysAgo: 3,
    }),
    demoFile({
      id: "file_demo_backup",
      downloadId: "dbbackup09",
      filename: "database-backup-2026-09-15.sql.gz",
      size: Math.round(740 * MB),
      contentType: "application/gzip",
      category: "archive",
      storageId: "stg_demo_r2_2",
      bucket: "katsu-pool-02",
      objectKey: "files/2026/09/file_demo_backup-database-backup-2026-09-15.sql.gz",
      downloads: 12,
      daysAgo: 4,
    }),
    demoFile({
      id: "file_demo_music",
      downloadId: "lofi2026x",
      filename: "Lofi-Study-Mix-2026.flac",
      size: Math.round(612 * MB),
      contentType: "audio/flac",
      category: "audio",
      storageId: "stg_demo_r2_1",
      bucket: "katsu-pool-01",
      objectKey: "files/2026/08/file_demo_music-Lofi-Study-Mix-2026.flac",
      downloads: 845,
      daysAgo: 16,
    }),
    demoFile({
      id: "file_demo_game",
      downloadId: "gameassets",
      filename: "game-assets-pack-v3.zip",
      size: Math.round(2.9 * GB),
      contentType: "application/zip",
      category: "archive",
      storageId: "stg_demo_r2_3",
      bucket: "katsu-pool-03",
      objectKey: "files/2026/05/file_demo_game-game-assets-pack-v3.zip",
      downloads: 203,
      daysAgo: 47,
      visibility: "private",
    }),
  ];

  return { storages, files };
}

function demoFile(input: {
  id: string;
  downloadId: string;
  filename: string;
  size: number;
  contentType: string;
  category: string;
  storageId: string;
  bucket: string;
  objectKey: string;
  downloads: number;
  daysAgo: number;
  visibility?: FileRecord["visibility"];
}): FileRecord {
  const createdAt = iso(input.daysAgo);
  return {
    id: input.id,
    downloadId: input.downloadId,
    filename: input.filename,
    originalName: input.filename,
    size: input.size,
    contentType: input.contentType,
    category: input.category,
    storageId: input.storageId,
    bucket: input.bucket,
    objectKey: input.objectKey,
    etag: `"demo${input.id.slice(-8)}"`,
    downloadCount: input.downloads,
    visibility: input.visibility ?? "public",
    createdAt,
    updatedAt: createdAt,
  };
}
