import { getConfigReport } from "@/lib/config/env";
import { getDatabase, getDatabaseInfo } from "@/lib/db";
import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/api/guard";
import { getPoolOverview } from "@/lib/services/storages";
import { listResumableSessions } from "@/lib/services/uploads";
import { toSafeFile } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Everything the admin dashboard renders in one round trip. */
export async function GET(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { csrf: false });

      const [db, pool, databaseInfo, configReport, resumable] = await Promise.all([
        getDatabase(),
        getPoolOverview(),
        getDatabaseInfo(),
        getConfigReport(),
        listResumableSessions().catch(() => []),
      ]);

      const [stats, recent, topDownloads] = await Promise.all([
        db.getPoolStats(),
        db.listFiles({ sort: "createdAt", direction: "desc", limit: 8 }),
        db.listFiles({ sort: "downloadCount", direction: "desc", limit: 5 }),
      ]);

      const storageNameById = new Map(pool.storages.map((storage) => [storage.id, storage.name]));

      return jsonOk({
        stats: {
          totalFiles: stats.totalFiles,
          totalBytes: stats.totalBytes,
          totalDownloads: stats.totalDownloads,
          publicFiles: stats.publicFiles,
        },
        pool,
        database: databaseInfo,
        config: configReport,
        recentFiles: recent.items.map((file) => toSafeFile(file, storageNameById.get(file.storageId) ?? null)),
        topFiles: topDownloads.items.map((file) => toSafeFile(file, storageNameById.get(file.storageId) ?? null)),
        resumableUploads: resumable.map((session) => ({
          id: session.id,
          filename: session.filename,
          size: session.size,
          partsTotal: session.partsTotal,
          partsUploaded: session.uploadedParts,
          storageName: session.storageName,
          status: session.status,
          updatedAt: session.updatedAt,
        })),
      });
    },
    { route: "/api/admin/overview", method: "GET" },
  );
}
