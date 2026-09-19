import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/request";
import { requireAdmin } from "@/lib/api/guard";
import { updateFileSchema } from "@/lib/api/schemas";
import {
  deleteFile,
  getAdminFile,
  renameFile,
  setFileVisibility,
} from "@/lib/services/files";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { csrf: false });
      return jsonOk({ file: await getAdminFile(id) });
    },
    { route: `/api/admin/files/${id}`, method: "GET" },
  );
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      const { data, response } = await parseBody(request, updateFileSchema);
      if (response) return response;
      const patch = data!;

      let file = await getAdminFile(id);
      if (patch.filename && patch.filename !== file.filename) {
        file = await renameFile(id, patch.filename);
      }
      if (patch.visibility && patch.visibility !== file.visibility) {
        file = await setFileVisibility(id, patch.visibility);
      }

      return jsonOk({ file });
    },
    { route: `/api/admin/files/${id}`, method: "PATCH" },
  );
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      const url = new URL(request.url);
      const keepObject = url.searchParams.get("keepObject") === "true";
      return jsonOk(await deleteFile(id, { keepObject }));
    },
    { route: `/api/admin/files/${id}`, method: "DELETE" },
  );
}
