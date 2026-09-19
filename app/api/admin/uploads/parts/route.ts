import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/request";
import { requireAdmin } from "@/lib/api/guard";
import { uploadPartSchema } from "@/lib/api/schemas";
import { presignParts } from "@/lib/services/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Issues fresh pre-signed URLs for the requested parts (also used on resume). */
export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { rateLimit: false });
      const { data, response } = await parseBody(request, uploadPartSchema);
      if (response) return response;

      const result = await presignParts(data!.sessionId, data!.partNumbers);
      return jsonOk(result);
    },
    { route: "/api/admin/uploads/parts", method: "POST" },
  );
}
