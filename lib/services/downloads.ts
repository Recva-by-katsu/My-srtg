import { getConfig } from "@/lib/config/env";
import { getDatabase } from "@/lib/db";
import type { FileRecord } from "@/lib/db/types";
import { buildClient } from "@/lib/r2/storage-manager";
import { createSignedLink, verifySignedLink } from "@/lib/auth/session";
import { AppError, notFound } from "@/lib/utils/assert";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("downloads");

export interface RangeSpec {
  start?: number;
  end?: number;
}

/** Parses a single-range `Range: bytes=start-end` header. */
export function parseRangeHeader(header: string | null, size: number): RangeSpec | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;

  const rawStart = match[1];
  const rawEnd = match[2];

  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    // suffix range: last N bytes
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start >= size || start > end) return null;

  return { start, end: Math.min(end, size - 1) };
}

export function contentDisposition(file: FileRecord, inline = false): string {
  const type = inline ? "inline" : "attachment";
  const ascii = file.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(file.filename).replace(/['()]/g, escape);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export interface ServeOptions {
  rangeHeader?: string | null;
  method?: "GET" | "HEAD";
  /** Admins may download files that are hidden from the public center. */
  allowPrivate?: boolean;
  inline?: boolean;
}

export interface ResolvedDownload {
  file: FileRecord;
  response: Response;
  counted: boolean;
}

/**
 * Resolves a public download id and streams the object from whichever R2
 * account holds it.
 *
 * The visitor never learns the account id, bucket name or object key: in the
 * default `stream` mode the bytes are proxied (pass-through, zero buffering);
 * `redirect` mode hands out a short lived pre-signed URL; `worker` mode forwards
 * to the optional standalone download worker.
 */
export async function serveDownload(
  downloadId: string,
  options: ServeOptions = {},
): Promise<ResolvedDownload> {
  const db = await getDatabase();
  const config = getConfig();
  const file = await db.getFileByDownloadId(downloadId);

  if (!file) throw notFound("file_not_found", "File tidak ditemukan di download center");
  if (file.visibility !== "public" && !options.allowPrivate) {
    throw new AppError("file_private", "File ini bersifat privat dan tidak tersedia di download center", {
      status: 404,
    });
  }

  const storage = await db.getStorage(file.storageId);
  if (!storage) {
    throw new AppError(
      "storage_missing",
      "Storage tempat file ini berada tidak lagi terdaftar. Hubungi administrator.",
      { status: 503 },
    );
  }
  if (storage.status === "disabled") {
    throw new AppError("storage_disabled", "Storage sumber sedang dinonaktifkan sementara", {
      status: 503,
    });
  }

  const range = parseRangeHeader(options.rangeHeader ?? null, file.size);
  const isMethodHead = options.method === "HEAD";
  const counted = !range || range.start === 0;

  // -------------------------------------------------------------- worker mode
  if (config.download.mode === "worker") {
    if (!config.download.workerUrl) {
      throw new AppError("download_worker_missing", "DOWNLOAD_WORKER_URL belum di-set", { status: 500 });
    }
    const token = await createSignedLink(file.downloadId);
    const target = new URL(`${config.download.workerUrl.replace(/\/+$/, "")}/${file.downloadId}`);
    target.searchParams.set("token", token);
    if (options.inline) target.searchParams.set("inline", "1");

    return {
      file,
      counted,
      response: new Response(null, {
        status: 302,
        headers: {
          Location: target.toString(),
          "Cache-Control": "no-store",
        },
      }),
    };
  }

  const client = await buildClient(storage);

  // ------------------------------------------------------------ redirect mode
  if (config.download.mode === "redirect") {
    const url = await client.presignGetObject(file.objectKey, {
      expiresIn: Math.min(900, config.download.linkTtlSeconds),
      contentDisposition: contentDisposition(file, options.inline ?? config.download.inlineContentTypes),
      contentType: file.contentType,
    });
    return {
      file,
      counted,
      response: new Response(null, {
        status: 302,
        headers: { Location: url, "Cache-Control": "no-store" },
      }),
    };
  }

  // -------------------------------------------------------------- stream mode
  if (isMethodHead) {
    const headers = new Headers();
    headers.set("Content-Type", file.contentType || "application/octet-stream");
    headers.set("Content-Length", String(file.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Disposition", contentDisposition(file, options.inline ?? config.download.inlineContentTypes));
    headers.set("Cache-Control", "private, max-age=0, must-revalidate");
    if (file.etag) headers.set("ETag", file.etag.startsWith('"') ? file.etag : `"${file.etag}"`);
    return { file, counted: false, response: new Response(null, { status: 200, headers }) };
  }

  if (getConfig().app.demoMode) {
    return { file, counted, response: demoResponse(file, range) };
  }

  const upstream = await client.getObject(file.objectKey, {
    rangeStart: range?.start,
    rangeEnd: range?.end,
  });

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || file.contentType || "application/octet-stream");
  headers.set(
    "Content-Disposition",
    contentDisposition(file, options.inline ?? config.download.inlineContentTypes),
  );
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const etag = upstream.headers.get("etag");
  if (etag) headers.set("ETag", etag);
  const lastModified = upstream.headers.get("last-modified");
  if (lastModified) headers.set("Last-Modified", lastModified);

  return {
    file,
    counted,
    response: new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers }),
  };
}

/** In demo mode there is no real object, so a deterministic placeholder is served. */
function demoResponse(file: FileRecord, range: RangeSpec | null): Response {
  const encoder = new TextEncoder();
  const notice = encoder.encode(
    [
      "DEMO MODE - objek R2 tidak tersedia.",
      `File     : ${file.filename}`,
      `Ukuran   : ${file.size} bytes`,
      `Storage  : ${file.storageId}`,
      "",
      "Matikan DEMO_MODE dan tambahkan storage R2 untuk mengunduh file sungguhan.",
    ].join("\n"),
  );

  const headers = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": contentDisposition(file),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });

  if (range) {
    const slice = notice.slice(range.start ?? 0, (range.end ?? notice.length - 1) + 1);
    headers.set("Content-Length", String(slice.byteLength));
    headers.set("Content-Range", `bytes ${range.start ?? 0}-${Math.min(range.end ?? notice.length - 1, notice.length - 1)}/${notice.byteLength}`);
    return new Response(slice, { status: 206, headers });
  }

  headers.set("Content-Length", String(notice.byteLength));
  return new Response(notice, { status: 200, headers });
}

/** Verifies a signed link token (used by the standalone download worker flow). */
export async function resolveSignedLink(token: string): Promise<FileRecord> {
  const payload = await verifySignedLink(token);
  if (!payload) throw new AppError("invalid_link", "Link download tidak valid atau sudah kedaluwarsa", { status: 403 });
  const db = await getDatabase();
  const file = await db.getFileByDownloadId(payload.id);
  if (!file) throw notFound("file_not_found", "File tidak ditemukan");
  return file;
}

export async function incrementDownload(file: FileRecord): Promise<void> {
  const db = await getDatabase();
  try {
    await db.incrementDownloadCount(file.id);
  } catch (error) {
    logger.warn("Failed to increment download counter", {
      fileId: file.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
