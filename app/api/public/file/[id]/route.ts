import { getConfig } from "@/lib/config/env";
import { getDatabase, toPublicFile } from "@/lib/db";
import { jsonError, jsonOk, withErrorHandling } from "@/lib/api/respond";
import { applyPublicRateLimit } from "@/lib/api/guard";
import { notFound } from "@/lib/utils/assert";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Public metadata for a single file (no storage/bucket/key information). */
export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await applyPublicRateLimit(request, "public");
      const db = await getDatabase();
      const file = await db.getFileByDownloadId(id);
      if (!file || file.visibility !== "public") {
        if (!getConfig().download.publicListing) {
          return jsonError(404, "listing_disabled", "File tidak tersedia");
        }
        throw notFound("file_not_found", "File tidak ditemukan di download center");
      }
      return jsonOk({ file: toPublicFile(file), downloadPath: `/download/${file.downloadId}` });
    },
    { route: `/api/public/file/${id}`, method: "GET" },
  );
}
