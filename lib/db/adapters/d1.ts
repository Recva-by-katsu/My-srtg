import { getConfig } from "@/lib/config/env";
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from "@/lib/db/schema";
import type {
  DatabaseAdapter,
  DatabaseInfo,
  FileQuery,
  FileRecord,
  FileSortField,
  Paginated,
  PoolStats,
  SortDirection,
  StorageRecord,
  UploadSessionRecord,
} from "@/lib/db/types";
import { escapeLikeTerm } from "@/lib/security/sanitize";
import { AppError } from "@/lib/utils/assert";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("db-d1");

type Param = string | number | null;

interface D1ResultSet {
  results?: Record<string, unknown>[];
  success?: boolean;
  meta?: { changes?: number; duration?: number; rows_read?: number; rows_written?: number };
}

interface D1Response {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ message: string }>;
  result?: D1ResultSet[];
}

/**
 * Cloudflare D1 adapter using the official HTTP API.
 *
 * The HTTP API is used instead of the Workers binding so the exact same code path
 * works on Vercel (Node.js), Cloudflare Pages/Workers (workerd) and local dev.
 * It only needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and `DATABASE_ID`.
 */
export class D1Adapter implements DatabaseAdapter {
  readonly driver = "d1" as const;

  private get accountId(): string {
    return getConfig().cloudflare.accountId;
  }

  private get databaseId(): string {
    return getConfig().database.d1DatabaseId;
  }

  private get apiUrl(): string {
    return `${getConfig().cloudflare.apiBaseUrl}/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
  }

  private assertConfigured(): void {
    const config = getConfig();
    if (!this.accountId || !config.cloudflare.apiToken || !this.databaseId) {
      throw new AppError(
        "database_not_configured",
        "Database D1 belum terkonfigurasi. Isi CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN dan DATABASE_ID, lalu jalankan inisialisasi database dari Admin → Settings.",
        { status: 503 },
      );
    }
  }

  private async post(body: unknown): Promise<D1Response> {
    this.assertConfigured();
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getConfig().cloudflare.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let payload: D1Response;
    try {
      payload = JSON.parse(text) as D1Response;
    } catch {
      throw new AppError("database_error", `D1 returned a non JSON response (HTTP ${response.status})`, {
        status: 502,
      });
    }

    if (!response.ok || payload.success === false) {
      const message =
        payload.errors?.map((error) => `${error.code}: ${error.message}`).join(", ") ||
        `D1 request failed with HTTP ${response.status}`;
      logger.error("D1 request failed", { message });
      throw new AppError("database_error", message, { status: 502 });
    }

    return payload;
  }

  private async query<T = Record<string, unknown>>(sql: string, params: Param[] = []): Promise<T[]> {
    const payload = await this.post({ sql, params });
    return (payload.result?.[0]?.results ?? []) as T[];
  }

  private async run(sql: string, params: Param[] = []): Promise<{ changes: number }> {
    const payload = await this.post({ sql, params });
    return { changes: payload.result?.[0]?.meta?.changes ?? 0 };
  }

  private async batch(statements: Array<{ sql: string; params?: Param[] }>): Promise<void> {
    await this.post({ batch: statements.map((statement) => ({ sql: statement.sql, params: statement.params ?? [] })) });
  }

  // ---------------------------------------------------------------- lifecycle

  async info(): Promise<DatabaseInfo> {
    try {
      const rows = await this.query<{ value: string }>(
        "SELECT value FROM meta WHERE key = ?1",
        ["schema_version"],
      );
      const version = rows[0]?.value ? Number(rows[0].value) : 0;
      return {
        driver: "d1",
        ready: true,
        schemaInitialized: version > 0,
        message: version > 0 ? `Schema version ${version}` : "Tabel belum dibuat",
      };
    } catch (error) {
      return {
        driver: "d1",
        ready: false,
        schemaInitialized: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async initializeSchema(): Promise<{ statements: number }> {
    // D1 executes each statement separately; batching keeps it to one round trip.
    for (let i = 0; i < SCHEMA_STATEMENTS.length; i += 5) {
      await this.batch(SCHEMA_STATEMENTS.slice(i, i + 5).map((sql) => ({ sql })));
    }
    logger.info("D1 schema initialized", { version: SCHEMA_VERSION });
    return { statements: SCHEMA_STATEMENTS.length };
  }

  // -------------------------------------------------------------------- files

  async listFiles(query: FileQuery): Promise<Paginated<FileRecord>> {
    const params: Param[] = [];
    const where: string[] = [];
    let index = 1;

    if (query.search) {
      where.push(`(filename LIKE ?${index} ESCAPE '\\' OR original_name LIKE ?${index} ESCAPE '\\')`);
      params.push(`%${escapeLikeTerm(query.search)}%`);
      index += 1;
    }
    if (query.storageId) {
      where.push(`storage_id = ?${index}`);
      params.push(query.storageId);
      index += 1;
    }
    if (query.category) {
      where.push(`category = ?${index}`);
      params.push(query.category);
      index += 1;
    }
    if (query.visibility) {
      where.push(`visibility = ?${index}`);
      params.push(query.visibility);
      index += 1;
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const sortField: FileSortField = query.sort ?? "createdAt";
    const direction: SortDirection = query.direction === "asc" ? "asc" : "desc";
    const sortColumn = SORT_COLUMNS[sortField] ?? "created_at";
    const limit = Math.max(1, Math.min(200, query.limit ?? 25));
    const offset = Math.max(0, query.offset ?? 0);

    const [rows, countRows] = await Promise.all([
      this.query(
        `SELECT * FROM files ${whereSql} ORDER BY ${sortColumn} ${direction}, id ${direction} LIMIT ?${index} OFFSET ?${index + 1}`,
        [...params, limit, offset],
      ),
      this.query<{ total: number }>(`SELECT COUNT(*) AS total FROM files ${whereSql}`, params),
    ]);

    return {
      items: rows.map(mapFileRow),
      total: Number(countRows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  async getFile(id: string): Promise<FileRecord | null> {
    const rows = await this.query("SELECT * FROM files WHERE id = ?1", [id]);
    return rows[0] ? mapFileRow(rows[0]) : null;
  }

  async getFileByDownloadId(downloadId: string): Promise<FileRecord | null> {
    const rows = await this.query("SELECT * FROM files WHERE download_id = ?1", [downloadId]);
    return rows[0] ? mapFileRow(rows[0]) : null;
  }

  async createFile(file: FileRecord): Promise<FileRecord> {
    await this.run(
      `INSERT INTO files (
        id, download_id, filename, original_name, size, content_type, category,
        storage_id, bucket, object_key, etag, download_count, visibility, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
      [
        file.id,
        file.downloadId,
        file.filename,
        file.originalName,
        file.size,
        file.contentType,
        file.category,
        file.storageId,
        file.bucket,
        file.objectKey,
        file.etag,
        file.downloadCount,
        file.visibility,
        file.createdAt,
        file.updatedAt,
      ],
    );
    return file;
  }

