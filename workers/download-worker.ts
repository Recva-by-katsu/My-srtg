/**
 * Katsu R2 Manager - standalone download worker (OPTIONAL).
 * -----------------------------------------------------------------------------
 * Deploy this only if you want downloads served from a separate Cloudflare
 * Worker (for example to keep the Next.js app free of bandwidth-heavy requests
 * or to attach a custom download domain). The application itself already streams
 * files with full HTTP Range support, so this file is not required.
 *
 * How it fits together
 *   1. Set `DOWNLOAD_MODE=worker` and `DOWNLOAD_WORKER_URL=https://download.example.com`
 *      on the main application.
 *   2. `/download/[id]` then answers with a 302 to `<worker>/<downloadId>?token=<signed>`.
 *   3. This worker verifies the token, reads the file metadata from the SAME D1
 *      database, and streams the object from an R2 binding.
 *
 * Deploying without a terminal
 *   Cloudflare Dashboard -> Workers & Pages -> Create -> Worker -> give it a name
 *   -> Settings -> Bindings:
 *     * D1 database  -> variable name `DB`, choose the Katsu database
 *     * R2 bucket    -> variable name `R2` (default bucket) and/or one binding
 *                       per bucket, then map them with the `R2_BUCKET_BINDINGS`
 *                       variable, e.g. {"katsu-media":"R2_KATSU","katsu-backup":"R2_BACKUP"}
 *   -> Settings -> Variables and Secrets:
 *     * `DOWNLOAD_SIGNING_SECRET` (Secret) - must match the main application
 *     * `ALLOWED_ORIGINS` (optional)       - comma separated list, default "*"
 *   -> Deployments -> paste this file into the editor (or connect the Git repo
 *      with `workers/download-worker.ts` as the entry point) -> Save and deploy.
 *
 * Security notes
 *   * No R2 access keys live here: bindings are authorized by the platform.
 *   * Account ids, bucket names and object keys are never returned to the client.
 *   * Tokens are HMAC-SHA256 signed and expire (default 6 hours, configurable on
 *     the app through DOWNLOAD_LINK_TTL_SECONDS).
 */

// ---------------------------------------------------------------------------
// Minimal ambient types. The project does not depend on @cloudflare/workers-types
// so that the whole repository type-checks with the plain Next.js tsconfig.
// ---------------------------------------------------------------------------

interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

interface R2ObjectBody {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  body: ReadableStream<Uint8Array>;
  range?: R2Range & { firstByte: number; lastByte: number };
  writeHttpMetadata(headers: Headers): void;
}

interface R2BucketBinding {
  get(key: string, options?: { range?: R2Range; onlyIf?: unknown }): Promise<R2ObjectBody | null>;
  head(key: string): Promise<Omit<R2ObjectBody, "body"> | null>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1DatabaseBinding {
  prepare(sql: string): D1PreparedStatement;
}

interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  DB?: D1DatabaseBinding;
  R2?: R2BucketBinding;
  /** JSON object mapping bucket name -> binding name, e.g. {"katsu-media":"R2_MEDIA"} */
  R2_BUCKET_BINDINGS?: string;
  DOWNLOAD_SIGNING_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  /** Set to "false" to allow direct access without a signed token (private files still require one). */
  REQUIRE_TOKEN?: string;
  /** Cache-Control max-age applied to successful downloads (seconds). */
  DOWNLOAD_CACHE_SECONDS?: string;
  [key: string]: unknown;
}

