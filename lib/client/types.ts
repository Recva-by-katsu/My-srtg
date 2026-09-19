/**
 * Response contracts shared by the client components.
 *
 * These mirror what the API routes return. Anything credential related is
 * intentionally absent - the browser only ever receives masked values.
 */

export type StorageStatus = "active" | "disabled" | "error";
export type FileVisibility = "public" | "private";

export interface SafeStorage {
  id: string;
  name: string;
  accountId: string;
  bucket: string;
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
  accessKeyIdMasked: string;
  hasCredentials: boolean;
  freeBytes: number;
  usagePercent: number;
}

export interface SafeFile {
  id: string;
  downloadId: string;
  filename: string;
  originalName: string;
  size: number;
  contentType: string;
  category: string;
  etag: string | null;
  downloadCount: number;
  visibility: FileVisibility;
  createdAt: string;
  updatedAt: string;
  storageName: string | null;
  storageId?: string;
  storageStatus?: string;
}

export interface PublicFile {
  downloadId: string;
  filename: string;
  size: number;
  contentType: string;
  category: string;
  downloadCount: number;
  createdAt: string;
}

export interface StorageCandidate {
  storageId: string;
  name: string;
  freeBytes: number;
  limitBytes: number;
  usagePercent: number;
  eligible: boolean;
  reason: string;
}

export interface PresignedPart {
  partNumber: number;
  url: string;
  start: number;
  end: number;
  size: number;
  expiresAt: string;
}

export interface UploadInitResponse {
  sessionId: string;
  filename: string;
  size: number;
  partSize: number;
  parts: number;
  partsUploaded: number;
  presignedParts: PresignedPart[];
  storage: { id: string; name: string };
  selection: {
    reason: string;
    forced: boolean;
    freeBytes: number;
    candidates: StorageCandidate[];
  };
  resumed: boolean;
}

export interface ConnectionStep {
  name: string;
  label: string;
  ok: boolean;
  message: string;
  durationMs: number;
}

export interface ConnectionTest {
  ok: boolean;
  storageId: string;
  storageName: string;
  bucket: string;
  endpoint: string;
  steps: ConnectionStep[];
  measuredBytes?: number;
  measuredObjects?: number;
  checkedAt: string;
  error?: { code: string; message: string; status: number };
}

export interface PoolOverview {
  storages: SafeStorage[];
  totalCapacityBytes: number;
  totalUsedBytes: number;
  totalFreeBytes: number;
  usagePercent: number;
  activeCount: number;
  degradedCount: number;
  largestFreeBytes: number;
  warnings: string[];
}

export interface ConfigIssue {
  level: "error" | "warn" | "info";
  key: string;
  message: string;
}

export interface ConfigReport {
  ready: boolean;
  issues: ConfigIssue[];
  driver: string;
  downloadMode: string;
  demoMode: boolean;
  credentialsEncrypted: boolean;
  adminConfigured: boolean;
}

export interface OverviewResponse {
  stats: {
    totalFiles: number;
    totalBytes: number;
    totalDownloads: number;
    publicFiles: number;
  };
  pool: PoolOverview;
  database: {
    driver: string;
    ready: boolean;
    schemaInitialized: boolean;
    message?: string;
  };
  config: ConfigReport;
  recentFiles: SafeFile[];
  topFiles: SafeFile[];
  resumableUploads: Array<{
    id: string;
    filename: string;
    size: number;
    partsTotal: number;
    partsUploaded: number;
    storageName: string;
    status: string;
    updatedAt: string;
  }>;
}

export interface ResumableSession {
  id: string;
  filename: string;
  size: number;
  partSize: number;
  partsTotal: number;
  partsUploaded: number;
  status: string;
  storageName: string;
  fingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MoveJobProgress {
  jobId: string;
  status: "running" | "completed" | "failed" | "canceled";
  bytesCopied: number;
  size: number;
  partsDone: number;
  partsTotal: number;
  percent: number;
  completed: boolean;
  error: string | null;
  file?: SafeFile;
}

export interface PublicStats {
  files: number;
  totalSize: number;
  totalDownloads: number;
  nodes: number;
  poolCapacity: number;
  poolUsed: number;
}
