import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/api/guard";
import { abortUpload, reconcileSession } from "@/lib/services/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Reconciles a session with R2 (`ListParts`) - the server side of resume. */
export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { csrf: false, rateLimit: false });
      const { session, uploadedParts } = await reconcileSession(id);
      return jsonOk({
        session: {
          id: session.id,
          filename: session.filename,
          size: session.size,
          partSize: session.partSize,
          partsTotal: session.partsTotal,
          partsUploaded: session.partsUploaded,
          status: session.status,
          storageId: session.storageId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        uploadedParts,
      });
    },
    { route: `/api/admin/uploads/${id}`, method: "GET" },
  );
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      return jsonOk(await abortUpload(id));
    },
    { route: `/api/admin/uploads/${id}`, method: "DELETE" },
  );
}
