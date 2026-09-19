import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/request";
import { requireAdmin } from "@/lib/api/guard";
import { updateStorageSchema } from "@/lib/api/schemas";
import { getStorageView, removeStorage, updateStorage } from "@/lib/services/storages";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { csrf: false });
      return jsonOk({ storage: await getStorageView(id) });
    },
    { route: `/api/admin/storages/${id}`, method: "GET" },
  );
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      const { data, response } = await parseBody(request, updateStorageSchema);
      if (response) return response;

      // `verifyConnection` is a transport level flag, not part of the record itself.
      const { verifyConnection, ...patch } = data!;
      const result = await updateStorage(id, patch, { verifyConnection: Boolean(verifyConnection) });
      return jsonOk(result);
    },
    { route: `/api/admin/storages/${id}`, method: "PATCH" },
  );
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      const url = new URL(request.url);
      const force = url.searchParams.get("force") === "true";
      const result = await removeStorage(id, { force });
      return jsonOk(result);
    },
    { route: `/api/admin/storages/${id}`, method: "DELETE" },
  );
}