  async updateFile(id: string, patch: Partial<FileRecord>): Promise<FileRecord | null> {
    const assignments: string[] = [];
    const params: Param[] = [];
    let index = 1;

    for (const [key, value] of Object.entries(patch)) {
      const column = FILE_COLUMNS[key as keyof FileRecord];
      if (!column || key === "id") continue;
      assignments.push(`${column} = ?${index}`);
      params.push(toParam(value));
      index += 1;
    }

    if (assignments.length === 0) return this.getFile(id);

    assignments.push(`updated_at = ?${index}`);
    params.push(new Date().toISOString());
    index += 1;
    params.push(id);

    await this.run(`UPDATE files SET ${assignments.join(", ")} WHERE id = ?${index}`, params);
    return this.getFile(id);
  }

  async deleteFile(id: string): Promise<boolean> {
    const { changes } = await this.run("DELETE FROM files WHERE id = ?1", [id]);
    return changes > 0;
  }

  async incrementDownloadCount(id: string): Promise<number> {
    await this.run("UPDATE files SET download_count = download_count + 1 WHERE id = ?1", [id]);
    const rows = await this.query<{ download_count: number }>(
      "SELECT download_count FROM files WHERE id = ?1",
      [id],
    );
    return Number(rows[0]?.download_count ?? 0);
  }

