import { getConfig } from "@/lib/config/env";
import { SCHEMA_VERSION } from "@/lib/db/schema";
import type {
  DatabaseAdapter,
  DatabaseInfo,
  FileQuery,
  FileRecord,
  FileSortField,
  Paginated,
  PoolStats,
  StorageRecord,
  UploadSessionRecord,
} from "@/lib/db/types";
import { escapeLikeTerm } from "@/lib/security/sanitize";
import { AppError } from "@/lib/utils/assert";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("db-kv");

const PREFIX = {
  storage: "storage:",
  file: "file:",
  upload: "upload:",
  state: "state:",
  indexFiles: "idx:files",
  indexStorages: "idx:storages",
  indexUploads: "idx:uploads",
  meta: "meta:schema",
} as const;

interface FileIndexEntry {
  id: string;
  downloadId: string;
  filename: string;
  originalName: string;
  size: number;
  contentType: string;
  category: string;
  storageId: string;
  visibility: FileRecord["visibility"];
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cloudflare KV adapter (Workers KV REST API).
 *
 * KV is offered as the lightweight alternative to D1. It keeps a slim index under
 * `idx:files` so listing/searching does not require scanning every key. Because
 * KV is eventually consistent and every write rewrites the index, this driver is
 * recommended for small libraries (up to a few hundred files) - use D1 for
 * anything bigger.
 */
export class KvAdapter implements DatabaseAdapter {
  readonly driver = "kv" as const;
  /** Serializes index mutations inside one isolate to reduce lost updates. */
  private queue: Promise<unknown> = Promise.resolve();

  private get base(): string {
    const config = getConfig();
    return `${config.cloudflare.apiBaseUrl}/accounts/${config.cloudflare.accountId}/storage/kv/namespaces/${config.database.kvNamespaceId}`;
  }

  private assertConfigured(): void {
    const config = getConfig();
    if (!config.cloudflare.accountId || !config.cloudflare.apiToken || !config.database.kvNamespaceId) {
      throw new AppError(
        "database_not_configured",
        "Database KV belum terkonfigurasi. Isi CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN dan KV_NAMESPACE_ID.",
        { status: 503 },
      );
    }
  }

  private async request(
    method: "GET" | "PUT" | "DELETE",
    path: string,
    body?: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<{ status: number; text: string }> {
    this.assertConfigured();
    const url = new URL(`${this.base}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${getConfig().cloudflare.apiToken}`,
        ...(body === undefined ? {} : { "Content-Type": "text/plain" }),
      },
      body,
    });

    const text = await response.text();
    if (response.status === 404) return { status: 404, text: "" };
    if (!response.ok) {
      logger.error("KV request failed", { status: response.status, text: text.slice(0, 400) });
      throw new AppError("database_error", `KV request failed (HTTP ${response.status})`, {
        status: 502,
      });
    }
    return { status: response.status, text };
  }

