import { getConfig } from "@/lib/config/env";
import { getDatabase } from "@/lib/db";
import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { applyPublicRateLimit } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/** Aggregated pool statistics shown on the public landing page (no R2 details). */
export async function GET(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await applyPublicRateLimit(request, "public");
      const db = await getDatabase();
      const stats = await db.getPoolStats();
      const storages = await db.listStorages();
      const config = getConfig();

      const totalCapacity = storages.reduce((sum, storage) => sum + storage.limitBytes, 0);
      const totalUsed = storages.reduce((sum, storage) => sum + storage.usedBytes, 0);

      return jsonOk({
        files: stats.publicFiles,
        totalSize: stats.totalBytes,
        totalDownloads: stats.totalDownloads,
        nodes: storages.filter((storage) => storage.status === "active").length,
        poolCapacity: config.download.publicListing ? totalCapacity : 0,
        poolUsed: config.download.publicListing ? totalUsed : 0,
      });
    },
    { route: "/api/public/stats", method: "GET" },
  );
}