  async getPoolStats(): Promise<PoolStats> {
    const [totals, perStorage] = await Promise.all([
      this.query<{
        totalFiles: number;
        totalBytes: number;
        totalDownloads: number;
        publicFiles: number;
      }>(
        `SELECT COUNT(*) AS totalFiles,
                COALESCE(SUM(size), 0) AS totalBytes,
                COALESCE(SUM(download_count), 0) AS totalDownloads,
                COALESCE(SUM(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END), 0) AS publicFiles
         FROM files`,
      ),
      this.query<{
        id: string;
        name: string;
        limit_bytes: number;
        status: string;
        files: number;
        bytes: number;
      }>(
        `SELECT s.id AS id, s.name AS name, s.limit_bytes AS limit_bytes, s.status AS status,
                COUNT(f.id) AS files, COALESCE(SUM(f.size), 0) AS bytes
         FROM storages s
         LEFT JOIN files f ON f.storage_id = s.id
         GROUP BY s.id, s.name, s.limit_bytes, s.status
         ORDER BY s.priority ASC, s.name ASC`,
      ),
    ]);

    const summary = totals[0];

    return {
      totalFiles: Number(summary?.totalFiles ?? 0),
      totalBytes: Number(summary?.totalBytes ?? 0),
      totalDownloads: Number(summary?.totalDownloads ?? 0),
      publicFiles: Number(summary?.publicFiles ?? 0),
      byStorage: perStorage.map((row) => ({
        storageId: row.id,
        name: row.name,
        files: Number(row.files ?? 0),
        bytes: Number(row.bytes ?? 0),
        limitBytes: Number(row.limit_bytes ?? 0),
        status: (row.status as StorageRecord["status"]) ?? "active",
      })),
    };
  }

  // ----------------------------------------------------------------- storages

  async listStorages(): Promise<StorageRecord[]> {
    const rows = await this.query("SELECT * FROM storages ORDER BY priority ASC, name ASC");
    return rows.map(mapStorageRow);
  }

  async getStorage(id: string): Promise<StorageRecord | null> {
    const rows = await this.query("SELECT * FROM storages WHERE id = ?1", [id]);
    return rows[0] ? mapStorageRow(rows[0]) : null;
  }

  async getStorageByName(name: string): Promise<StorageRecord | null> {
    const rows = await this.query("SELECT * FROM storages WHERE name = ?1", [name]);
    return rows[0] ? mapStorageRow(rows[0]) : null;
  }

