import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/request";
import { requireAdmin } from "@/lib/api/guard";
import { uploadInitSchema } from "@/lib/api/schemas";
import { initUpload } from "@/lib/services/uploads";

export const dynamic = "force-dynamic";
/** Multipart initiation is cheap, but slow object stores deserve head room. */
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      const { data, response } = await parseBody(request, uploadInitSchema);
      if (response) return response;

      const result = await initUpload(data!);

      return jsonOk(
        {
          sessionId: result.session.id,
          filename: result.session.filename,
          size: result.session.size,
          partSize: result.partSize,
          parts: result.parts,
          partsUploaded: result.session.partsUploaded,
          presignedParts: result.presignedParts,
          storage: result.storage,
          selection: {
            reason: result.selection.reason,
            forced: result.selection.forced,
            freeBytes: result.selection.freeBytes,
            candidates: result.selection.candidates,
          },
          resumed: result.resumed,
        },
        { status: result.resumed ? 200 : 201 },
      );
    },
    { route: "/api/admin/uploads/init", method: "POST" },
  );
}
