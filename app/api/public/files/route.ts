import { getConfig } from "@/lib/config/env";
import { getDatabase, toPublicFile } from "@/lib/db";
import { jsonError, jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseSearchParams } from "@/lib/api/request";
import { listQuerySchema } from "@/lib/api/schemas";
import { applyPublicRateLimit } from "@/lib/api/guard";
import { sanitizeSearchTerm } from "@/lib/security/sanitize";

export const dynamic = "force-dynamic";

/**
 * Public file list for the Download Center.
 *
 * Returns display metadata only - never the storage id, bucket name, object key
 * or any Cloudflare credential.
 */
export async function GET(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      const config = getConfig();
      if (!config.download.publicListing) {
        return jsonError(
          404,
          "listing_disabled",
          "Daftar file publik dinonaktifkan oleh administrator (PUBLIC_LISTING=false).",
        );
      }

      await applyPublicRateLimit(request, "public");

      const { data, response } = parseSearchParams(request, listQuerySchema);
      if (response) return response;
      const query = data!;

      const db = await getDatabase();
      const limit = Math.min(60, Math.max(1, query.limit ?? 24));
      const page = Math.max(1, query.page ?? 1);

      const result = await db.listFiles({
        search: sanitizeSearchTerm(query.q ?? ""),
        category: query.category || undefined,
        visibility: "public",
        sort: query.sort ?? "createdAt",
        direction: query.direction ?? "desc",
        limit,
        offset: (page - 1) * limit,
      });

      return jsonOk({
        items: result.items.map(toPublicFile),
        total: result.total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(result.total / limit)),
      });
    },
    { route: "/api/public/files", method: "GET" },
  );
}
