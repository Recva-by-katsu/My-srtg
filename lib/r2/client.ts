import {
  booleanOr,
  buildXml,
  escapeXml,
  findAll,
  numberOr,
  parseXml,
  textOf,
  type XmlNode,
} from "@/lib/r2/xml";
import { presignUrl, sha256HexPayload, signRequest, UNSIGNED_PAYLOAD } from "@/lib/r2/sigv4";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("r2-client");

export interface R2ConnectionConfig {
  /** Internal storage id (used for logging only). */
  id?: string;
  name?: string;
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Defaults to https://<accountId>.r2.cloudflarestorage.com */
  endpoint?: string;
  /** R2 uses the `auto` region. */
  region?: string;
}

export class R2Error extends Error {
  readonly status: number;
  readonly code: string;
  readonly storage: string;
  readonly requestId?: string;

  constructor(
    message: string,
    options: { status: number; code: string; storage: string; requestId?: string },
  ) {
    super(message);
    this.name = "R2Error";
    this.status = options.status;
    this.code = options.code;
    this.storage = options.storage;
    this.requestId = options.requestId;
  }
}

export interface S3ObjectSummary {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  storageClass?: string;
}

export interface ListObjectsResult {
  objects: S3ObjectSummary[];
  keyCount: number;
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export interface ObjectMetadata {
  key: string;
  size: number;
  contentType: string;
  etag: string;
  lastModified: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface UploadedPart extends CompletedPart {
  size: number;
  lastModified: string;
}

export interface GetObjectOptions {
  rangeStart?: number;
  rangeEnd?: number;
  ifMatch?: string;
  responseContentType?: string;
  responseContentDisposition?: string;
  signal?: AbortSignal;
}

const DEFAULT_REGION = "auto";

/**
 * Bridges the `Uint8Array<ArrayBufferLike>` / `BodyInit` type mismatch between
 * different TypeScript DOM lib versions without copying the buffer.
 */
function asBody(value: Uint8Array | string): BodyInit {
  return value as unknown as BodyInit;
}

function normalizeEndpoint(config: R2ConnectionConfig): string {
  if (config.endpoint && config.endpoint.trim()) {
    return config.endpoint.trim().replace(/\/+$/, "");
  }
  return `https://${config.accountId}.r2.cloudflarestorage.com`;
}

/**
 * S3 compatible client for a single Cloudflare R2 bucket.
 *
 * The class is intentionally small: it exposes exactly the operations the
 * storage pool needs (metadata, streaming reads, multipart writes, deletes and
 * pre-signed URLs for direct browser transfers).
 */
export class R2Client {
  readonly config: R2ConnectionConfig;
  readonly endpoint: string;
  readonly region: string;

  constructor(config: R2ConnectionConfig) {
    this.config = config;
    this.endpoint = normalizeEndpoint(config);
    this.region = config.region?.trim() || DEFAULT_REGION;
  }

  get label(): string {
    return this.config.name ?? this.config.id ?? this.config.bucket;
  }

  /** Builds the absolute (path style) URL of an object - the layout R2 expects. */
  objectUrl(key: string, query?: Record<string, string | number | undefined>): URL {
    const url = new URL(`${this.endpoint}/${encodeURIComponent(this.config.bucket)}${encodeKeyPath(key)}`);
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    return url;
  }

  bucketUrl(query?: Record<string, string | number | undefined>): URL {
    const url = new URL(`${this.endpoint}/${encodeURIComponent(this.config.bucket)}`);
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    return url;
  }

  private async execute(
    method: string,
    url: URL,
    init: { body?: BodyInit | null; headers?: Record<string, string>; signal?: AbortSignal } = {},
  ): Promise<Response> {
    const payloadHash =
      init.body === undefined || init.body === null ? undefined : await sha256HexPayload(init.body);

    const signed = await signRequest({
      method,
      url,
      region: this.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      headers: init.headers ?? {},
      payloadHash: payloadHash ?? UNSIGNED_PAYLOAD,
    });

    const response = await fetch(url, {
      method,
      headers: { ...signed.headers, ...(init.headers ?? {}) },
      body: init.body ?? undefined,
      signal: init.signal,
    });

    return response;
  }

  private async request<T>(
    method: string,
    url: URL,
    init: { body?: BodyInit | null; headers?: Record<string, string>; signal?: AbortSignal } = {},
    parser?: (document: XmlNode, response: Response) => T,
  ): Promise<T> {
    const response = await this.execute(method, url, init);
    const text = await response.text();

    if (!response.ok) {
      throw this.toError(method, url, response, text);
    }

    if (!parser) return undefined as T;
    return parser(parseXml(text), response);
  }

  private toError(method: string, url: URL, response: Response, body: string): R2Error {
    let code = `HTTP_${response.status}`;
    let message = `${method} ${url.pathname} failed with status ${response.status}`;
    try {
      const document = parseXml(body);
      const parsedCode = textOf(document, "Code");
      const parsedMessage = textOf(document, "Message");
      if (parsedCode) code = parsedCode;
      if (parsedMessage) message = parsedMessage;
    } catch {
      /* body was not XML */
    }
    return new R2Error(message, {
      status: response.status,
      code,
      storage: this.label,
      requestId: response.headers.get("cf-ray") ?? undefined,
    });
  }

  // ---------------------------------------------------------------- metadata

  async headBucket(signal?: AbortSignal): Promise<{ ok: true; region?: string }> {
    const url = this.bucketUrl();
    const response = await this.execute("HEAD", url, { signal });
    if (!response.ok) {
      throw this.toError("HEAD", url, response, "");
    }
    return { ok: true, region: response.headers.get("cf-r2-region") ?? undefined };
  }

  async headObject(key: string, signal?: AbortSignal): Promise<ObjectMetadata> {
    const url = this.objectUrl(key);
    const response = await this.execute("HEAD", url, { signal });
    if (response.status === 404) {
      throw new R2Error(`Object not found: ${key}`, {
        status: 404,
        code: "NoSuchKey",
        storage: this.label,
      });
    }
    if (!response.ok) throw this.toError("HEAD", url, response, "");

    return {
      key,
      size: Number(response.headers.get("content-length") ?? 0),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      etag: (response.headers.get("etag") ?? "").replace(/"/g, ""),
      lastModified: response.headers.get("last-modified") ?? new Date().toISOString(),
    };
  }

  async listObjectsV2(
    options: { prefix?: string; continuationToken?: string; maxKeys?: number; signal?: AbortSignal } = {},
  ): Promise<ListObjectsResult> {
    const url = this.bucketUrl({
      "list-type": 2,
      prefix: options.prefix || undefined,
      "continuation-token": options.continuationToken,
      "max-keys": options.maxKeys ?? 1000,
    });

    return this.request("GET", url, { signal: options.signal }, (document) => {
      const contents = findAll(document, "Contents").map((node) => ({
        key: textOf(node, "Key"),
        size: numberOr(node, "Size"),
        lastModified: textOf(node, "LastModified"),
        etag: textOf(node, "ETag").replace(/"/g, ""),
        storageClass: textOf(node, "StorageClass") || undefined,
      }));
      return {
        objects: contents,
        keyCount: numberOr(document, "KeyCount", contents.length),
        isTruncated: booleanOr(document, "IsTruncated"),
        nextContinuationToken: textOf(document, "NextContinuationToken") || undefined,
      };
    });
  }

  /** Sums the size of every object under a prefix. Stops after `maxPages` pages. */
  async measureUsage(
    options: { prefix?: string; maxPages?: number; signal?: AbortSignal } = {},
  ): Promise<{ bytes: number; objects: number; truncated: boolean; pages: number }> {
    const maxPages = options.maxPages ?? 100;
    let bytes = 0;
    let objects = 0;
    let pages = 0;
    let token: string | undefined;
    let truncated = false;

    do {
      const page = await this.listObjectsV2({
        prefix: options.prefix,
        continuationToken: token,
        maxKeys: 1000,
        signal: options.signal,
      });
      pages += 1;
      for (const object of page.objects) {
        // Multipart leftovers also consume quota, so they are counted as well.
        bytes += object.size;
        objects += 1;
      }
      token = page.nextContinuationToken;
      truncated = page.isTruncated;
    } while (truncated && token && pages < maxPages);

    return { bytes, objects, truncated: Boolean(truncated && token), pages };
  }

  // ------------------------------------------------------------------- reads

  /**
   * Streams an object (or a byte range of it). The returned `Response.body` is
   * passed straight through to the client - nothing is buffered in memory.
   */
  async getObject(key: string, options: GetObjectOptions = {}): Promise<Response> {
    const query: Record<string, string | undefined> = {};
    if (options.responseContentType) query["response-content-type"] = options.responseContentType;
    if (options.responseContentDisposition) {
      query["response-content-disposition"] = options.responseContentDisposition;
    }

    const url = this.objectUrl(key, query);
    const headers: Record<string, string> = {};
    if (options.rangeStart !== undefined || options.rangeEnd !== undefined) {
      const start = options.rangeStart ?? 0;
      const end = options.rangeEnd !== undefined ? options.rangeEnd : "";
      headers.Range = `bytes=${start}-${end}`;
    }
    if (options.ifMatch) headers["If-Match"] = options.ifMatch;

    const response = await this.execute("GET", url, { headers, signal: options.signal });
    if (!response.ok && response.status !== 206) {
      const body = await response.text();
      throw this.toError("GET", url, response, body);
    }
    return response;
  }

  // ------------------------------------------------------------------ writes

  async putObject(
    key: string,
    body: Uint8Array | string,
    contentType = "application/octet-stream",
  ): Promise<{ etag: string }> {
    const url = this.objectUrl(key);
    return this.request(
      "PUT",
      url,
      { body: asBody(body), headers: { "content-type": contentType } },
      (_document, response) => ({ etag: (response.headers.get("etag") ?? "").replace(/"/g, "") }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.request("DELETE", this.objectUrl(key));
  }

  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += 500) chunks.push(keys.slice(i, i + 500));

    for (const chunk of chunks) {
      const body = buildXml("Delete", [
        ...chunk.map((key) => `<Object><Key>${escapeXml(key)}</Key></Object>`),
        "<Quiet>true</Quiet>",
      ]);
      const url = this.bucketUrl({ delete: "" });
      await this.request("POST", url, {
        body,
        headers: { "content-type": "application/xml" },
      });
    }
  }

  // ---------------------------------------------------------------- multipart

  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const url = this.objectUrl(key, { uploads: "" });
    const result = await this.request(
      "POST",
      url,
      { headers: { "content-type": contentType } },
      (document) => textOf(document, "UploadId"),
    );
    if (!result) {
      throw new R2Error("R2 did not return an UploadId", {
        status: 502,
        code: "InvalidResponse",
        storage: this.label,
      });
    }
    return result;
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array,
  ): Promise<CompletedPart> {
    const url = this.objectUrl(key, { partNumber, uploadId });
    const response = await this.execute("PUT", url, { body: asBody(body) });
    if (!response.ok) {
      throw this.toError("PUT", url, response, await response.text());
    }
    await response.arrayBuffer().catch(() => undefined);
    return {
      partNumber,
      etag: (response.headers.get("etag") ?? "").replace(/"/g, ""),
    };
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<{ etag: string; location?: string }> {
    if (parts.length === 0) {
      throw new R2Error("Cannot complete a multipart upload without parts", {
        status: 400,
        code: "InvalidPart",
        storage: this.label,
      });
    }
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const body = buildXml(
      "CompleteMultipartUpload",
      ordered.map(
        (part) =>
          `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(
            part.etag.includes('"') ? part.etag : `"${part.etag}"`,
          )}</ETag></Part>`,
      ),
    );

    const url = this.objectUrl(key, { uploadId });
    return this.request(
      "POST",
      url,
      { body, headers: { "content-type": "application/xml" } },
      (document) => ({
        etag: textOf(document, "ETag").replace(/"/g, ""),
        location: textOf(document, "Location") || undefined,
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const url = this.objectUrl(key, { uploadId });
    await this.request("DELETE", url);
  }

  async listParts(
    key: string,
    uploadId: string,
    options: { partNumberMarker?: number; signal?: AbortSignal } = {},
  ): Promise<{ parts: UploadedPart[]; isTruncated: boolean; nextPartNumberMarker?: number }> {
    const url = this.objectUrl(key, {
      uploadId,
      "max-parts": 1000,
      "part-number-marker": options.partNumberMarker || undefined,
    });

    return this.request(
      "GET",
      url,
      { signal: options.signal },
      (document) => {
        const parts = findAll(document, "Part").map((node) => ({
          partNumber: numberOr(node, "PartNumber"),
          size: numberOr(node, "Size"),
          etag: textOf(node, "ETag").replace(/"/g, ""),
          lastModified: textOf(node, "LastModified"),
        }));
        const marker = numberOr(document, "NextPartNumberMarker");
        return {
          parts,
          isTruncated: booleanOr(document, "IsTruncated"),
          nextPartNumberMarker: marker || undefined,
        };
      },
    );
  }

  /** Lists every in-progress multipart upload of the bucket (used to clean up). */
  async listMultipartUploads(prefix?: string): Promise<Array<{ key: string; uploadId: string; initiated: string }>> {
    const url = this.bucketUrl({ uploads: "", prefix: prefix || undefined, "max-uploads": 1000 });
    return this.request("GET", url, {}, (document) =>
      findAll(document, "Upload").map((node) => ({
        key: textOf(node, "Key"),
        uploadId: textOf(node, "UploadId"),
        initiated: textOf(node, "Initiated"),
      })),
    );
  }

  // ---------------------------------------------------------------- presigned

  async presignPutObject(
    key: string,
    options: { expiresIn?: number; contentType?: string } = {},
  ): Promise<string> {
    return presignUrl({
      method: "PUT",
      url: this.objectUrl(key),
      region: this.region,
      expiresIn: options.expiresIn ?? 3600,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn = 3600,
  ): Promise<string> {
    return presignUrl({
      method: "PUT",
      url: this.objectUrl(key, { partNumber, uploadId }),
      region: this.region,
      expiresIn,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  async presignGetObject(
    key: string,
    options: { expiresIn?: number; contentDisposition?: string; contentType?: string } = {},
  ): Promise<string> {
    const url = this.objectUrl(key, {
      "response-content-disposition": options.contentDisposition,
      "response-content-type": options.contentType,
    });
    return presignUrl({
      method: "GET",
      url,
      region: this.region,
      expiresIn: options.expiresIn ?? 900,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }
}

function encodeKeyPath(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  if (!normalized) return "";
  return `/${normalized.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

export function describeR2Error(error: unknown): { message: string; code: string; status: number } {
  if (error instanceof R2Error) {
    return { message: error.message, code: error.code, status: error.status };
  }
  if (error instanceof Error) {
    logger.debug("Non R2 error surfaced from storage layer", { message: error.message });
    return { message: error.message, code: "storage_error", status: 502 };
  }
  return { message: String(error), code: "storage_error", status: 502 };
}