  async createStorage(storage: StorageRecord): Promise<StorageRecord> {
    await this.run(
      `INSERT INTO storages (
        id, name, account_id, bucket, access_key_id, secret_access_key, endpoint, region,
        limit_bytes, used_bytes, priority, status, last_checked_at, last_error, notes,
        created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
      [
        storage.id,
        storage.name,
        storage.accountId,
        storage.bucket,
        storage.accessKeyId,
        storage.secretAccessKey,
        storage.endpoint,
        storage.region,
        storage.limitBytes,
        storage.usedBytes,
        storage.priority,
        storage.status,
        storage.lastCheckedAt,
        storage.lastError,
        storage.notes,
        storage.createdAt,
        storage.updatedAt,
      ],
    );
    return storage;
  }

  async updateStorage(id: string, patch: Partial<StorageRecord>): Promise<StorageRecord | null> {
    const assignments: string[] = [];
    const params: Param[] = [];
    let index = 1;

    for (const [key, value] of Object.entries(patch)) {
      const column = STORAGE_COLUMNS[key as keyof StorageRecord];
      if (!column || key === "id") continue;
      assignments.push(`${column} = ?${index}`);
      params.push(toParam(value));
      index += 1;
    }

    if (assignments.length === 0) return this.getStorage(id);

    assignments.push(`updated_at = ?${index}`);
    params.push(new Date().toISOString());
    index += 1;
    params.push(id);

    await this.run(`UPDATE storages SET ${assignments.join(", ")} WHERE id = ?${index}`, params);
    return this.getStorage(id);
  }

  async deleteStorage(id: string): Promise<boolean> {
    // Files keep their metadata (bucket/object key) so history stays readable,
    // they simply become unavailable until the storage is restored.
    const { changes } = await this.run("DELETE FROM storages WHERE id = ?1", [id]);
    return changes > 0;
  }

  // ------------------------------------------------------------------ uploads

  async listUploadSessions(
    filter: { status?: UploadSessionRecord["status"][]; limit?: number } = {},
  ): Promise<UploadSessionRecord[]> {
    const params: Param[] = [];
    let sql = "SELECT * FROM upload_sessions";
    if (filter.status && filter.status.length > 0) {
      const placeholders = filter.status.map((_, position) => {
        params.push(filter.status![position]!);
        return `?${position + 1}`;
      });
      sql += ` WHERE status IN (${placeholders.join(", ")})`;
    }
    sql += ` ORDER BY updated_at DESC LIMIT ?${params.length + 1}`;
    params.push(Math.max(1, Math.min(100, filter.limit ?? 25)));
    const rows = await this.query(sql, params);
    return rows.map(mapUploadRow);
  }

  async getUploadSession(id: string): Promise<UploadSessionRecord | null> {
    const rows = await this.query("SELECT * FROM upload_sessions WHERE id = ?1", [id]);
    return rows[0] ? mapUploadRow(rows[0]) : null;
  }

  async createUploadSession(session: UploadSessionRecord): Promise<UploadSessionRecord> {
    await this.run(
      `INSERT INTO upload_sessions (
        id, filename, size, content_type, storage_id, bucket, object_key, upload_id,
        part_size, parts_total, parts_uploaded, status, visibility, file_id,
        client_fingerprint, error, created_at, updated_at, completed_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
      [
        session.id,
        session.filename,
        session.size,
        session.contentType,
        session.storageId,
        session.bucket,
        session.objectKey,
        session.uploadId,
        session.partSize,
        session.partsTotal,
        session.partsUploaded,
        session.status,
        session.visibility,
        session.fileId,
        session.clientFingerprint,
        session.error,
        session.createdAt,
        session.updatedAt,
        session.completedAt,
      ],
    );
    return session;
  }

  async updateUploadSession(
    id: string,
    patch: Partial<UploadSessionRecord>,
  ): Promise<UploadSessionRecord | null> {
    const assignments: string[] = [];
    const params: Param[] = [];
    let index = 1;

    for (const [key, value] of Object.entries(patch)) {
      const column = UPLOAD_COLUMNS[key as keyof UploadSessionRecord];
      if (!column || key === "id") continue;
      assignments.push(`${column} = ?${index}`);
      params.push(toParam(value));
      index += 1;
    }

    if (assignments.length === 0) return this.getUploadSession(id);

    assignments.push(`updated_at = ?${index}`);
    params.push(new Date().toISOString());
    index += 1;
    params.push(id);

    await this.run(
      `UPDATE upload_sessions SET ${assignments.join(", ")} WHERE id = ?${index}`,
      params,
    );
    return this.getUploadSession(id);
  }

  async deleteUploadSession(id: string): Promise<boolean> {
    const { changes } = await this.run("DELETE FROM upload_sessions WHERE id = ?1", [id]);
    return changes > 0;
  }

  async pruneUploadSessions(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const { changes } = await this.run(
      "DELETE FROM upload_sessions WHERE status IN ('completed', 'aborted', 'failed') AND updated_at < ?1",
      [cutoff],
    );
    return changes;
  }

  // -------------------------------------------------------------------- state

  async getState(key: string): Promise<string | null> {
    const now = Date.now();
    const rows = await this.query<{ value: string; expires_at: number | null }>(
      "SELECT value, expires_at FROM app_state WHERE key = ?1",
      [key],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.expires_at !== null && Number(row.expires_at) <= now) {
      // Best effort cleanup; ignored when it fails.
      this.run("DELETE FROM app_state WHERE key = ?1", [key]).catch(() => undefined);
      return null;
    }
    return row.value;
  }

  async setState(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    await this.run(
      `INSERT INTO app_state (key, value, expires_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
      [key, value, expiresAt],
    );
  }

  async deleteState(key: string): Promise<void> {
    await this.run("DELETE FROM app_state WHERE key = ?1", [key]);
  }
}

const SORT_COLUMNS: Record<FileSortField, string> = {
  createdAt: "created_at",
  filename: "filename",
  size: "size",
  downloadCount: "download_count",
};

const FILE_COLUMNS: Record<keyof FileRecord, string> = {
  id: "id",
  downloadId: "download_id",
  filename: "filename",
  originalName: "original_name",
  size: "size",
  contentType: "content_type",
  category: "category",
  storageId: "storage_id",
  bucket: "bucket",
  objectKey: "object_key",
  etag: "etag",
  downloadCount: "download_count",
  visibility: "visibility",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

const STORAGE_COLUMNS: Record<keyof StorageRecord, string> = {
  id: "id",
  name: "name",
  accountId: "account_id",
  bucket: "bucket",
  accessKeyId: "access_key_id",
  secretAccessKey: "secret_access_key",
  endpoint: "endpoint",
  region: "region",
  limitBytes: "limit_bytes",
  usedBytes: "used_bytes",
  priority: "priority",
  status: "status",
  lastCheckedAt: "last_checked_at",
  lastError: "last_error",
  notes: "notes",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

const UPLOAD_COLUMNS: Record<keyof UploadSessionRecord, string> = {
  id: "id",
  filename: "filename",
  size: "size",
  contentType: "content_type",
  storageId: "storage_id",
  bucket: "bucket",
  objectKey: "object_key",
  uploadId: "upload_id",
  partSize: "part_size",
  partsTotal: "parts_total",
  partsUploaded: "parts_uploaded",
  status: "status",
  visibility: "visibility",
  fileId: "file_id",
  clientFingerprint: "client_fingerprint",
  error: "error",
  createdAt: "created_at",
  updatedAt: "updated_at",
  completedAt: "completed_at",
};

function toParam(value: unknown): Param {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return String(value);
}

function str(row: Record<string, unknown>, key: string, fallback = ""): string {
  const value = row[key];
  return value === null || value === undefined ? fallback : String(value);
}

function int(row: Record<string, unknown>, key: string, fallback = 0): number {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : fallback;
}

function nullableStr(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined || value === "" ? null : String(value);
}

export function mapFileRow(row: Record<string, unknown>): FileRecord {
  return {
    id: str(row, "id"),
    downloadId: str(row, "download_id"),
    filename: str(row, "filename"),
    originalName: str(row, "original_name", str(row, "filename")),
    size: int(row, "size"),
    contentType: str(row, "content_type", "application/octet-stream"),
    category: str(row, "category", "other"),
    storageId: str(row, "storage_id"),
    bucket: str(row, "bucket"),
    objectKey: str(row, "object_key"),
    etag: nullableStr(row, "etag"),
    downloadCount: int(row, "download_count"),
    visibility: (str(row, "visibility", "public") as FileRecord["visibility"]) ?? "public",
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
  };
}

export function mapStorageRow(row: Record<string, unknown>): StorageRecord {
  return {
    id: str(row, "id"),
    name: str(row, "name"),
    accountId: str(row, "account_id"),
    bucket: str(row, "bucket"),
    accessKeyId: str(row, "access_key_id"),
    secretAccessKey: str(row, "secret_access_key"),
    endpoint: nullableStr(row, "endpoint"),
    region: str(row, "region", "auto"),
    limitBytes: int(row, "limit_bytes"),
    usedBytes: int(row, "used_bytes"),
    priority: int(row, "priority", 100),
    status: str(row, "status", "active") as StorageRecord["status"],
    lastCheckedAt: nullableStr(row, "last_checked_at"),
    lastError: nullableStr(row, "last_error"),
    notes: nullableStr(row, "notes"),
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
  };
}

export function mapUploadRow(row: Record<string, unknown>): UploadSessionRecord {
  return {
    id: str(row, "id"),
    filename: str(row, "filename"),
    size: int(row, "size"),
    contentType: str(row, "content_type", "application/octet-stream"),
    storageId: str(row, "storage_id"),
    bucket: str(row, "bucket"),
    objectKey: str(row, "object_key"),
    uploadId: nullableStr(row, "upload_id"),
    partSize: int(row, "part_size", 8 * 1024 * 1024),
    partsTotal: int(row, "parts_total"),
    partsUploaded: int(row, "parts_uploaded"),
    status: str(row, "status", "pending") as UploadSessionRecord["status"],
    visibility: str(row, "visibility", "public") as UploadSessionRecord["visibility"],
    fileId: nullableStr(row, "file_id"),
    clientFingerprint: nullableStr(row, "client_fingerprint"),
    error: nullableStr(row, "error"),
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
    completedAt: nullableStr(row, "completed_at"),
  };
}
