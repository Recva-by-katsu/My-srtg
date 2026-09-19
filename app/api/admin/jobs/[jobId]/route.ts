import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/request";
import { requireAdmin } from "@/lib/api/guard";
import { z } from "zod";
import { advanceMoveJob, cancelMoveJob, getMoveJob } from "@/lib/services/files";

export const dynamic = "force-dynamic";

const stepSchema = z.object({
  byteBudget: z.coerce.number().int().min(1024 * 1024).max(256 * 1024 * 1024).optional(),
});

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { jobId } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { csrf: false });
      return jsonOk({ job: await getMoveJob(jobId) });
    },
    { route: `/api/admin/jobs/${jobId}`, method: "GET" },
  );
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { jobId } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { rateLimit: false });
      const { data, response } = await parseBody(request, stepSchema);
      if (response) return response;
      return jsonOk({ job: await advanceMoveJob(jobId, data!.byteBudget) });
    },
    { route: `/api/admin/jobs/${jobId}`, method: "POST" },
  );
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { jobId } = await context.params;
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      return jsonOk({ job: await cancelMoveJob(jobId) });
    },
    { route: `/api/admin/jobs/${jobId}`, method: "DELETE" },
  );
}
