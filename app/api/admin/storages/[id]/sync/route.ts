import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/api/guard";
import { resyncUsage } from "@/lib/services/storages";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { rateLimit: false });
      return jsonOk({ sync: await resyncUsage(id) });
    },
    { route: `/api/admin/storages/${id}/sync`, method: "POST" },
  );
}
