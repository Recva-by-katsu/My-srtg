import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/request";
import { requireAdmin } from "@/lib/api/guard";
import { createStorageSchema } from "@/lib/api/schemas";
import { createStorage, listStorages } from "@/lib/services/storages";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { csrf: false });
      return jsonOk({ storages: await listStorages() });
    },
    { route: "/api/admin/storages", method: "GET" },
  );
}

export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      const { data, response } = await parseBody(request, createStorageSchema);
      if (response) return response;
      const result = await createStorage(data!);
      return jsonOk(result, { status: 201 });
    },
    { route: "/api/admin/storages", method: "POST" },
  );
}
