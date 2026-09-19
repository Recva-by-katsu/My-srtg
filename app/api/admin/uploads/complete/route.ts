import { getDatabase, toSafeFile } from "@/lib/db";
import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/request";
import { requireAdmin } from "@/lib/api/guard";
import { uploadCompleteSchema } from "@/lib/api/schemas";
import { completeUpload } from "@/lib/services/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      const { data, response } = await parseBody(request, uploadCompleteSchema);
      if (response) return response;

      const file = await completeUpload(data!.sessionId, data!.parts ?? []);
      const db = await getDatabase();
      const storage = await db.getStorage(file.storageId);

      return jsonOk({
        file: toSafeFile(file, storage?.name ?? null),
        downloadPath: `/download/${file.downloadId}`,
      });
    },
    { route: "/api/admin/uploads/complete", method: "POST" },
  );
}
