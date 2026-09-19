import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { applyPublicRateLimit } from "@/lib/api/guard";
import { getSessionFromRequest } from "@/lib/auth/session";
import { incrementDownload, serveDownload } from "@/lib/services/downloads";
import { getConfig } from "@/lib/config/env";

export const dynamic = "force-dynamic";
/** Streaming a multi-gigabyte object can legitimately take a long time. */
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

/**
 * Public download endpoint.
 *
 * - resolves the metadata record
 * - locates the R2 account/bucket that physically holds the object
 * - streams the bytes back to the visitor (pass-through, no buffering)
 * - honours HTTP Range requests so download managers and video players can
 *   resume interrupted transfers
 *
 * Nothing about the underlying storage (account id, bucket, keys) is exposed.
 */
export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  return withErrorHandling(
    async () => {
      await applyPublicRateLimit(request, "download");
      const session = await getSessionFromRequest(request);
      const url = new URL(request.url);

      if (url.searchParams.get("info") === "1") {
        const resolved = await serveDownload(id, {
          method: "HEAD",
          allowPrivate: Boolean(session),
        });
        return jsonOk({
          filename: resolved.file.filename,
          size: resolved.file.size,
          contentType: resolved.file.contentType,
          downloadCount: resolved.file.downloadCount,
        });
      }

      const resolved = await serveDownload(id, {
        rangeHeader: request.headers.get("range"),
        method: "GET",
        allowPrivate: Boolean(session),
        inline: url.searchParams.get("inline") === "1",
      });

      if (resolved.counted && !getConfig().app.demoMode) {
        // Fire and forget: the counter must never delay the first byte.
        void incrementDownload(resolved.file);
      }

      return resolved.response;
    },
    { route: `/download/${id}`, method: "GET" },
  );
}

export async function HEAD(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withErrorHandling(
    async () => {
      const session = await getSessionFromRequest(request);
      const resolved = await serveDownload(id, {
        method: "HEAD",
        allowPrivate: Boolean(session),
      });
      return resolved.response;
    },
    { route: `/download/${id}`, method: "HEAD" },
  );
}