  private async kvGet<T>(key: string): Promise<T | null> {
    const { status, text } = await this.request(
      "GET",
      `/values/${encodeURIComponent(key)}`,
    );
    if (status === 404 || !text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  private async kvPut(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.request(
      "PUT",
      `/values/${encodeURIComponent(key)}`,
      typeof value === "string" ? value : JSON.stringify(value),
      ttlSeconds && ttlSeconds >= 60 ? { expiration_ttl: Math.ceil(ttlSeconds) } : undefined,
    );
  }

  private async kvDelete(key: string): Promise<void> {
    await this.request("DELETE", `/values/${encodeURIComponent(key)}`);
  }

  /** Runs an index mutation with an in-process lock. */
  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  // ---------------------------------------------------------------- lifecycle

  async info(): Promise<DatabaseInfo> {
    try {
      const version = await this.kvGet<number>(PREFIX.meta);
      return {
        driver: "kv",
        ready: true,
        schemaInitialized: Boolean(version),
        message: version ? `Schema version ${version}` : "Namespace kosong",
      };
    } catch (error) {
      return {
        driver: "kv",
        ready: false,
        schemaInitialized: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async initializeSchema(): Promise<{ statements: number }> {
    await this.kvPut(PREFIX.meta, SCHEMA_VERSION);
    await this.kvPut(PREFIX.indexFiles, []);
    await this.kvPut(PREFIX.indexStorages, []);
    await this.kvPut(PREFIX.indexUploads, []);
    return { statements: 4 };
  }

  // -------------------------------------------------------------------- files

  private async readFileIndex(): Promise<FileIndexEntry[]> {
    const index = await this.kvGet<FileIndexEntry[]>(PREFIX.indexFiles);
    return Array.isArray(index) ? index : [];
  }

  private async writeFileIndex(index: FileIndexEntry[]): Promise<void> {
    await this.kvPut(PREFIX.indexFiles, index);
  }

  private toIndexEntry(file: FileRecord): FileIndexEntry {
    return {
      id: file.id,
      downloadId: file.downloadId,
      filename: file.filename,
      originalName: file.originalName,
      size: file.size,
      contentType: file.contentType,
      category: file.category,
      storageId: file.storageId,
      visibility: file.visibility,
      downloadCount: file.downloadCount,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  async listFiles(query: FileQuery): Promise<Paginated<FileRecord>> {
    const index = await this.readFileIndex();
    const term = query.search ? escapeLikeTerm(query.search).toLowerCase() : "";
    const limit = Math.max(1, Math.min(200, query.limit ?? 25));
    const offset = Math.max(0, query.offset ?? 0);
    const field: FileSortField = query.sort ?? "createdAt";
    const direction = query.direction === "asc" ? 1 : -1;

    let entries = index.filter((entry) => {
      if (query.storageId && entry.storageId !== query.storageId) return false;
      if (query.category && entry.category !== query.category) return false;
      if (query.visibility && entry.visibility !== query.visibility) return false;
      if (term) {
        const haystack = `${entry.filename} ${entry.originalName}`.toLowerCase();
        return term
          .split(/\s+/)
          .filter(Boolean)
          .every((token) => haystack.includes(token.replace(/\\/g, "")));
      }
      return true;
    });

    entries = entries.sort((a, b) => {
      const left = sortValue(a, field);
      const right = sortValue(b, field);
      if (left === right) return a.id < b.id ? -1 * direction : direction;
      return left < right ? -1 * direction : direction;
    });

    const page = entries.slice(offset, offset + limit);
    const items = await Promise.all(
      page.map(async (entry) => (await this.getFile(entry.id)) ?? (entry as unknown as FileRecord)),
    );

    return { items, total: entries.length, limit, offset };
  }

  async getFile(id: string): Promise<FileRecord | null> {
    return this.kvGet<FileRecord>(`${PREFIX.file}${id}`);
  }

  async getFileByDownloadId(downloadId: string): Promise<FileRecord | null> {
    const index = await this.readFileIndex();
    const entry = index.find((item) => item.downloadId === downloadId);
    if (!entry) return null;
    return this.getFile(entry.id);
  }

  async createFile(file: FileRecord): Promise<FileRecord> {
    await this.mutate(async () => {
      await this.kvPut(`${PREFIX.file}${file.id}`, file);
      const index = await this.readFileIndex();
      index.unshift(this.toIndexEntry(file));
      await this.writeFileIndex(index);
    });
    return file;
  }

  async updateFile(id: string, patch: Partial<FileRecord>): Promise<FileRecord | null> {
    return this.mutate(async () => {
      const existing = await this.getFile(id);
      if (!existing) return null;
      const next: FileRecord = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
      await this.kvPut(`${PREFIX.file}${id}`, next);
      const index = await this.readFileIndex();
      const position = index.findIndex((entry) => entry.id === id);
      const entry = this.toIndexEntry(next);
      if (position >= 0) index[position] = entry;
      else index.unshift(entry);
      await this.writeFileIndex(index);
      return next;
    });
  }

  async deleteFile(id: string): Promise<boolean> {
    return this.mutate(async () => {
      const existing = await this.getFile(id);
      if (!existing) return false;
      await this.kvDelete(`${PREFIX.file}${id}`);
      const index = await this.readFileIndex();
      await this.writeFileIndex(index.filter((entry) => entry.id !== id));
      return true;
    });
  }

  async incrementDownloadCount(id: string): Promise<number> {
    return this.mutate(async () => {
      const record = await this.getFile(id);
      if (!record) return 0;
      record.downloadCount += 1;
      record.updatedAt = new Date().toISOString();
      await this.kvPut(`${PREFIX.file}${id}`, record);
      const index = await this.readFileIndex();
      const entry = index.find((item) => item.id === id);
      if (entry) entry.downloadCount = record.downloadCount;
      await this.writeFileIndex(index);
      return record.downloadCount;
    });
  }

  async getPoolStats(): Promise<PoolStats> {
    const [index, storages] = await Promise.all([this.readFileIndex(), this.listStorages()]);
    const byStorage = storages.map((storage) => {
      const entries = index.filter((entry) => entry.storageId === storage.id);
      return {
        storageId: storage.id,
        name: storage.name,
        files: entries.length,
        bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
        limitBytes: storage.limitBytes,
        status: storage.status,
      };
    });

    return {
      totalFiles: index.length,
      totalBytes: index.reduce((sum, entry) => sum + entry.size, 0),
      totalDownloads: index.reduce((sum, entry) => sum + entry.downloadCount, 0),
      publicFiles: index.filter((entry) => entry.visibility === "public").length,
      byStorage,
    };
  }

  // ----------------------------------------------------------------- storages

  private async readStorageIds(): Promise<string[]> {
    const ids = await this.kvGet<string[]>(PREFIX.indexStorages);
    return Array.isArray(ids) ? ids : [];
  }

  async listStorages(): Promise<StorageRecord[]> {
    const ids = await this.readStorageIds();
    const storages = await Promise.all(
      ids.map(async (id) => this.kvGet<StorageRecord>(`${PREFIX.storage}${id}`)),
    );
    return storages
      .filter((storage): storage is StorageRecord => Boolean(storage))
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }

  async getStorage(id: string): Promise<StorageRecord | null> {
    return this.kvGet<StorageRecord>(`${PREFIX.storage}${id}`);
  }

  async getStorageByName(name: string): Promise<StorageRecord | null> {
    const storages = await this.listStorages();
    return storages.find((storage) => storage.name === name) ?? null;
  }

  async createStorage(storage: StorageRecord): Promise<StorageRecord> {
    await this.mutate(async () => {
      await this.kvPut(`${PREFIX.storage}${storage.id}`, storage);
      const ids = await this.readStorageIds();
      if (!ids.includes(storage.id)) ids.push(storage.id);
      await this.kvPut(PREFIX.indexStorages, ids);
    });
    return storage;
  }

  async updateStorage(id: string, patch: Partial<StorageRecord>): Promise<StorageRecord | null> {
    return this.mutate(async () => {
      const existing = await this.getStorage(id);
      if (!existing) return null;
      const next: StorageRecord = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
      await this.kvPut(`${PREFIX.storage}${id}`, next);
      return next;
    });
  }

  async deleteStorage(id: string): Promise<boolean> {
    return this.mutate(async () => {
      const existing = await this.getStorage(id);
      if (!existing) return false;
      await this.kvDelete(`${PREFIX.storage}${id}`);
      const ids = await this.readStorageIds();
      await this.kvPut(PREFIX.indexStorages, ids.filter((entry) => entry !== id));
      return true;
    });
  }

  // ------------------------------------------------------------------ uploads

  private async readUploadIds(): Promise<string[]> {
    const ids = await this.kvGet<string[]>(PREFIX.indexUploads);
    return Array.isArray(ids) ? ids : [];
  }

  async listUploadSessions(
    filter: { status?: UploadSessionRecord["status"][]; limit?: number } = {},
  ): Promise<UploadSessionRecord[]> {
    const ids = await this.readUploadIds();
    const sessions = await Promise.all(
      ids.map(async (id) => this.kvGet<UploadSessionRecord>(`${PREFIX.upload}${id}`)),
    );
    return sessions
      .filter((session): session is UploadSessionRecord => Boolean(session))
      .filter((session) => (filter.status ? filter.status.includes(session.status) : true))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, Math.max(1, Math.min(100, filter.limit ?? 25)));
  }

  async getUploadSession(id: string): Promise<UploadSessionRecord | null> {
    return this.kvGet<UploadSessionRecord>(`${PREFIX.upload}${id}`);
  }

  async createUploadSession(session: UploadSessionRecord): Promise<UploadSessionRecord> {
    await this.mutate(async () => {
      await this.kvPut(`${PREFIX.upload}${session.id}`, session);
      const ids = await this.readUploadIds();
      if (!ids.includes(session.id)) ids.unshift(session.id);
      await this.kvPut(PREFIX.indexUploads, ids.slice(0, 200));
    });
    return session;
  }

  async updateUploadSession(
    id: string,
    patch: Partial<UploadSessionRecord>,
  ): Promise<UploadSessionRecord | null> {
    return this.mutate(async () => {
      const existing = await this.getUploadSession(id);
      if (!existing) return null;
      const next: UploadSessionRecord = {
        ...existing,
        ...patch,
        id,
        updatedAt: new Date().toISOString(),
      };
      await this.kvPut(`${PREFIX.upload}${id}`, next);
      return next;
    });
  }

  async deleteUploadSession(id: string): Promise<boolean> {
    return this.mutate(async () => {
      const existing = await this.getUploadSession(id);
      if (!existing) return false;
      await this.kvDelete(`${PREFIX.upload}${id}`);
      const ids = await this.readUploadIds();
      await this.kvPut(PREFIX.indexUploads, ids.filter((entry) => entry !== id));
      return true;
    });
  }

  async pruneUploadSessions(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const sessions = await this.listUploadSessions({ limit: 100 });
    const stale = sessions.filter(
      (session) =>
        ["completed", "aborted", "failed"].includes(session.status) &&
        new Date(session.updatedAt).getTime() < cutoff,
    );
    await Promise.all(stale.map((session) => this.deleteUploadSession(session.id)));
    return stale.length;
  }

  // -------------------------------------------------------------------- state

  async getState(key: string): Promise<string | null> {
    const entry = await this.kvGet<{ value: string; expiresAt: number | null }>(
      `${PREFIX.state}${key}`,
    );
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.kvDelete(`${PREFIX.state}${key}`).catch(() => undefined);
      return null;
    }
    return entry.value;
  }

  async setState(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.kvPut(
      `${PREFIX.state}${key}`,
      { value, expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null },
      // KV requires a minimum TTL of 60 seconds; shorter windows are kept as
      // permanent keys and expire logically through `expiresAt`.
      ttlSeconds && ttlSeconds >= 60 ? ttlSeconds : undefined,
    );
  }

  async deleteState(key: string): Promise<void> {
    await this.kvDelete(`${PREFIX.state}${key}`);
  }
}

function sortValue(entry: FileIndexEntry, field: FileSortField): string | number {
  switch (field) {
    case "filename":
      return entry.filename.toLowerCase();
    case "size":
      return entry.size;
    case "downloadCount":
      return entry.downloadCount;
    default:
      return entry.createdAt;
  }
}
