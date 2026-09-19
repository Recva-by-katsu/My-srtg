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
import { createDemoData } from "@/lib/db/demo-data";

interface StateEntry {
  value: string;
  expiresAt: number | null;
}

/**
 * In-memory adapter.
 *
 * Used for `DEMO_MODE` (the public download center and admin dashboard can be
 * explored without any Cloudflare account) and for unit tests. Data lives for the
 * lifetime of the process/isolate only.
 */
export class MemoryAdapter implements DatabaseAdapter {
  readonly driver = "memory" as const;

  private readonly files = new Map<string, FileRecord>();
  private readonly storages = new Map<string, StorageRecord>();
  private readonly uploads = new Map<string, UploadSessionRecord>();
  private readonly state = new Map<string, StateEntry>();
  private initialized = false;

  constructor(seedDemo = false) {
    if (seedDemo) {
      const demo = createDemoData();
      for (const storage of demo.storages) this.storages.set(storage.id, storage);
      for (const file of demo.files) this.files.set(file.id, file);
      this.initialized = true;
    }
  }

  async info(): Promise<DatabaseInfo> {
    return {
      driver: "memory",
      ready: true,
      schemaInitialized: this.initialized,
      message: this.initialized
        ? `Demo store (schema ${SCHEMA_VERSION})`
        : "In-memory store, data hilang saat proses restart",
    };
  }

  async initializeSchema(): Promise<{ statements: number }> {
    this.initialized = true;
    return { statements: SCHEMA_VERSION };
  }

  async listFiles(query: FileQuery): Promise<Paginated<FileRecord>> {
    const term = query.search ? escapeLikeTerm(query.search).toLowerCase() : "";
    const limit = Math.max(1, Math.min(200, query.limit ?? 25));
    const offset = Math.max(0, query.offset ?? 0);
    const field: FileSortField = query.sort ?? "createdAt";
    const direction = query.direction === "asc" ? 1 : -1;

    let items = [...this.files.values()].filter((file) => {
      if (query.storageId && file.storageId !== query.storageId) return false;
      if (query.category && file.category !== query.category) return false;
      if (query.visibility && file.visibility !== query.visibility) return false;
      if (term) {
        const haystack = `${file.filename} ${file.originalName}`.toLowerCase();
        return term
          .split(/\s+/)
          .filter(Boolean)
          .every((token) => haystack.includes(token.replace(/\\/g, "")));
      }
      return true;
    });

    items = items.sort((a, b) => {
      const left = sortValue(a, field);
      const right = sortValue(b, field);
      if (left === right) return a.id < b.id ? -1 * direction : direction;
      return left < right ? -1 * direction : direction;
    });

    return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
  }

  async getFile(id: string): Promise<FileRecord | null> {
    return this.files.get(id) ?? null;
  }

  async getFileByDownloadId(downloadId: string): Promise<FileRecord | null> {
    for (const file of this.files.values()) {
      if (file.downloadId === downloadId) return file;
    }
    return null;
  }

  async createFile(file: FileRecord): Promise<FileRecord> {
    this.files.set(file.id, { ...file });
    return { ...file };
  }

  async updateFile(id: string, patch: Partial<FileRecord>): Promise<FileRecord | null> {
    const existing = this.files.get(id);
    if (!existing) return null;
    const next: FileRecord = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    this.files.set(id, next);
    return { ...next };
  }

  async deleteFile(id: string): Promise<boolean> {
    return this.files.delete(id);
  }

  async incrementDownloadCount(id: string): Promise<number> {
    const existing = this.files.get(id);
    if (!existing) return 0;
    existing.downloadCount += 1;
    existing.updatedAt = new Date().toISOString();
    return existing.downloadCount;
  }

  async getPoolStats(): Promise<PoolStats> {
    const files = [...this.files.values()];
    return {
      totalFiles: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      totalDownloads: files.reduce((sum, file) => sum + file.downloadCount, 0),
      publicFiles: files.filter((file) => file.visibility === "public").length,
      byStorage: [...this.storages.values()]
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
        .map((storage) => {
          const owned = files.filter((file) => file.storageId === storage.id);
          return {
            storageId: storage.id,
            name: storage.name,
            files: owned.length,
            bytes: owned.reduce((sum, file) => sum + file.size, 0),
            limitBytes: storage.limitBytes,
            status: storage.status,
          };
        }),
    };
  }

  async listStorages(): Promise<StorageRecord[]> {
    return [...this.storages.values()].sort(
      (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
    );
  }

  async getStorage(id: string): Promise<StorageRecord | null> {
    return this.storages.get(id) ?? null;
  }

  async getStorageByName(name: string): Promise<StorageRecord | null> {
    for (const storage of this.storages.values()) {
      if (storage.name === name) return storage;
    }
    return null;
  }

  async createStorage(storage: StorageRecord): Promise<StorageRecord> {
    this.storages.set(storage.id, { ...storage });
    return { ...storage };
  }

  async updateStorage(id: string, patch: Partial<StorageRecord>): Promise<StorageRecord | null> {
    const existing = this.storages.get(id);
    if (!existing) return null;
    const next: StorageRecord = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    this.storages.set(id, next);
    return { ...next };
  }

  async deleteStorage(id: string): Promise<boolean> {
    return this.storages.delete(id);
  }

  async listUploadSessions(
    filter: { status?: UploadSessionRecord["status"][]; limit?: number } = {},
  ): Promise<UploadSessionRecord[]> {
    return [...this.uploads.values()]
      .filter((session) => (filter.status ? filter.status.includes(session.status) : true))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, Math.max(1, Math.min(100, filter.limit ?? 25)));
  }

  async getUploadSession(id: string): Promise<UploadSessionRecord | null> {
    return this.uploads.get(id) ?? null;
  }

  async createUploadSession(session: UploadSessionRecord): Promise<UploadSessionRecord> {
    this.uploads.set(session.id, { ...session });
    return { ...session };
  }

  async updateUploadSession(
    id: string,
    patch: Partial<UploadSessionRecord>,
  ): Promise<UploadSessionRecord | null> {
    const existing = this.uploads.get(id);
    if (!existing) return null;
    const next: UploadSessionRecord = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.uploads.set(id, next);
    return { ...next };
  }

  async deleteUploadSession(id: string): Promise<boolean> {
    return this.uploads.delete(id);
  }

  async pruneUploadSessions(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let removed = 0;
    for (const [id, session] of this.uploads) {
      const done = ["completed", "aborted", "failed"].includes(session.status);
      if (done && new Date(session.updatedAt).getTime() < cutoff) {
        this.uploads.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  async getState(key: string): Promise<string | null> {
    const entry = this.state.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.state.delete(key);
      return null;
    }
    return entry.value;
  }

  async setState(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.state.set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async deleteState(key: string): Promise<void> {
    this.state.delete(key);
  }
}

function sortValue(file: FileRecord, field: FileSortField): string | number {
  switch (field) {
    case "filename":
      return file.filename.toLowerCase();
    case "size":
      return file.size;
    case "downloadCount":
      return file.downloadCount;
    default:
      return file.createdAt;
  }
}
