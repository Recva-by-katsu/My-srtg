import { getConfig } from "@/lib/config/env";
import { getDatabase } from "@/lib/db";
import { decryptSecret } from "@/lib/db/vault";
import type { StorageRecord } from "@/lib/db/types";
import { describeR2Error, R2Client, R2Error, type R2ConnectionConfig } from "@/lib/r2/client";
import { AppError } from "@/lib/utils/assert";
import { formatBytes, percentage } from "@/lib/utils/format";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("storage-manager");

export const MIN_PART_SIZE = 5 * 1024 * 1024; // 5 MiB - S3/R2 minimum for multipart parts
export const MAX_PART_SIZE = 512 * 1024 * 1024;
export const MAX_PARTS = 10_000;
export const MAX_OBJECT_SIZE = 5 * 1024 ** 4; // 5 TiB

export interface StoragePoolEntry {
  record: StorageRecord;
  client: R2Client;
  freeBytes: number;
  usagePercent: number;
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

export interface StorageSelection {
  storageId: string;
  storageName: string;
  bucket: string;
  freeBytes: number;
  reason: string;
  forced: boolean;
  candidates: StorageCandidate[];
}

const clientCache = new Map<string, R2Client>();

function cacheKey(record: StorageRecord): string {
  return `${record.id}:${record.updatedAt}:${record.secretAccessKey.length}`;
}

/** Builds (and caches) an R2 client with decrypted credentials. Server only. */
export async function buildClient(record: StorageRecord): Promise<R2Client> {
  const key = cacheKey(record);
  const cached = clientCache.get(key);
  if (cached) return cached;

  const secretAccessKey = await decryptSecret(record.secretAccessKey);
  const config: R2ConnectionConfig = {
    id: record.id,
    name: record.name,
    accountId: record.accountId,
    bucket: record.bucket,
    accessKeyId: record.accessKeyId,
    secretAccessKey,
    endpoint: record.endpoint ?? undefined,
    region: record.region || "auto",
  };

  const client = new R2Client(config);
  if (clientCache.size >= 32) clientCache.clear();
  clientCache.set(key, client);
  return client;
}

export function invalidateClientCache(): void {
  clientCache.clear();
}

export async function getPoolEntry(storageId: string): Promise<StoragePoolEntry> {
  const db = await getDatabase();
  const record = await db.getStorage(storageId);
  if (!record) {
    throw new AppError("storage_not_found", `Storage ${storageId} tidak ditemukan`, { status: 404 });
  }
  const client = await buildClient(record);
  return {
    record,
    client,
    freeBytes: Math.max(0, record.limitBytes - record.usedBytes),
    usagePercent: percentage(record.usedBytes, record.limitBytes),
  };
}

export async function getStoragePool(options: { includeDisabled?: boolean } = {}): Promise<StoragePoolEntry[]> {
  const db = await getDatabase();
  const records = await db.listStorages();
  const entries: StoragePoolEntry[] = [];

  for (const record of records) {
    if (!options.includeDisabled && record.status !== "active") continue;
    try {
      const client = await buildClient(record);
      entries.push({
        record,
        client,
        freeBytes: Math.max(0, record.limitBytes - record.usedBytes),
        usagePercent: percentage(record.usedBytes, record.limitBytes),
      });
    } catch (error) {
      // A storage with a broken credential set must not take the whole pool down.
      logger.warn("Skipping storage with unreadable credentials", {
        storageId: record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return entries;
}

/**
 * Automatic storage selection.
 *
 * Rules (as specified):
 *  1. Only healthy storages with enough free capacity are eligible.
 *  2. Among them the one with the largest free space wins.
 *  3. `priority` and name act as deterministic tie breakers.
 *  4. A manual `preferredStorageId` is honoured when it has enough space.
 */
export async function selectStorageForUpload(
  sizeBytes: number,
  options: { preferredStorageId?: string; allowOversized?: boolean } = {},
): Promise<StorageSelection> {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new AppError("invalid_size", "Ukuran file tidak valid", { status: 400 });
  }

  const config = getConfig();
  if (sizeBytes > config.storage.maxUploadSizeBytes) {
    throw new AppError(
      "file_too_large",
      `File ${formatBytes(sizeBytes)} melebihi batas upload ${formatBytes(config.storage.maxUploadSizeBytes)} (ubah lewat MAX_UPLOAD_SIZE_GB).`,
      { status: 413, details: { sizeBytes, maxBytes: config.storage.maxUploadSizeBytes } },
    );
  }
  if (sizeBytes > MAX_OBJECT_SIZE) {
    throw new AppError("file_too_large", "R2 membatasi satu objek maksimal 5 TiB", { status: 413 });
  }

  const db = await getDatabase();
  const records = await db.listStorages();
  const candidates: StorageCandidate[] = records.map((record) => {
    const freeBytes = Math.max(0, record.limitBytes - record.usedBytes);
    const usagePercent = Math.round(percentage(record.usedBytes, record.limitBytes) * 10) / 10;

    if (record.status !== "active") {
      return {
        storageId: record.id,
        name: record.name,
        freeBytes,
        limitBytes: record.limitBytes,
        usagePercent,
        eligible: false,
        reason: record.status === "disabled" ? "Storage dinonaktifkan" : "Storage berstatus error",
      };
    }
    if (record.limitBytes > 0 && freeBytes < sizeBytes) {
      return {
        storageId: record.id,
        name: record.name,
        freeBytes,
        limitBytes: record.limitBytes,
        usagePercent,
        eligible: false,
        reason: `Sisa ${formatBytes(freeBytes)} tidak cukup untuk ${formatBytes(sizeBytes)}`,
      };
    }
    if (!record.accessKeyId || !record.secretAccessKey) {
      return {
        storageId: record.id,
        name: record.name,
        freeBytes,
        limitBytes: record.limitBytes,
        usagePercent,
        eligible: false,
        reason: "Kredensial R2 belum lengkap",
      };
    }

    return {
      storageId: record.id,
      name: record.name,
      freeBytes,
      limitBytes: record.limitBytes,
      usagePercent,
      eligible: true,
      reason: `Sisa ${formatBytes(freeBytes)}`,
    };
  });

  const byRecord = new Map(records.map((record) => [record.id, record]));

  const preferred = options.preferredStorageId
    ? candidates.find((candidate) => candidate.storageId === options.preferredStorageId)
    : undefined;

  if (preferred && preferred.eligible) {
    const record = byRecord.get(preferred.storageId)!;
    return {
      storageId: preferred.storageId,
      storageName: preferred.name,
      bucket: record.bucket,
      freeBytes: preferred.freeBytes,
      reason: `Dipilih manual - ${preferred.reason}`,
      forced: true,
      candidates,
    };
  }

  const eligible = candidates
    .filter((candidate) => candidate.eligible)
    .sort((a, b) => {
      if (b.freeBytes !== a.freeBytes) return b.freeBytes - a.freeBytes;
      const priorityA = byRecord.get(a.storageId)?.priority ?? 100;
      const priorityB = byRecord.get(b.storageId)?.priority ?? 100;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.name.localeCompare(b.name);
    });

  const chosen = eligible[0];
  if (!chosen) {
    const message =
      candidates.length === 0
        ? "Belum ada storage R2 yang terdaftar. Tambahkan storage terlebih dahulu di Admin → Storage."
        : `Tidak ada storage dengan sisa kapasitas ${formatBytes(sizeBytes)}. Kosongkan salah satu storage atau tambah akun R2 baru.`;
    throw new AppError("no_storage_available", message, {
      status: 507,
      details: { sizeBytes, candidates },
    });
  }

  const record = byRecord.get(chosen.storageId)!;
  return {
    storageId: chosen.storageId,
    storageName: chosen.name,
    bucket: record.bucket,
    freeBytes: chosen.freeBytes,
    reason: `Kapasitas cukup & free space terbesar (${formatBytes(chosen.freeBytes)} dari ${formatBytes(chosen.limitBytes)})`,
    forced: false,
    candidates,
  };
}

export interface PartPlan {
  partSize: number;
  parts: number;
}

/**
 * Chooses a multipart layout for a file: the requested part size, but never so
 * large that we exceed R2's 10.000 part limit and never below the 5 MiB minimum.
 */
export function planParts(fileSize: number, preferredPartSize?: number): PartPlan {
  const config = getConfig();
  const requested = Math.max(
    MIN_PART_SIZE,
    Math.min(MAX_PART_SIZE, preferredPartSize ?? config.storage.defaultPartSizeBytes),
  );
  const minimumForLimit = Math.ceil(fileSize / MAX_PARTS);
  const partSize = Math.max(requested, minimumForLimit, MIN_PART_SIZE);
  const parts = Math.max(1, Math.ceil(fileSize / partSize));

  return { partSize, parts };
}

export interface ConnectionStep {
  name: string;
  label: string;
  ok: boolean;
  message: string;
  durationMs: number;
}

export interface ConnectionTestResult {
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

/**
 * Verifies a storage end to end: bucket reachability, read access, write access
 * and cleanup. Each step is timed so the admin UI can show exactly where a
 * misconfiguration happens (wrong account id, missing token permission, ...).
 */
export async function testStorageConnection(
  record: StorageRecord,
  options: { writeTest?: boolean } = {},
): Promise<ConnectionTestResult> {
  const steps: ConnectionStep[] = [];
  const result: ConnectionTestResult = {
    ok: false,
    storageId: record.id,
    storageName: record.name,
    bucket: record.bucket,
    endpoint: "",
    steps,
    checkedAt: new Date().toISOString(),
  };

  let client: R2Client;
  try {
    client = await buildClient(record);
    result.endpoint = client.endpoint;
  } catch (error) {
    steps.push({
      name: "credentials",
      label: "Dekripsi kredensial",
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      durationMs: 0,
    });
    result.error = { code: "credentials", message: "Kredensial tidak dapat didekripsi", status: 500 };
    return result;
  }

  const runStep = async (
    name: string,
    label: string,
    action: () => Promise<string>,
  ): Promise<boolean> => {
    const started = Date.now();
    try {
      const message = await action();
      steps.push({ name, label, ok: true, message, durationMs: Date.now() - started });
      return true;
    } catch (error) {
      const described = describeR2Error(error);
      steps.push({
        name,
        label,
        ok: false,
        message: friendlyStorageMessage(described.code, described.message),
        durationMs: Date.now() - started,
      });
      result.error = described;
      return false;
    }
  };

  const headOk = await runStep("head_bucket", "Akses bucket", async () => {
    await client.headBucket();
    return `Bucket "${record.bucket}" dapat diakses`;
  });
  if (!headOk) return result;

  const listOk = await runStep("list_objects", "Baca daftar objek", async () => {
    const page = await client.listObjectsV2({ maxKeys: 1 });
    return `ListObjectsV2 berhasil (${page.keyCount} objek pada halaman pertama)`;
  });
  if (!listOk) return result;

  if (options.writeTest !== false) {
    const probeKey = getConfig().storage.probeKey;
    const payload = `katsu-r2-manager connection probe ${new Date().toISOString()}`;

    const writeOk = await runStep("write_probe", "Tulis objek uji", async () => {
      await client.putObject(probeKey, payload, "text/plain");
      return `Objek uji ${probeKey} berhasil ditulis`;
    });

    if (writeOk) {
      await runStep("delete_probe", "Hapus objek uji", async () => {
        await client.deleteObject(probeKey);
        return "Objek uji dibersihkan";
      });
    }

    if (!writeOk) return result;
  }

  result.ok = steps.every((step) => step.ok);
  return result;
}

/** Re-measures real bucket usage by listing every object under the pool prefix. */
export async function measureStorage(
  record: StorageRecord,
  options: { prefix?: string; maxPages?: number } = {},
): Promise<{ bytes: number; objects: number; truncated: boolean }> {
  const client = await buildClient(record);
  return client.measureUsage({
    prefix: options.prefix ?? "",
    maxPages: options.maxPages ?? 50,
  });
}

export function friendlyStorageMessage(code: string, fallback: string): string {
  switch (code) {
    case "AccessDenied":
      return "Akses ditolak. Periksa Access Key ID / Secret Access Key dan pastikan API token R2 mengizinkan bucket ini.";
    case "NoSuchBucket":
      return "Bucket tidak ditemukan. Pastikan nama bucket dan Account ID sesuai.";
    case "InvalidAccessKeyId":
      return "Access Key ID tidak dikenali oleh R2.";
    case "SignatureDoesNotMatch":
      return "Secret Access Key salah (signature tidak cocok).";
    case "NotFound":
    case "NoSuchKey":
      return "Objek tidak ditemukan di bucket.";
    case "PreconditionFailed":
      return "Precondition gagal (ETag berubah).";
    default:
      return fallback;
  }
}

export function isMissingObjectError(error: unknown): boolean {
  return error instanceof R2Error && (error.code === "NoSuchKey" || error.status === 404);
}