interface FileRow {
  id: string;
  download_id: string;
  filename: string;
  original_name: string;
  size: number;
  content_type: string;
  bucket: string;
  object_key: string;
  etag: string | null;
  visibility: string;
  download_count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOWNLOAD_ID_PATTERN = /^[A-Za-z0-9_-]{6,40}$/;

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function hmacBase64Url(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(secret.length >= 32 ? secret : secret.padEnd(32, "\u0000"));
  const key = await crypto.subtle.importKey("raw", keyMaterial as unknown as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message) as unknown as ArrayBuffer);
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** Mirrors `verifySignedLink()` in lib/auth/session.ts of the main application. */
async function verifyToken(token: string | null, secret: string | undefined): Promise<{ id: string; exp: number } | null> {
  if (!token || !secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await hmacBase64Url(secret, `link.${body}`);
  if (!safeEqual(expected, signature)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as { id?: string; exp?: number; scope?: string };
    if (payload.scope !== "download" || typeof payload.exp !== "number" || typeof payload.id !== "string") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: payload.id, exp: payload.exp };
  } catch {
    return null;
  }
}

function jsonResponse(status: number, payload: Record<string, unknown>, headers: Headers): Response {
  const body = JSON.stringify({ ok: status < 400, ...payload });
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(body, { status, headers: responseHeaders });
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowed.includes("*")) headers.set("Access-Control-Allow-Origin", "*");
  else if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.append("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Range, Content-Type");
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, ETag, Last-Modified");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function resolveBucket(env: Env, bucket: string): R2BucketBinding | null {
  if (env.R2_BUCKET_BINDINGS) {
    try {
      const mapping = JSON.parse(env.R2_BUCKET_BINDINGS) as Record<string, string>;
      const bindingName = mapping[bucket];
      if (bindingName) {
        const binding = env[bindingName];
        if (binding && typeof (binding as R2BucketBinding).get === "function") return binding as R2BucketBinding;
      }
    } catch {
      // A malformed mapping simply falls back to the default binding below.
    }
  }
  return env.R2 ?? null;
}

interface RangeRequest {
  start: number;
  end: number;
}

function parseRange(header: string | null, size: number): RangeRequest | null {
  if (!header || !header.startsWith("bytes=")) return null;
  const spec = header.slice(6).split(",")[0]?.trim();
  if (!spec) return null;

  if (spec.startsWith("-")) {
    const suffix = Number(spec.slice(1));
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }

  const [rawStart, rawEnd] = spec.split("-");
  const start = Number(rawStart);
  if (!Number.isFinite(start) || start < 0 || start >= size) return null;
  const end = rawEnd ? Number(rawEnd) : size - 1;
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const needsStar = /[^\x20-\x7e]/.test(filename);
  const type = inline ? "inline" : "attachment";
  if (!needsStar) return `${type}; filename="${ascii}"`;
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const INLINE_SAFE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "text/plain",
]);

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

