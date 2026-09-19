import { getDatabase, toSafeStorage } from "@/lib/db";
import type { SafeStorage, StorageRecord } from "@/lib/db/types";
import { encryptSecret } from "@/lib/db/vault";
import {
  invalidateClientCache,
  measureStorage,
  testStorageConnection,
  type ConnectionTestResult,
} from "@/lib/r2/storage-manager";
import type { CreateStorageInput, UpdateStorageInput } from "@/lib/api/schemas";
import { badRequest, conflict, notFound } from "@/lib/utils/assert";
import { parseSizeToBytes, percentage } from "@/lib/utils/format";
import { createId } from "@/lib/utils/id";
import { createLogger } from "@/lib/utils/logger";
import { getConfig } from "@/lib/config/env";

const logger = createLogger("storages");

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

export async function listStorages(): Promise<SafeStorage[]> {
  const db = await getDatabase();
  const records = await db.listStorages();
  return records.map(toSafeStorage);
}

export async function getStorageView(id: string): Promise<SafeStorage> {
  const db = await getDatabase();
  const record = await db.getStorage(id);
  if (!record) throw notFound("storage_not_found", "Storage tidak ditemukan");
  return toSafeStorage(record);
}

export async function getPoolOverview(): Promise<PoolOverview> {
  const storages = await listStorages();
  const totalCapacityBytes = storages.reduce((sum, storage) => sum + storage.limitBytes, 0);
  const totalUsedBytes = storages.reduce((sum, storage) => sum + storage.usedBytes, 0);
  const totalFreeBytes = Math.max(0, totalCapacityBytes - totalUsedBytes);
  const warnings: string[] = [];

  for (const storage of storages) {
    if (storage.status === "error") warnings.push(`${storage.name}: ${storage.lastError ?? "koneksi gagal"}`);
    if (storage.status === "disabled") warnings.push(`${storage.name}: dinonaktifkan`);
    if (storage.limitBytes > 0 && storage.usagePercent >= 95) {
      warnings.push(`${storage.name}: kapasitas hampir penuh (${storage.usagePercent}%)`);
    }
  }

  return {
    storages,
    totalCapacityBytes,
    totalUsedBytes,
    totalFreeBytes,
    usagePercent: Math.round(percentage(totalUsedBytes, totalCapacityBytes) * 10) / 10,
    activeCount: storages.filter((storage) => storage.status === "active").length,
    degradedCount: storages.filter((storage) => storage.status !== "active").length,
    largestFreeBytes: storages.reduce((max, storage) => Math.max(max, storage.freeBytes), 0),
    warnings,
  };
}

export interface CreateStorageResult {
  storage: SafeStorage;
  test: ConnectionTestResult | null;
}

export async function createStorage(input: CreateStorageInput): Promise<CreateStorageResult> {
  const db = await getDatabase();

  const existingByName = await db.getStorageByName(input.name);
  if (existingByName) {
    throw conflict("storage_name_exists", `Storage dengan nama "${input.name}" sudah ada`);
  }

  const all = await db.listStorages();
  const duplicateBucket = all.find(
    (storage) =>
      storage.accountId.toLowerCase() === input.accountId.toLowerCase() &&
      storage.bucket.toLowerCase() === input.bucket.toLowerCase(),
  );
  if (duplicateBucket) {
    throw conflict(
      "storage_bucket_exists",
      `Bucket "${input.bucket}" sudah terdaftar sebagai ${duplicateBucket.name}`,
    );
  }

  const now = new Date().toISOString();
  const record: StorageRecord = {
    id: createId("stg"),
    name: input.name,
    accountId: input.accountId,
    bucket: input.bucket,
    accessKeyId: input.accessKeyId,
    secretAccessKey: await encryptSecret(input.secretAccessKey),
    endpoint: input.endpoint ? input.endpoint.replace(/\/+$/, "") : null,
    region: input.region || "auto",
    limitBytes: parseSizeToBytes(input.limitValue, input.limitUnit ?? "GB"),
    usedBytes: 0,
    priority: input.priority ?? 100,
    status: "active",
    lastCheckedAt: null,
    lastError: null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const created = await db.createStorage(record);
  invalidateClientCache();

  let test: ConnectionTestResult | null = null;
  if (input.verifyConnection !== false && !getConfig().app.demoMode) {
    test = await testStorageConnection(created, { writeTest: true });
    await db.updateStorage(created.id, {
      status: test.ok ? "active" : "error",
      lastCheckedAt: test.checkedAt,
      lastError: test.ok ? null : (test.error?.message ?? "Koneksi gagal").slice(0, 500),
    });
    invalidateClientCache();
  } else if (getConfig().app.demoMode) {
    test = {
      ok: true,
      storageId: created.id,
      storageName: created.name,
      bucket: created.bucket,
      endpoint: `https://${created.accountId}.r2.cloudflarestorage.com`,
      steps: [
        {
          name: "demo",
          label: "Demo mode",
          ok: true,
          message: "DEMO_MODE aktif - koneksi tidak benar-benar diuji.",
          durationMs: 0,
        },
      ],
      checkedAt: new Date().toISOString(),
    };
  }

  const finalRecord = await db.getStorage(created.id);
  logger.info("Storage created", { storageId: created.id, name: created.name, tested: test?.ok });

  return { storage: toSafeStorage(finalRecord ?? created), test };
}

export interface UpdateStorageResult {
  storage: SafeStorage;
  test: ConnectionTestResult | null;
}

export async function updateStorage(
  id: string,
  input: UpdateStorageInput,
  options: { verifyConnection?: boolean } = {},
): Promise<UpdateStorageResult> {
  const db = await getDatabase();
  const existing = await db.getStorage(id);
  if (!existing) throw notFound("storage_not_found", "Storage tidak ditemukan");

  if (input.name && input.name !== existing.name) {
    const clash = await db.getStorageByName(input.name);
    if (clash && clash.id !== id) {
      throw conflict("storage_name_exists", `Storage dengan nama "${input.name}" sudah ada`);
    }
  }

  const patch: Partial<StorageRecord> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.accountId !== undefined) patch.accountId = input.accountId;
  if (input.bucket !== undefined) patch.bucket = input.bucket;
  if (input.accessKeyId !== undefined) patch.accessKeyId = input.accessKeyId;
  if (input.secretAccessKey) patch.secretAccessKey = await encryptSecret(input.secretAccessKey);
  if (input.endpoint !== undefined) patch.endpoint = input.endpoint ? input.endpoint.replace(/\/+$/, "") : null;
  if (input.region !== undefined) patch.region = input.region || "auto";
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.usedBytes !== undefined) patch.usedBytes = input.usedBytes;
  if (input.lastCheckedAt !== undefined) patch.lastCheckedAt = input.lastCheckedAt;
  if (input.lastError !== undefined) patch.lastError = input.lastError;
  if (input.limitValue !== undefined) {
    patch.limitBytes = parseSizeToBytes(input.limitValue, input.limitUnit ?? "GB");
  }

  if (Object.keys(patch).length === 0) {
    throw badRequest("empty_patch", "Tidak ada perubahan yang dikirim");
  }

  const updated = await db.updateStorage(id, patch);
  invalidateClientCache();
  if (!updated) throw notFound("storage_not_found", "Storage tidak ditemukan");

  let test: ConnectionTestResult | null = null;
  if (options.verifyConnection && !getConfig().app.demoMode) {
    test = await testStorageConnection(updated, { writeTest: true });
    await db.updateStorage(id, {
      status: test.ok ? "active" : "error",
      lastCheckedAt: test.checkedAt,
      lastError: test.ok ? null : (test.error?.message ?? "Koneksi gagal").slice(0, 500),
    });
    invalidateClientCache();
  }

  const finalRecord = await db.getStorage(id);
  return { storage: toSafeStorage(finalRecord ?? updated), test };
}

