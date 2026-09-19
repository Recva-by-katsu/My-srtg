import { getConfig, type DatabaseDriver } from "@/lib/config/env";
import { D1Adapter } from "@/lib/db/adapters/d1";
import { KvAdapter } from "@/lib/db/adapters/kv";
import { MemoryAdapter } from "@/lib/db/adapters/memory";
import type {
  DatabaseAdapter,
  DatabaseInfo,
  FileRecord,
  PublicFile,
  SafeStorage,
  StorageRecord,
} from "@/lib/db/types";
import { maskSecret } from "@/lib/security/sanitize";
import { percentage } from "@/lib/utils/format";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("db");

const GLOBAL_KEY = Symbol.for("katsu.database");
type GlobalWithDatabase = typeof globalThis & { [GLOBAL_KEY]?: DatabaseAdapter };

function resolveDriver(): { driver: DatabaseDriver; note?: string } {
  const config = getConfig();
  const configured = config.database.driver;

  if (config.app.demoMode || configured === "memory") {
    return { driver: "memory" };
  }

  const hasCloudflareApi = Boolean(config.cloudflare.accountId && config.cloudflare.apiToken);

  if (configured === "d1") {
    if (config.database.d1DatabaseId && hasCloudflareApi) return { driver: "d1" };
    if (config.database.kvNamespaceId && hasCloudflareApi) {
      return {
        driver: "kv",
        note: "DATABASE_ID kosong tetapi KV_NAMESPACE_ID terisi - memakai driver KV.",
      };
    }
    return {
      driver: "memory",
      note: "Database Cloudflare belum terkonfigurasi - memakai penyimpanan sementara (memory).",
    };
  }

  if (configured === "kv") {
    if (config.database.kvNamespaceId && hasCloudflareApi) return { driver: "kv" };
    if (config.database.d1DatabaseId && hasCloudflareApi) {
      return {
        driver: "d1",
        note: "KV_NAMESPACE_ID kosong tetapi DATABASE_ID terisi - memakai driver D1.",
      };
    }
    return {
      driver: "memory",
      note: "Database Cloudflare belum terkonfigurasi - memakai penyimpanan sementara (memory).",
    };
  }

  return { driver: configured };
}

function createAdapter(driver: DatabaseDriver): DatabaseAdapter {
  switch (driver) {
    case "d1":
      return new D1Adapter();
    case "kv":
      return new KvAdapter();
    case "memory":
    default:
      return new MemoryAdapter(getConfig().app.demoMode);
  }
}

/**
 * Returns the shared database adapter for this isolate.
 *
 * The driver is chosen from `DATABASE_DRIVER`, with a friendly fallback when the
 * matching identifiers are missing so a fresh deployment never hard-crashes.
 */
export async function getDatabase(): Promise<DatabaseAdapter> {
  const scope = globalThis as GlobalWithDatabase;
  if (scope[GLOBAL_KEY]) return scope[GLOBAL_KEY]!;

  const { driver, note } = resolveDriver();
  if (note) logger.warn(note, { driver });
  const adapter = createAdapter(driver);
  scope[GLOBAL_KEY] = adapter;
  return adapter;
}

/** Drops the cached adapter (used after configuration changes in tests). */
export function resetDatabase(): void {
  const scope = globalThis as GlobalWithDatabase;
  delete scope[GLOBAL_KEY];
}

export async function getDatabaseInfo(): Promise<DatabaseInfo> {
  const db = await getDatabase();
  try {
    return await db.info();
  } catch (error) {
    return {
      driver: db.driver,
      ready: false,
      schemaInitialized: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Creates tables when they are missing (D1/KV) - powers the one-click installer. */
export async function ensureSchema(force = false): Promise<DatabaseInfo> {
  const db = await getDatabase();
  const info = await db.info();
  if (!info.schemaInitialized || force) {
    const result = await db.initializeSchema();
    logger.info("Database schema initialized", { driver: db.driver, ...result });
    return db.info();
  }
  return info;
}

// ------------------------------------------------------------ safe projections

/**
 * Strips credential material from a storage record.
 *
 * The secret access key is encrypted at rest and never leaves the server; the
 * access key id is stored in clear (it is not a secret on its own) but is only
 * ever exposed to the browser in masked form.
 */
export function toSafeStorage(storage: StorageRecord): SafeStorage {
  const { accessKeyId, secretAccessKey, ...rest } = storage;
  const freeBytes = Math.max(0, storage.limitBytes - storage.usedBytes);
  return {
    ...rest,
    accessKeyIdMasked: maskSecret(accessKeyId, 4, 4),
    hasCredentials: Boolean(accessKeyId && secretAccessKey),
    freeBytes,
    usagePercent: Math.round(percentage(storage.usedBytes, storage.limitBytes) * 10) / 10,
  };
}

export function toPublicFile(file: FileRecord): PublicFile {
  return {
    downloadId: file.downloadId,
    filename: file.filename,
    size: file.size,
    contentType: file.contentType,
    category: file.category,
    downloadCount: file.downloadCount,
    createdAt: file.createdAt,
  };
}

/** Removes bucket/object location from a record before it reaches the browser. */
export function toSafeFile(file: FileRecord, storageName?: string | null) {
  const { bucket: _bucket, objectKey: _objectKey, storageId: _storageId, ...rest } = file;
  void _bucket;
  void _objectKey;
  void _storageId;
  return { ...rest, storageName: storageName ?? null };
}
