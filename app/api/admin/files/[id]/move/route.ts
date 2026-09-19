import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/request";
import { requireAdmin } from "@/lib/api/guard";
import { moveFileSchema } from "@/lib/api/schemas";
import { startMoveJob } from "@/lib/services/files";

export const dynamic = "force-dynamic";

/**
 * Starts a cross-account move job.
 *
 * The job is advanced by the client in small steps (`/api/admin/jobs/[jobId]`)
 * so that no single request has to stream gigabytes inside a worker invocation.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      const { data, response } = await parseBody(request, moveFileSchema);
      if (response) return response;

      const job = await startMoveJob(id, data!.targetStorageId, { deleteSource: data!.deleteSource });
      return jsonOk({ job }, { status: 202 });
    },
    { route: `/api/admin/files/${id}/move`, method: "POST" },
  );
}