async function serve(request: Request, env: Env, ctx: WaitUntil, downloadId: string): Promise<Response> {
  const headers = corsHeaders(request, env);

  if (!DOWNLOAD_ID_PATTERN.test(downloadId)) {
    return jsonResponse(400, { error: { code: "invalid_id", message: "ID unduhan tidak valid" } }, headers);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const inlineParam = url.searchParams.get("inline") === "1";
  const secret = env.DOWNLOAD_SIGNING_SECRET || env.SESSION_SECRET;
  const payload = await verifyToken(token, secret);

  const requireToken = (env.REQUIRE_TOKEN ?? "true").toLowerCase() !== "false";
  if (!payload && requireToken) {
    return jsonResponse(403, { error: { code: "invalid_link", message: "Tautan unduhan tidak valid atau sudah kedaluwarsa" } }, headers);
  }
  if (payload && payload.id !== downloadId) {
    return jsonResponse(403, { error: { code: "link_mismatch", message: "Tautan tidak cocok dengan file yang diminta" } }, headers);
  }

  if (!env.DB) {
    return jsonResponse(
      503,
      { error: { code: "db_missing", message: "Worker ini belum memiliki binding D1 bernama DB" } },
      headers,
    );
  }

  const row = await env.DB.prepare(
    `SELECT id, download_id, filename, original_name, size, content_type, bucket, object_key, etag, visibility, download_count
     FROM files WHERE download_id = ?1 LIMIT 1`,
  )
    .bind(downloadId)
    .first<FileRow>();

  if (!row) {
    return jsonResponse(404, { error: { code: "file_not_found", message: "File tidak ditemukan di download center" } }, headers);
  }

  // Private files always need a valid signed token, even when REQUIRE_TOKEN=false.
  if (row.visibility !== "public" && !payload) {
    return jsonResponse(404, { error: { code: "file_not_found", message: "File tidak ditemukan di download center" } }, headers);
  }

  const bucket = resolveBucket(env, row.bucket);
  if (!bucket) {
    return jsonResponse(
      503,
      {
        error: {
          code: "bucket_binding_missing",
          message: `Tidak ada binding R2 untuk bucket "${row.bucket}". Tambahkan binding R2 atau isi R2_BUCKET_BINDINGS.`,
        },
      },
      headers,
    );
  }

  const filename = row.original_name || row.filename;
  const inline = inlineParam && INLINE_SAFE_TYPES.has(row.content_type);
  const cacheSeconds = Math.max(0, Number(env.DOWNLOAD_CACHE_SECONDS ?? "3600") || 0);
  const isHead = request.method.toUpperCase() === "HEAD";

  const range = parseRange(request.headers.get("Range"), row.size);

  if (isHead) {
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Type", row.content_type || "application/octet-stream");
    headers.set("Content-Length", range ? String(range.end - range.start + 1) : String(row.size));
    headers.set("Content-Disposition", contentDisposition(filename, inline));
    if (row.etag) headers.set("ETag", row.etag.startsWith('"') ? row.etag : `"${row.etag}"`);
    headers.set("Cache-Control", `public, max-age=${cacheSeconds}`);
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${row.size}`);
      return new Response(null, { status: 206, headers });
    }
    return new Response(null, { status: 200, headers });
  }

  const object = await bucket.get(row.object_key, range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : undefined);

  if (!object) {
    return jsonResponse(
      404,
      { error: { code: "object_missing", message: "Objek tidak ditemukan di bucket R2. Jalankan Sinkronkan di halaman Storage R2." } },
      headers,
    );
  }

  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", row.content_type || "application/octet-stream");
  headers.set("Content-Disposition", contentDisposition(filename, inline));
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  headers.set("Cache-Control", range ? "no-store" : `public, max-age=${cacheSeconds}`);

  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${row.size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(object.size || row.size));

  // Only the first byte-range of a download counts as one download.
  if (!range) {
    ctx.waitUntil(
      env.DB.prepare("UPDATE files SET download_count = download_count + 1, updated_at = ?2 WHERE id = ?1")
        .bind(row.id, new Date().toISOString())
        .run()
        .catch(() => undefined),
    );
  }

  return new Response(object.body, { status: 200, headers });
}

const katsuDownloadWorker = {
  async fetch(request: Request, env: Env, ctx: WaitUntil): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const headers = corsHeaders(request, env);

    if (method === "OPTIONS") return new Response(null, { status: 204, headers });

    if (url.pathname === "/healthz" || url.pathname === "/health") {
      return jsonResponse(200, { status: "ok", worker: "katsu-download", database: Boolean(env.DB), bucket: Boolean(env.R2) }, headers);
    }

    if (method !== "GET" && method !== "HEAD") {
      return jsonResponse(405, { error: { code: "method_not_allowed", message: "Hanya GET dan HEAD yang didukung" } }, headers);
    }

    const downloadId = decodeURIComponent(url.pathname.replace(/^\/+/, "")).split("/")[0] ?? "";
    if (!downloadId) {
      return jsonResponse(
        200,
        {
          ok: true,
          service: "Katsu R2 Manager download worker",
          usage: "GET /<downloadId>?token=<signed-token>",
          docs: "https://developers.cloudflare.com/r2/",
        },
        headers,
      );
    }

    try {
      return await serve(request, env, ctx, downloadId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse(500, { error: { code: "worker_error", message } }, headers);
    }
  },
};

export default katsuDownloadWorker;
