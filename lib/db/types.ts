import type { DatabaseDriver } from "@/lib/config/env";

export type StorageStatus = "active" | "disabled" | "error";
export type FileVisibility = "public" | "private";
export type UploadStatus =
  | "pending"
  | "uploading"
  | "paused"
  | "completed"
  | "failed"
  | "aborted";

/** A single Cloudflare R2 account/bucket inside the storage pool. */
export interface StorageRecord {
  id: string;
  name: string;
  accountId: string;
  bucket: string;
  /** Encrypted at rest (see lib/db/vault.ts). Never sent to the browser. */
  accessKeyId: string;
  /** Encrypted at rest (see lib/db/vault.ts). Never sent to the browser. */
  secretAccessKey: string;
  endpoint: string | null;
  region: string;
  limitBytes: number;
  usedBytes: number;
  priority: number;
  status: StorageStatus;
  lastCheckedAt: string | null;
  lastError: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Metadata of one object stored in the pool. */
export interface FileRecord {
  id: string;
  downloadId: string;
  filename: string;
  originalName: string;
  size: number;
  contentType: string;
  category: string;
  storageId: string;
  bucket: string;
  objectKey: string;
  etag: string | null;
  downloadCount: number;
  visibility: FileVisibility;
  createdAt: string;
  updatedAt: string;
}

/** Server side bookkeeping for a (possibly resumable) upload. */
export interface UploadSessionRecord {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  storageId: string;
  bucket: string;
  objectKey: string;
  uploadId: string | null;
  partSize: number;
  partsTotal: number;
  partsUploaded: number;
  status: UploadStatus;
  visibility: FileVisibility;
  /** Set once the upload has been finalized (makes `complete` idempotent). */
  fileId: string | null;
  clientFingerprint: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type FileSortField = "createdAt" | "filename" | "size" | "downloadCount";
export type SortDirection = "asc" | "desc";

export interface FileQuery {
  search?: string;
  storageId?: string;
  category?: string;
  visibility?: FileVisibility;
  sort?: FileSortField;
  direction?: SortDirection;
  limit?: number;
  offset?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface StorageUsageStat {
  storageId: string;
  name: string;
  files: number;
  bytes: number;
  limitBytes: number;
  status: StorageStatus;
}

export interface PoolStats {
  totalFiles: number;
  totalBytes: number;
  totalDownloads: number;
  publicFiles: number;
  byStorage: StorageUsageStat[];
}

export interface DatabaseInfo {
  driver: DatabaseDriver;
  ready: boolean;
  schemaInitialized: boolean;
  message?: string;
}

export interface StateEntry {
  value: string;
  expiresAt: number | null;
}

/**
 * Repository contract implemented by every driver (D1, KV, in-memory).
 * Keeping the interface small and explicit is what allows swapping Cloudflare D1
 * for KV - or a local demo store - without touching a single route handler.
 */
export interface DatabaseAdapter {
  readonly driver: DatabaseDriver;

  info(): Promise<DatabaseInfo>;
  initializeSchema(): Promise<{ statements: number }>;

  listFiles(query: FileQuery): Promise<Paginated<FileRecord>>;
  getFile(id: string): Promise<FileRecord | null>;
  getFileByDownloadId(downloadId: string): Promise<FileRecord | null>;
  createFile(file: FileRecord): Promise<FileRecord>;
  updateFile(id: string, patch: Partial<FileRecord>): Promise<FileRecord | null>;
  deleteFile(id: string): Promise<boolean>;
  incrementDownloadCount(id: string): Promise<number>;
  getPoolStats(): Promise<PoolStats>;

  listStorages(): Promise<StorageRecord[]>;
  getStorage(id: string): Promise<StorageRecord | null>;
  getStorageByName(name: string): Promise<StorageRecord | null>;
  createStorage(storage: StorageRecord): Promise<StorageRecord>;
  updateStorage(id: string, patch: Partial<StorageRecord>): Promise<StorageRecord | null>;
  deleteStorage(id: string): Promise<boolean>;

  listUploadSessions(filter?: { status?: UploadStatus[]; limit?: number }): Promise<UploadSessionRecord[]>;
  getUploadSession(id: string): Promise<UploadSessionRecord | null>;
  createUploadSession(session: UploadSessionRecord): Promise<UploadSessionRecord>;
  updateUploadSession(id: string, patch: Partial<UploadSessionRecord>): Promise<UploadSessionRecord | null>;
  deleteUploadSession(id: string): Promise<boolean>;
  pruneUploadSessions(olderThanMs: number): Promise<number>;

  getState(key: string): Promise<string | null>;
  setState(key: string, value: string, ttlSeconds?: number): Promise<void>;
  deleteState(key: string): Promise<void>;
}

/** Removes credential material before anything leaves the server. */
export type SafeStorage = Omit<StorageRecord, "accessKeyId" | "secretAccessKey"> & {
  accessKeyIdMasked: string;
  hasCredentials: boolean;
  freeBytes: number;
  usagePercent: number;
};

export type SafeFile = Omit<FileRecord, "bucket" | "objectKey" | "storageId"> & {
  storageName: string | null;
};

export type PublicFile = Pick<
  FileRecord,
  "downloadId" | "filename" | "size" | "contentType" | "category" | "downloadCount" | "createdAt"
>;
