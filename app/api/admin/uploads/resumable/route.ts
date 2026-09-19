import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/api/guard";
import { listResumableSessions } from "@/lib/services/uploads";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { csrf: false });
      const sessions = await listResumableSessions();
      return jsonOk({
        sessions: sessions.map((session) => ({
          id: session.id,
          filename: session.filename,
          size: session.size,
          partSize: session.partSize,
          partsTotal: session.partsTotal,
          partsUploaded: session.uploadedParts,
          status: session.status,
          storageName: session.storageName,
          fingerprint: session.clientFingerprint,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        })),
      });
    },
    { route: "/api/admin/uploads/resumable", method: "GET" },
  );
}
