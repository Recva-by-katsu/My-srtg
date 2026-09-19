import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseSearchParams } from "@/lib/api/request";
import { requireAdmin } from "@/lib/api/guard";
import { listQuerySchema } from "@/lib/api/schemas";
import { listAdminFiles } from "@/lib/services/files";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { csrf: false });
      const { data, response } = parseSearchParams(request, listQuerySchema);
      if (response) return response;

      const result = await listAdminFiles(data!);
      return jsonOk({
        items: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      });
    },
    { route: "/api/admin/files", method: "GET" },
  );
}