export async function removeStorage(
  id: string,
  options: { force?: boolean } = {},
): Promise<{ deleted: boolean; orphanedFiles: number }> {
  const db = await getDatabase();
  const existing = await db.getStorage(id);
  if (!existing) throw notFound("storage_not_found", "Storage tidak ditemukan");

  const files = await db.listFiles({ storageId: id, limit: 200 });
  if (files.total > 0 && !options.force) {
    throw conflict(
      "storage_in_use",
      `Storage ini masih menyimpan ${files.total} file. Pindahkan atau hapus file tersebut terlebih dahulu, atau gunakan opsi "paksa hapus" (metadata file akan tetap ada tetapi tidak dapat diunduh).`,
      { files: files.total },
    );
  }

  await db.deleteStorage(id);
  invalidateClientCache();
  logger.warn("Storage deleted", { storageId: id, name: existing.name, orphanedFiles: files.total });

  return { deleted: true, orphanedFiles: files.total };
}

export async function runConnectionTest(id: string): Promise<ConnectionTestResult> {
  const db = await getDatabase();
  const record = await db.getStorage(id);
  if (!record) throw notFound("storage_not_found", "Storage tidak ditemukan");

  if (getConfig().app.demoMode) {
    return {
      ok: true,
      storageId: record.id,
      storageName: record.name,
      bucket: record.bucket,
      endpoint: `https://${record.accountId}.r2.cloudflarestorage.com`,
      steps: [
        {
          name: "demo",
          label: "Demo mode",
          ok: true,
          message: "DEMO_MODE aktif - pengujian koneksi dilewati.",
          durationMs: 0,
        },
      ],
      checkedAt: new Date().toISOString(),
    };
  }

  const result = await testStorageConnection(record, { writeTest: true });
  await db.updateStorage(id, {
    status: result.ok ? "active" : "error",
    lastCheckedAt: result.checkedAt,
    lastError: result.ok ? null : (result.error?.message ?? "Koneksi gagal").slice(0, 500),
  });
  invalidateClientCache();
  return result;
}

/** Recalculates `usedBytes` from the real bucket contents. */
export async function resyncUsage(id: string) {
  const db = await getDatabase();
  const record = await db.getStorage(id);
  if (!record) throw notFound("storage_not_found", "Storage tidak ditemukan");

  if (getConfig().app.demoMode) {
    return { storageId: id, usedBytes: record.usedBytes, objects: 0, truncated: false, source: "database" as const };
  }

  const measurement = await measureStorage(record, { maxPages: 100 });
  await db.updateStorage(id, {
    usedBytes: measurement.bytes,
    lastCheckedAt: new Date().toISOString(),
    lastError: null,
    status: "active",
  });
  invalidateClientCache();

  return {
    storageId: id,
    usedBytes: measurement.bytes,
    objects: measurement.objects,
    truncated: measurement.truncated,
    source: "r2" as const,
  };
}
